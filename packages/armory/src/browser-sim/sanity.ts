/**
 * The sanity gates' sims, as the runner's `sanityChecks`, on its fixed
 * fights (`sanityFights`): DPS rises with each stat, and being hit resets
 * Stormstrike as Improved Stormstrike says. `checks.ts` judges what they
 * measure.
 */
import {
    BONUS_STAT_COUNT,
    STAT,
    type RaidSimResult,
    type SimPool,
} from '@goturbo/sim'

import type { Check, Stat } from '../results-file'
import type { Character } from './character'
import { dpsRisesCheck, stormstrikeRuleCheck } from './checks'
import { buildRequest, type RequestOptions } from './request'
import { STORMSTRIKE } from './rotation'
import { sanityFights, type Scenario } from './scenarios'
import { avoidedOf, castsOf, dpsOf, playerOf } from './sim-result'
import { stormstrikeVariants } from './talents'
import { bonusFor } from './weights'

/**
 * The stats the DPS-rises gates add, the runner's: its name in the check,
 * the stat and the amount.
 */
const SANITY_STATS: { name: string; stat: Stat; amount: number }[] = [
    { name: 'Strength', stat: 'strength', amount: 20 },
    { name: 'Agility', stat: 'agility', amount: 20 },
    { name: 'Intellect', stat: 'intellect', amount: 20 },
    { name: 'Attack Power', stat: 'attack_power', amount: 40 },
    { name: 'Hit rating', stat: 'hit_rating', amount: 20 },
    { name: 'Crit rating', stat: 'crit_rating', amount: 28 },
]
/** The DPS-rises gates' seeds and iterations. */
const SANITY_SEEDS = [21, 22, 23]
const SANITY_ITERATIONS = 3000
/** The Stormstrike gate's seed and iterations. */
const STORMSTRIKE_SEED = 31
const STORMSTRIKE_ITERATIONS = 4000
/**
 * The mana the Stormstrike gate's sims add, so that none runs dry. The
 * rule's expected rate holds when Stormstrike goes out as soon as it's
 * ready. A character short of mana waits for it instead, and Improved
 * Stormstrike's mana regen then moves the casts as well. Testchar's
 * level-30 gear at level 45 runs dry and measured a reset effect 1.42
 * times the expected rate; with this mana it measures 0.99 times at every
 * level from 30 to 55.
 */
const STORMSTRIKE_MANA = 1_000_000

/** The sanity sims: a baseline and each stat per seed, and 4 Stormstrike fights. */
export const SANITY_CALLS = SANITY_SEEDS.length * (SANITY_STATS.length + 1) + 4

/** The Stormstrike gate's bonus: mana that never runs out. */
function unlimitedMana(): RequestOptions['bonusStats'] {
    const stats = new Array<number>(BONUS_STAT_COUNT).fill(0)
    stats[STAT.mana] = STORMSTRIKE_MANA
    return { stats }
}

/**
 * The sanity sims and their gates, as the runner's `sanityChecks`: DPS
 * rises with each stat, and being hit resets Stormstrike as Improved
 * Stormstrike says.
 */
export async function sanitySims(
    character: Character,
    pool: SimPool
): Promise<Check[]> {
    const { solo, dungeon } = sanityFights(character.level)
    const run = (
        c: Character,
        fight: Scenario,
        seed: number,
        iterations: number,
        bonusStats?: RequestOptions['bonusStats']
    ) =>
        pool.sim(
            buildRequest(c, fight, { seed, iterations, bonusStats }),
            c.profile
        )
    const dps = (seed: number, stat?: Stat, amount = 0) =>
        run(
            character,
            dungeon,
            seed,
            SANITY_ITERATIONS,
            stat ? bonusFor(stat, amount) : undefined
        ).then(dpsOf)
    const baselines = SANITY_SEEDS.map((seed) => dps(seed))
    const rising = Promise.all(
        SANITY_STATS.map(async ({ name, stat, amount }) => {
            const gains = await Promise.all(
                SANITY_SEEDS.map(async (seed, s) => {
                    const [base, up] = await Promise.all([
                        baselines[s]!,
                        dps(seed, stat, amount),
                    ])
                    return up - base
                })
            )
            return dpsRisesCheck(name, amount, gains, dungeon.target_level)
        })
    )

    const variants = stormstrikeVariants(character.talents)
    const notHit: Scenario = { ...solo, being_hit: false }
    const minutes = solo.duration_s / 60
    const mana = unlimitedMana()
    const measure = async (talents: string) => {
        const c = { ...character, talents }
        const [hit, calm] = await Promise.all(
            [solo, notHit].map((fight) =>
                run(c, fight, STORMSTRIKE_SEED, STORMSTRIKE_ITERATIONS, mana)
            )
        )
        const perMin = (result: RaidSimResult) =>
            castsOf(playerOf(result), STORMSTRIKE, STORMSTRIKE_ITERATIONS) /
            minutes
        return {
            hit: perMin(hit!),
            notHit: perMin(calm!),
            avoided: avoidedOf(hit!) / STORMSTRIKE_ITERATIONS,
        }
    }
    const [checks, without, withIt] = await Promise.all([
        rising,
        measure(variants.without),
        measure(variants.withIt),
    ])
    return [
        ...checks,
        stormstrikeRuleCheck({
            points: variants.points,
            addedStormstrike: variants.addedStormstrike,
            without,
            withIt,
            avoided: withIt.avoided,
            durationS: solo.duration_s,
        }),
    ]
}
