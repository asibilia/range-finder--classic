/**
 * What each gear slot shows (spec sections 5, 6 and 10), worked out from the
 * file before anything is drawn: the item, its gap to the plan (or `BIS`),
 * the note under it, the chips, and the slot button's accessible name.
 */
import {
    formatGap,
    type Item,
    type SlotEntry,
    type SlotGap,
    slotGap,
} from './gains'
import { firstSource, itemName, shortSource } from './item-name'
import { type NextItem, nextAlternative } from './next-item'
import type { BagItemsOn } from './planner-state'
import type { Plan } from './plans'
import type { ResultsFile, Slot } from './results-file'
import { SLOT_LABELS, slotLabel, SLOTS_IN_ORDER } from './slot-labels'

/** What one slot shows. */
export type SlotShown = {
    slot: Slot
    label: string
    item: Item | null
    /** The item's name as shown (`Unnamed cloak (279848)` for a placeholder). */
    itemName: string | null
    /**
     * What you wear: the gap to the plan's item, or `bis`; null with
     * neither, and always in the plan view.
     */
    gap: SlotGap | null
    /**
     * What you wear, with a gap: the plan's item for the slot, shown as the
     * tile's third line, `Best: <item>` (a link to the picker); null
     * otherwise.
     */
    best: { itemId: number; name: string } | null
    /**
     * What you wear, on a slot that is the sim's best for now (`BIS`) or
     * empty with nothing from the plan: the alternative that needs a level
     * above the character's (`nextAlternative`), shown as the tile's third
     * line, `Next: <item> at level N` (a link to the picker); null
     * otherwise.
     */
    next: NextItem | null
    /**
     * The line under the name, when there is no `best` line: the first part
     * of the item's source.
     */
    note: string | undefined
    /**
     * Said to a screen reader after the name (the button's description),
     * e.g. `Replaces Trapper's Leather Legguards` in the plan view.
     */
    description: string | undefined
    /** Plan view: the plan keeps what you wear here (drawn faded). */
    sameAsWorn: boolean
    /** Chips under the label, e.g. `Needs level 33`. */
    chips: string[]
    /**
     * The accessible name, e.g. `Hands: Toughened Leather Gloves, 21.6 EP
     * below the sim's best`.
     */
    name: string
}

/**
 * An empty outline, before a file loads: `Head: Empty`.
 *
 * @param slot - The slot.
 * @returns What it shows.
 */
export function emptySlot(slot: Slot): SlotShown {
    const label = SLOT_LABELS[slot]
    return {
        slot,
        label,
        item: null,
        itemName: null,
        gap: null,
        best: null,
        next: null,
        note: undefined,
        description: undefined,
        sameAsWorn: false,
        chips: [],
        name: `${label}: Empty`,
    }
}

/** The bag upgrade put on in one slot: the item, and its EP over worn. */
type BagInSlot = { item: Item; gain_ep: number }

function bagInSlot(
    file: ResultsFile,
    slot: Slot,
    bagOn: BagItemsOn
): BagInSlot | null {
    const upgrade = file.bag_upgrades.find(
        (candidate) =>
            candidate.slot === slot && bagOn.includes(candidate.item.item_id)
    )
    return upgrade ? { item: upgrade.item, gain_ep: upgrade.gain_ep } : null
}

/**
 * A slot's entry as the page shows it: the file's, or, with a bag upgrade
 * for this slot put on, the entry as if the bag item were worn (see
 * `overBag`).
 *
 * @param file - The loaded results file.
 * @param slot - The slot.
 * @param bagOn - The item_ids of the bag upgrades put on (none: `[]`).
 * @returns The entry, or undefined when the file has none for the slot.
 */
export function slotEntry(
    file: ResultsFile,
    slot: Slot,
    bagOn: BagItemsOn
): SlotEntry | undefined {
    const entry = file.slots.find((candidate) => candidate.slot === slot)
    const bag = bagInSlot(file, slot, bagOn)
    return bag && entry ? overBag(entry, bag) : entry
}

/**
 * A slot with a file loaded, on what you wear (with its gap to the plan,
 * or `BIS`) or on the plan's gear.
 *
 * @param file - The loaded results file.
 * @param slot - The slot.
 * @param plan - The plan the sliders pick, or null with no plans.
 * @param planShown - True to show the plan's gear (the `BIS` view; no
 * badges), false for what you wear.
 * @param bagOn - The item_ids of the bag upgrades put on (Equip or
 * Equip all). In its slot a bag item stands for what you wear, and EP gains
 * are taken over it (EP adds up: an alternative's gain less the bag item's).
 * @returns What it shows.
 */
export function slotShown(
    file: ResultsFile,
    slot: Slot,
    plan: Plan | null,
    planShown: boolean,
    bagOn: BagItemsOn = []
): SlotShown {
    const label = slotLabel(slot, file)
    const bag = bagInSlot(file, slot, bagOn)
    const entry = slotEntry(file, slot, bagOn)
    const named = (item: Item) => itemName(item, slot, file.character.class)
    const shown =
        planShown && plan
            ? planView(entry, plan.gear[slot], named)
            : wornView(entry, slotGap(entry, plan), named)
    if (
        !shown.item &&
        !entry?.worn &&
        isTrinket(slot) &&
        !entry?.alternatives.length
    )
        shown.note = 'No trinkets in the data yet'
    const chips: string[] = []
    if (shown.item && shown.item.required_level > file.character.level)
        chips.push(`needs ${shown.item.required_level}`)
    if (
        !(planShown && plan) &&
        !bag &&
        file.bag_upgrades.some((candidate) => candidate.slot === slot)
    )
        chips.push('better in bags')
    // Best for now, or empty with nothing from the plan: what comes next.
    const nextUp =
        !(planShown && plan) &&
        (shown.gap?.kind === 'bis' ||
            (!entry?.worn && (plan?.gear[slot] ?? null) === null))
            ? nextAlternative(entry, file.character.level)
            : null
    const next: NextItem | null = nextUp && {
        itemId: nextUp.item.item_id,
        name: named(nextUp.item),
        level: nextUp.item.required_level,
    }
    if (next) shown.note = undefined
    const shownName = shown.item ? named(shown.item) : null
    const name = shownName ?? 'Nothing equipped'
    const suffix = shown.sameAsWorn
        ? ', same as what you wear'
        : gapSuffix(shown.gap)
    return {
        slot,
        label,
        ...shown,
        next,
        itemName: shownName,
        chips,
        name: `${label}: ${name}${suffix}`,
    }
}

/**
 * A slot's entry as if the bag item were worn: it is what you wear, the
 * old worn item becomes an alternative at minus the bag item's EP, and every
 * EP gain is taken over the bag item. DPS gains can't be moved that way, so
 * they are dropped (not simmed over the bag item).
 */
function overBag(entry: SlotEntry, bag: BagInSlot): SlotEntry {
    const over = (gain: number | null) =>
        gain === null ? null : gain - bag.gain_ep
    const alternatives = entry.alternatives
        .filter((alternative) => alternative.item.item_id !== bag.item.item_id)
        .map((alternative) => ({
            item: alternative.item,
            gain_ep: over(alternative.gain_ep),
            gain_dps: null,
        }))
    if (entry.worn)
        alternatives.push({
            item: entry.worn,
            gain_ep: -bag.gain_ep,
            gain_dps: null,
        })
    alternatives.sort(
        (a, b) => (b.gain_ep ?? -Infinity) - (a.gain_ep ?? -Infinity)
    )
    return { ...entry, worn: bag.item, alternatives }
}

type View = Pick<
    SlotShown,
    'item' | 'gap' | 'best' | 'note' | 'description' | 'sameAsWorn'
>

function isTrinket(slot: Slot): boolean {
    return slot === 'trinket_1' || slot === 'trinket_2'
}

function wornView(
    entry: SlotEntry | undefined,
    gap: SlotGap | null,
    named: (item: Item) => string
): View {
    const worn = entry?.worn ?? null
    const best = gap?.kind === 'gap' ? gap.item : null
    return {
        item: worn,
        gap,
        best: best && { itemId: best.item_id, name: named(best) },
        note: best || !worn ? undefined : firstSource(worn.source.text),
        description: undefined,
        sameAsWorn: false,
    }
}

/** `, 16.7 EP below the sim's best`, `, the sim's best`, or nothing. */
function gapSuffix(gap: SlotGap | null): string {
    if (!gap) return ''
    if (gap.kind === 'bis') return ", the sim's best"
    return `, ${formatGap(gap.gain)} ${gap.gain.unit} below the sim's best`
}

function planView(
    entry: SlotEntry | undefined,
    planItemId: number | null,
    named: (item: Item) => string
): View {
    const worn = entry?.worn ?? null
    if (planItemId === (worn?.item_id ?? null))
        return {
            item: worn,
            gap: null,
            best: null,
            note: worn ? 'Same as you wear' : undefined,
            description: undefined,
            sameAsWorn: worn !== null,
        }
    const alternative = entry?.alternatives.find(
        (candidate) => candidate.item.item_id === planItemId
    )
    const item = alternative?.item ?? null
    return {
        item,
        gap: null,
        best: null,
        // The mockup's line under a swapped-in item: where it comes from.
        // What it replaces is said to a screen reader instead.
        note: item ? shortSource(firstSource(item.source.text)) : undefined,
        description: `Replaces ${worn ? named(worn) : 'nothing'}`,
        sameAsWorn: false,
    }
}

/** The slot gaps added up, for the total line under the gear heading. */
export type GapTotal = {
    /** The EP gaps' raw values added up. */
    ep: number
    /** How many slots have an EP gap. */
    epSlots: number
    /** The DPS-only gaps' raw values added up. */
    dps: number
    /** How many slots have a DPS-only gap. */
    dpsSlots: number
}

/**
 * The slot gaps to the plan added up (spec section 4), over what you wear
 * (a bag item put on counts as worn).
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick.
 * @param bagOn - The item_ids of the bag upgrades put on.
 * @returns The totals.
 */
export function gapTotal(
    file: ResultsFile,
    plan: Plan,
    bagOn: BagItemsOn = []
): GapTotal {
    const total: GapTotal = { ep: 0, epSlots: 0, dps: 0, dpsSlots: 0 }
    for (const slot of SLOTS_IN_ORDER) {
        const gap = slotGap(slotEntry(file, slot, bagOn), plan)
        if (gap?.kind !== 'gap') continue
        if (gap.gain.unit === 'EP') {
            total.ep += gap.gain.value
            total.epSlots += 1
        } else {
            total.dps += gap.gain.value
            total.dpsSlots += 1
        }
    }
    return total
}
