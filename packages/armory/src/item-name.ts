/**
 * How the page names an item and says where it comes from, as the approved
 * mockup did: an item the runner could only name `Item 279848` reads
 * `Unnamed cloak (279848)`, and a source reads without its kind
 * (`Leatherworking`, `Blind Hunter, Razorfen Kraul`).
 */
import type { Item } from './gains'
import type { Slot } from './results-file'

/** What one item in a slot is called, in words (`cloak`, `bracers`). */
const SLOT_WORDS: Record<Slot, string> = {
    head: 'helm',
    neck: 'necklace',
    shoulder: 'shoulders',
    back: 'cloak',
    chest: 'chest piece',
    wrist: 'bracers',
    hands: 'gloves',
    waist: 'belt',
    legs: 'leggings',
    feet: 'boots',
    finger_1: 'ring',
    finger_2: 'ring',
    trinket_1: 'trinket',
    trinket_2: 'trinket',
    main_hand: 'weapon',
    off_hand: 'off-hand item',
    relic: 'relic',
}

/** The relic slot holds a class's own kind of relic. */
const RELIC_WORDS: Record<string, string> = {
    Shaman: 'totem',
    Paladin: 'libram',
    Druid: 'idol',
}

/**
 * The name the page shows for an item. The runner names an item it has no
 * name for `Item <id>`; that placeholder reads `Unnamed <slot word> (<id>)`.
 *
 * @param item - The item.
 * @param slot - The slot it is shown in (picks the word).
 * @param characterClass - The character's class (`Shaman`: a relic is a totem).
 * @returns The name to show.
 *
 * @example
 * itemName({ item_id: 279848, name: 'Item 279848', ... }, 'back', 'Shaman')
 * // 'Unnamed cloak (279848)'
 */
export function itemName(
    item: Pick<Item, 'item_id' | 'name'>,
    slot: Slot,
    characterClass: string
): string {
    if (item.name !== `Item ${item.item_id}`) return item.name
    const word =
        slot === 'relic'
            ? (RELIC_WORDS[characterClass] ?? SLOT_WORDS.relic)
            : SLOT_WORDS[slot]
    return `Unnamed ${word} (${item.item_id})`
}

const KIND_PREFIX = /^(?:Crafted|Drop): /

/**
 * A source without its kind, for the short line under a slot's name:
 * `Crafted: Leatherworking` reads `Leatherworking`, `Drop: Blind Hunter,
 * Razorfen Kraul` reads `Blind Hunter, Razorfen Kraul`. Each `; ` part is
 * shortened on its own; other wording is kept.
 *
 * @param text - The item's `source.text`.
 * @returns The short source.
 */
export function shortSource(text: string): string {
    return text
        .split('; ')
        .map((part) => part.replace(KIND_PREFIX, ''))
        .join('; ')
}
