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
import type { Plan } from './plans'
import type { ResultsFile, Slot } from './results-file'
import { SLOT_LABELS, SLOTS_IN_ORDER } from './slot-labels'

/** What one slot shows. */
export type SlotShown = {
    slot: Slot
    label: string
    item: Item | null
    gain: Gain | null
    note: string | undefined
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
        gain: null,
        note: undefined,
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
    const shown = plan ? planView(entry, plan.gear[slot]) : wornView(entry)
    const chips: string[] = []
    if (shown.item && shown.item.required_level > file.character.level)
        chips.push(`Needs level ${shown.item.required_level}`)
    if (!plan && file.bag_upgrades.some((upgrade) => upgrade.slot === slot))
        chips.push('Better in bags')
    const name = shown.item ? shown.item.name : 'Nothing equipped'
    const suffix = shown.sameAsWorn
        ? ', same as what you wear'
        : shown.gain
          ? `, ${formatGain(shown.gain)}`
          : ''
    return {
        slot,
        label,
        ...shown,
        chips,
        name: `${label}: ${name}${suffix}`,
    }
}

type View = Pick<SlotShown, 'item' | 'gain' | 'note' | 'sameAsWorn'>

function wornView(entry: SlotEntry | undefined): View {
    const worn = entry?.worn ?? null
    const best = bestUpgrade(entry)
    return {
        item: worn,
        gain: best?.gain ?? null,
        note: best ? `Best: ${best.item.name}` : worn?.source.text,
        sameAsWorn: false,
    }
}

function planView(
    entry: SlotEntry | undefined,
    planItemId: number | null
): View {
    const worn = entry?.worn ?? null
    if (planItemId === (worn?.item_id ?? null))
        return {
            item: worn,
            gain: null,
            note: worn ? 'Same as what you wear' : undefined,
            sameAsWorn: worn !== null,
        }
    const alternative = entry?.alternatives.find(
        (candidate) => candidate.item.item_id === planItemId
    )
    const gain = alternative ? gainOf(alternative) : null
    return {
        item: alternative?.item ?? null,
        gain: isUpgrade(gain) ? gain : null,
        note: `Replaces ${worn ? worn.name : 'nothing'}`,
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
