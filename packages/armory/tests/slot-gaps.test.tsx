/**
 * Slot gaps in EP, BIS badges and the total line (spec #109 sections 0 and
 * 4): in the `Current` view each slot says how far what you wear is below
 * the plan's item for that slot (`↓ 16.7`, `↓ 6.0 DPS`), or `BIS` when the
 * plan keeps it, and one line under the gear heading adds the gaps up.
 * What you wear includes a bag item put on with `Equip` (section 0): the
 * gaps, the total and the readings' gap lines are measured over it.
 * The DOM helper must be the first import.
 */
import './dom'
import { openFile, openSample, variant } from './open-app'
import {
    alternative,
    button,
    entry,
    gearPane,
    keepAllWorn,
    lineWith,
    maxDamage,
    showBis,
    squeeze,
} from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

const TOTAL_ABOUT =
    'An estimate: the slot gaps added up. The DPS readings hold the exact numbers.'

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** The slot button whose name starts with `<label>: `. */
function slot(label: string): HTMLElement {
    return screen.getByRole('button', {
        name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `),
    })
}

/** Every slot button in the gear card (named `<Label>: …`). */
function slotButtons(): HTMLElement[] {
    return [...gearPane().querySelectorAll<HTMLElement>('button')].filter(
        (button) =>
            /^[A-Z][\w -]*: /.test(button.getAttribute('aria-label') ?? '')
    )
}

/** The gap badges in a slot (they carry `data-size`), spaces taken out. */
function gaps(element: HTMLElement): string[] {
    return [...element.querySelectorAll('[data-size]')].map((badge) =>
        squeeze(badge.textContent)
    )
}

/** Whether the slot shows a `BIS` badge. */
function hasBisText(element: HTMLElement): boolean {
    return [...element.querySelectorAll('*')].some(
        (node) => squeeze(node.textContent) === 'BIS'
    )
}

/**
 * The gap line under the reading labelled `label` (`↓ 14.7 DPS below the
 * sim's plan`), spaces taken out, or null when it has none.
 */
function readingGapLine(label: string): string | null {
    const line = document.querySelector(
        `[data-reading="${CSS.escape(label)}"] [data-reading-gap]`
    )
    return line ? squeeze(line.textContent) : null
}

describe('slot gaps', () => {
    test("with the sample, Head reads ↓ 16.7 and is named as 16.7 EP below the sim's best; Two-hand reads ↓ 6.0 DPS", async () => {
        await openSample()

        const head = screen.getByRole('button', {
            name: "Head: Brawler's Leather Hood, 16.7 EP below the sim's best",
        })
        expect(gaps(head)).toEqual([squeeze('↓ 16.7')])

        const twoHand = screen.getByRole('button', {
            name: "Two-hand: Guardian's Dualblade, 6.0 DPS below the sim's best",
        })
        expect(gaps(twoHand)).toEqual([squeeze('↓ 6.0 DPS')])
    })

    test("Head shows the gain of the plan's Head item (12.3), not of its first alternative (20.0)", async () => {
        await openFile(
            variant((file) => {
                const head = entry(file, 'head')
                const first = head.alternatives[0]
                if (!first)
                    throw new Error('the sample head has no alternative')
                first.gain_ep = 20
                // Hyena Hide Helm, a later Head alternative, in the plan.
                maxDamage(file).gear.head = 284712
                alternative(file, 'head', 284712).gain_ep = 12.3
            })
        )

        const head = slot('Head')
        expect(gaps(head)).toEqual([squeeze('↓ 12.3')])
        expect(head.getAttribute('aria-label')).toBe(
            "Head: Brawler's Leather Hood, 12.3 EP below the sim's best"
        )
    })

    test('gain_ep 9.0 with gain_dps 2.5 reads ↓ 9.0, gain_ep null with gain_dps 2.5 reads ↓ 2.5 DPS, gain_ep -1.7 shows no badge', async () => {
        await openFile(
            variant((file) => {
                const helm = alternative(file, 'head', 252455)
                helm.gain_ep = 9
                helm.gain_dps = 2.5
                const gloves = alternative(file, 'hands', 17721)
                gloves.gain_ep = null
                gloves.gain_dps = 2.5
                const legs = alternative(file, 'legs', 6690)
                legs.gain_ep = -1.7
                legs.gain_dps = null
            })
        )

        expect(gaps(slot('Head'))).toEqual([squeeze('↓ 9.0')])
        expect(gaps(slot('Hands'))).toEqual([squeeze('↓ 2.5 DPS')])
        const legs = slot('Legs')
        expect(gaps(legs)).toEqual([])
        expect(hasBisText(legs)).toBe(false)
        expect(legs.getAttribute('aria-label')).toBe(
            "Legs: Trapper's Leather Legguards"
        )
    })

    test('the item picker shows gain_ep over gain_dps: an alternative with both reads +9.0 EP', async () => {
        const user = await openFile(
            variant((file) => {
                const helm = alternative(file, 'head', 252455)
                helm.gain_ep = 9
                helm.gain_dps = 2.5
            })
        )

        await user.click(slot('Head'))
        const dialog = screen.getByRole('dialog', { name: 'Head' })
        const row = within(dialog)
            .getAllByRole('listitem')
            .find((candidate) =>
                within(candidate).queryByText("Defender's Leather Helm")
            )
        if (!row) throw new Error("no row for Defender's Leather Helm")
        expect(row.textContent).toContain('+9.0 EP')
        expect(row.textContent).not.toContain('2.5 DPS')
    })
})

describe('BIS badges', () => {
    test("when the plan keeps the worn Trapper's Leather Belt, Waist reads BIS with the owned icon", async () => {
        await openFile(
            variant((file) => {
                const waist = entry(file, 'waist')
                if (!waist.worn || waist.alternatives.length === 0)
                    throw new Error(
                        'the sample waist has no worn item or no alternatives'
                    )
                maxDamage(file).gear.waist = waist.worn.item_id
            })
        )

        const waist = screen.getByRole('button', {
            name: "Waist: Trapper's Leather Belt, the sim's best",
        })
        expect(hasBisText(waist)).toBe(true)
        expect(waist.querySelector('[data-sim-best="owned"]')).not.toBeNull()
        expect(waist.querySelector('[data-size]')).toBeNull()
    })
})

describe('the total line', () => {
    test("with the sample, it reads [↓ 195.2 EP] (a filled badge) in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons.", async () => {
        await openSample()

        const line = lineWith(
            "↓ 195.2 EP in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons."
        )
        expect(line).not.toBeNull()
        const mono = [...line!.querySelectorAll('.font-mono')].some((element) =>
            (element.textContent ?? '').includes('195.2')
        )
        expect(mono).toBe(true)
        // The owner's design: the number and EP in one filled orange badge.
        const badge = line!.querySelector('[data-total-badge]')
        expect(badge?.textContent).toBe('↓ 195.2 EP')
        expect(badge?.className.split(/\s+/)).toEqual(
            expect.arrayContaining(['bg-primary', 'text-primary-foreground'])
        )
    })

    test('About the total says the line is an estimate', async () => {
        const user = await openSample()

        await user.click(
            within(gearPane()).getByRole('button', { name: 'About the total' })
        )

        expect(await screen.findByText(TOTAL_ABOUT)).toBeDefined()
    })

    test('one EP gap of 4.0 and no DPS gaps reads across 1 slot', async () => {
        await openFile(
            variant((file) => {
                keepAllWorn(file)
                maxDamage(file).gear.head = 252455
                alternative(file, 'head', 252455).gain_ep = 4
            })
        )

        expect(
            lineWith(
                "↓ 4.0 EP in total below the sim's best set, across 1 slot."
            )
        ).not.toBeNull()
    })

    test('only a 2.5 DPS gap reads as DPS below the best set, on weapons', async () => {
        await openFile(
            variant((file) => {
                keepAllWorn(file)
                maxDamage(file).gear.main_hand = 6687
                const corpsemaker = alternative(file, 'main_hand', 6687)
                corpsemaker.gain_ep = null
                corpsemaker.gain_dps = 2.5
            })
        )

        expect(
            lineWith("↓ 2.5 DPS below the sim's best set, on weapons.")
        ).not.toBeNull()
    })

    test("with no gaps it reads Every slot matches the sim's best set.", async () => {
        await openFile(variant(keepAllWorn))

        expect(
            lineWith("Every slot matches the sim's best set.")
        ).not.toBeNull()
        expect(lineWith('in total below')).toBeNull()
    })
})

describe('no plus signs, and nothing in the BIS view', () => {
    test('no slot badge in the gear card contains +', async () => {
        await openSample()

        const badges = [
            ...gearPane().querySelectorAll<HTMLElement>('[data-size]'),
        ].map((badge) => badge.textContent ?? '')
        expect(badges.length).toBeGreaterThan(0)
        for (const text of badges) expect(text).not.toContain('+')
    })

    test('in the BIS view no slot shows a badge and there is no total line', async () => {
        const user = await openFile(
            variant((file) => {
                // A BIS badge in Current, to see that it goes too.
                const waist = entry(file, 'waist')
                if (waist.worn) maxDamage(file).gear.waist = waist.worn.item_id
            })
        )
        expect(lineWith('in total below the sim')).not.toBeNull()

        await showBis(user)

        for (const button of slotButtons()) {
            expect(button.querySelector('[data-size]')).toBeNull()
            expect(hasBisText(button)).toBe(false)
            expect(button.querySelector('[data-sim-best="owned"]')).toBeNull()
            expect(button.textContent ?? '').not.toContain('↓')
        }
        expect(lineWith("below the sim's best set")).toBeNull()
        expect(lineWith("Every slot matches the sim's best set.")).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'About the total' })
        ).toBeNull()
    })
})

describe('with a bag item on', () => {
    test('after Equip on the sample, the Shoulder gap, the total and the Solo and Dungeon gap lines are measured over Berylline Pads', async () => {
        const user = await openSample()
        expect(
            lineWith(
                "↓ 195.2 EP in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons."
            )
        ).not.toBeNull()
        expect(readingGapLine('Solo')).toBe(
            squeeze("↓ 14.7 DPS below the sim's plan")
        )
        expect(readingGapLine('Dungeon')).toBe(
            squeeze("↓ 8.7 DPS below the sim's plan")
        )

        await user.click(button('Equip'))

        // The plan's shoulder, Batwing Mantle, is 17.8 EP over Serpent's
        // Shoulders, so 10.8 over the Pads (+7.0 EP).
        const shoulder = screen.getByRole('button', {
            name: "Shoulder: Berylline Pads, 10.8 EP below the sim's best",
        })
        expect(gaps(shoulder)).toEqual([squeeze('↓ 10.8')])
        expect(
            lineWith(
                "↓ 188.2 EP in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons."
            )
        ).not.toBeNull()
        // The Pads' results (104.1 and 75.7 DPS) against the plan's 118.4
        // and 84.1.
        expect(readingGapLine('Solo')).toBe(
            squeeze("↓ 14.3 DPS below the sim's plan")
        )
        expect(readingGapLine('Dungeon')).toBe(
            squeeze("↓ 8.4 DPS below the sim's plan")
        )
    })
})
