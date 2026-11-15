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
