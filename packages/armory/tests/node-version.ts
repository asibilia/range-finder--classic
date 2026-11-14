/**
 * Which Node the armory build needs, and the check the build test runs
 * before it builds. Pure, so `node-version.test.ts` can check it without
 * swapping the real Node.
 */
import { z } from 'zod'

/** The oldest Node React Router 8 runs on; the root `engines.node` too. */
export const MINIMUM_NODE = '22.22.0'

/** `node --version` output, e.g. `v22.22.0`, as [major, minor, patch]. */
const NodeVersionSchema = z
    .string()
    .trim()
    .regex(/^v?\d+\.\d+\.\d+$/)
    .transform((v) => v.replace(/^v/, '').split('.').map(Number))

const minimum = NodeVersionSchema.parse(MINIMUM_NODE)

function atLeastMinimum(version: number[]): boolean {
    for (let i = 0; i < minimum.length; i++) {
        const have = version[i] ?? 0
        const need = minimum[i] ?? 0
        if (have !== need) return have > need
    }
    return true
}

/**
 * Says what is wrong with the Node on the PATH for building the page, or
 * null when it is new enough.
 *
 * @param found - the trimmed-or-not output of `node --version`, or null
 *     when there is no `node` to run
 * @returns null when `found` is 22.22.0 or newer; otherwise the message
 *     `this test builds the page and needs Node 22.22 or newer; found <found>`
 *     (`no node` when `found` is null or empty)
 *
 * @example
 * nodeVersionProblem('v24.1.0') // null
 * nodeVersionProblem('v20.11.1')
 * // 'this test builds the page and needs Node 22.22 or newer; found v20.11.1'
 */
export function nodeVersionProblem(found: string | null): string | null {
    const shown = found?.trim() || 'no node'
    const parsed = NodeVersionSchema.safeParse(found ?? '')
    if (parsed.success && atLeastMinimum(parsed.data)) return null
    return `this test builds the page and needs Node 22.22 or newer; found ${shown}`
}

/**
 * Runs `node --version` from the PATH, as `bunx react-router` will.
 *
 * @returns its trimmed output, or null when there is no `node` to run or it
 *     fails
 */
export function readNodeVersion(): string | null {
    try {
        const result = Bun.spawnSync(['node', '--version'], {
            stdout: 'pipe',
            stderr: 'pipe',
        })
        if (result.exitCode !== 0) return null
        return result.stdout.toString().trim() || null
    } catch {
        return null
    }
}
