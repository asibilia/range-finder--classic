/**
 * What each gear slot shows (spec sections 5, 6 and 10), worked out from the
 * file before anything is drawn: the item, its gain, the note under it, the
 * chips, and the slot button's accessible name.
 */
import {
    bestUpgrade,
    formatGain,
    type Gain,
    gainOf,
    gainSize,
    isUpgrade,
    type Item,
    type SlotEntry,
} from './gains'
import { itemName, shortSource } from './item-name'
import type { Plan } from './plans'
import type { ResultsFile, Slot } from './results-file'
import { SLOT_LABELS, SLOTS_IN_ORDER } from './slot-labels'

/** What one slot shows. */
export type SlotShown = {
    slot: Slot
    label: string
    item: Item | null
    /** The item's name as shown (`Unnamed cloak (279848)` for a placeholder). */
    itemName: string | null
    gain: Gain | null
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
    /** The accessible name, e.g. `Hands: Toughened Leather Gloves, +21.6 EP`. */
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
        gain: null,
        note: undefined,
        description: undefined,
        sameAsWorn: false,
        chips: [],
        name: `${label}: Empty`,
    }
}

/**
 * A slot with a file loaded, on what you wear or on the plan's gear.
 *
 * @param file - The loaded results file.
 * @param slot - The slot.
 * @param plan - The plan whose gear to show, or null for what you wear.
 * @returns What it shows.
 */
export function slotShown(
    file: ResultsFile,
    slot: Slot,
    plan: Plan | null
): SlotShown {
    const label = SLOT_LABELS[slot]
    const entry = file.slots.find((candidate) => candidate.slot === slot)
    const named = (item: Item) => itemName(item, slot, file.character.class)
    const shown = plan
        ? planView(entry, plan.gear[slot], named)
        : wornView(entry, named)
    if (
        !shown.item &&
        !entry?.worn &&
        isTrinket(slot) &&
        !entry?.alternatives.length
    )
        shown.note = 'No trinkets in the data yet'
    const chips: string[] = []
    if (shown.item && shown.item.required_level > file.character.level)
        chips.push(`Needs level ${shown.item.required_level}`)
    if (!plan && file.bag_upgrades.some((upgrade) => upgrade.slot === slot))
        chips.push('Better in bags')
    const shownName = shown.item ? named(shown.item) : null
    const name = shownName ?? 'Nothing equipped'
    const suffix = shown.sameAsWorn
        ? ', same as what you wear'
        : shown.gain
          ? `, ${formatGain(shown.gain)}`
          : ''
    return {
        slot,
        label,
        ...shown,
        itemName: shownName,
        chips,
        name: `${label}: ${name}${suffix}`,
    }
}

type View = Pick<
    SlotShown,
    'item' | 'gain' | 'note' | 'description' | 'sameAsWorn'
>

function isTrinket(slot: Slot): boolean {
    return slot === 'trinket_1' || slot === 'trinket_2'
}

function wornView(
    entry: SlotEntry | undefined,
    named: (item: Item) => string
): View {
    const worn = entry?.worn ?? null
    const best = bestUpgrade(entry)
    return {
        item: worn,
        gain: best?.gain ?? null,
        note: best ? `Best: ${named(best.item)}` : worn?.source.text,
        description: undefined,
        sameAsWorn: false,
    }
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
            gain: null,
            note: worn ? 'Same as what you wear' : undefined,
            description: undefined,
            sameAsWorn: worn !== null,
        }
    const alternative = entry?.alternatives.find(
        (candidate) => candidate.item.item_id === planItemId
    )
    const gain = alternative ? gainOf(alternative) : null
    const item = alternative?.item ?? null
    return {
        item,
        gain: isUpgrade(gain) ? gain : null,
        // The mockup's line under a swapped-in item: where it comes from.
        // What it replaces is said to a screen reader instead.
        note: item ? shortSource(item.source.text) : undefined,
        description: `Replaces ${worn ? named(worn) : 'nothing'}`,
        sameAsWorn: false,
    }
}

/** The gear pane's explaining line in the worn view. */
export type UpgradeSummary = {
    /** The first slot's gain, shown as an example pill; null with none. */
    example: Gain | null
    /** How many slots have a big upgrade. */
    big: number
}

/**
 * The example gain and the count of big upgrades, for the line under the
 * gear heading: `+16.7 EP is the best gain the sim found for that slot. 11
 * slots have a big upgrade (15 EP or 3 DPS and up).`
 *
 * @param file - The loaded results file.
 * @returns The summary.
 */
export function upgradeSummary(file: ResultsFile): UpgradeSummary {
    const gains = SLOTS_IN_ORDER.map(
        (slot) =>
            bestUpgrade(file.slots.find((entry) => entry.slot === slot))?.gain
    ).filter((gain): gain is Gain => gain !== undefined)
    return {
        example: gains[0] ?? null,
        big: gains.filter((gain) => gainSize(gain) === 'big').length,
    }
}
