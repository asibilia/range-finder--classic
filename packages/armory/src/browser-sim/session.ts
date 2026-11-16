/**
 * Simming fights: one single fight, or a session, the chain of pulls where
 * each pull starts with the mana the last one left, plus what the gap
 * between them gives back (no drinking).
 */
import type { Sheet, SimPool } from '@goturbo/sim'

import type { ResultsFile } from '../results-file'
import type { Character, Gear } from './character'
import { buildRequest } from './request'
import type { Scenario } from './scenarios'
import {
    damageByPart,
    damageSplit,
    manaAtEnd,
    outOfMana,
    playerOf,
    type Parts,
    type UnitMetrics,
} from './sim-result'

/** The seed and iterations of every fight the browser sims. */
export const FIGHT_SEED = 23
export const FIGHT_ITERATIONS = 2000
/** The timeline's bucket on a pull, to read the mana it ends with. */
const PULL_BUCKET_MS = 1000
/** No spirit regen for 5 s after the last cast, then a tick every 2 s. */
const FIVE_SECOND_RULE_S = 5
const TICK_S = 2

export type FightResult = Omit<ResultsFile['results'][number], 'gear'>

export type SimmedFight = { result: FightResult; player: UnitMetrics }

type Names = (id: number) => string | undefined

/** The mana a Shaman regains out of combat over a gap. */
export function gapRegen(spirit: number, gapS: number): number {
    const ticks = Math.max(0, Math.floor((gapS - FIVE_SECOND_RULE_S) / TICK_S))
    return ticks * (spirit / 5 + 17)
}

/** One single fight in `gear`, at the fixed seed. */
export async function simSingle(
    pool: SimPool,
    character: Character,
    scenario: Scenario,
    gear: Gear,
    sheet: Sheet,
    names: Names
): Promise<SimmedFight> {
    const result = await pool.sim(
        buildRequest(character, scenario, {
            seed: FIGHT_SEED,
            iterations: FIGHT_ITERATIONS,
            gear,
        }),
        character.profile
    )
    const player = playerOf(result)
    return {
        player,
        result: {
            fight_id: scenario.fight_id,
            dps: Math.round((player.dps?.avg ?? 0) * 10) / 10,
            health: sheet.health,
            armor: sheet.armor,
            out_of_mana_s: outOfMana(player, scenario.duration_s),
            time_to_die_s: null,
            timeline: null,
            pulls: null,
            damage_split: damageSplit(damageByPart(player, names)),
        },
    }
}

/** A chain of pulls in `gear`, each starting with the mana carried over. */
export async function simSession(
    pool: SimPool,
    character: Character,
    scenario: Scenario,
    gear: Gear,
    sheet: Sheet,
    names: Names
): Promise<FightResult> {
    const maxMana = Math.max(1, sheet.mana)
    const pulls: NonNullable<FightResult['pulls']> = []
    const parts: Parts = new Map()
    let mana = maxMana
    let firstDry: number | null = null
    for (let pull = 1; pull <= scenario.pulls; pull++) {
        const pct = Math.min(100, Math.max(1, (mana / maxMana) * 100))
        const result = await pool.sim(
            buildRequest(character, scenario, {
                seed: FIGHT_SEED,
                iterations: FIGHT_ITERATIONS,
                gear,
                startingManaPct: pull === 1 ? undefined : pct,
                timelineBucketMs: PULL_BUCKET_MS,
            }),
            character.profile
        )
        const player = playerOf(result)
        damageByPart(player, names, parts)
        const end = Math.max(0, manaAtEnd(player) ?? mana)
        pulls.push({
            pull,
            dps: Math.round((player.dps?.avg ?? 0) * 10) / 10,
            mana_start: Math.round(mana),
            mana_end: Math.round(end),
        })
        const dry = outOfMana(player, scenario.duration_s)
        if (firstDry === null && dry !== 'never')
            firstDry = (pull - 1) * (scenario.duration_s + scenario.gap_s) + dry
        mana = Math.min(maxMana, end + gapRegen(sheet.spirit, scenario.gap_s))
    }
    const dps = pulls.reduce((sum, p) => sum + p.dps, 0) / pulls.length
    return {
        fight_id: scenario.fight_id,
        dps: Math.round(dps * 10) / 10,
        health: sheet.health,
        armor: sheet.armor,
        out_of_mana_s:
            firstDry === null ? 'never' : Math.round(firstDry * 10) / 10,
        time_to_die_s: null,
        timeline: null,
        pulls,
        damage_split: damageSplit(parts),
    }
}
