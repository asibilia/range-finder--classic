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
    timelineOf,
    type Parts,
    type SpellNames,
    type UnitMetrics,
} from './sim-result'

/** The seed of every fight the browser sims, as in the runner. */
export const FIGHT_SEED = 23
/**
 * The runner's iterations: 4000 on a single fight (worn, the plan, the
 * sanity and weapon sims), 2000 on each pull of the chain.
 */
export const FIGHT_ITERATIONS = 4000
export const PULL_ITERATIONS = 2000
/**
 * The timeline's bucket: per second on a single fight (its chart), and on
 * a pull, to read the mana it ends with.
 */
const TIMELINE_BUCKET_MS = 1000

export type FightResult = Omit<ResultsFile['results'][number], 'gear'>

export type SimmedFight = { result: FightResult; player: UnitMetrics }

type Names = (id: number) => string | undefined

/**
 * One single fight in `gear`, at the fixed seed. `names` names items,
 * `spellNames` spells (`build/spell-names.json`), in the damage split.
 */
export async function simSingle(
    pool: SimPool,
    character: Character,
    scenario: Scenario,
    gear: Gear,
    sheet: Sheet,
    names: Names,
    spellNames: SpellNames = {}
): Promise<SimmedFight> {
    const result = await pool.sim(
        buildRequest(character, scenario, {
            seed: FIGHT_SEED,
            iterations: FIGHT_ITERATIONS,
            gear,
            timelineBucketMs: TIMELINE_BUCKET_MS,
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
            timeline: timelineOf(player),
            pulls: null,
            damage_split: damageSplit(
                damageByPart(player, names, new Map(), spellNames)
            ),
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
    names: Names,
    spellNames: SpellNames = {}
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
                iterations: PULL_ITERATIONS,
                gear,
                startingManaPct: pull === 1 ? undefined : pct,
                timelineBucketMs: TIMELINE_BUCKET_MS,
            }),
            character.profile
        )
        const player = playerOf(result)
        damageByPart(player, names, parts, spellNames)
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
        // The runner's rule: the export's out-of-combat rate over the gap.
        mana = Math.min(
            maxMana,
            end + (character.ooc_mana_regen ?? 0) * scenario.gap_s
        )
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
