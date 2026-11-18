/**
 * The callout card's one best next step (spec #109 section 8), worked out
 * from the file and the plan before anything is drawn: a bag upgrade to put
 * on, several of them, the easiest gap to go get, or every slot
 * best-in-slot. The first state that applies wins.
 */
import { type Gain, type Item, slotGap } from './gains'
import type { Plan } from './plans'
import type { ResultsFile, Slot } from './results-file'
import { SLOTS_IN_ORDER } from './slot-labels'
import { slotEntry } from './slot-view'

export type BagUpgrade = ResultsFile['bag_upgrades'][number]

type SourceKind = Item['source']['kind']

/** The card's state; null shows no card. */
export type NextStep =
    | { kind: 'bag_one'; upgrade: BagUpgrade }
    | { kind: 'bag_many'; upgrades: BagUpgrade[]; total: number }
    | { kind: 'go_get'; slot: Slot; item: Item; gain: Gain }
    | { kind: 'all_bis'; level: number; nextLevel: number | null }

/** The easiest kinds of source to go get first. */
const SOURCE_ORDER: readonly SourceKind[] = [
    'vendor',
    'quest',
    'drop',
    'crafted',
    'reputation',
    'pvp',
    'unknown',
]

/**
 * The card's state for the plan: `bag_one` or `bag_many` with bag upgrades
 * worth more than 0.0 EP, else `go_get` with a slot gap, else `all_bis`
 * when no slot has a gap. Items in `left_out_items` never count.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no card).
 * @param bagWorn - The item_id of a bag upgrade put on with Equip, or
 * null. The card stays on its bag state with it on, and slot gaps are
 * taken with it on.
 * @returns The state, or null for no card.
 */
export function nextStep(
    file: ResultsFile,
    plan: Plan | null,
    bagWorn: number | null = null
): NextStep | null {
    if (!plan) return null
    const leftOut = new Set(
        (file.left_out_items ?? []).map((item) => item.item_id)
    )
    const counts = (item: Item) => !leftOut.has(item.item_id)

    const bags = file.bag_upgrades
        .filter((upgrade) => upgrade.gain_ep > 0 && counts(upgrade.item))
        .sort((a, b) => b.gain_ep - a.gain_ep)
    const on = bags.find((upgrade) => upgrade.item.item_id === bagWorn)
    if (on) return { kind: 'bag_one', upgrade: on }
    const [first] = bags
    if (first && bags.length === 1) return { kind: 'bag_one', upgrade: first }
    if (first)
        return {
            kind: 'bag_many',
            upgrades: bags,
            total: bags.reduce((sum, upgrade) => sum + upgrade.gain_ep, 0),
        }

    const gaps: { slot: Slot; item: Item; gain: Gain }[] = []
    let anyGap = false
    for (const slot of SLOTS_IN_ORDER) {
        const gap = slotGap(slotEntry(file, slot, bagWorn), plan)
        if (gap?.kind !== 'gap') continue
        anyGap = true
        if (counts(gap.item))
            gaps.push({ slot, item: gap.item, gain: gap.gain })
    }
    const rank = (kind: SourceKind) => SOURCE_ORDER.indexOf(kind)
    gaps.sort(
        (a, b) =>
            rank(a.item.source.kind) - rank(b.item.source.kind) ||
            Number(a.gain.unit === 'DPS') - Number(b.gain.unit === 'DPS') ||
            b.gain.value - a.gain.value
    )
    const [easiest] = gaps
    if (easiest) return { kind: 'go_get', ...easiest }
    // Only left-out items stand between you and the plan: no card.
    if (anyGap) return null

    const level = file.character.level
    const above = file.slots
        .flatMap((entry) => entry.alternatives)
        .map((alternative) => alternative.item)
        .filter((item) => counts(item) && item.required_level > level)
        .map((item) => item.required_level)
    return {
        kind: 'all_bis',
        level,
        nextLevel: above.length > 0 ? Math.min(...above) : null,
    }
}
