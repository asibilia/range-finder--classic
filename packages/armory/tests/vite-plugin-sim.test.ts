/**
 * The Vite plugin that serves the sim (`vite-plugin-sim.ts`): in dev, a
 * request under `/sim/` is answered from `packages/sim/build/`. This runs
 * the plugin in a real Vite dev server in middleware mode (no port) and
 * sends it one request.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Plugin, type ViteDevServer } from 'vite'

const REPO_ROOT = join(import.meta.dir, '../../..')
const SIM_BUILD = join(REPO_ROOT, 'packages/sim/build')
// A path in a variable: the plugin belongs to tsconfig.node.json, not to
// the tests' project.
const PLUGIN = join(import.meta.dir, '../vite-plugin-sim.ts')

type Connect = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void
) => void

let server: ViteDevServer | undefined
let root: string | undefined

beforeAll(() => {
    if (existsSync(join(SIM_BUILD, 'lib.wasm.gz'))) return
    const build = Bun.spawnSync([process.execPath, 'run', 'sim:build'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (build.exitCode !== 0) {
        console.error(build.stdout.toString() + build.stderr.toString())
        throw new Error('bun run sim:build failed')
    }
}, 600_000)

/** Starts a Vite dev server, in middleware mode, with only the plugin. */
async function startServer(): Promise<ViteDevServer> {
    const mod = (await import(PLUGIN)) as {
        simPlugin?: () => Plugin
        default?: () => Plugin
    }
    const factory = mod.simPlugin ?? mod.default
    if (typeof factory !== 'function')
        throw new Error('vite-plugin-sim.ts exports no plugin factory')
    root = mkdtempSync(join(tmpdir(), 'vite-plugin-sim-'))
    server = await createServer({
        configFile: false,
        root,
        logLevel: 'silent',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { middlewareMode: true, hmr: false, ws: false },
        plugins: [factory()],
    })
    return server
}

afterAll(async () => {
    await server?.close()
    if (root) rmSync(root, { recursive: true, force: true })
})

/** Sends a GET for `url` through the dev server's middlewares. */
function get(
    dev: ViteDevServer,
    url: string
): Promise<{ status: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
        const req = new IncomingMessage(new Socket())
        req.method = 'GET'
        req.url = url
        req.headers = { host: 'localhost' }
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
            resolve({ status: res.statusCode, body: Buffer.concat(chunks) })
            return res
        }) as unknown as typeof res.end
        const fellThrough = new Error(`No middleware answered ${url}`)
        ;(dev.middlewares as unknown as Connect)(req, res, (error) =>
            reject(error ?? fellThrough)
        )
    })
}

describe('vite-plugin-sim in dev', () => {
    test('answers a request for /sim/lib.wasm.gz from packages/sim/build/', async () => {
        const dev = await startServer()
        const { status, body } = await get(dev, '/sim/lib.wasm.gz')
        expect(status).toBe(200)
        const onDisk = readFileSync(join(SIM_BUILD, 'lib.wasm.gz'))
        expect(body.length).toBe(onDisk.length)
        expect(body.equals(onDisk)).toBe(true)
    }, 120_000)
})
