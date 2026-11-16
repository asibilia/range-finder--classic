/**
 * From a dropped export to a results file, gear and the plan first:
 * `simExport` reads the export, ranks the plan by the precomputed weights
 * for the character's class, spec and level band (or by weights simmed on
 * the device when there's no file for the band) and sims worn gear and the
 * plan. `refine` sims the weights for the player's own gear and re-sims
 * the plan with them.
 */
import { readWeightsFile, SimCancelled, type SimPool } from '@goturbo/sim'

import { readResultsFile, type ResultsFile } from '../results-file'
import type { Character, SimStop } from './character'
import { readExport } from './export-reader'
import { scenariosFor } from './scenarios'
import { simCharacter, SUPPORTED } from './sim-character'
import { STAT_STEPS, simStatWeights, type StatWeights } from './weights'

type Progress = (done: number, planned: number) => void

/** How stat weights are simmed: seeds (101, 102 …) × iterations each. */
export type WeightsOptions = { iterations?: number; seeds?: number }

/** The page's weights settings (spec section 5): 5 seeds × 8000 iterations. */
export const WEIGHTS_DEFAULTS: Readonly<{ seeds: number; iterations: number }> =
    Object.freeze({ seeds: 5, iterations: 8000 })

/** The weights method's first seed. */
const FIRST_SEED = 101

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
    const sims =
        scenariosFor(level).length * seeds.length * (STAT_STEPS.length + 1)
    return sims * iterations
}

function settings(options: WeightsOptions) {
    const count = options.seeds ?? WEIGHTS_DEFAULTS.seeds
    return {
        seeds: Array.from({ length: count }, (_, i) => FIRST_SEED + i),
        iterations: options.iterations ?? WEIGHTS_DEFAULTS.iterations,
    }
}

/**
 * One run on the pool: progress counted across the run's batches, its
 * iterations and time added up, and a `cancel()` on the pool (which
 * listeners hear as `(0, 0)`) turned into `SimCancelled` for the run.
 */
function startRun(pool: SimPool, onProgress: Progress) {
    let cancelled = false
    let offset = 0
    let lastDone = 0
    const totals = { iterations: 0, ms: 0 }
    const unsubscribe = pool.onProgress((done, planned) => {
        if (cancelled) return
        if (done === 0 && planned === 0) {
            cancelled = true
            return
        }
        lastDone = done
        onProgress(offset + done, offset + planned)
    })
    const guard = <T>(value: T): T => {
        if (cancelled) throw new SimCancelled()
        return value
    }
    const guarded: SimPool = {
        ...pool,
        size: pool.size,
        sim: (request, profile) =>
            cancelled
                ? Promise.reject(new SimCancelled())
                : pool.sim(request, profile).then(guard),
        sheet: (request, profile) =>
            cancelled
                ? Promise.reject(new SimCancelled())
                : pool.sheet(request, profile).then(guard),
        batch(planned) {
            const stats = pool.stats()
            totals.iterations += stats.iterations
            totals.ms += stats.ms
            offset += lastDone
            lastDone = 0
            pool.batch(planned)
        },
        // The run forwards progress itself.
        onProgress: () => () => {},
    }
    return {
        pool: guarded,
        check: () => guard(undefined),
        totals() {
            const stats = pool.stats()
            const iterations = totals.iterations + stats.iterations
            const ms = totals.ms + stats.ms
            return {
                iterations,
                msPerIteration: iterations > 0 ? ms / iterations : 0,
            }
        },
        end: unsubscribe,
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
    run.pool.batch(fights.length * seeds.length * (STAT_STEPS.length + 1))
    const simmed = await simStatWeights(character, run.pool, fights, {
        seeds,
        iterations,
    })
    return withSource(simmed, { kind: 'yours' })
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

/** The precomputed weights for the character's band, or null. */
async function precomputed(
    pool: SimPool,
    character: Character
): Promise<StatWeights | null> {
    const raw = await pool.weights(
        character.class,
        SUPPORTED.spec,
        character.level
    )
    if (raw === null || raw === undefined) return null
    const read = readWeightsFile(raw)
    if (!read.ok) return null
    const { level_min, level_max } = read.file
    return withSource(read.file.fights, {
        kind: 'precomputed',
        level_min,
        level_max,
    })
}

/** Worn gear and the plan ranked by `weights`, the weights stamped in. */
async function simWithWeights(
    run: Run,
    character: Character,
    weights: StatWeights
): Promise<SimExportOutcome> {
    const outcome = await simCharacter(character, weights, run.pool, () => {})
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
    return { kind: 'file', file: read.file, character, ...run.totals() }
}

/**
 * Sims a dropped export: the export read (its stops come before any sim),
 * then worn gear and the max damage plan, ranked by the precomputed
 * weights for the band, or by weights simmed on the device first when
 * there's none (`options` sets those weights' seeds and iterations).
 */
export async function simExport(
    text: string,
    pool: SimPool,
    onProgress: Progress,
    options: WeightsOptions = {}
): Promise<SimExportOutcome> {
    const run = startRun(pool, onProgress)
    try {
        // The calibration sheet.
        run.pool.batch(1)
        const read = await readExport(text, run.pool)
        run.check()
        if (read.kind !== 'character') return read
        const character = read.character
        const weights =
            (await precomputed(pool, character)) ??
            (await simYourWeights(run, character, options))
        run.check()
        return await simWithWeights(run, character, weights)
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
        const weights = await simYourWeights(run, character, options)
        run.check()
        return await simWithWeights(run, character, weights)
    } finally {
        run.end()
    }
}
