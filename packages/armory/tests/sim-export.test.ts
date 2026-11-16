/**
 * From a dropped export to a results file in the browser: `simExport` (gear
 * and the plan first, ranked by the precomputed weights, or by weights
 * simmed on the device when there's no file for the band) and `refine`
 * (weights for the player's own gear). Driven from outside under Bun with
 * the real WASM, on Testchar's export (`exportFromCharacter`) until #83.
 * Weights are simmed at small settings so the file stays quick.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    createSimPool,
    sheetFromSim,
    type RaidSimRequest,
    type SimPool,
} from '@goturbo/sim'

import { readResultsFile } from '../src/results-file'

/** When this file started, for the 2-minute check at the end. */
const STARTED = performance.now()

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')
const BROWSER_SIM = '../src/browser-sim'
const TESTCHAR_HELPER = '../../sim/tests/helpers/testchar'
const EXPORT_HELPER = './helpers/export-from-character'

/** Small weights settings, so the test stays well inside its time. */
const SMALL = { iterations: 300, seeds: 3 }
/** The first seeds of the weights method (101 to 105). */
const SMALL_SEEDS = [101, 102, 103]

type Json = Record<string, unknown>
type Progress = (done: number, planned: number) => void
type WeightsOptions = { iterations?: number; seeds?: number }
type FileWeights = {
    fight_id: string
    weights: { stat: string; ep: number }[]
    source?: Json
}
type SimFile = Json & {
    stat_weights: FileWeights[]
    character: Json
}
type Outcome = Json & {
    kind: string
    file?: SimFile
    character?: Json
    iterations?: number
    msPerIteration?: number
}

type BrowserSim = {
    simExport: (
        text: string,
        pool: SimPool,
        onProgress: Progress,
        options?: WeightsOptions
    ) => Promise<Outcome>
    refine: (
        file: SimFile,
        character: Json,
        pool: SimPool,
        onProgress: Progress,
        options?: WeightsOptions
    ) => Promise<Outcome | SimFile>
    estimateMinutes: (
        iterations: number,
        msPerIteration: number,
        workers: number
    ) => number
    WEIGHTS_DEFAULTS: { iterations: number; seeds: number }
    buildRequest: (
        character: unknown,
        fight: string,
        options: { seed: number; iterations: number }
    ) => RaidSimRequest
    scenariosFor: (level: number) => unknown[]
    simStatWeights: (
        character: unknown,
        pool: SimPool,
        fights: unknown[],
        options: { seeds: number[]; iterations: number }
    ) => Promise<
        { fight_id: string; weights: { stat: string; ep: number }[] }[]
    >
}

async function browserSim(): Promise<BrowserSim> {
    return (await import(BROWSER_SIM)) as BrowserSim
}

type TestcharHelper = { testcharCharacter: (pool: SimPool) => Promise<Json> }

async function testchar(on: SimPool): Promise<Json> {
    const helper = (await import(TESTCHAR_HELPER)) as TestcharHelper
    return helper.testcharCharacter(on)
}

async function exportOf(character: Json, sheet: unknown): Promise<string> {
    const helper = (await import(EXPORT_HELPER)) as unknown as {
        exportFromCharacter: (character: unknown, sheet: unknown) => string
    }
    return helper.exportFromCharacter(character, sheet)
}

const shared = createSimPool({ base: BASE })
afterAll(() => shared.close())

/** A pool that adds up the iterations of every sim it passes on. */
function counting(real: SimPool, total: { iterations: number }): SimPool {
    return {
        ...real,
        size: real.size,
        sim: (request, profile) => {
            const options = request.simOptions as
                { iterations?: number } | undefined
            total.iterations += options?.iterations ?? 0
            return real.sim(request, profile)
        },
    }
}

/** The results file a call returned, whether wrapped in an outcome or not. */
function fileOf(out: Outcome | SimFile): SimFile {
    if ('kind' in out) {
        expect(out.kind).toBe('file')
        return (out as Outcome).file!
    }
    return out as SimFile
}

/** A call that the pool's `cancel()` stops at its first counted sim. */
async function cancelled(start: (onProgress: Progress) => Promise<unknown>) {
    let stopped = false
    const error = await start(() => {
        if (stopped) return
        stopped = true
        shared.cancel()
    }).then(
        () => undefined,
        (thrown: unknown) => thrown
    )
    expect(stopped).toBe(true)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('SimCancelled')
}

let textMemo: Promise<string> | undefined
/** Testchar's export: level 30, so the 30–34 weights file. */
function testcharExport(): Promise<string> {
    textMemo ??= testchar(shared).then((character) =>
        exportOf(character, character.sheet)
    )
    return textMemo
}

let firstMemo:
    Promise<{ outcome: Outcome; counted: { iterations: number } }> | undefined
/** `simExport` on Testchar's export, run once to the end. */
function firstRun() {
    firstMemo ??= (async () => {
        const counted = { iterations: 0 }
        const { simExport } = await browserSim()
        const outcome = await simExport(
            await testcharExport(),
            counting(shared, counted),
            () => {}
        )
        return { outcome, counted }
    })()
    return firstMemo
}

let refinedMemo: Promise<SimFile> | undefined
/** `refine` on the first run's file, at the small settings. */
function refined(): Promise<SimFile> {
    refinedMemo ??= (async () => {
        const { refine } = await browserSim()
        const { outcome } = await firstRun()
        return fileOf(
            await refine(
                outcome.file!,
                outcome.character!,
                shared,
                () => {},
                SMALL
            )
        )
    })()
    return refinedMemo
}

describe('simExport', () => {
    test('cancel() during simExport rejects with SimCancelled, and the next simExport returns a file', async () => {
        const { simExport } = await browserSim()
        const text = await testcharExport()
        await cancelled((onProgress) => simExport(text, shared, onProgress))
        const { outcome } = await firstRun()
        expect(outcome.kind).toBe('file')
    }, 600_000)

    test("Testchar's export (level 30) gives a file that reads, with precomputed 30–34 weights, in at most 400,000 iterations counting every sim it ran", async () => {
        const { outcome, counted } = await firstRun()
        expect(outcome.kind).toBe('file')
        const file = outcome.file!
        expect(readResultsFile(file).ok).toBe(true)
        expect(file.stat_weights.length).toBeGreaterThan(0)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({
                kind: 'precomputed',
                level_min: 30,
                level_max: 34,
            })
        expect(counted.iterations).toBeGreaterThan(0)
        expect(outcome.iterations).toBeGreaterThanOrEqual(counted.iterations)
        expect(outcome.iterations).toBeLessThanOrEqual(400_000)
    }, 600_000)

    test('the same export at level 45 (no weights file for 45–49) sims weights on the device first and gives a file with weights of source yours', async () => {
        const { buildRequest, simExport } = await browserSim()
        const plain = await testchar(shared)
        const character: Json = {
            ...plain,
            level: 45,
            profile: { ...(plain.profile as Json), level: 45 },
        }
        expect(await shared.weights('Shaman', 'Enhancement', 45)).toBeNull()
        const sheet = sheetFromSim(
            await shared.sheet(
                buildRequest(character, 'dungeon-long', {
                    seed: 23,
                    iterations: 4000,
                }),
                character.profile as never
            )
        )
        const text = await exportOf(character, sheet)
        const outcome = await simExport(text, shared, () => {}, SMALL)
        expect(outcome.kind).toBe('file')
        const file = outcome.file!
        expect(readResultsFile(file).ok).toBe(true)
        expect(file.character.level).toBe(45)
        expect(file.stat_weights.length).toBeGreaterThan(0)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({ kind: 'yours' })
    }, 600_000)
})

describe('refine', () => {
    test('cancel() during refine rejects with SimCancelled, and the next refine returns a file', async () => {
        const { refine } = await browserSim()
        const { outcome } = await firstRun()
        expect(outcome.kind).toBe('file')
        await cancelled((onProgress) =>
            refine(outcome.file!, outcome.character!, shared, onProgress, SMALL)
        )
        const file = await refined()
        expect(readResultsFile(file).ok).toBe(true)
    }, 600_000)

    test('with 3 seeds × 300 iterations, refine gives a file whose weights are of source yours and equal the stat weights method run directly through the pool', async () => {
        const { scenariosFor, simStatWeights } = await browserSim()
        const { outcome } = await firstRun()
        const file = await refined()
        expect(readResultsFile(file).ok).toBe(true)
        const character = outcome.character!
        const direct = await simStatWeights(
            character,
            shared,
            scenariosFor(character.level as number),
            { seeds: SMALL_SEEDS, iterations: SMALL.iterations }
        )
        expect(file.stat_weights.length).toBe(3)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({ kind: 'yours' })
        const got = file.stat_weights.map(({ fight_id, weights }) => ({
            fight_id,
            weights,
        }))
        const want = direct.map(({ fight_id, weights }) => ({
            fight_id,
            weights: weights.map(({ stat, ep }) => ({ stat, ep })),
        }))
        expect(got).toEqual(want)
    }, 600_000)
})

describe('weights settings and the estimate', () => {
    test('with no options, simExport and refine sim weights with 5 seeds × 8000 iterations (WEIGHTS_DEFAULTS)', async () => {
        const { WEIGHTS_DEFAULTS } = await browserSim()
        expect(WEIGHTS_DEFAULTS).toEqual({ seeds: 5, iterations: 8000 })
    })

    test('estimateMinutes(1_320_000, 0.93, 8) is 3, and estimateMinutes(1000, 0.93, 8) is 1', async () => {
        const { estimateMinutes } = await browserSim()
        expect(estimateMinutes(1_320_000, 0.93, 8)).toBe(3)
        expect(estimateMinutes(1000, 0.93, 8)).toBe(1)
    })
})

describe('bun run check', () => {
    test('bun run check runs this file through test:armory, and the root has a sim:record script', async () => {
        const path = join(ARMORY, '../../package.json')
        const root = (await Bun.file(path).json()) as {
            scripts: Record<string, string>
        }
        expect(root.scripts.check).toContain('bun run check:all')
        expect(root.scripts['check:all']).toContain('bun run test:armory')
        expect(root.scripts['test:armory']).toBe(
            'bun test --isolate packages/armory'
        )
        expect(root.scripts['sim:record']).toBeDefined()
    })
})

describe('sim-export.test.ts', () => {
    test('the whole file, with its real simExport and refine runs, finishes in under 2 minutes', async () => {
        // Both runs are memoized: they ran in the tests above.
        expect((await firstRun()).outcome.kind).toBe('file')
        expect(readResultsFile(await refined()).ok).toBe(true)
        expect(performance.now() - STARTED).toBeLessThan(120_000)
    }, 600_000)
})
