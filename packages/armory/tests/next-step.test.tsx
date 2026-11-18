/**
 * The callout card under the left slots (spec #109 section 8, states 1, 2,
 * 4 and 5): one card with the single best next step for the plan, in the
 * `Current` view only. A bag upgrade to put on, several of them, the
 * easiest gap to go get, or every slot best-in-slot.
 * The DOM helper must be the first import.
 *
 * Checks are booleans (`shows`, `hasButton`): here `expect(element)
 * .toBeNull()` passes on a DOM element.
 */
import './dom'
import { openFile, openSample, variant, type Json } from './open-app'
import {
    alternative,
    button,
    entries,
    hasButton,
    huntingPants,
    item,
    keepAllWorn,
    lineWith,
    planGap,
    showBis,
    shows,
    type Item,
} from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor } from '@testing-library/react'

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** Throws unless every line is shown, in this order. */
function expectInOrder(lines: string[]) {
    const found = lines.map((text) => {
        const element = lineWith(text)
        if (!element) throw new Error(`no line reading ${text}`)
        return element
    })
    for (let i = 1; i < found.length; i++) {
        const before = found[i - 1]!
        const after = found[i]!
        const follows =
            (before.compareDocumentPosition(after) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
        expect([lines[i - 1], lines[i], follows]).toEqual([
            lines[i - 1],
            lines[i],
            true,
        ])
    }
}

/** The names of the `Show N more` / `Show fewer` buttons. */
function showButtons(): string[] {
    return screen
        .queryAllByRole('button', { name: /^Show (\d+ more|fewer)$/ })
        .map((found) => found.textContent ?? '')
}

/** Whether the header button named `name` (`Wishlist 1`) is there. */
function hasHeaderButton(name: string): boolean {
    return screen.queryByRole('button', { name, hidden: true }) !== null
}

/** A bag upgrade without results (not simmed). */
function bagUpgrade(slotName: string, it: Item, gainEp: number) {
    return { slot: slotName, item: it, gain_ep: gainEp }
}

/**
 * No bag upgrades; in the plan a Legs gap `Hunting Pants` (vendor, 5.0 EP)
 * and a Head gap `Defender's Leather Helm` (drop, 20.0 EP).
 */
function goGetFile(): Json {
    return variant((file) => {
        file.bag_upgrades = []
        keepAllWorn(file)
        huntingPants(file)
        planGap(file, 'head', 252455, (alt) => {
            alt.item.source = { kind: 'drop', text: 'Drop: World Drop' }
            alt.gain_ep = 20
            alt.gain_dps = null
        })
    })
}

const HUNTING_PANTS =
    'Hunting Pants (Vendor: Harggan, The Hinterlands), +5.0 EP on your leggings.'

const BAG_ONE =
    'Berylline Pads are in your bags, +7.0 EP over the shoulders you wear. No dungeon needed.'

const FIVE_BAGS = [
    bagUpgrade('feet', item(900003, 'Glinting Boots'), 6.1),
    bagUpgrade('head', item(900001, 'Glinting Helm'), 10.1),
    bagUpgrade('hands', item(900002, 'Glinting Gloves'), 8.4),
    bagUpgrade('relic', item(900005, 'Glinting Totem'), 4.2),
    bagUpgrade('wrist', item(900004, 'Glinting Bracers'), 5.5),
]

const ROWS = [
    'Glinting Helm · Head +10.1 EP',
    'Glinting Gloves · Hands +8.4 EP',
    'Glinting Boots · Feet +6.1 EP',
    'Glinting Bracers · Wrist +5.5 EP',
    'Glinting Totem · Totem +4.2 EP',
]

describe('one bag upgrade', () => {
    test('the sample reads the Berylline Pads sentence; Equip puts them on and Undo takes them off; no Wear them button', async () => {
        const user = await openSample()

        expect(shows(BAG_ONE)).toBe(true)
        expect(hasButton('Wear them')).toBe(false)

        await user.click(button('Equip'))
        expect(hasButton(/^Shoulder: Berylline Pads/)).toBe(true)
        expect(shows('You wear Berylline Pads now.')).toBe(true)

        await user.click(button('Undo'))
        expect(hasButton(/^Shoulder: Serpent's Shoulders/)).toBe(true)
        expect(shows(BAG_ONE)).toBe(true)
        expect(hasButton('Equip')).toBe(true)
    })

    test('with a bag upgrade and a vendor gap both present, the card shows the bag state', async () => {
        await openFile(variant(huntingPants))

        expect(shows(BAG_ONE)).toBe(true)
        expect(hasButton('Equip')).toBe(true)
        expect(shows(HUNTING_PANTS)).toBe(false)
        expect(hasButton('Other options')).toBe(false)
    })
})

describe('several bag upgrades', () => {
    test('three bag upgrades read the total and three rows biggest first, with no Show button', async () => {
        await openFile(
            variant((file) => {
                file.bag_upgrades = FIVE_BAGS.slice(0, 3)
            })
        )

        expect(
            shows('3 items in your bags beat what you wear, +24.6 EP together.')
        ).toBe(true)
        expectInOrder(ROWS.slice(0, 3))
        expect(showButtons()).toEqual([])
    })

    test('five bag upgrades show three rows and Show 2 more; pressing it shows five rows and Show fewer', async () => {
        const user = await openFile(
            variant((file) => {
                file.bag_upgrades = FIVE_BAGS
            })
        )

        expect(
            shows('5 items in your bags beat what you wear, +34.3 EP together.')
        ).toBe(true)
        expectInOrder(ROWS.slice(0, 3))
        expect(ROWS.slice(3).map(shows)).toEqual([false, false])
        expect(showButtons()).toEqual(['Show 2 more'])

        await user.click(button('Show 2 more'))

        expectInOrder(ROWS)
        expect(showButtons()).toEqual(['Show fewer'])
    })
})

describe('the easiest upgrade to go get', () => {
    test('a vendor Legs gap comes before a bigger drop Head gap; Other options opens the Legs picker', async () => {
        const user = await openFile(goGetFile())

        expect(shows(HUNTING_PANTS)).toBe(true)
        expect(hasButton('Add to wishlist')).toBe(true)

        await user.click(button('Other options'))

        await waitFor(() => {
            if (!screen.queryByRole('dialog', { name: 'Legs' }))
                throw new Error('no dialog titled Legs')
        })
    })

    test('a DPS-only Main hand gap reads +6.0 DPS on your weapon', async () => {
        await openFile(
            variant((file) => {
                file.bag_upgrades = []
                keepAllWorn(file)
                planGap(file, 'main_hand', 6687, (alt) => {
                    alt.gain_ep = null
                    alt.gain_dps = 6
                })
            })
        )

        expect(
            shows(
                'Corpsemaker (Drop: Overlord Ramtusk, Razorfen Kraul), +6.0 DPS on your weapon.'
            )
        ).toBe(true)
    })

    test('Add to wishlist turns into On wishlist, the wishlist count goes up by one, and the card stays', async () => {
        const user = await openFile(goGetFile())
        expect(hasHeaderButton('Wishlist 0')).toBe(true)

        await user.click(button('Add to wishlist'))

        expect(hasButton('On wishlist')).toBe(true)
        expect(hasHeaderButton('Wishlist 1')).toBe(true)
        expect(shows(HUNTING_PANTS)).toBe(true)
    })
})

describe('everything best-in-slot', () => {
    /** Level 33, no bag upgrades, no gaps; alternatives at most level 33. */
    function allBest(file: Json) {
        const character = file.character as { level: number }
        character.level = 33
        file.bag_upgrades = []
        keepAllWorn(file)
        for (const each of entries(file))
            for (const alt of each.alternatives)
                alt.item.required_level = Math.min(alt.item.required_level, 33)
    }

    test('with an alternative needing level 37 and one needing 35, it reads Next upgrades open at level 35.', async () => {
        await openFile(
            variant((file) => {
                allBest(file)
                alternative(file, 'head', 252455).item.required_level = 37
                alternative(file, 'legs', 6690).item.required_level = 35
            })
        )

        expect(shows('Best-in-slot for level 33')).toBe(true)
        expect(
            shows("Every slot matches the sim's best set you can get now.")
        ).toBe(true)
        expect(shows('Next upgrades open at level 35.')).toBe(true)
    })

    test('with no alternative above level 33, the Next upgrades sentence is left out', async () => {
        await openFile(variant(allBest))

        expect(shows('Best-in-slot for level 33')).toBe(true)
        expect(
            shows("Every slot matches the sim's best set you can get now.")
        ).toBe(true)
        expect(shows('Next upgrades open')).toBe(false)
    })
})

describe('left out items', () => {
    test('a left-out bag item with the biggest gain never shows; the card reads the other bag upgrade', async () => {
        await openFile(
            variant((file) => {
                // The sample's left-out item: first in the list, biggest gain.
                const bags = file.bag_upgrades as unknown[]
                bags.unshift(
                    bagUpgrade(
                        'head',
                        item(99901, 'Made-up Hood of Nowhere'),
                        30
                    )
                )
            })
        )

        expect(shows(BAG_ONE)).toBe(true)
        expect(shows('Made-up Hood of Nowhere')).toBe(false)
        expect(shows('items in your bags beat')).toBe(false)
    })

    test('a left-out vendor gap with the biggest gain never shows; the card reads the next one', async () => {
        await openFile(
            variant((file) => {
                file.bag_upgrades = []
                keepAllWorn(file)
                huntingPants(file)
                planGap(file, 'head', 252455, (alt) => {
                    alt.item.name = 'Made-up Vendor Helm'
                    alt.item.source = {
                        kind: 'vendor',
                        text: 'Vendor: Nobody, Nowhere',
                    }
                    alt.gain_ep = 30
                    alt.gain_dps = null
                })
                file.left_out_items = [
                    {
                        item_id: 252455,
                        name: 'Made-up Vendor Helm',
                        reason: 'it has no source and needs level 1',
                    },
                ]
            })
        )

        expect(shows(HUNTING_PANTS)).toBe(true)
        expect(shows('Made-up Vendor Helm (Vendor')).toBe(false)
    })
})

describe('the BIS view', () => {
    test('there is no card in the BIS view', async () => {
        const user = await openSample()
        expect(shows(BAG_ONE)).toBe(true)

        await showBis(user)

        expect(shows(BAG_ONE)).toBe(false)
        expect(hasButton('Equip')).toBe(false)
    })
})
