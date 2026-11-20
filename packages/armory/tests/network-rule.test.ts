/**
 * The network rule the build-output test applies to the page's own code:
 * narrowly scoped same-origin fetches, plus the official Wowhead script in
 * its one loader. No product module calls Wowhead's tooltip-data endpoint.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// A path in a variable, so the rest of the suite loads before it exists.
const RULE = join(import.meta.dir, 'network-rule.ts')
const LOCAL_LATEST = 'packages/armory/src/local-latest.ts'
const WOWHEAD_LOADER = 'packages/armory/src/wowhead-loader.ts'

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

describe('the Wowhead script boundary', () => {
    test('passes only the official script in its loader', async () => {
        const official = `const URL = 'https://wow.zamimg.com/js/tooltips.js'
            const script = document.createElement('script')`
        expect(await networkProblems(WOWHEAD_LOADER, official)).toEqual([])
        expect(
            await networkProblems('packages/armory/src/app.tsx', official)
        ).not.toEqual([])
        expect(
            await networkProblems(
                WOWHEAD_LOADER,
                official.replace('wow.zamimg.com', 'example.com')
            )
        ).not.toEqual([])
    })

    test('rejects direct tooltip JSON and environment calls', async () => {
        const official = `const URL = 'https://wow.zamimg.com/js/tooltips.js'
            const script = document.createElement('script')`
        for (const direct of [
            "fetch('https://nether.wowhead.com/tooltip/item/1?dataEnv=16')",
            "const env = 'dataEnv=16'",
        ])
            expect(
                await networkProblems(WOWHEAD_LOADER, official + direct)
            ).not.toEqual([])
    })
})
