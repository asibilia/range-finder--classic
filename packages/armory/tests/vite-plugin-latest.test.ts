/**
 * The Vite plugin that serves the owner's latest results file in dev
 * (`vite-plugin-latest.ts`): `/local/latest.json`,
 * `/local/latest-status.json` and `/local/latest-export.lua`, read through
 * an untracked config. This runs
 * the plugin in a real Vite dev server in middleware mode (no port), with a
 * temporary config and files, never the owner's.
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    utimesSync,
    writeFileSync,
} from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import {
    createServer,
    type Logger,
    type Plugin,
    type ViteDevServer,
} from 'vite'

const PACKAGE_DIR = join(import.meta.dir, '..')
// A path in a variable: the plugin belongs to tsconfig.node.json, not to
// the tests' project.
const PLUGIN = join(import.meta.dir, '../vite-plugin-latest.ts')

type Connect = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void
) => void

type Answer = {
    status: number
    body: Buffer
    headers: Record<string, string | undefined>
}

const servers: ViteDevServer[] = []
const made: string[] = []

/** A fresh temporary folder. */
function folder(): string {
    const dir = mkdtempSync(join(tmpdir(), 'vite-plugin-latest-'))
    made.push(dir)
    return dir
}

type Factory = (options?: { configFile?: string }) => Plugin

async function factory(): Promise<Factory> {
    const mod = (await import(PLUGIN)) as {
        latestPlugin?: Factory
        default?: Factory
    }
    const make = mod.latestPlugin ?? mod.default
    if (typeof make !== 'function')
        throw new Error('vite-plugin-latest.ts exports no plugin factory')
    return make
}

/** A logger that keeps every warning. */
function keepingLogger(warnings: string[]): Logger {
    const warned = new Set<string>()
    return {
        hasWarned: false,
        info() {},
        warn(message) {
            warnings.push(message)
        },
        warnOnce(message) {
            if (warned.has(message)) return
            warned.add(message)
            warnings.push(message)
        },
        error() {},
        clearScreen() {},
        hasErrorLogged: () => false,
    }
}

/** Starts a Vite dev server, in middleware mode, with only the plugin. */
async function startServer(
    configFile: string,
    warnings: string[] = []
): Promise<ViteDevServer> {
    const make = await factory()
    const server = await createServer({
        configFile: false,
        root: folder(),
        customLogger: keepingLogger(warnings),
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { middlewareMode: true, hmr: false, ws: false },
        plugins: [make({ configFile })],
    })
    servers.push(server)
    return server
}

afterEach(async () => {
    for (const server of servers.splice(0)) await server.close()
})

afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Sends a GET for `url` through the dev server's middlewares. */
function get(
    dev: ViteDevServer,
    url: string,
    headers: Record<string, string> = {}
): Promise<Answer> {
    return new Promise((resolve, reject) => {
        const req = new IncomingMessage(new Socket())
        req.method = 'GET'
        req.url = url
        req.headers = { host: 'localhost:5173', ...headers }
        req.push(null)
        const res = new ServerResponse(req)
        const chunks: Buffer[] = []
        const keep = (chunk: unknown, encoding?: unknown) => {
            if (chunk === undefined || chunk === null) return
            if (typeof chunk === 'function') return
            chunks.push(
                typeof chunk === 'string'
                    ? Buffer.from(
                          chunk,
                          (typeof encoding === 'string'
                              ? encoding
                              : 'utf8') as BufferEncoding
                      )
                    : Buffer.from(chunk as Uint8Array)
            )
        }
        res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
            keep(chunk, encoding)
            const done = typeof encoding === 'function' ? encoding : cb
            if (typeof done === 'function') done()
            return true
        }) as unknown as typeof res.write
        res.end = ((chunk?: unknown, encoding?: unknown) => {
            keep(chunk, encoding)
            const header = (name: string) => {
                const value = res.getHeader(name)
                return value === undefined ? undefined : String(value)
            }
            resolve({
                status: res.statusCode,
                body: Buffer.concat(chunks),
                headers: {
                    'cache-control': header('cache-control'),
                    'last-modified': header('last-modified'),
                },
            })
            return res
        }) as unknown as typeof res.end
        const fellThrough = new Error(`No middleware answered ${url}`)
        ;(dev.middlewares as unknown as Connect)(req, res, (error) =>
            reject(error ?? fellThrough)
        )
    })
}

/** A temporary config naming a temporary latest file, with its folder. */
function localSetup(): { config: string; dir: string; latest: string } {
    const dir = folder()
    const latest = join(dir, 'latest.json')
    writeFileSync(latest, '{"schema_version":1,"made_at":"first"}\n')
    const config = join(folder(), '.local.json')
    writeFileSync(config, JSON.stringify({ latest_results_file: latest }))
    return { config, dir, latest }
}

describe('vite-plugin-latest in dev', () => {
    test('without a config, /local/latest.json answers 404 and the logger is warned there is no local latest file', async () => {
        const warnings: string[] = []
        const dev = await startServer(join(folder(), 'absent.json'), warnings)
        const { status } = await get(dev, '/local/latest.json')
        expect(status).toBe(404)
        expect(
            warnings.some((w) => w.startsWith('armory: no local latest file'))
        ).toBe(true)
    }, 60_000)

    test('serves the latest file with no-store and Last-Modified, answers 304 to If-Modified-Since, and 200 again once the file is rewritten 2 s later', async () => {
        const { config, latest } = localSetup()
        const dev = await startServer(config)

        const first = await get(dev, '/local/latest.json')
        expect(first.status).toBe(200)
        expect(first.body.equals(readFileSync(latest))).toBe(true)
        expect(first.headers['cache-control']).toBe('no-store')
        expect(first.headers['last-modified']).toBeDefined()

        const since = { 'if-modified-since': first.headers['last-modified']! }
        const same = await get(dev, '/local/latest.json', since)
        expect(same.status).toBe(304)

        const then = statSync(latest).mtime.getTime() / 1000
        writeFileSync(latest, '{"schema_version":1,"made_at":"second"}\n')
        utimesSync(latest, then + 2, then + 2)
        const rewritten = await get(dev, '/local/latest.json', since)
        expect(rewritten.status).toBe(200)
        expect(rewritten.body.toString()).toBe(
            '{"schema_version":1,"made_at":"second"}\n'
        )
    }, 60_000)

    test('serves the status file beside the latest one, 404 once it is gone, and 404 for any other /local/ path', async () => {
        const { config, dir } = localSetup()
        const status = join(dir, 'latest-status.json')
        const text =
            '{"made_at":"2026-11-17T10:00:00Z","export_saved_at":"2026-11-17T09:59:00Z","ok":false,"reason":"the export was empty","results_file":"r.json"}\n'
        writeFileSync(status, text)
        writeFileSync(join(dir, 'other.json'), '{}')
        const dev = await startServer(config)

        const present = await get(dev, '/local/latest-status.json')
        expect(present.status).toBe(200)
        expect(present.body.toString()).toBe(text)

        rmSync(status)
        expect((await get(dev, '/local/latest-status.json')).status).toBe(404)
        expect((await get(dev, '/local/other.json')).status).toBe(404)
        expect((await get(dev, '/local/../x')).status).toBe(404)
    }, 60_000)

    test('serves the export beside the latest file at /local/latest-export.lua (no-store, as text), 404 without it', async () => {
        const { config, dir } = localSetup()
        const dev = await startServer(config)
        expect((await get(dev, '/local/latest-export.lua')).status).toBe(404)

        const text = 'TurboCharExportDB = {}\n'
        writeFileSync(join(dir, 'latest-export.lua'), text)
        const present = await get(dev, '/local/latest-export.lua')
        expect(present.status).toBe(200)
        expect(present.body.toString()).toBe(text)
        expect(present.headers['cache-control']).toBe('no-store')
    }, 60_000)

    test('the export answers 404 without a latest file, even when a file of that name exists elsewhere', async () => {
        const dir = folder()
        writeFileSync(join(dir, 'latest-export.lua'), 'x')
        const config = join(folder(), '.local.json')
        writeFileSync(
            config,
            JSON.stringify({ latest_results_file: join(dir, 'latest.json') })
        )
        const dev = await startServer(config)
        expect((await get(dev, '/local/latest-export.lua')).status).toBe(404)
    }, 60_000)

    test('answers 403 to a request whose Host is not localhost', async () => {
        const { config, dir } = localSetup()
        writeFileSync(join(dir, 'latest-export.lua'), 'x')
        const dev = await startServer(config)
        for (const path of ['/local/latest.json', '/local/latest-export.lua']) {
            const { status } = await get(dev, path, { host: 'example.com' })
            expect(status).toBe(403)
        }
    }, 60_000)
})

describe('vite-plugin-latest in the build', () => {
    test('applies only when serving, vite.config.ts registers it, and tsconfig.node.json includes it', async () => {
        const make = await factory()
        expect(make({ configFile: join(folder(), 'absent.json') }).apply).toBe(
            'serve'
        )

        const viteConfig = readFileSync(
            join(PACKAGE_DIR, 'vite.config.ts'),
            'utf8'
        )
        expect(viteConfig).toMatch(/from '\.\/vite-plugin-latest(\.ts)?'/)
        expect(viteConfig).toMatch(/\blatestPlugin\(/)

        const path = join(PACKAGE_DIR, 'tsconfig.node.json')
        const node = ts.parseConfigFileTextToJson(
            path,
            readFileSync(path, 'utf8')
        ).config as { include?: string[] }
        expect(node.include).toContain('vite-plugin-latest.ts')
    }, 60_000)
})
