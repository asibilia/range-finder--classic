/**
 * The armory planner's production build (`bun run build:armory`): React
 * Router prerenders the page to `build/client/index.html`, which git
 * ignores. The built page asks no other server for anything (every file it
 * loads is its own) and the page's code keeps nothing in the browser. This
 * runs the build once and reads what it wrote.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { nodeVersionProblem, readNodeVersion } from './node-version'

const REPO_ROOT = join(import.meta.dir, '../../..')
const PACKAGE_DIR = join(import.meta.dir, '..')
const CLIENT_DIR = join(PACKAGE_DIR, 'build/client')
const INDEX_HTML = join(CLIENT_DIR, 'index.html')

/**
 * Hosts that appear in the built JavaScript as names, never as requests:
 * XML namespaces, JSON Schema ids (zod), links in React's and React Router's
 * error messages, and React Router's placeholder origin for parsing paths.
 */
const NAME_ONLY_HOSTS = new Set([
    'www.w3.org',
    'json-schema.org',
    'react.dev',
    'reactrouter.com',
    'localhost',
])

/** Browser storage APIs the page's own code must not use. */
const STORAGE = /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/
/** Ways of asking a server for something. */
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/

let buildExitCode: number | null = null
let buildOutput = ''

function filesUnder(dir: string, extension: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith(extension))
        .map((name) => join(dir, name))
}

beforeAll(() => {
    // React Router's command line runs under the PATH's Node; under an
    // older one it dies on syntax, with none the prerender hangs. Say so.
    const nodeProblem = nodeVersionProblem(readNodeVersion())
    if (nodeProblem) throw new Error(nodeProblem)

    const result = Bun.spawnSync([process.execPath, 'run', 'build:armory'], {
        cwd: REPO_ROOT,
        // `bun test` sets NODE_ENV=test, which would make Vite bundle
        // React's development build; this checks the production one.
        env: { ...process.env, NODE_ENV: 'production' },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    buildExitCode = result.exitCode
    buildOutput = result.stdout.toString() + result.stderr.toString()
}, 180_000)

describe('the build', () => {
    test('writes packages/armory/build/client/index.html, which git ignores', () => {
        if (buildExitCode !== 0) console.error(buildOutput)
        expect(buildExitCode).toBe(0)
        expect(existsSync(INDEX_HTML)).toBe(true)

        const ignored = Bun.spawnSync(
            [
                'git',
                'check-ignore',
                '-q',
                'packages/armory/build/client/index.html',
            ],
            { cwd: REPO_ROOT }
        )
        expect(ignored.exitCode).toBe(0)
    })

    test('the prerendered page has the title and the Armory planner h1', () => {
        const html = readFileSync(INDEX_HTML, 'utf8')
        expect(html).toContain('<title>Armory planner</title>')
        expect(html).toMatch(/<h1>Armory planner<\/h1>/)
    })

    test('the page loads only its own files', () => {
        const html = readFileSync(INDEX_HTML, 'utf8')
        const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map(
            (m) => m[1]
        )
        expect(refs.length).toBeGreaterThan(0)
        for (const ref of refs) expect(ref).toMatch(/^\/assets\/[\w.-]+$/)

        for (const file of filesUnder(CLIENT_DIR, '.css')) {
            const css = readFileSync(file, 'utf8')
            expect(css).not.toMatch(/@import|url\(/)
        }
    })

    test('the CSS has no Tailwind utilities the page does not use', () => {
        // The page uses no Tailwind classes yet. Scanning the source, Tailwind
        // took words like "static" and "grid" for classes and emitted them;
        // src/styles.css now scans nothing (`source(none)`).
        const css = filesUnder(CLIENT_DIR, '.css')
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n')
        expect(css.length).toBeGreaterThan(0)
        const found = ['static', 'grid', 'hidden', 'table', 'rounded', 'ring']
            .map((name) => `.${name}`)
            .filter((selector) =>
                new RegExp(`\\${selector}(?![\\w-])`).test(css)
            )
        expect(found).toEqual([])
    })

    test('no URL in the built JavaScript points at a server', () => {
        const hosts = new Set<string>()
        for (const file of filesUnder(CLIENT_DIR, '.js')) {
            const js = readFileSync(file, 'utf8')
            for (const m of js.matchAll(/\b(?:https?|wss?):\/\/([\w.-]+)/g))
                hosts.add(m[1]!)
        }
        expect([...hosts].filter((h) => !NAME_ONLY_HOSTS.has(h))).toEqual([])
    })
})

describe("the page's own code", () => {
    // React Router's client code has fetch and sessionStorage in it; with
    // no loaders, no actions and every route in the first page
    // (`routeDiscovery: 'initial'`), it asks the server for nothing. Our
    // code must not use them either.
    const sources = [
        ...filesUnder(join(PACKAGE_DIR, 'src'), '.ts'),
        ...filesUnder(join(PACKAGE_DIR, 'src'), '.tsx'),
        ...filesUnder(join(PACKAGE_DIR, 'workers'), '.ts'),
    ]

    test('keeps nothing in the browser and asks no server for anything', () => {
        expect(sources.length).toBeGreaterThan(0)
        const offenders = sources.filter((file) => {
            const source = readFileSync(file, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '')
            // The Worker's own `fetch(request)` handler is not a request.
            const code = source.replace(/^\s*fetch\(request\)\s*\{/m, '')
            return STORAGE.test(code) || NETWORK.test(code)
        })
        expect(offenders).toEqual([])
    })
})
