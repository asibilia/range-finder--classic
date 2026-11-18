/**
 * From a dropped export to a results file in the browser: `simExport` (gear
 * and the plan first, ranked by the precomputed weights, or by weights
 * simmed on the device when there's no file for the band) and `refine`
 * (weights for the player's own gear). Driven from outside under Bun with
 * the real WASM, on Testchar's export (`exportFromCharacter`) until #83.
 * Weights are simmed at small settings so the file stays quick.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { estimateMinutes, WEIGHTS_DEFAULTS } from '../src/browser-sim'

const ARMORY = join(import.meta.dir, '..')

describe('weights settings and the estimate', () => {
    test('with no options, simExport and refine sim weights with 5 seeds × 8000 iterations (WEIGHTS_DEFAULTS)', () => {
        expect(WEIGHTS_DEFAULTS).toEqual({ seeds: 5, iterations: 8000 })
    })

    test('estimateMinutes(1_320_000, 0.93, 8) is 3, and estimateMinutes(1000, 0.93, 8) is 1', () => {
        expect(estimateMinutes(1_320_000, 0.93, 8)).toBe(3)
        expect(estimateMinutes(1000, 0.93, 8)).toBe(1)
    })
})

describe('bun run check', () => {
    test('bun run check runs this file through test:armory and its slow half through test:slow, and the root has a sim:record script', async () => {
        const path = join(ARMORY, '../../package.json')
        const root = (await Bun.file(path).json()) as {
            scripts: Record<string, string>
        }
        expect(root.scripts.check).toContain('bun run check:all')
        expect(root.scripts['check:all']).toContain(
            'bun run test:armory && bun run test:slow'
        )
        expect(root.scripts['test:armory']).toBe(
            'bun test --isolate --timeout=2000 packages/armory'
        )
        expect(root.scripts['test:slow']).toEndWith(' .slow.test')
        expect(root.scripts['sim:record']).toBeDefined()
    })
})
