/** The words for each gear slot, and where each slot sits around the character. */
import type { Slot } from './results-file'

export const SLOT_LABELS: Record<Slot, string> = {
    head: 'Head',
    neck: 'Neck',
    shoulder: 'Shoulder',
    back: 'Back',
    chest: 'Chest',
    wrist: 'Wrist',
    hands: 'Hands',
    waist: 'Waist',
    legs: 'Legs',
    feet: 'Feet',
    finger_1: 'Finger 1',
    finger_2: 'Finger 2',
    trinket_1: 'Trinket 1',
    trinket_2: 'Trinket 2',
    main_hand: 'Main hand',
    off_hand: 'Off hand',
    relic: 'Relic',
}

export const LEFT_SLOTS: Slot[] = [
    'head',
    'neck',
    'shoulder',
    'back',
    'chest',
    'wrist',
]

export const RIGHT_SLOTS: Slot[] = [
    'hands',
    'waist',
    'legs',
    'feet',
    'finger_1',
    'finger_2',
    'trinket_1',
    'trinket_2',
]

export const BOTTOM_SLOTS: Slot[] = ['main_hand', 'off_hand', 'relic']

/** Every slot, in the order the page reads them: left, right, bottom. */
export const SLOTS_IN_ORDER: Slot[] = [
    ...LEFT_SLOTS,
    ...RIGHT_SLOTS,
    ...BOTTOM_SLOTS,
]

/** What the relic slot is called for a class that has its own kind. */
const RELIC_LABELS: Record<string, string> = {
    Shaman: 'Totem',
    Paladin: 'Libram',
    Druid: 'Idol',
}

/** The parts of a results file the slot labels read. */
type LabelFile = {
    character: { class: string }
    slots: { slot: Slot; worn: unknown; alternatives: unknown[] }[]
    plans: { gear: Partial<Record<Slot, number | null>> }[]
    bag_upgrades: { slot: Slot }[]
}

/**
 * True when the file reads as a two-hander in the main hand: nothing worn
 * in the off hand, no off-hand alternative, no plan puts one there and no
 * bag upgrade is for it, while the main hand holds something. The contract
 * has no two-handed flag on items, so this is read from what the file has
 * (a one-hander with an empty off hand reads as two-handed too).
 *
 * @param file - The loaded results file.
 * @returns Whether the bottom row shows `Two-hand` and no off hand.
 */
export function holdsTwoHander(file: LabelFile): boolean {
    const entry = (slot: Slot) => file.slots.find((s) => s.slot === slot)
    const offHand = entry('off_hand')
    return (
        Boolean(entry('main_hand')?.worn) &&
        !offHand?.worn &&
        (offHand?.alternatives.length ?? 0) === 0 &&
        file.plans.every((plan) => (plan.gear.off_hand ?? null) === null) &&
        !file.bag_upgrades.some((upgrade) => upgrade.slot === 'off_hand')
    )
}

/**
 * A slot's label for this file: as `SLOT_LABELS`, but the main hand reads
 * `Two-hand` when the file reads as a two-hander (`holdsTwoHander`), and
 * the relic slot is named for the class (`Totem` for a Shaman).
 *
 * @param slot - The slot.
 * @param file - The loaded file, or null before one loads.
 * @returns The label.
 *
 * @example
 * slotLabel('relic', shamanFile) // 'Totem'
 */
export function slotLabel(slot: Slot, file: LabelFile | null): string {
    if (!file) return SLOT_LABELS[slot]
    if (slot === 'relic')
        return RELIC_LABELS[file.character.class] ?? SLOT_LABELS.relic
    if (slot === 'main_hand' && holdsTwoHander(file)) return 'Two-hand'
    return SLOT_LABELS[slot]
}

/**
 * The bottom row's slots for this file: without the off hand when the file
 * reads as a two-hander, as the mockup shows `Two-hand` and `Totem`.
 *
 * @param file - The loaded file, or null before one loads (all three).
 * @returns The slots, in order.
 */
export function bottomSlots(file: LabelFile | null): Slot[] {
    if (file && holdsTwoHander(file))
        return BOTTOM_SLOTS.filter((slot) => slot !== 'off_hand')
    return BOTTOM_SLOTS
}
