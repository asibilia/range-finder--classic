/**
 * The callout card's one best next step (spec #109 section 8), worked out
 * from the file and the plan before anything is drawn: a bag upgrade to put
 * on, several of them, a quick fix, the easiest gap to go get, or every slot
 * best-in-slot. The first state that applies wins.
 */
import { type Gain, type Item, shownValue, slotGap } from './gains'
import {
    type BagItemsOn,
    canWearAllBagItems,
    offeredBagUpgrades,
} from './planner-state'
import type { Plan } from './plans'
import type { ResultsFile, Slot } from './results-file'
import { SLOTS_IN_ORDER } from './slot-labels'
import { slotEntry } from './slot-view'

export type BagUpgrade = ResultsFile['bag_upgrades'][number]

export type QuickFix = NonNullable<ResultsFile['quick_fixes']>[number]

type SourceKind = Item['source']['kind']

/** The card's state; null shows no card. */
export type NextStep =
    | { kind: 'bag_one'; upgrade: BagUpgrade }
    | {
          kind: 'bag_many'
          upgrades: BagUpgrade[]
          total: number
          /** `Equip all N` can put them on: the file has their results. */
          canWearAll: boolean
          /** Every one of them is on (after `Equip all N`). */
          allOn: boolean
      }
    | { kind: 'quick_fix'; fix: QuickFix; also: QuickFix[] }
    | {
          kind: 'go_get'
          slot: Slot
          item: Item
          gain: Gain
          /** The profession you make it with, when it's crafted by you. */
          madeWith: string | null
      }
    | { kind: 'all_bis'; level: number; nextLevel: number | null }

/** The easiest kinds of source to go get first (after crafted by you). */
const SOURCE_ORDER: readonly SourceKind[] = [
    'vendor',
    'quest',
    'drop',
    'crafted',
    'reputation',
    'pvp',
    'unknown',
]

/** A quick fix shows when it is worth this much DPS or more (shown value). */
const QUICK_FIX_MIN_DPS = 3

/**
 * The profession you make an item with: a crafted item one of whose
 * `source.text` parts reads `Crafted: <name>` for a profession you have.
 */
function craftedWith(item: Item, professions: readonly string[]) {
    if (item.source.kind !== 'crafted') return null
    for (const part of item.source.text.split('; ')) {
        const name = /^Crafted: (.+)$/.exec(part)?.[1]
        if (name !== undefined && professions.includes(name)) return name
    }
    return null
}

/** The quick fixes worth 3.0 DPS or more (as shown), biggest first. */
function worthyFixes(file: ResultsFile): QuickFix[] {
    return (file.quick_fixes ?? [])
        .filter(
            (fix) =>
                shownValue({ value: fix.dps_gain, unit: 'DPS' }) >=
                QUICK_FIX_MIN_DPS
        )
        .sort((a, b) => b.dps_gain - a.dps_gain)
}

/**
 * The card's state for the plan: `bag_one` or `bag_many` with bag upgrades
 * worth more than 0.0 EP, else `quick_fix` with a fix worth 3.0 DPS or more,
 * else `go_get` with a slot gap (crafted by you first), else `all_bis` when
 * no slot has a gap. Items in `left_out_items` never count.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no card).
 * @param bagOn - The item_ids of the bag upgrades put on with Equip or
 * Equip all. The card stays on its bag state with them on, and slot gaps
 * are taken with them on.
 * @returns The state, or null for no card.
 */
export function nextStep(
    file: ResultsFile,
    plan: Plan | null,
    bagOn: BagItemsOn = []
): NextStep | null {
    if (!plan) return null
    const leftOut = new Set(
        (file.left_out_items ?? []).map((item) => item.item_id)
    )
    const counts = (item: Item) => !leftOut.has(item.item_id)

    const bags = offeredBagUpgrades(file)
    const on =
        bagOn.length === 1
            ? bags.find((upgrade) => upgrade.item.item_id === bagOn[0])
            : undefined
    if (on) return { kind: 'bag_one', upgrade: on }
    const [first] = bags
    if (first && bags.length === 1) return { kind: 'bag_one', upgrade: first }
    if (first)
        return {
            kind: 'bag_many',
            upgrades: bags,
            total: bags.reduce((sum, upgrade) => sum + upgrade.gain_ep, 0),
            canWearAll: canWearAllBagItems(file),
            allOn:
                bagOn.length > 1 &&
                bags.every((upgrade) => bagOn.includes(upgrade.item.item_id)),
        }

    const [fix, ...also] = worthyFixes(file)
    if (fix) return { kind: 'quick_fix', fix, also }

    const professions = (file.character.professions ?? []).map(
        (profession) => profession.name
    )
    const gaps: {
        slot: Slot
        item: Item
        gain: Gain
        madeWith: string | null
    }[] = []
    let anyGap = false
    for (const slot of SLOTS_IN_ORDER) {
        const gap = slotGap(slotEntry(file, slot, bagOn), plan)
        if (gap?.kind !== 'gap') continue
        anyGap = true
        if (counts(gap.item))
            gaps.push({
                slot,
                item: gap.item,
                gain: gap.gain,
                madeWith: craftedWith(gap.item, professions),
            })
    }
    // Crafted by you first, then by kind of source.
    const rank = (gap: (typeof gaps)[number]) =>
        gap.madeWith === null
            ? 1 + SOURCE_ORDER.indexOf(gap.item.source.kind)
            : 0
    gaps.sort(
        (a, b) =>
            rank(a) - rank(b) ||
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
