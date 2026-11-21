/**
 * From a dropped export to a results file, gear and the plan first:
 * `simExport` reads the export, ranks the plan by the precomputed weights
 * for the character's class, spec and level band (or by weights simmed on
 * the device when there's no file for the band) and sims worn gear and the
 * plan. `refine` sims the weights for the player's own gear and re-sims
 * the plan with them.
 */
import { SimCancelled, type SimPool } from '@goturbo/sim'

import { readResultsFile, type ResultsFile } from '../results-file'
import type { Character, SimStop } from './character'
import { failedChecks } from './checks'
import { calibrate, CALIBRATION_CALLS, exportCharacter } from './export-reader'
import { buildRequest } from './request'
import { DEFAULT_FIGHT, type FightOverride, scenariosFor } from './scenarios'
import { FIGHT_SEED } from './session'
import {
    characterCalls,
    gateCalls,
    runGates,
    simCharacter,
    SUPPORTED,
} from './sim-character'
import {
    simStatWeights,
    weightSeeds,
    WEIGHTS_DEFAULTS,
    weightsSims,
    type StatWeights,
} from './weights'

type Progress = (done: number, planned: number) => void

/** How stat weights are simmed: seeds (101, 102 …) × iterations each. */
export type WeightsOptions = { iterations?: number; seeds?: number }

export type SimExportOptions = WeightsOptions & {
    /**
     * Called when there's no weights file for the band and the run sims
     * the weights first, with its estimate in whole minutes.
     */
    onWeightsFirst?: (minutes: number) => void
    /**
     * Run Simulator: the page's fight settings, for the long dungeon fight
     * and the chain (`scenariosFor`). Absent: the fixed fights, as before.
     * Weights simmed on the device keep the fixed fights.
     */
    fight?: FightOverride
}

/** The warm-up sim that times the device before weights are simmed. */
const WARM_UP_ITERATIONS = 500

export type SimExportOutcome =
    | {
          kind: 'file'
          file: ResultsFile
          /** The character read from the export, kept for `refine`. */
          character: Character
          /** Iterations of every sim the run ran, gates included. */
          iterations: number
          /** The pool's time per iteration over the run's sims. */
          msPerIteration: number
      }
    | SimStop

type WeightsSource = NonNullable<StatWeights[number]['source']>

/**
 * Refine's time in whole minutes, at least 1: `iterations` at
 * `msPerIteration` each, shared by `workers`.
 */
export function estimateMinutes(
    iterations: number,
    msPerIteration: number,
    workers: number
): number {
    const ms = (iterations * msPerIteration) / Math.max(1, workers)
    return Math.max(1, Math.ceil(ms / 60_000))
}

/** The iterations simming a character's weights plans with `options`. */
export function weightsIterations(
    level: number,
    options: WeightsOptions = {}
): number {
    const { seeds, iterations } = settings(options)
    return weightsSims(scenariosFor(level).length, seeds.length) * iterations
}

function settings(options: WeightsOptions) {
    return {
        seeds: weightSeeds(options.seeds ?? WEIGHTS_DEFAULTS.seeds),
        iterations: options.iterations ?? WEIGHTS_DEFAULTS.iterations,
    }
}

/** The sims simming a character's weights makes with `options`. */
function yourWeightsCalls(character: Character, options: WeightsOptions) {
    const { seeds } = settings(options)
    return weightsSims(scenariosFor(character.level).length, seeds.length)
}

/** The calls the gates and the warm-up make before weights are simmed. */
function beforeYourWeightsCalls(character: Character): number {
    return gateCalls(character) + 1
}

/**
 * One run on the pool, its stages counted as one: `begin(total)` starts
 * the pool's one batch for the whole run, with every stage's calls
 * planned up front (the most each can make), so a stage's own `batch()`
 * only marks where its count starts. `expect(remaining)` lowers the plan
 * when a stage learns it needs fewer calls. The fraction done the run
 * reports never goes back, and it ends at its planned count. A `cancel()`
 * on the pool (heard as `(0, 0)`) becomes `SimCancelled` for the run.
 */
function startRun(pool: SimPool, onProgress: Progress) {
    let cancelled = false
    let ended = false
    let begun = false
    /** The calls `begin` planned. */
    let planned = 0
    /** Calls the run planned and has since learned it won't make. */
    let cut = 0
    let done = 0
    /** The planned count the pool's progress last said. */
    let poolPlanned = 0
    /** Where the current stage's count starts, and the calls it plans. */
    let stage = { start: 0, planned: 0 }
    const report = () => {
        if (cancelled || ended) return
        onProgress(done, Math.max(done, poolPlanned - cut))
    }
    const unsubscribe = pool.onProgress((count, of) => {
        if (cancelled || ended) return
        if (count === 0 && of === 0) {
            cancelled = true
            return
        }
        done = count
        poolPlanned = of
        report()
    })
    const guard = <T>(value: T): T => {
        if (cancelled || ended) throw new SimCancelled()
        return value
    }
    const guarded: SimPool = {
        ...pool,
        size: pool.size,
        sim: (request, profile) =>
            cancelled || ended
                ? Promise.reject(new SimCancelled())
                : pool.sim(request, profile).then(guard),
        sheet: (request, profile) =>
            cancelled || ended
                ? Promise.reject(new SimCancelled())
                : pool.sheet(request, profile).then(guard),
        stats: () =>
            begun ? pool.stats() : { calls: 0, iterations: 0, ms: 0 },
        // The run's one batch counts and times every stage.
        batch(count) {
            stage = { start: done, planned: count }
        },
        // A stage hears its own count, from where it started.
        onProgress(callback) {
            return pool.onProgress((count, of) => {
                if (ended) return
                if (count === 0 && of === 0) callback(0, 0)
                else callback(count - stage.start, stage.planned)
            })
        },
    }
    return {
        pool: guarded,
        check: () => guard(undefined),
        /** Starts the run's count of `total` calls, from 0, and its timing. */
        begin(total: number) {
            guard(undefined)
            begun = true
            planned = total
            poolPlanned = total
            pool.batch(total)
            report()
        },
        /** The run makes at most `remaining` calls more. */
        expect(remaining: number) {
            if (cancelled || ended) return
            const more = planned - done - remaining - cut
            if (more <= 0) return
            cut += more
            report()
        },
        /** The run made its last call: the count ends at its plan. */
        finish() {
            if (cancelled || ended) return
            done = Math.max(done, poolPlanned - cut)
            report()
        },
        totals() {
            const stats = guarded.stats()
            return {
                iterations: stats.iterations,
                msPerIteration:
                    stats.iterations > 0 ? stats.ms / stats.iterations : 0,
            }
        },
        end() {
            ended = true
            unsubscribe()
        },
    }
}

type Run = ReturnType<typeof startRun>

/** The three single fights' weights simmed for the character's gear. */
async function simYourWeights(
    run: Run,
    character: Character,
    options: WeightsOptions
): Promise<StatWeights> {
    const { seeds, iterations } = settings(options)
    const fights = scenariosFor(character.level)
    run.pool.batch(yourWeightsCalls(character, options))
    const simmed = await simStatWeights(character, run.pool, fights, {
        seeds,
        iterations,
    })
    return withSource(simmed, { kind: 'yours' })
}

/**
 * Before weights are simmed on the device: the gates (a character they
 * stop gets no weights simmed), then a warm-up sim that times the device.
 */
async function beforeYourWeights(
    run: Run,
    character: Character
): Promise<SimStop | { kind: 'passed'; msPerIteration: number }> {
    run.pool.batch(beforeYourWeightsCalls(character))
    const { checks } = await runGates(character, run.pool)
    run.check()
    const failed = failedChecks(checks)
    if (failed.length > 0) return { kind: 'gates', failed }
    const before = run.pool.stats()
    await run.pool.sim(
        buildRequest(character, DEFAULT_FIGHT, {
            seed: FIGHT_SEED,
            iterations: WARM_UP_ITERATIONS,
        }),
        character.profile
    )
    run.check()
    const after = run.pool.stats()
    const iterations = after.iterations - before.iterations
    return {
        kind: 'passed',
        msPerIteration:
            iterations > 0 ? (after.ms - before.ms) / iterations : 0,
    }
}

/** Weights without their half-widths, stamped with where they came from. */
function withSource(
    fights: { fight_id: string; weights: { stat: string; ep: number }[] }[],
    source: WeightsSource
): StatWeights {
    return fights.map((fight) => ({
        fight_id: fight.fight_id,
        weights: fight.weights.map(({ stat, ep }) => ({
            stat: stat as StatWeights[number]['weights'][number]['stat'],
            ep,
        })),
        source,
    }))
}

/**
 * The precomputed weights for the character's band, or null when there's
 * no file for it. A file that doesn't read fails the run (the pool says
 * why).
 */
async function precomputed(
    pool: SimPool,
    character: Character
): Promise<StatWeights | null> {
    const file = await pool.weights(
        character.class,
        SUPPORTED.spec,
        character.level
    )
    if (!file) return null
    const { level_min, level_max } = file
    return withSource(file.fights, {
        kind: 'precomputed',
        level_min,
        level_max,
    })
}

/**
 * Worn gear and the plan ranked by `weights`, the weights stamped in. It
 * is a run's last stage: what `simCharacter` plans is all the run has
 * left.
 */
async function simWithWeights(
    run: Run,
    character: Character,
    weights: StatWeights,
    fight?: FightOverride
): Promise<SimExportOutcome> {
    const outcome = await simCharacter(
        character,
        weights,
        run.pool,
        (done, planned) => {
            if (planned > 0) run.expect(planned - done)
        },
        fight
    )
    run.check()
    if (outcome.kind !== 'file') return outcome
    const sources = new Map(weights.map((w) => [w.fight_id, w.source]))
    const file = {
        ...outcome.file,
        stat_weights: outcome.file.stat_weights.map((w) => {
            const source = sources.get(w.fight_id)
            return source ? { ...w, source } : w
        }),
    }
    const read = readResultsFile(file)
    if (!read.ok)
        throw new Error("The browser sim made a file the page can't read.")
    run.finish()
    return { kind: 'file', file: read.file, character, ...run.totals() }
}

/**
 * Sims a dropped export: the export read (its stops come before any sim),
 * then worn gear and the max damage plan, ranked by the precomputed
 * weights for the band. With none, the gates run first, then the weights
 * are simmed on the device (`options` sets their seeds and iterations, and
 * `options.onWeightsFirst` hears the estimate). Every call the run can
 * make is planned once the export is read, so the progress counts the
 * whole run.
 */
export async function simExport(
    text: string,
    pool: SimPool,
    onProgress: Progress,
    options: SimExportOptions = {}
): Promise<SimExportOutcome> {
    const run = startRun(pool, onProgress)
    try {
        const read = await exportCharacter(text, run.pool)
        run.check()
        if (read.kind !== 'character') return read
        let weights = await precomputed(run.pool, read.character)
        run.check()
        // Every call the run can make: calibration, the gates, warm-up and
        // weights when there's no file for the band, then gear and the plan.
        run.begin(
            CALIBRATION_CALLS +
                (weights
                    ? 0
                    : beforeYourWeightsCalls(read.character) +
                      yourWeightsCalls(read.character, options)) +
                characterCalls(read.character)
        )
        const character = await calibrate(read.character, run.pool)
        run.check()
        if (!weights) {
            const ready = await beforeYourWeights(run, character)
            if (ready.kind !== 'passed') return ready
            options.onWeightsFirst?.(
                estimateMinutes(
                    weightsIterations(character.level, options),
                    ready.msPerIteration,
                    pool.size
                )
            )
            weights = await simYourWeights(run, character, options)
            run.check()
        }
        return await simWithWeights(run, character, weights, options.fight)
    } finally {
        run.end()
    }
}

/**
 * Refine: sims the three single fights' weights for the player's own gear
 * (`options` sets the seeds and iterations; the page uses the defaults),
 * re-ranks the alternatives and re-sims the plan. The new file's weights
 * are `yours`. `_file` is the file being refined: the new one replaces it,
 * and everything in it comes from `character` again.
 */
export async function refine(
    _file: ResultsFile,
    character: Character,
    pool: SimPool,
    onProgress: Progress,
    options: WeightsOptions = {}
): Promise<SimExportOutcome> {
    const run = startRun(pool, onProgress)
    try {
        run.begin(
            yourWeightsCalls(character, options) + characterCalls(character)
        )
        const weights = await simYourWeights(run, character, options)
        run.check()
        return await simWithWeights(run, character, weights)
    } finally {
        run.end()
    }
}
