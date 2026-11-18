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

/** A line that is a comment: it starts, after spaces, with `//`, `*` or `/*`. */
function isCommentLine(line: string): boolean {
    return /^\s*(\/\/|\*|\/\*)/.test(line)
}

/** The text between a call's opening paren (at `open`) and its matching close. */
function argumentsAt(text: string, open: number): string {
    let depth = 0
    for (let at = open; at < text.length; at++) {
        if (text[at] === '(') depth++
        else if (text[at] === ')' && --depth === 0)
            return text.slice(open + 1, at)
    }
    return text.slice(open + 1)
}

/** Whether a call's arguments give a `size` that is not a number above 3. */
function hasSmallSize(args: string): boolean {
    const given = /(?:^|[{,\s])size\s*(?::\s*([^,}\n]+))?\s*[,}\n]/.exec(args)
    if (!given) return false
    const value = given[1]?.trim()
    if (value === undefined || !/^\d[\d_]*(\.\d+)?$/.test(value)) return true
    return Number(value.replaceAll('_', '')) <= LARGEST
}

/**
 * The problems with the sim pools a set of test files make: once per
 * `createSimPool(` call (outside comment lines) whose argument object has
 * no `size`, or a `size` that is a number above 3.
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
        let at = text.indexOf(CALL)
        while (at !== -1) {
            const lineStart = text.lastIndexOf('\n', at) + 1
            const lineEnd = text.indexOf('\n', at)
            const line = text.slice(
                lineStart,
                lineEnd === -1 ? undefined : lineEnd
            )
            const open = at + CALL.length - 1
            if (!isCommentLine(line) && !hasSmallSize(argumentsAt(text, open)))
                problems.push(`${path}: ${CALL} without a size of 3 or less`)
            at = text.indexOf(CALL, at + CALL.length)
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
        expect(check('createSimPool({ base: BASE, size: real.size })')).toEqual(
            []
        )
        expect(check('// createSimPool({ base: BASE })')).toEqual([])
        expect(check('  * createSimPool({ base: BASE })')).toEqual([])
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
