/**
 * Stat weights: the EP of each stat, from given weights (the results
 * file's `stat_weights`) or simmed with the runner's method: each stat
 * added in a fixed amount, simmed against the same seed's baseline over 5
 * seeds; EP is DPS per point over attack power's.
 */
import {
    BONUS_STAT_COUNT,
    PSEUDO_STAT,
    PSEUDO_STAT_COUNT,
    STAT,
    type SimPool,
} from '@goturbo/sim'

import type { ResultsFile, Stat } from '../results-file'
import type { Character, Gear } from './character'
import { buildRequest } from './request'
import { dpsOf } from './sim-result'
import type { Scenario } from './scenarios'

export type StatWeights = ResultsFile['stat_weights']

/** The amount of each stat the method adds, and where it goes. */
export const STAT_STEPS: { stat: Stat; amount: number; index: number }[] = [
    { stat: 'strength', amount: 20, index: STAT.strength },
    { stat: 'agility', amount: 20, index: STAT.agility },
    { stat: 'intellect', amount: 20, index: STAT.intellect },
    { stat: 'spirit', amount: 20, index: STAT.spirit },
    { stat: 'attack_power', amount: 40, index: STAT.attackPower },
    { stat: 'hit_rating', amount: 10, index: STAT.hitRating },
    { stat: 'crit_rating', amount: 14, index: STAT.critRating },
    { stat: 'spell_damage', amount: 20, index: STAT.spellDamage },
    { stat: 'mana_per_5', amount: 5, index: STAT.mp5 },
    // Weapon DPS is a pseudo stat: the main hand's.
    { stat: 'weapon_dps', amount: 2, index: -1 },
]

/**
 * The weights method's settings (spec section 5): 5 seeds × 8000
 * iterations. `bun run sim:weights`, Refine and the no-weights-file path
 * all use them.
 */
export const WEIGHTS_DEFAULTS: Readonly<{ seeds: number; iterations: number }> =
    Object.freeze({ seeds: 5, iterations: 8000 })

/** The weights method's first seed: `count` seeds run 101, 102 … */
const FIRST_SEED = 101

/** The seeds of a weights run with `count` seeds. */
export function weightSeeds(count: number = WEIGHTS_DEFAULTS.seeds): number[] {
    return Array.from({ length: count }, (_, i) => FIRST_SEED + i)
}

/**
 * The sims the weights method runs on `fights` fights with `seeds` seeds:
 * per fight and seed, a baseline and one sim per weighed stat.
 */
export function weightsSims(fights: number, seeds: number): number {
    return fights * seeds * (STAT_STEPS.length + 1)
}

/** The sim's bonus stats for `amount` of one weighed stat. */
export function bonusFor(stat: Stat, amount: number) {
    const step = STAT_STEPS.find((s) => s.stat === stat)
    const stats = new Array<number>(BONUS_STAT_COUNT).fill(0)
    const pseudoStats = new Array<number>(PSEUDO_STAT_COUNT).fill(0)
    if (step && step.index >= 0) stats[step.index] = amount
    if (stat === 'weapon_dps') pseudoStats[PSEUDO_STAT.mainHandDps] = amount
    return { stats, pseudoStats }
}

/** Student's t at 97.5% for 1 to 30 degrees of freedom. */
const T_975 = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08,
    2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]

/** The mean and its 95% half-width (Student's t, n − 1 degrees). */
export function meanCI(values: number[]): { mean: number; half: number } {
    const n = values.length
    if (n === 0) return { mean: 0, half: 0 }
    const mean = values.reduce((sum, v) => sum + v, 0) / n
    if (n === 1) return { mean, half: 0 }
    const variance =
        values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
    const t = T_975[Math.min(n - 1, T_975.length) - 1]!
    return { mean, half: (t * Math.sqrt(variance)) / Math.sqrt(n) }
}

/**
 * Sims stat weights on each fight: for every seed, the baseline and each
 * stat added; EP and its half-width are DPS per point over attack power's.
 */
export async function simStatWeights(
    character: Character,
    pool: SimPool,
    fights: Scenario[],
    options: { seeds?: number[]; iterations?: number; gear?: Gear } = {}
): Promise<
    { fight_id: string; weights: { stat: Stat; ep: number; half: number }[] }[]
> {
    const seeds = options.seeds ?? weightSeeds()
    const iterations = options.iterations ?? WEIGHTS_DEFAULTS.iterations
    const run = (fight: Scenario, seed: number, stat?: Stat, amount = 0) =>
        pool
            .sim(
                buildRequest(character, fight, {
                    seed,
                    iterations,
                    gear: options.gear,
                    bonusStats: stat ? bonusFor(stat, amount) : undefined,
                }),
                character.profile
            )
            .then(dpsOf)
    return Promise.all(
        fights.map(async (fight) => {
            // One baseline per fight and seed, shared by every stat.
            const baselines = seeds.map((seed) => run(fight, seed))
            const perPoint = await Promise.all(
                STAT_STEPS.map(async (step) =>
                    Promise.all(
                        seeds.map(async (seed, s) => {
                            const [base, up] = await Promise.all([
                                baselines[s]!,
                                run(fight, seed, step.stat, step.amount),
                            ])
                            return (up - base) / step.amount
                        })
                    )
                )
            )
            const ap = meanCI(
                perPoint[
                    STAT_STEPS.findIndex((s) => s.stat === 'attack_power')
                ]!
            ).mean
            const weights = STAT_STEPS.map((step, i) => {
                const { mean, half } = meanCI(perPoint[i]!)
                const ep = ap > 0 ? mean / ap : 0
                return {
                    stat: step.stat,
                    ep: Math.round(ep * 100) / 100,
                    half: ap > 0 ? Math.round((half / ap) * 100) / 100 : 0,
                }
            })
            return { fight_id: fight.fight_id, weights }
        })
    )
}

/**
 * The EP per stat the plan ranks armor and jewellery by: the average of
 * the solo-hit-short and dungeon-short weights.
 */
export function epTable(weights: StatWeights): Map<Stat, number> {
    const fights = weights.filter((w) =>
        ['solo-hit-short', 'dungeon-short'].includes(w.fight_id)
    )
    const used = fights.length > 0 ? fights : weights
    const sums = new Map<Stat, number>()
    for (const fight of used)
        for (const { stat, ep } of fight.weights)
            sums.set(stat, (sums.get(stat) ?? 0) + ep / used.length)
    return sums
}
