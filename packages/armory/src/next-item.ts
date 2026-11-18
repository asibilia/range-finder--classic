/**
 * The item a slot gets next, once the character levels: for a slot that is
 * already the sim's best for now (the plan keeps what you wear) or empty
 * with nothing the plan puts there, the alternative that needs a level
 * above the character's. The tile shows it as its third line, `Next:
 * <item> at level N`.
 */
import type { Alternative, SlotEntry } from './gains'

/** What the `Next:` line names: the item, its name and the level it needs. */
export type NextItem = { itemId: number; name: string; level: number }

/** An alternative's gain for ordering: EP, else DPS, else nothing. */
function gainFor(alternative: Alternative): number {
    return alternative.gain_ep ?? alternative.gain_dps ?? -Infinity
}

/**
 * The alternative a slot gets next: of those that need a level above the
 * character's, the one with the lowest required level; on a tie, the
 * biggest gain (EP, else DPS).
 *
 * @param entry - The slot's entry.
 * @param level - The character's level.
 * @returns The alternative, or null when none needs a higher level.
 *
 * @example
 * ```ts
 * nextAlternative(trinketEntry, 34)?.item.name // "Gill's Gills" (level 35)
 * ```
 */
export function nextAlternative(
    entry: SlotEntry | undefined,
    level: number
): Alternative | null {
    const above = (entry?.alternatives ?? []).filter(
        (alternative) => alternative.item.required_level > level
    )
    let next: Alternative | null = null
    for (const alternative of above) {
        if (
            next === null ||
            alternative.item.required_level < next.item.required_level ||
            (alternative.item.required_level === next.item.required_level &&
                gainFor(alternative) > gainFor(next))
        )
            next = alternative
    }
    return next
}
