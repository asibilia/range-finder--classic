/**
 * The network rule the build-output test applies to the page's own code
 * (`tests/network-rule.ts`): `fetch` only in the sim's loader, of
 * `new URL(`, and in `src/local-latest.ts`, of a string literal starting
 * `'/local/'`, with an optional options argument.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// A path in a variable, so the rest of the suite loads before it exists.
const RULE = join(import.meta.dir, 'network-rule.ts')
const LOCAL_LATEST = 'packages/armory/src/local-latest.ts'

async function networkProblems(path: string, code: string): Promise<string[]> {
    const mod = (await import(RULE)) as {
        networkProblems: (path: string, code: string) => string[]
    }
    return mod.networkProblems(path, code)
}

describe('the network rule in src/local-latest.ts', () => {
    test("reports fetch(someVariable) and passes fetch('/local/latest.json', { headers })", async () => {
        expect(
            await networkProblems(
                LOCAL_LATEST,
                'const answer = await fetch(someVariable)'
            )
        ).not.toEqual([])
        expect(
            await networkProblems(
                LOCAL_LATEST,
                "const answer = await fetch('/local/latest.json', { headers })"
            )
        ).toEqual([])
    })

    test("still reports fetch('/local/latest.json') anywhere else", async () => {
        expect(
            await networkProblems(
                'packages/armory/src/app.tsx',
                "await fetch('/local/latest.json')"
            )
        ).not.toEqual([])
    })
})
