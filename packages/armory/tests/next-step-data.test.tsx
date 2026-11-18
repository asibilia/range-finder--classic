/**
 * The callout card's data-gated parts (spec #109 section 8, ticket #118):
 * quick fixes (state 3), items crafted by you first in `go_get`, and
 * `Equip all N` on several bag upgrades. Each shows only when its field is
 * in the file (`quick_fixes`, `character.professions`, `bag_upgrades_all`).
 * The DOM helper must be the first import.
 *
 * Checks are booleans (`shows`, `hasButton`): here `expect(element)
 * .toBeNull()` passes on a DOM element.
 */
import './dom'
import { openFile, readingValue, variant, type Json } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'

type Item = {
    item_id: number
    name: string
    quality: string
    item_level: number | null
    required_level: number
    source: { kind: string; text: string }
    data: string
}
type Alt = { item: Item; gain_ep: number | null; gain_dps: number | null }
type Entry = { slot: string; worn: Item | null; alternatives: Alt[] }
type PlanJson = { gear: Record<string, number | null> }
type ResultJson = { fight_id: string; dps: number }
type BagJson = { slot: string; item: Item; gain_ep: number; results?: unknown }

/** Unmounts the page and forgets the file it kept, as between tests. */
function reset() {
    cleanup()
    localStorage.clear()
}

afterEach(reset)

/** Text with every space taken out, so line breaks don't matter. */
function squeeze(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, '')
}

function gearPane(): HTMLElement {
    const pane = document.querySelector<HTMLElement>('[data-slot="gear-pane"]')
    if (!pane) throw new Error('no gear card')
    return pane
}

/** Whether the gear card shows an element (not hidden) holding `text`. */
function shows(text: string): boolean {
    const wanted = squeeze(text)
    return [...gearPane().querySelectorAll<HTMLElement>('*')].some(
        (element) =>
            squeeze(element.textContent).includes(wanted) &&
            !element.closest('[hidden]')
    )
}

/** The button named `name`; a short error when there is none. */
function button(name: string): HTMLElement {
    const found = screen.queryByRole('button', { name })
    if (!found) throw new Error(`no button named ${name}`)
    return found
}

/** Whether a button named `name` is on the page. */
function hasButton(name: string | RegExp): boolean {
    return screen.queryByRole('button', { name }) !== null
}

function entries(file: Json): Entry[] {
    return file.slots as Entry[]
}

function alternative(file: Json, slotName: string, itemId: number): Alt {
    const entry = entries(file).find((each) => each.slot === slotName)
    const found = entry?.alternatives.find(
        (candidate) => candidate.item.item_id === itemId
    )
    if (!found) throw new Error(`no alternative ${itemId} in ${slotName}`)
    return found
}

/** The default plan (Max damage, the highest damage mix). */
function maxDamage(file: Json): PlanJson {
    const plan = (file.plans as PlanJson[])[0]
    if (!plan) throw new Error('the sample has no plans')
    return plan
}

/** Makes the default plan keep what you wear in every slot (no gaps). */
function keepAllWorn(file: Json) {
    const gear = maxDamage(file).gear
    for (const slotName of Object.keys(gear)) gear[slotName] = null
    for (const each of entries(file))
        gear[each.slot] = each.worn?.item_id ?? null
}

/** Puts an alternative in the plan for `slotName`, changed by `change`. */
function planGap(
    file: Json,
    slotName: string,
    itemId: number,
    change: (alt: Alt) => void
) {
    maxDamage(file).gear[slotName] = itemId
    change(alternative(file, slotName, itemId))
}

/** A made-up item of unknown source. */
function item(itemId: number, name: string): Item {
    return {
        item_id: itemId,
        name,
        quality: 'uncommon',
        item_level: null,
        required_level: 25,
        source: { kind: 'unknown', text: 'Source unknown' },
        data: 'classic',
    }
}

const WINDFURY = {
    kind: 'imbue',
    slot: 'main_hand',
    dps_gain: 18.2,
    text: "Windfury Weapon wasn't on your weapon at export.",
}

const OFF_HAND = {
    kind: 'empty_slot',
    slot: 'off_hand',
    dps_gain: 4.0,
    text: 'Your off hand is empty.',
}

const WINDFURY_LINE =
    "Windfury Weapon wasn't on your weapon at export. Putting it back is worth about +18.2 DPS."

/** No bag upgrades, a vendor Legs gap in the plan, and `quickFixes`. */
function quickFixFile(quickFixes: unknown[]): Json {
    return variant((file) => {
        file.bag_upgrades = []
        file.quick_fixes = quickFixes
        keepAllWorn(file)
        huntingPants(file, 5)
    })
}

/** The plan's Legs item becomes `Hunting Pants`, from a vendor. */
function huntingPants(file: Json, gainEp: number) {
    planGap(file, 'legs', 6690, (alt) => {
        alt.item.name = 'Hunting Pants'
        alt.item.source = {
            kind: 'vendor',
            text: 'Vendor: Harggan, The Hinterlands',
        }
        alt.gain_ep = gainEp
        alt.gain_dps = null
    })
}

describe('quick fixes', () => {
    test('one imbue fix worth 18.2 DPS reads its text and Putting it back is worth about +18.2 DPS.; under 3.0 DPS it falls back to go get', async () => {
        await openFile(quickFixFile([{ ...WINDFURY, dps_gain: 2.9 }]))
        expect(shows('Putting it back is worth')).toBe(false)
        expect(
            shows(
                'Hunting Pants (Vendor: Harggan, The Hinterlands), +5.0 EP on your leggings.'
            )
        ).toBe(true)
        reset()

        await openFile(quickFixFile([WINDFURY]))

        expect(shows(WINDFURY_LINE)).toBe(true)
        expect(shows('Also:')).toBe(false)
        expect(hasButton('Other options')).toBe(false)
        expect(shows('Hunting Pants (Vendor')).toBe(false)
    })

    test('a second fix worth 4.0 DPS follows as Also:, and one under 3.0 DPS is left out', async () => {
        await openFile(
            quickFixFile([
                {
                    kind: 'weapon_skill',
                    slot: 'main_hand',
                    dps_gain: 2.9,
                    text: 'Your axe skill is low.',
                },
                OFF_HAND,
                WINDFURY,
            ])
        )

        expect(shows(WINDFURY_LINE)).toBe(true)
        expect(shows('Also: Your off hand is empty. (+4.0 DPS).')).toBe(true)
        expect(shows('Your axe skill is low.')).toBe(false)
    })
})

describe('crafted by you', () => {
    /**
     * No bag upgrades; in the plan a Chest gap `Totemic Leather Tunic`
     * (crafted, Leatherworking, 6.0 EP) and a Legs gap `Hunting Pants`
     * (vendor, 9.0 EP); the character knows `profession`.
     */
    function craftedFile(profession: string): Json {
        return variant((file) => {
            file.bag_upgrades = []
            const character = file.character as Json
            character.professions = [{ name: profession, skill: 165, max: 225 }]
            keepAllWorn(file)
            huntingPants(file, 9)
            planGap(file, 'chest', 252451, (alt) => {
                alt.item.source = {
                    kind: 'crafted',
                    text: 'Crafted: Leatherworking',
                }
                alt.gain_ep = 6
                alt.gain_dps = null
            })
        })
    }

    test('with Leatherworking, a crafted Chest gap ranks before a bigger vendor Legs gap and reads You can make; with Tailoring it does not', async () => {
        await openFile(craftedFile('Tailoring'))
        expect(
            shows(
                'Hunting Pants (Vendor: Harggan, The Hinterlands), +9.0 EP on your leggings.'
            )
        ).toBe(true)
        expect(shows('You can make')).toBe(false)
        reset()

        await openFile(craftedFile('Leatherworking'))

        expect(
            shows(
                'You can make Totemic Leather Tunic with your Leatherworking, +6.0 EP on your chest piece.'
            )
        ).toBe(true)
        expect(shows('Hunting Pants (Vendor')).toBe(false)
    })
})

describe('Equip all', () => {
    /**
     * Three bag upgrades in three slots: the sample's Berylline Pads
     * (shoulder), a Glinting Helm (head) and Glinting Gloves (hands). With
     * `all`, `bag_upgrades_all` holds the Pads' results at 150.5 DPS.
     */
    function threeBagsFile(all: boolean): Json {
        return variant((file) => {
            const bags = file.bag_upgrades as BagJson[]
            const pads = bags.find((bag) => bag.item.name === 'Berylline Pads')
            if (!pads) throw new Error('the sample has no Berylline Pads')
            file.bag_upgrades = [
                pads,
                {
                    slot: 'head',
                    item: item(900001, 'Glinting Helm'),
                    gain_ep: 10.1,
                },
                {
                    slot: 'hands',
                    item: item(900002, 'Glinting Gloves'),
                    gain_ep: 8.4,
                },
            ]
            if (!all) return
            const results = structuredClone(pads.results) as ResultJson[]
            for (const result of results) result.dps = 150.5
            file.bag_upgrades_all = { results }
        })
    }

    test('Equip all 3 puts all three on, shows the combined DPS and the sentence; Undo restores all three slots; no button without bag_upgrades_all', async () => {
        await openFile(threeBagsFile(false))
        expect(
            shows('3 items in your bags beat what you wear, +25.5 EP together.')
        ).toBe(true)
        expect(hasButton(/^Equip all/)).toBe(false)
        reset()

        const user = await openFile(threeBagsFile(true))
        expect(readingValue('Dungeon')).toBe('75.4')

        await user.click(button('Equip all 3'))

        expect(hasButton(/^Shoulder: Berylline Pads/)).toBe(true)
        expect(hasButton(/^Head: Glinting Helm/)).toBe(true)
        expect(hasButton(/^Hands: Glinting Gloves/)).toBe(true)
        expect(readingValue('Solo')).toBe('150.5')
        expect(readingValue('Dungeon')).toBe('150.5')
        expect(
            shows(
                'You wear 3 bag items now. What they replaced went to your bags.'
            )
        ).toBe(true)

        await user.click(button('Undo'))

        expect(hasButton(/^Shoulder: Serpent's Shoulders/)).toBe(true)
        expect(hasButton(/^Head: Brawler's Leather Hood/)).toBe(true)
        expect(hasButton(/^Hands: Toughened Leather Gloves/)).toBe(true)
        expect(readingValue('Dungeon')).toBe('75.4')
        expect(hasButton('Equip all 3')).toBe(true)
    })
})
