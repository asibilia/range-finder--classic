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
 * XML namespaces, JSON Schema ids (zod), links in React's, React Router's,
 * Base UI's and Recharts' (Redux Toolkit, Immer) error messages, and React
 * Router's placeholder origin for parsing paths.
 */
const NAME_ONLY_HOSTS = new Set([
    'www.w3.org',
    'json-schema.org',
    'react.dev',
    'reactrouter.com',
    'localhost',
    'base-ui.com',
    'redux.js.org',
    'redux-toolkit.js.org',
    'bit.ly',
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
        expect(html).toMatch(/<h1[^>]*>Armory planner<\/h1>/)
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
        // Tailwind scans only the folders src/styles.css names with
        // `@source` (the components), never the samples or the schema, whose
        // words ("static", "table") it took for classes. Every class in the
        // built CSS must be written in one of those files.
        const css = filesUnder(CLIENT_DIR, '.css')
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n')
        expect(css.length).toBeGreaterThan(0)
        const styles = readFileSync(join(PACKAGE_DIR, 'src/styles.css'), 'utf8')
        const scanned = [...styles.matchAll(/@source '([^']+)';/g)].map((m) =>
            join(PACKAGE_DIR, 'src', m[1]!)
        )
        expect(scanned.length).toBeGreaterThan(0)
        const sources = scanned
            .flatMap((path) =>
                path.endsWith('.tsx') ? [path] : filesUnder(path, '.tsx')
            )
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n')
        const classes = new Set(
            [...css.matchAll(/\.((?:\\.|[\w-])+)/g)]
                .map((m) => m[1]!.replace(/\\(.)/g, '$1'))
                // Numbers in values (`0.5rem`), not classes.
                .filter((name) => /^-?[a-z@*]/i.test(name))
        )
        expect(classes.size).toBeGreaterThan(0)
        // `group-has-[...]/field-label:...` names the group `group/field-label`.
        const written = (name: string) =>
            sources.includes(name) ||
            (/^(group|peer)\//.test(name) &&
                sources.includes(name.slice(name.indexOf('/'))))
        expect([...classes].filter((name) => !written(name))).toEqual([])
    })

    test('from 90rem the CSS puts the gear and the card side by side', () => {
        const css = filesUnder(CLIENT_DIR, '.css')
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n')
        const wide = css.match(/@media\s*\(min-width:\s*90rem\)\s*\{([^@]*)\}/)
        expect(wide).not.toBeNull()
        expect(wide![1]).toContain(
            '.min-\\[90rem\\]\\:grid-cols-\\[minmax\\(0\\,1fr\\)_27\\.75rem\\]{grid-template-columns:minmax(0,1fr) 27.75rem}'
        )
        // The doll's three columns come from a container query on the pane.
        expect(css).toMatch(/@container doll \(min-width:\s*49rem\)/)
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
