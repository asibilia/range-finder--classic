/**
 * Test pools stay small. A pool's default size is the computer's cores
 * minus one, up to 8, and each worker holds a whole compiled sim, so every
 * `createSimPool(` call in the armory's and the sim's tests passes an
 * explicit `size` of 3 or less.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../..')
const TEST_DIRS = ['packages/armory/tests', 'packages/sim/tests']
/** The scan tests, whose own text names the calls they look for. */
const SKIPPED = new Set(['test-pools.test.ts', 'slow-split.test.ts'])
const CALL = 'createSimPool('
const LARGEST = 3

/** The index just past a string that opens at `at`. */
function pastString(text: string, at: number): number {
    const quote = text[at]
    for (let i = at + 1; i < text.length; i++) {
        if (text[i] === '\\') i++
        else if (text[i] === quote) return i + 1
    }
    return text.length
}

/** The text with comments blanked, preserving strings and line breaks. */
function withoutComments(text: string): string {
    let code = ''
    for (let at = 0; at < text.length;) {
        const char = text[at]!
        if (char === "'" || char === '"' || char === '`') {
            const end = pastString(text, at)
            code += text.slice(at, end)
            at = end
        } else if (char === '/' && text[at + 1] === '/') {
            const newline = text.indexOf('\n', at)
            const end = newline === -1 ? text.length : newline
            code += ' '.repeat(end - at)
            at = end
        } else if (char === '/' && text[at + 1] === '*') {
            const close = text.indexOf('*/', at + 2)
            const end = close === -1 ? text.length : close + 2
            code += text.slice(at, end).replace(/[^\n]/g, ' ')
            at = end
        } else {
            code += char
            at++
        }
    }
    return code
}

/** The text between a call's opening paren (at `open`) and its matching close. */
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

/** The top-level properties of a call's object argument. */
function propertiesOf(args: string): string[] {
    const object = args.trim()
    if (!object.startsWith('{') || !object.endsWith('}')) return []
    const body = object.slice(1, -1)
    const properties: string[] = []
    let start = 0
    let depth = 0
    for (let at = 0; at < body.length; at++) {
        const char = body[at]!
        if (char === "'" || char === '"' || char === '`') {
            at = pastString(body, at) - 1
        } else if ('({['.includes(char)) depth++
        else if (')}]'.includes(char)) depth--
        else if (char === ',' && depth === 0) {
            properties.push(body.slice(start, at))
            start = at + 1
        }
    }
    properties.push(body.slice(start))
    return properties
}

/** A JavaScript number, or NaN for a dynamic expression. */
function numberOf(literal: string): number {
    if (
        !/^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)$/.test(
            literal
        )
    )
        return Number.NaN
    return Number(literal.replaceAll('_', ''))
}

/** Whether a call's top-level `size` is explicitly small or an allowed test value. */
function hasSmallSize(args: string): boolean {
    const values = propertiesOf(args)
        .map((property) =>
            /^(?:size|'size'|"size")\s*:\s*([\s\S]+)$/.exec(property.trim())
        )
        .filter((match) => match !== null)
        .map((match) => match[1]!.trim())
    const value = values.at(-1)
    if (value === undefined) return false
    if (value === 'real.size' || value === 'undefined') return true
    const size = numberOf(value)
    return Number.isFinite(size) && size <= LARGEST
}

/**
 * The problems with the sim pools a set of test files make: once per
 * `createSimPool(` call whose argument object has no top-level `size`, or a
 * `size` that is not a number of 3 or less (`real.size` and `undefined` are
 * allowed for the tests that explicitly cover those pool sizes).
 *
 * @param files - Each file's path (as it should read in the problem) and text.
 * @returns One `<path>: createSimPool( without a size of 3 or less` per such
 * call, in file order; `[]` when every pool is small.
 *
 * @example
 * ```typescript
 * poolSizeProblems([{ path: 'a.test.ts', text: 'createSimPool({ base: BASE })' }])
 * // ['a.test.ts: createSimPool( without a size of 3 or less']
 * ```
 */
export function poolSizeProblems(
    files: { path: string; text: string }[]
): string[] {
    const problems: string[] = []
    for (const { path, text } of files) {
        const code = withoutComments(text)
        let at = code.indexOf(CALL)
        while (at !== -1) {
            const open = at + CALL.length - 1
            if (!hasSmallSize(argumentsAt(code, open)))
                problems.push(`${path}: ${CALL} without a size of 3 or less`)
            at = code.indexOf(CALL, at + CALL.length)
        }
    }
    return problems
}

/** Every test file under the armory's and the sim's tests, but the scans. */
function testFiles(): { path: string; text: string }[] {
    const glob = new Bun.Glob('**/*.test.{ts,tsx}')
    return TEST_DIRS.flatMap((dir) =>
        Array.from(glob.scanSync({ cwd: join(REPO_ROOT, dir) }))
            .filter((file) => !SKIPPED.has(basename(file)))
            .map((file) => {
                const path = `${dir}/${file}`
                return {
                    path,
                    text: readFileSync(join(REPO_ROOT, path), 'utf8'),
                }
            })
    )
}

describe('poolSizeProblems', () => {
    const problem = 'a.test.ts: createSimPool( without a size of 3 or less'
    const check = (text: string) =>
        poolSizeProblems([{ path: 'a.test.ts', text }])

    test('names a call with no size', () => {
        expect(check('createSimPool({ base: BASE })')).toEqual([problem])
    })

    test('passes a size of 2, a size from another pool, and a comment line', () => {
        expect(check('createSimPool({ base: BASE, size: 2 })')).toEqual([])
        expect(
            check('createSimPool({ base: BASE, size: 2 /* workers */ })')
        ).toEqual([])
        expect(check('createSimPool({ base: BASE, size: 1e0 })')).toEqual([])
        expect(check('createSimPool({ base: BASE, size: real.size })')).toEqual(
            []
        )
        expect(check('createSimPool({ base: BASE, size: undefined })')).toEqual(
            []
        )
        expect(check('// createSimPool({ base: BASE })')).toEqual([])
        expect(check('/*\n  * createSimPool({ base: BASE })\n */')).toEqual([])
    })

    test('names a commented-out, nested, unrecognized or oversized size', () => {
        expect(
            check('createSimPool({\n    base: BASE,\n    // size: 2,\n})')
        ).toEqual([problem])
        expect(
            check('createSimPool({ base: BASE, options: { size: 2 } })')
        ).toEqual([problem])
        expect(check('createSimPool({ base: BASE, size: workers })')).toEqual([
            problem,
        ])
        expect(
            check('createSimPool({ base: BASE, size: 8 /* workers */ })')
        ).toEqual([problem])
        expect(check('createSimPool({ base: BASE, size: 1e1 })')).toEqual([
            problem,
        ])
    })

    test('names a size above 3, once per call', () => {
        expect(check('createSimPool({ base: BASE, size: 8 })')).toEqual([
            problem,
        ])
        expect(
            check(
                'createSimPool({ base: BASE })\ncreateSimPool({\n    base: x,\n    size: 3,\n})'
            )
        ).toEqual([problem])
        expect(check('createSimPool({ base: url(a), ...options })')).toEqual([
            problem,
        ])
    })
})

test("every createSimPool( call in the armory's and the sim's tests has a size of 3 or less", () => {
    const files = testFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(poolSizeProblems(files)).toEqual([])
})
