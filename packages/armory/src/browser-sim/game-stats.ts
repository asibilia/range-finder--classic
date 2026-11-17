/**
 * Item stats as the game exports them (`GetItemStats`' `ITEM_MOD_*` keys)
 * and as the sim takes them: the runner's `ITEM_MOD_TO_STAT` (`export.ts`).
 */
import { BONUS_STAT_COUNT } from '@goturbo/sim'

import type { GameStats } from './character'

/** The game's item stat keys to the proto `Stat` index. */
export const ITEM_MOD_TO_STAT: Readonly<Record<string, number>> = {
    ITEM_MOD_STRENGTH_SHORT: 0,
    ITEM_MOD_AGILITY_SHORT: 1,
    ITEM_MOD_STAMINA_SHORT: 2,
    ITEM_MOD_INTELLECT_SHORT: 3,
    ITEM_MOD_SPIRIT_SHORT: 13,
    ITEM_MOD_ATTACK_POWER_SHORT: 14,
    ITEM_MOD_SPELL_DAMAGE_DONE_SHORT: 5,
    ITEM_MOD_SPELL_HEALING_DONE_SHORT: 4,
    ITEM_MOD_HIT_RATING_SHORT: 17,
    ITEM_MOD_HIT_MELEE_RATING_SHORT: 17,
    ITEM_MOD_CRIT_RATING_SHORT: 18,
    ITEM_MOD_CRIT_MELEE_RATING_SHORT: 18,
    ITEM_MOD_HASTE_RATING_SHORT: 19,
    ITEM_MOD_EXPERTISE_RATING_SHORT: 21,
    RESISTANCE0_NAME: 27,
    ITEM_MOD_MANA_REGENERATION_SHORT: 31,
}

/**
 * Game stats as the sim's stats array (`BONUS_STAT_COUNT` entries); keys
 * the sim doesn't take are dropped.
 */
export function gameStats(stats: Readonly<GameStats> | undefined): number[] {
    const out = new Array<number>(BONUS_STAT_COUNT).fill(0)
    for (const [key, amount] of Object.entries(stats ?? {})) {
        const index = Object.hasOwn(ITEM_MOD_TO_STAT, key)
            ? ITEM_MOD_TO_STAT[key]
            : undefined
        if (index !== undefined) out[index] = (out[index] ?? 0) + amount
    }
    return out
}
