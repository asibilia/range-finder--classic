/**
 * The armory planner's production build (`bun run build:armory`): React
 * Router prerenders the page to `build/client/index.html`, which git
 * ignores. The built page asks no other server for anything (every file it
 * loads is its own) and the page's code keeps one thing in the browser: the
 * last results file, under one localStorage key, from one module
 * (`src/remembered-file.ts`). This runs the build once and reads what it
 * wrote.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { ART } from '../src/character-art'
import { REMEMBERED_FILE_KEY } from '../src/remembered-file'
import { LOADER, LOCAL_LATEST, networkProblems } from './network-rule'
import { nodeVersionProblem, readNodeVersion } from './node-version'

const REPO_ROOT = join(import.meta.dir, '../../..')
const PACKAGE_DIR = join(import.meta.dir, '..')
const CLIENT_DIR = join(PACKAGE_DIR, 'build/client')
const INDEX_HTML = join(CLIENT_DIR, 'index.html')
const SIM_DIR = join(REPO_ROOT, 'packages/sim')
const SIM_BUILD = join(SIM_DIR, 'build')
/** Cloudflare's limit per static asset. */
const MAX_ASSET_BYTES = 25 * 1024 * 1024
/** The sim's files the page needs, under `build/client/sim/`. */
const SIM_FILES = [
    'lib.wasm.gz',
    'wasm_exec.js',
    'worker.js',
    'db.json',
    'leftover_db.json',
    'item_first_seen.json',
    'calibrations.json',
]

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

/** Browser storage APIs the page's own code must never use. */
const STORAGE =
    /\b(sessionStorage|indexedDB|document\.cookie|cookieStore|caches|openDatabase)\b/
/** The one module allowed to touch localStorage, from the package root. */
const REMEMBERED_FILE = 'src/remembered-file.ts'

let buildExitCode: number | null = null
let buildOutput = ''

/** `source` without its comments. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/**
 * How `code` (a source file without comments, at `path` from the package
 * root) breaks the storage rule: no storage API but localStorage, and
 * localStorage only in `src/remembered-file.ts`, reached once, and only
 * read, written and removed under `REMEMBERED_FILE_KEY`.
 */
function storageProblems(path: string, code: string): string[] {
    const problems: string[] = []
    const other = code.match(STORAGE)
    if (other) problems.push(`${path} uses ${other[1]}`)
    const local = code.match(/\blocalStorage\b/g) ?? []
    const calls = [
        ...code.matchAll(/\.(getItem|setItem|removeItem|key|clear)\(([^,)]*)/g),
    ]
    if (path !== REMEMBERED_FILE) {
        if (local.length > 0) problems.push(`${path} uses localStorage`)
        for (const [, method] of calls)
            if (method !== 'key' && method !== 'clear')
                problems.push(`${path} calls ${method}`)
        return problems
    }
    if (local.length !== 1)
        problems.push(
            `${path} names localStorage ${local.length} times, not once`
        )
    if (/\blocalStorage\s*\[/.test(code))
        problems.push(`${path} indexes localStorage`)
    for (const [, method, key] of calls) {
        if (method === 'key' || method === 'clear')
            problems.push(`${path} calls ${method}`)
        else if (key!.trim() !== 'REMEMBERED_FILE_KEY')
            problems.push(`${path} uses the key ${key!.trim()}`)
    }
    const keys = code.match(/(['"`])armory:[^'"`]*\1/g) ?? []
    if (keys.length !== 1 || keys[0]!.slice(1, -1) !== REMEMBERED_FILE_KEY)
        problems.push(`${path} names a key other than ${REMEMBERED_FILE_KEY}`)
    return problems
}

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

    // The armory build copies the sim's build; Luca's checks don't build it.
    ensureSimBuild()

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
}, 900_000)

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

    test('the prerendered page has the title and the Armory h1', () => {
        const html = readFileSync(INDEX_HTML, 'utf8')
        expect(html).toContain('<title>Armory</title>')
        expect(html).toMatch(/<h1[^>]*>Armory<\/h1>/)
    })

    test('the prerendered page is dark only: its <html> has the class dark', () => {
        const html = readFileSync(INDEX_HTML, 'utf8')
        const tag = html.match(/<html\b[^>]*>/)
        expect(tag).not.toBeNull()
        const classes = tag![0].match(/\bclass="([^"]*)"/)?.[1] ?? ''
        expect(classes.split(/\s+/)).toContain('dark')
    })

    test('the page loads only its own files', () => {
        const html = readFileSync(INDEX_HTML, 'utf8')
        const refs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map(
            (m) => m[1]
        )
        expect(refs.length).toBeGreaterThan(0)
        for (const ref of refs) expect(ref).toMatch(/^\/assets\/[\w.-]+$/)

        // The CSS imports nothing, and its only url()s are the page's own
        // font files (JetBrains Mono, self-hosted) under /assets/.
        for (const file of filesUnder(CLIENT_DIR, '.css')) {
            const css = readFileSync(file, 'utf8')
            expect(css).not.toMatch(/@import/)
            const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) =>
                m[1]!.replace(/^['"]|['"]$/g, '')
            )
            for (const url of urls)
                expect(url).toMatch(/^\/assets\/[\w.-]+\.woff2?$/)
        }
    })

    test("the character art is the page's own: every url in the manifest is a same-origin /art/ path, and the build carries the file", () => {
        expect(ART.length).toBeGreaterThan(0)
        for (const art of ART) {
            expect(art.url).toMatch(/^\/art\/[a-z0-9-]+\.webp$/)
            expect(new URL(art.url, 'https://armory.example').host).toBe(
                'armory.example'
            )
            const built = join(CLIENT_DIR, art.url)
            expect({ url: art.url, built: existsSync(built) }).toEqual({
                url: art.url,
                built: true,
            })
            expect(statSync(built).size).toBe(art.bytes)
        }
    })

    test('JetBrains Mono is self-hosted: its latin 400 and 700 woff2 files are in the build', () => {
        const fonts = filesUnder(join(CLIENT_DIR, 'assets'), '.woff2').map(
            (file) => file.slice(file.lastIndexOf('/') + 1)
        )
        expect(
            fonts.some((name) => name.startsWith('jetbrains-mono-latin-400'))
        ).toBe(true)
        expect(
            fonts.some((name) => name.startsWith('jetbrains-mono-latin-700'))
        ).toBe(true)
    })

    test('the CSS has no Tailwind utilities the page does not use', () => {
        // Tailwind scans only the folders src/styles.css names with
        // `@source` (the components), never the samples or the schema, whose
        // words ("static", "table") it took for classes. Every class in the
        // built CSS must be written in one of those files.
        // Without url()s: the font files' names aren't classes.
        const css = filesUnder(CLIENT_DIR, '.css')
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n')
            .replace(/url\([^)]*\)/g, '')
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

    test("puts the sim's module, runtime, worker and item data under build/client/sim/, and every built file is under 25 MiB", () => {
        for (const name of SIM_FILES) {
            const built = join(CLIENT_DIR, 'sim', name)
            expect({ name, built: existsSync(built) }).toEqual({
                name,
                built: true,
            })
            const source = readFileSync(join(SIM_BUILD, name))
            expect(readFileSync(built).equals(source)).toBe(true)
        }

        const files = readdirSync(CLIENT_DIR, {
            recursive: true,
            encoding: 'utf8',
        })
            .map((name) => join(CLIENT_DIR, name))
            .filter((path) => statSync(path).isFile())
        expect(files.length).toBeGreaterThan(SIM_FILES.length)
        const tooBig = files.filter(
            (path) => statSync(path).size >= MAX_ASSET_BYTES
        )
        expect(tooBig).toEqual([])
    })

    test('no URL in the built JavaScript points at a server', () => {
        // Go's own wasm_exec.js names github.com in a comment: skipped by name.
        const goRuntime = join(CLIENT_DIR, 'sim/wasm_exec.js')
        const hosts = new Set<string>()
        for (const file of filesUnder(CLIENT_DIR, '.js')) {
            if (file === goRuntime) continue
            const js = readFileSync(file, 'utf8')
            for (const m of js.matchAll(/\b(?:https?|wss?):\/\/([\w.-]+)/g))
                hosts.add(m[1]!)
        }
        expect([...hosts].filter((h) => !NAME_ONLY_HOSTS.has(h))).toEqual([])
    })

    test('carries no trace of the local latest file, though vite.config.ts registers its plugin', () => {
        const config = readFileSync(join(PACKAGE_DIR, 'vite.config.ts'), 'utf8')
        expect(config).toMatch(/\blatestPlugin\(/)
        const traces = [
            '/local/latest',
            // The export the dev route serves for Run Simulator.
            'latest-export',
            'local-latest',
            'latest_results_file',
            'vite-plugin-latest',
            'Loaded from this computer',
            // The page's dev-only header buttons: the wiring that makes them
            // must fold away in a build, not only `src/local-latest.ts`.
            'Open another file',
            'Back to the latest from this computer',
        ]
        const files = readdirSync(CLIENT_DIR, {
            recursive: true,
            encoding: 'utf8',
        })
            .map((name) => join(CLIENT_DIR, name))
            .filter((path) => statSync(path).isFile())
        expect(files.length).toBeGreaterThan(0)
        const found = files.flatMap((file) => {
            const text = readFileSync(file).toString('latin1')
            return traces
                .filter((trace) => text.includes(trace))
                .map(
                    (trace) => `${file.slice(CLIENT_DIR.length + 1)}: ${trace}`
                )
        })
        expect(found).toEqual([])
    })
})

describe("the page's own code", () => {
    // React Router's client code has fetch and sessionStorage in it; with
    // no loaders, no actions and every route in the first page
    // (`routeDiscovery: 'initial'`), it asks the server for nothing. Our
    // code must not use them either. It keeps one thing in the browser:
    // the last results file, in `src/remembered-file.ts`.
    // The sim's TypeScript API, its worker script, and the worker as
    // `sim:build` copies it are the page's code too. Read once the build
    // has run, as `packages/sim/build/worker.js` comes from it.
    const sources = () => [
        ...filesUnder(join(PACKAGE_DIR, 'src'), '.ts'),
        ...filesUnder(join(PACKAGE_DIR, 'src'), '.tsx'),
        ...filesUnder(join(PACKAGE_DIR, 'workers'), '.ts'),
        ...filesUnder(join(SIM_DIR, 'src'), '.ts'),
        ...filesUnder(join(SIM_DIR, 'src'), '.js'),
        ...(existsSync(join(SIM_BUILD, 'worker.js'))
            ? [join(SIM_BUILD, 'worker.js')]
            : []),
    ]
    const code = (file: string) => withoutComments(readFileSync(file, 'utf8'))
    const slashes = (path: string) => path.split('\\').join('/')
    const fromRepo = (file: string) => slashes(file.slice(REPO_ROOT.length + 1))
    /** Paths from the armory package for its files, from the repo for others. */
    const fromPackage = (file: string) =>
        fromRepo(file).startsWith('packages/armory/')
            ? fromRepo(file).slice('packages/armory/'.length)
            : fromRepo(file)

    test('asks no server for anything', () => {
        const all = sources()
        expect(all.map(fromRepo)).toContain(LOADER)
        const problems = all.flatMap((file) =>
            networkProblems(
                fromRepo(file),
                // The Worker's own `fetch(request)` handler is not a request.
                code(file).replace(/^\s*fetch\(request\)\s*\{/m, '')
            )
        )
        expect(problems).toEqual([])
    })

    test('the network rule reports a fetch outside loader.ts or one in it not of new URL(, and passes the loader as written', () => {
        const loader = code(join(REPO_ROOT, LOADER))
        expect(loader).toContain('fetch(new URL(')
        expect(networkProblems(LOADER, loader)).toEqual([])
        // The worker script, and its copy in the sim's build, are scanned too.
        expect(sources().map(fromRepo)).toEqual(
            expect.arrayContaining([
                'packages/sim/src/worker.js',
                'packages/sim/build/worker.js',
            ])
        )

        const bad: [string, string][] = [
            ['packages/armory/src/app.tsx', "await fetch('/sim/db.json')"],
            [
                'packages/sim/src/pool.ts',
                "await fetch(new URL('db.json', base))",
            ],
            ['packages/sim/src/worker.js', "fetch(new URL('lib.wasm.gz', b))"],
            [LOADER, loader + '\nawait fetch(url)'],
            [LOADER, loader + "\nawait fetch('https://example.com/x')"],
            [LOADER, loader + '\nconst get = fetch'],
            [LOADER, loader + '\nnew XMLHttpRequest()'],
            ['packages/sim/src/pool.ts', 'navigator.sendBeacon("/x")'],
            [LOCAL_LATEST, 'await fetch(someVariable)'],
            [LOCAL_LATEST, "await fetch('https://example.com/local/x')"],
            [LOCAL_LATEST, 'const get = fetch'],
            [
                'packages/armory/src/app.tsx',
                "await fetch('/local/latest.json')",
            ],
        ]
        for (const [path, source] of bad)
            expect({
                path,
                source,
                reported: networkProblems(path, source).length > 0,
            }).toEqual({ path, source, reported: true })

        // src/local-latest.ts may fetch a '/local/' string, with options.
        expect(
            networkProblems(
                LOCAL_LATEST,
                "const answer = await fetch('/local/latest.json', { headers })"
            )
        ).toEqual([])
    })

    test('keeps only the last results file in the browser, under one localStorage key, from one module', () => {
        const all = sources()
        expect(all.map(fromPackage)).toContain(REMEMBERED_FILE)
        expect(REMEMBERED_FILE_KEY).toBe('armory:last-results-file')
        expect(
            all.flatMap((file) =>
                storageProblems(fromPackage(file), code(file))
            )
        ).toEqual([])
    })

    test('the storage rule fails any other storage, key or module', () => {
        const ok = `const KEY = '${REMEMBERED_FILE_KEY}'
            const store = () => globalThis.localStorage
            store().getItem(REMEMBERED_FILE_KEY)
            store().setItem(REMEMBERED_FILE_KEY, text)
            store().removeItem(REMEMBERED_FILE_KEY)`
        expect(storageProblems(REMEMBERED_FILE, ok)).toEqual([])
        const bad: [string, string][] = [
            ['src/app.tsx', 'localStorage.getItem(REMEMBERED_FILE_KEY)'],
            ['src/app.tsx', 'store().setItem(REMEMBERED_FILE_KEY, text)'],
            [REMEMBERED_FILE, ok + "\nstore().setItem('armory:other', text)"],
            [REMEMBERED_FILE, ok + '\nstore().setItem(OTHER_KEY, text)'],
            [REMEMBERED_FILE, ok + '\nstore().clear()'],
            [REMEMBERED_FILE, ok + '\nconst again = localStorage'],
            [
                REMEMBERED_FILE,
                ok + '\nsessionStorage.setItem(REMEMBERED_FILE_KEY, text)',
            ],
            [REMEMBERED_FILE, ok + '\nindexedDB.open("x")'],
            ['src/app.tsx', 'document.cookie = "a=b"'],
            ['src/app.tsx', 'caches.open("x")'],
        ]
        for (const [path, source] of bad)
            expect(storageProblems(path, source)).not.toEqual([])
    })
})
