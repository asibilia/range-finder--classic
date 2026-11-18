/**
 * `Next:` links: in the `Current` view, a slot that is the sim's best for
 * now (`BIS`: the plan keeps what you wear) or empty with nothing from the
 * plan, whose best alternative needs a level above the character's, reads
 * `Next: <item> at level N` as its tile's third line, in muted text. The
 * item is a button beside the slot's (never inside it) that opens the
 * slot's picker on that item. The lowest required level above the
 * character's wins; on a tie, the biggest gain. The DOM helper must be the
 * first import.
 */
import './dom'
import { openFile, variant, type Json } from './open-app'
import { entry, gearPane, item, maxDamage, showBis, squeeze } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** The sample at level 30, with a BIS main hand and trinkets to come. */
function upcoming(file: Json): void {
    // Main hand: the plan keeps the worn Guardian's Dualblade (BIS); two
    // alternatives need level 31 (Thermaplugg's Left Arm, 4 DPS, and a
    // made-up axe with more), one needs 33 with even more.
    const main = entry(file, 'main_hand')
    maxDamage(file).gear.main_hand = main.worn!.item_id
    main.alternatives.push(
        {
            item: { ...item(990001, 'Big Axe of Later'), required_level: 31 },
            gain_ep: null,
            gain_dps: 9,
        },
        {
            item: {
                ...item(990002, 'Huge Axe of Much Later'),
                required_level: 33,
            },
            gain_ep: null,
            gain_dps: 20,
        }
    )
    // Trinket 1: empty, nothing from the plan, two trinkets to come.
    maxDamage(file).gear.trinket_1 = null
    entry(file, 'trinket_1').alternatives.push(
        {
            item: { ...item(990003, 'Far Charm'), required_level: 34 },
            gain_ep: 30,
            gain_dps: null,
        },
        {
            item: { ...item(990004, "Gill's Gills"), required_level: 32 },
            gain_ep: 12,
            gain_dps: null,
        }
    )
}

/** The `Next:` lines in the gear card, as text. */
function nextLines(): string[] {
    return [...gearPane().querySelectorAll('[data-next-line]')].map((line) =>
        squeeze(line.textContent)
    )
}

describe('Next: links', () => {
    test('a BIS slot names the next item: lowest level above his, biggest gain on a tie; the BIS badge stays', async () => {
        await openFile(variant(upcoming))
        const pane = gearPane()
        const link = within(pane).getByRole('button', {
            name: 'Big Axe of Later',
        })
        const line = link.closest('[data-next-line]')
        expect(line !== null).toBe(true)
        expect(squeeze(line!.textContent)).toBe(
            squeeze('Next: Big Axe of Later at level 31')
        )
        // Muted, not orange; not inside the slot's button.
        expect(line!.className.split(/\s+/)).toContain('text-muted-foreground')
        expect(line!.className).not.toContain('gain')
        expect(link.parentElement?.closest('button') === null).toBe(true)
        // The slot keeps its BIS badge.
        const slot = within(pane).getByRole('button', {
            name: /: Guardian's Dualblade, the sim's best$/,
        })
        expect(slot.querySelector('[data-bis]') !== null).toBe(true)
    })

    test('an empty slot with nothing from the plan names the next item', async () => {
        await openFile(variant(upcoming))
        expect(nextLines()).toEqual(
            [
                "Next: Gill's Gills at level 32",
                'Next: Big Axe of Later at level 31',
            ].map(squeeze)
        )
    })

    test('the link opens the slot picker on that item', async () => {
        const user = await openFile(variant(upcoming))
        await user.click(
            within(gearPane()).getByRole('button', { name: "Gill's Gills" })
        )
        const dialog = screen.getByRole('dialog', { name: 'Trinket 1' })
        await waitFor(() => {
            const focused = document.activeElement
            if (
                !focused ||
                focused.tagName !== 'LI' ||
                !dialog.contains(focused) ||
                !(focused.textContent ?? '').includes("Gill's Gills")
            )
                throw new Error("focus is not on Gill's Gills' row")
        })
    })

    test('nothing above his level: no Next line (the plain sample has none)', async () => {
        await openFile(variant(() => {}))
        expect(nextLines()).toEqual([])
    })

    test('in the BIS view no Next line shows', async () => {
        const user = await openFile(variant(upcoming))
        expect(nextLines()).toHaveLength(2)
        await showBis(user)
        expect(nextLines()).toEqual([])
    })
})
