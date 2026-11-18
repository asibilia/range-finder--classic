/**
 * Fast and slow test files stay apart. A test file that runs the real WASM
 * sim (it calls `createSimPool(`, `loadSim(`, `loadModule(` or
 * `raidSimJson(`) is slow, and is named `<name>.slow.test.ts`; a fast file
 * gives no test or hook a time limit above 2000 ms, except a `beforeAll`
 * that only calls `ensureSimBuild()` (a fresh checkout builds the sim
 * first). The fast set runs with bun's `--timeout=2000`.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../..')
const TEST_DIRS = ['packages/armory/tests', 'packages/sim/tests']
/** The scan tests, whose own text names the calls they look for. */
const SKIPPED = new Set(['slow-split.test.ts', 'test-pools.test.ts'])
const SLOW_SUFFIX = '.slow.test.ts'
/** The calls that make a real pool or run the WASM. */
const WASM_CALLS = ['createSimPool(', 'loadSim(', 'loadModule(', 'raidSimJson(']
/** The calls whose last argument can be a time limit. */
const LIMITED_CALLS = [
    'test',
    'it',
    'beforeAll',
    'beforeEach',
    'afterAll',
    'afterEach',
]
/** The longest time limit a fast file may give, in milliseconds. */
const LONGEST = 2000

export type SlowReason = 'runs the WASM' | 'time limit above 2000 ms'
/** A fast file and why it is slow. */
export type SlowFinding = { path: string; reason: SlowReason }

/** A line that is a comment: it starts, after spaces, with `//`, `*` or `/*`. */
function isCommentLine(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line)
}

/** The file's text with its comment lines blanked (line breaks kept). */
function codeOf(text: string): string {
    return text
        .split('\n')
        .map((line) => (isCommentLine(line) ? '' : line))
        .join('\n')
}

/**
 * The index just past a string that opens at `at` (`'`, `"` or a backtick),
 * so brackets inside strings and test titles are not counted.
 */
function pastString(text: string, at: number): number {
    const quote = text[at]
    for (let i = at + 1; i < text.length; i++) {
        if (text[i] === '\\') i++
        else if (text[i] === quote) return i + 1
    }
    return text.length
}

/**
 * The text between a call's opening paren (at `open`) and its matching
 * close, skipping strings; to the end of the text when it never closes.
 */
function argumentsAt(text: string, open: number): string {
    let depth = 0
    for (let at = open; at < text.length; at++) {
        const char = text[at]!
        if (char === "'" || char === '"' || char === '`') {
            at = pastString(text, at) - 1
        } else if (char === '(') depth++
        else if (char === ')' && --depth === 0) return text.slice(open + 1, at)
    }
    return text.slice(open + 1)
}

/** `600_000` as 600000; NaN for anything but a plain number. */
function numberOf(literal: string): number {
    return /^\d[\d_]*(\.\d+)?$/.test(literal)
        ? Number(literal.replaceAll('_', ''))
        : Number.NaN
}

/**
 * The time limit a call's arguments end with: a number, or an object's
 * `timeout`, as the last argument. Undefined when the last argument is
 * neither (a callback, a title).
 */
function lastLimit(args: string): number | undefined {
    const trimmed = args.replace(/[\s,]+$/, '')
    const number = /,\s*(\d[\d_]*(?:\.\d+)?)$/.exec(trimmed)
    if (number) return numberOf(number[1]!)
    if (!trimmed.endsWith('}')) return undefined
    // The object's opening brace, matched back from its close.
    let depth = 0
    for (let at = trimmed.length - 1; at >= 0; at--) {
        if (trimmed[at] === '}') depth++
        else if (trimmed[at] === '{' && --depth === 0) {
            // An object argument follows a comma; a function body follows `=>` or `)`.
            if (!trimmed.slice(0, at).trimEnd().endsWith(',')) return undefined
            const timeout = /\btimeout\s*:\s*(\d[\d_]*(?:\.\d+)?)/.exec(
                trimmed.slice(at)
            )
            return timeout ? numberOf(timeout[1]!) : undefined
        }
    }
    return undefined
}

/**
 * True for a hook whose function only calls `ensureSimBuild(` without
 * `always`: `() => ensureSimBuild()` or `() => { ensureSimBuild({ ... }) }`.
 */
function onlyBuilds(args: string): boolean {
    const body = /^\s*(?:async\s*)?\(\s*\)\s*=>\s*([\s\S]*?)\s*,[^,]*$/.exec(
        args.replace(/[\s,]+$/, '')
    )
    if (!body) return false
    const call = body[1]!.replace(/^\{\s*([\s\S]*?);?\s*\}$/, '$1').trim()
    return (
        /^ensureSimBuild\([\s\S]*\)$/.test(call) &&
        !call.includes('always') &&
        argumentsAt(call, 'ensureSimBuild'.length).length ===
            call.length - 'ensureSimBuild()'.length
    )
}

/** True when the code gives a test or hook a time limit above 2000 ms. */
function hasLongLimit(code: string): boolean {
    const calls = new RegExp(
        `(?<![\\w$.])(${LIMITED_CALLS.join('|')}|setDefaultTimeout)\\s*\\(`,
        'g'
    )
    for (const match of code.matchAll(calls)) {
        const name = match[1]!
        const args = argumentsAt(code, match.index + match[0].length - 1)
        if (name === 'setDefaultTimeout') {
            if (numberOf(args.trim()) > LONGEST) return true
            continue
        }
        const limit = lastLimit(args)
        if (limit === undefined || !(limit > LONGEST)) continue
        if (name === 'beforeAll' && onlyBuilds(args)) continue
        return true
    }
    return false
}

/**
 * The slow things in fast test files: once per file and reason, a file
 * that runs the WASM and one that gives a test or hook a time limit above
 * 2000 ms. Files ending in `.slow.test.ts`, the scan tests themselves
 * (`slow-split.test.ts`, `test-pools.test.ts`) and comment lines are
 * skipped.
 *
 * @param files - Each file's path (as it should read in the result) and text.
 * @returns One `{ path, reason }` per slow file and reason, in file order
 * (`runs the WASM` first); `[]` when every fast file is fast.
 *
 * @example
 * ```typescript
 * findSlowInFast([{ path: 'a.test.ts', text: 'createSimPool({ size: 2 })' }])
 * // [{ path: 'a.test.ts', reason: 'runs the WASM' }]
 * findSlowInFast([{ path: 'a.test.ts', text: "beforeAll(() => ensureSimBuild(), 600_000)" }])
 * // []
 * ```
 */
export function findSlowInFast(
    files: { path: string; text: string }[]
): SlowFinding[] {
    const found: SlowFinding[] = []
    for (const { path, text } of files) {
        if (path.endsWith(SLOW_SUFFIX) || SKIPPED.has(basename(path))) continue
        const code = codeOf(text)
        if (WASM_CALLS.some((call) => code.includes(call)))
            found.push({ path, reason: 'runs the WASM' })
        if (hasLongLimit(code))
            found.push({ path, reason: 'time limit above 2000 ms' })
    }
    return found
}

/** Every test file under the armory's and the sim's tests. */
function testFiles(): { path: string; text: string }[] {
    const glob = new Bun.Glob('**/*.test.{ts,tsx}')
    return TEST_DIRS.flatMap((dir) =>
        Array.from(glob.scanSync({ cwd: join(REPO_ROOT, dir) })).map((file) => {
            const path = `${dir}/${file}`
            return {
                path,
                text: readFileSync(join(REPO_ROOT, path), 'utf8'),
            }
        })
    )
}

describe('findSlowInFast', () => {
    const check = (text: string, path = 'a.test.ts') =>
        findSlowInFast([{ path, text }])
    const wasm: SlowFinding[] = [{ path: 'a.test.ts', reason: 'runs the WASM' }]
    const limit = (path: string): SlowFinding[] => [
        { path, reason: 'time limit above 2000 ms' },
    ]

    test('names a fast file that calls createSimPool(, loadSim(, loadModule( or raidSimJson(, and skips a slow file', () => {
        expect(check('createSimPool(')).toEqual(wasm)
        expect(check('createSimPool(', 'a.slow.test.ts')).toEqual([])
        expect(check('const sim = await loadSim({ base })')).toEqual(wasm)
        expect(check('await loadModule(url)')).toEqual(wasm)
        expect(check('raidSimJson(request)')).toEqual(wasm)
        expect(check('createSimPool(\nloadSim(')).toEqual(wasm)
    })

    test('skips comment lines and the scan tests', () => {
        expect(check('// createSimPool(')).toEqual([])
        expect(check(' * loadSim({ base })')).toEqual([])
        expect(check('/* raidSimJson( */')).toEqual([])
        expect(check('createSimPool(', 'x/slow-split.test.ts')).toEqual([])
        expect(check('createSimPool(', 'x/test-pools.test.ts')).toEqual([])
    })

    test('names a test, it or hook whose last argument is a limit above 2000 ms, or a setDefaultTimeout above it', () => {
        const b = (text: string) => check(text, 'b.test.ts')
        expect(b("test('x', () => {\n}, 600_000)")).toEqual(limit('b.test.ts'))
        expect(b("test('x', () => {}, { timeout: 60_000 })")).toEqual(
            limit('b.test.ts')
        )
        expect(b('setDefaultTimeout(5000)')).toEqual(limit('b.test.ts'))
        expect(b("it('x', async () => {\n    await go()\n}, 2001)")).toEqual(
            limit('b.test.ts')
        )
        expect(b('afterEach(() => {\n    stop()\n},\n    120_000\n)')).toEqual(
            limit('b.test.ts')
        )
        expect(
            b("test(\n    'x',\n    () => {},\n    { timeout: 60_000 }\n)")
        ).toEqual(limit('b.test.ts'))
    })

    test('passes limits of 2000 ms or less, numbers that are not limits, and a beforeAll that only builds the sim', () => {
        expect(check("test('x', () => {}, 2000)")).toEqual([])
        expect(check("test('x', () => {}, { timeout: 1500 })")).toEqual([])
        expect(check('setDefaultTimeout(2000)')).toEqual([])
        expect(check("test('item (999999) at 600_000', () => {})")).toEqual([])
        expect(check("test('x', () => {\n    wait(5000)\n})")).toEqual([])
        expect(
            check(
                "test('x', async () => {\n    await find({ timeout: 4000 })\n})"
            )
        ).toEqual([])
        expect(check('beforeAll(() => ensureSimBuild(), 600_000)')).toEqual([])
        expect(
            check(
                "beforeAll(() => ensureSimBuild({ needs: ['weights/a.json'] }), 600_000)"
            )
        ).toEqual([])
    })

    test('names a beforeAll that forces the build, or does more than build', () => {
        expect(
            check('beforeAll(() => ensureSimBuild({ always: true }), 600_000)')
        ).toEqual(limit('a.test.ts'))
        expect(
            check(
                'beforeAll(() => {\n    ensureSimBuild()\n    started = now()\n}, 600_000)'
            )
        ).toEqual(limit('a.test.ts'))
        expect(check('beforeEach(() => ensureSimBuild(), 600_000)')).toEqual(
            limit('a.test.ts')
        )
    })

    test('gives one entry per file and reason, in file order', () => {
        expect(
            findSlowInFast([
                {
                    path: 'a.test.ts',
                    text: "createSimPool(\ntest('x', () => {}, 9000)",
                },
                {
                    path: 'b.test.ts',
                    text: "test('x', () => {}, 9000)\ntest('y', () => {}, 9000)",
                },
                { path: 'c.test.ts', text: "test('x', () => {})" },
            ])
        ).toEqual([...wasm, ...limit('a.test.ts'), ...limit('b.test.ts')])
    })
})

test("no fast test file in the armory's or the sim's tests runs the WASM or gives a time limit above 2000 ms", () => {
    const files = testFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(findSlowInFast(files)).toEqual([])
})
