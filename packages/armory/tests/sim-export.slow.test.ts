/**
 * From a dropped export to a results file in the browser: `simExport` (gear
 * and the plan first, ranked by the precomputed weights, or by weights
 * simmed on the device when there's no file for the band) and `refine`
 * (weights for the player's own gear). Driven from outside under Bun with
 * the real WASM, on Testchar's export (`exportFromCharacter`) until #83.
 * Weights are simmed at small settings so the file stays quick.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    createSimPool,
    sheetFromSim,
    type Sheet,
    type SimPool,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import {
    testcharCharacter,
    type TestcharCharacter,
} from '../../sim/tests/helpers/testchar'
import {
    buildRequest,
    refine,
    scenariosFor,
    simExport,
    simStatWeights,
    type SimExportOutcome,
} from '../src/browser-sim'
import { readResultsFile, type ResultsFile } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')

/** Small weights settings, so the test stays well inside its time. */
const SMALL = { iterations: 300, seeds: 3 }
/** The first seeds of the weights method (101 to 105). */
const SMALL_SEEDS = [101, 102, 103]

type Progress = (done: number, planned: number) => void
/** A run that ended in a results file. */
type FileOutcome = Extract<SimExportOutcome, { kind: 'file' }>

/**
 * When this file's own work started, for the 2-minute check at the end:
 * after the sim's build, which a fresh checkout makes first.
 */
let started = performance.now()

beforeAll(() => {
    ensureSimBuild()
    started = performance.now()
}, 600_000)

const shared = createSimPool({ base: BASE, size: 2 })
afterAll(() => shared.close())

/** The outcome of a run that made a file; a stop fails the test. */
function fileRun(outcome: SimExportOutcome): FileOutcome {
    expect(outcome.kind).toBe('file')
    if (outcome.kind !== 'file') throw new Error(`a ${outcome.kind} stop`)
    return outcome
}

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
    textMemo ??= testcharCharacter(shared).then((character) =>
        exportFromCharacter(character, character.sheet)
    )
    return textMemo
}

/** Every `(done, planned)` a run reported, in order. */
type Report = { done: number; planned: number }

/** A progress callback that keeps every report in `reports`. */
function recording(reports: Report[]): Progress {
    return (done, planned) => reports.push({ done, planned })
}

/**
 * A run's progress as the page's bar shows it: every report has a planned
 * count above 0 and done at most planned, the fraction done never goes
 * down, and the last report is done of planned.
 */
function expectSteadyProgress(reports: Report[]): void {
    expect(reports.length).toBeGreaterThan(1)
    expect(
        reports.filter(({ done, planned }) => planned <= 0 || done > planned)
    ).toEqual([])
    // done / planned compared without division: a·d < c·b.
    const drops = reports.flatMap((now, i) => {
        const before = reports[i - 1]
        return before && now.done * before.planned < before.done * now.planned
            ? [{ before, now }]
            : []
    })
    expect(drops).toEqual([])
    const last = reports[reports.length - 1]!
    expect(last.done).toBe(last.planned)
}

let firstMemo:
    | Promise<{
          outcome: SimExportOutcome
          counted: { iterations: number }
          reports: Report[]
      }>
    | undefined
/** `simExport` on Testchar's export, run once to the end. */
function firstRun() {
    firstMemo ??= (async () => {
        const counted = { iterations: 0 }
        const reports: Report[] = []
        const outcome = await simExport(
            await testcharExport(),
            counting(shared, counted),
            recording(reports)
        )
        return { outcome, counted, reports }
    })()
    return firstMemo
}

let refinedMemo: Promise<{ file: ResultsFile; reports: Report[] }> | undefined
/** `refine` on the first run's file, at the small settings. */
function refinedRun() {
    refinedMemo ??= (async () => {
        const { file, character } = fileRun((await firstRun()).outcome)
        const reports: Report[] = []
        const outcome = await refine(
            file,
            character,
            shared,
            recording(reports),
            SMALL
        )
        return { file: fileRun(outcome).file, reports }
    })()
    return refinedMemo
}

/** The refined file. */
async function refined(): Promise<ResultsFile> {
    return (await refinedRun()).file
}

/** What a run did, in order: the sims it sent and the estimates it heard. */
type RunEvent =
    | { kind: 'sim'; seed?: number; iterations?: number }
    | { kind: 'estimate'; minutes: number }

/** A pool that logs every sim call, when it's made, to `events`. */
function logging(real: SimPool, events: RunEvent[]): SimPool {
    return {
        ...real,
        size: real.size,
        sim: (request, profile) => {
            const options = request.simOptions as
                { randomSeed?: number; iterations?: number } | undefined
            events.push({
                kind: 'sim',
                seed: options?.randomSeed,
                iterations: options?.iterations,
            })
            return real.sim(request, profile)
        },
    }
}

/** True for a sim of the weights method at the small settings. */
function isWeightsSim(event: RunEvent): boolean {
    return (
        event.kind === 'sim' &&
        SMALL_SEEDS.includes(event.seed ?? 0) &&
        event.iterations === SMALL.iterations
    )
}

/**
 * A level with no weights file (only 30–34 has one), above the runner's
 * level 30: the sanity gates' mobs rise with the character (the solo fight
 * at level 46, the dungeon at 47), and Testchar's level-30 gear has to pass
 * every gate there, the Stormstrike reset band among them.
 */
const NO_FILE_LEVEL = 45
/**
 * The owner's character's level, inside the 30–34 weights file: the
 * sanity gates' mobs are level 33 and 34.
 */
const OWNER_LEVEL = 32

/** The Stormstrike reset gate's name. */
const STORMSTRIKE_RULE = 'being hit resets Stormstrike as the rule says'

const atLevelMemo = new Map<
    number,
    Promise<{ character: TestcharCharacter; sheet: Sheet }>
>()
/** Testchar at `level`, and the sheet the sim gives it there. */
function testcharAt(level: number) {
    const memo =
        atLevelMemo.get(level) ??
        (async () => {
            const plain = await testcharCharacter(shared)
            const character: TestcharCharacter = {
                ...plain,
                level,
                // The reader sets base attack power to 2 × level − 20 (the runner's rule).
                profile: {
                    ...plain.profile,
                    level,
                    baseAttackPower: 2 * level - 20,
                },
            }
            const sheet = sheetFromSim(
                await shared.sheet(
                    buildRequest(character, 'dungeon-long', {
                        seed: 23,
                        iterations: 4000,
                    }),
                    character.profile
                )
            )
            return { character, sheet }
        })()
    atLevelMemo.set(level, memo)
    return memo
}

/** `simExport` on Testchar's export at `level`, its sims and estimates logged. */
async function levelExport(level: number, sheet?: (sheet: Sheet) => Sheet) {
    const at = await testcharAt(level)
    const events: RunEvent[] = []
    const text = exportFromCharacter(
        at.character,
        sheet ? sheet(at.sheet) : at.sheet
    )
    const outcome = await simExport(text, logging(shared, events), () => {}, {
        ...SMALL,
        onWeightsFirst: (minutes) => events.push({ kind: 'estimate', minutes }),
    })
    return { outcome, events }
}

const levelRunMemo = new Map<number, ReturnType<typeof levelExport>>()
/** The export at `level` with its own sheet, run once to the end. */
function levelRun(level: number) {
    const memo = levelRunMemo.get(level) ?? levelExport(level)
    levelRunMemo.set(level, memo)
    return memo
}

/**
 * A file's sanity gates, as the run kept them: the Stormstrike reset gate,
 * and the hit-rating gate (whose detail names the dungeon mob's level).
 */
function sanityOf(file: ResultsFile) {
    const stormstrike = file.checks.find((c) => c.name === STORMSTRIKE_RULE)
    const hit = file.checks.find((c) =>
        /^DPS rises with hit rating$/i.test(c.name)
    )
    expect(stormstrike).toBeDefined()
    expect(hit).toBeDefined()
    return { stormstrike: stormstrike!, hit: hit! }
}

describe('simExport', () => {
    test('cancel() during simExport rejects with SimCancelled, and the next simExport returns a file', async () => {
        const text = await testcharExport()
        await cancelled((onProgress) => simExport(text, shared, onProgress))
        const { outcome } = await firstRun()
        expect(outcome.kind).toBe('file')
    }, 600_000)

    test("Testchar's export (level 30) gives a file that reads, with precomputed 30–34 weights, in at most 400,000 iterations counting every sim it ran", async () => {
        const { outcome, counted } = await firstRun()
        const { file, iterations } = fileRun(outcome)
        expect(readResultsFile(file).ok).toBe(true)
        expect(file.stat_weights.length).toBeGreaterThan(0)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({
                kind: 'precomputed',
                level_min: 30,
                level_max: 34,
            })
        expect(counted.iterations).toBeGreaterThan(0)
        expect(iterations).toBeGreaterThanOrEqual(counted.iterations)
        expect(iterations).toBeLessThanOrEqual(400_000)
    }, 600_000)

    test("the progress simExport reports on Testchar's export never goes back and ends at done of planned", async () => {
        const { outcome, reports } = await firstRun()
        expect(outcome.kind).toBe('file')
        expectSteadyProgress(reports)
    }, 600_000)

    test('the same export at level 45 (no weights file for 45–49) sims weights on the device first and gives a file with weights of source yours', async () => {
        expect(
            await shared.weights('Shaman', 'Enhancement', NO_FILE_LEVEL)
        ).toBeNull()
        const { outcome } = await levelRun(NO_FILE_LEVEL)
        const { file } = fileRun(outcome)
        expect(readResultsFile(file).ok).toBe(true)
        expect(file.character.level).toBe(NO_FILE_LEVEL)
        expect(file.stat_weights.length).toBeGreaterThan(0)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({ kind: 'yours' })
    }, 600_000)

    test('the level-45 run passes the sanity gates against the risen level-46/47 mobs, the Stormstrike reset gate among them', async () => {
        const { file } = fileRun((await levelRun(NO_FILE_LEVEL)).outcome)
        const { stormstrike, hit } = sanityOf(file)
        expect(stormstrike.passed).toBe(true)
        expect(hit.passed).toBe(true)
        expect(hit.detail).toContain('level 47')
    }, 600_000)

    test("Testchar's export at the owner's level 32 passes the sanity gates against level-33/34 mobs, the Stormstrike reset gate among them, and gives a file with precomputed 30–34 weights", async () => {
        const { outcome } = await levelRun(OWNER_LEVEL)
        const { file } = fileRun(outcome)
        expect(readResultsFile(file).ok).toBe(true)
        expect(file.character.level).toBe(OWNER_LEVEL)
        for (const fight of file.stat_weights)
            expect(fight.source).toEqual({
                kind: 'precomputed',
                level_min: 30,
                level_max: 34,
            })
        const { stormstrike, hit } = sanityOf(file)
        expect(stormstrike.passed).toBe(true)
        expect(hit.passed).toBe(true)
        expect(hit.detail).toContain('level 34')
    }, 600_000)

    test('a level-45 export whose sheet Strength is off by 10 returns a gates stop naming sheet strength, and no weights sim runs and no estimate is given', async () => {
        const { outcome, events } = await levelExport(
            NO_FILE_LEVEL,
            (sheet) => ({
                ...sheet,
                strength: sheet.strength + 10,
            })
        )
        expect(outcome.kind).toBe('gates')
        if (outcome.kind !== 'gates') throw new Error('not a gates stop')
        expect(outcome.failed.map((check) => check.name)).toContain(
            'sheet strength'
        )
        // The gates did sim (the level-60 regression), and nothing after.
        expect(events.some((event) => event.kind === 'sim')).toBe(true)
        expect(events.filter(isWeightsSim)).toEqual([])
        expect(events.filter((event) => event.kind === 'estimate')).toEqual([])
    }, 600_000)

    test('a passing level-45 run calls onWeightsFirst once, with a whole number of minutes of at least 1, before the first weights sim', async () => {
        const { outcome, events } = await levelRun(NO_FILE_LEVEL)
        expect(outcome.kind).toBe('file')
        const estimates = events.filter(
            (event): event is Extract<RunEvent, { kind: 'estimate' }> =>
                event.kind === 'estimate'
        )
        expect(estimates).toHaveLength(1)
        const estimate = estimates[0]!
        expect(Number.isInteger(estimate.minutes)).toBe(true)
        expect(estimate.minutes).toBeGreaterThanOrEqual(1)
        const firstWeightsSim = events.findIndex(isWeightsSim)
        expect(firstWeightsSim).toBeGreaterThan(-1)
        expect(events.indexOf(estimate)).toBeLessThan(firstWeightsSim)
    }, 600_000)
})

describe('refine', () => {
    test('cancel() during refine rejects with SimCancelled, and the next refine returns a file', async () => {
        const { file, character } = fileRun((await firstRun()).outcome)
        await cancelled((onProgress) =>
            refine(file, character, shared, onProgress, SMALL)
        )
        expect(readResultsFile(await refined()).ok).toBe(true)
    }, 600_000)

    test('with 3 seeds × 300 iterations, refine gives a file whose weights are of source yours and equal the stat weights method run directly through the pool', async () => {
        const { character } = fileRun((await firstRun()).outcome)
        const file = await refined()
        expect(readResultsFile(file).ok).toBe(true)
        const direct = await simStatWeights(
            character,
            shared,
            scenariosFor(character.level),
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

    test('the progress refine reports at 3 seeds × 300 iterations never goes back and ends at done of planned', async () => {
        const { file, reports } = await refinedRun()
        expect(readResultsFile(file).ok).toBe(true)
        expectSteadyProgress(reports)
    }, 600_000)
})

describe('sim-export.slow.test.ts', () => {
    // A wall-clock bound, generous because CI runners vary (about 1.5× apart
    // between runs). Real per-test time limits move to config in #119.
    test('the whole file, with its real simExport and refine runs, finishes in under 5 minutes', async () => {
        // Both runs are memoized: they ran in the tests above.
        expect((await firstRun()).outcome.kind).toBe('file')
        expect(readResultsFile(await refined()).ok).toBe(true)
        expect(performance.now() - started).toBeLessThan(300_000)
    }, 600_000)
})
