/**
 * From a dropped export to a results file in the browser: `simExport` (gear
 * and the plan first, ranked by the precomputed weights, or by weights
 * simmed on the device when there's no file for the band) and `refine`
 * (weights for the player's own gear). Driven from outside under Bun with
 * the real WASM, on Testchar's export (`exportFromCharacter`) until #83.
 * Weights are simmed at small settings so the file stays quick.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import type { SimPool } from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    estimateMinutes,
    refine,
    simExport,
    WEIGHTS_DEFAULTS,
} from '../src/browser-sim'
import { exportFromCharacter } from './helpers/export-from-character'
import { BUILD, callKey, recordedPool } from './helpers/recorded-pool'

const ARMORY = join(import.meta.dir, '..')

beforeAll(() => ensureSimBuild(), 600_000)

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

describe('post-rejection progress isolation', () => {
    test('simExport emits no onProgress after rejecting when loadItemDb resolves late', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const l60 = (await Bun.file(
            join(BUILD, 'l60-test.in.json')
        ).json()) as unknown
        const l60Key = callKey('sim', l60)

        const pool: SimPool = {
            ...base,
            size: base.size,
            sim: (request, profile) =>
                callKey('sim', request, profile) === l60Key
                    ? Promise.reject(new Error('boom'))
                    : base.sim(request, profile),
            data: (name) =>
                name === 'db.json'
                    ? new Promise((resolve, reject) =>
                          setTimeout(
                              () => void base.data(name).then(resolve, reject),
                              25
                          )
                      )
                    : base.data(name),
        }

        const reports: { done: number; planned: number }[] = []
        let caught: unknown
        try {
            await simExport(exportLua, pool, (done, planned) =>
                reports.push({ done, planned })
            )
        } catch (error) {
            caught = error
        }

        expect(caught).toBeInstanceOf(Error)
        expect((caught as Error).message).toBe('boom')
        const countAtReject = reports.length
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(reports.length).toBe(countAtReject)
    })

    test('refine emits no onProgress after rejecting when loadItemDb resolves late', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const first = await simExport(exportLua, base, () => {})
        if (first.kind !== 'file') throw new Error(`unexpected ${first.kind}`)

        const l60 = (await Bun.file(
            join(BUILD, 'l60-test.in.json')
        ).json()) as unknown
        const l60Key = callKey('sim', l60)

        const pool: SimPool = {
            ...base,
            size: base.size,
            sim: (request, profile) =>
                callKey('sim', request, profile) === l60Key
                    ? Promise.reject(new Error('boom'))
                    : base.sim(request, profile),
            data: (name) =>
                name === 'db.json'
                    ? new Promise((resolve, reject) =>
                          setTimeout(
                              () => void base.data(name).then(resolve, reject),
                              25
                          )
                      )
                    : base.data(name),
        }

        const reports: { done: number; planned: number }[] = []
        let caught: unknown
        try {
            await refine(first.file, first.character, pool, (done, planned) =>
                reports.push({ done, planned })
            )
        } catch (error) {
            caught = error
        }

        expect(caught).toBeInstanceOf(Error)
        expect((caught as Error).message).toBe('boom')
        const countAtReject = reports.length
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(reports.length).toBe(countAtReject)
    })
})
