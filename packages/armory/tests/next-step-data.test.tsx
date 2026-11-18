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
import {
    button,
    hasButton,
    huntingPants,
    item,
    keepAllWorn,
    planGap,
    shows,
    type Item,
} from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup } from '@testing-library/react'

type ResultJson = { fight_id: string; dps: number }
type BagJson = { slot: string; item: Item; gain_ep: number; results?: unknown }

/** Unmounts the page and forgets the file it kept, as between tests. */
function reset() {
    cleanup()
    localStorage.clear()
}

afterEach(reset)

/**
 * Whether the reading labelled `label` has a gap line under it saying what
 * you wear is below the plan (`↓ N`; a green `+ N` says it beats it).
 */
function hasReadingGap(label: string): boolean {
    return (
        document.querySelector(
            `[data-reading="${CSS.escape(label)}"] [data-reading-gap="below"]`
        ) !== null
    )
}

/** Whether the reading labelled `label` says what you wear beats the plan. */
function beatsPlan(label: string): boolean {
    return (
        document.querySelector(
            `[data-reading="${CSS.escape(label)}"] [data-reading-gap="above"]`
        ) !== null
    )
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

    test('after Equip all, each slot reads its gap over its bag item, the total follows, and the DPS gap lines go as the combined set beats the plan', async () => {
        const user = await openFile(threeBagsFile(true))
        expect(hasReadingGap('Solo')).toBe(true)
        expect(hasReadingGap('Dungeon')).toBe(true)

        await user.click(button('Equip all 3'))

        // The plan's items over each bag item: Batwing Mantle 17.8 - 7.0,
        // Defender's Leather Helm 16.7 - 10.1, Gloves of the Greatfather
        // 21.6 - 8.4.
        expect(
            [
                "Shoulder: Berylline Pads, 10.8 EP below the sim's best",
                "Head: Glinting Helm, 6.6 EP below the sim's best",
                "Hands: Glinting Gloves, 13.2 EP below the sim's best",
            ].filter((name) => !hasButton(name))
        ).toEqual([])
        expect(
            shows(
                "↓ 169.7 EP in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons."
            )
        ).toBe(true)
        // 150.5 DPS worn beats the plan's 118.4 and 84.1: green + N.
        expect(hasReadingGap('Solo')).toBe(false)
        expect(hasReadingGap('Dungeon')).toBe(false)
        expect(beatsPlan('Solo')).toBe(true)
        expect(beatsPlan('Dungeon')).toBe(true)
    })
})
