/**
 * What the approved C2 mockup showed and this build restores, beyond the
 * spec's earlier tests: the gear pane's explaining lines, the slot chips
 * (tied to the slot by `aria-describedby`, so its name stays exact), the
 * worn-view hint, the readings' change from what you wear, the picker's
 * bag flag, the talent tiles and the new-visitor card in the gear pane.
 * The DOM helper must be the first import.
 */
import './dom'
import {
    chooseFight,
    description,
    openFile,
    openSample,
    readingChange,
    renderApp,
    variant,
} from './open-app'
import { lineWith, showBis } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

import { initials } from '../src/components/talents-dialog'

// The readings' short labels (#111).
const DPS_SOLO = 'Solo'
const DPS_LONG = 'Dungeon'

afterEach(() => {
    cleanup()
})

describe('the gear pane', () => {
    test('in the worn view, the total line under the gear heading adds up the slot gaps, in place of the old gain-pill explanation', async () => {
        await openSample()

        const total = lineWith(
            "↓ 195.2 EP in total below the sim's best set, across 12 slots, plus 6.0 DPS on weapons."
        )
        expect(total !== null).toBe(true)
        const heading = screen.getByRole('heading', {
            level: 2,
            name: 'Truncha',
        })
        expect(
            heading.compareDocumentPosition(total!) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(lineWith('is the best gain the sim found') !== null).toBe(false)
    })

    test('in the plan view says what faded slots mean, and fades unchanged slots', async () => {
        const user = await openSample()
        await showBis(user)

        expect(screen.getByText('Faded slots stay as they are.')).toBeDefined()
        expect(screen.queryByText(/Labels show the gain/)).toBeNull()
        expect(
            screen
                .getByRole('button', {
                    name: 'Totem: Unnamed totem (263412), same as what you wear',
                })
                .getAttribute('data-same')
        ).toBe('true')
        expect(
            screen
                .getByRole('button', { name: /^Legs: Ferine Leggings/ })
                .hasAttribute('data-same')
        ).toBe(false)
    })

    test('a plan item above your level carries a needs chip, and the slot name stays exact', async () => {
        const user = await openSample()
        await showBis(user)

        // The plan view's slots have no gap badge, so no gap in the name.
        const hands = screen.getByRole('button', {
            name: 'Hands: Gloves of the Greatfather',
        })
        expect(within(hands).getByText('needs 33')).toBeDefined()
        expect(description(hands)).toBe(
            'needs 33 Replaces Toughened Leather Gloves'
        )
    })

    test('the shoulder slot says a better one is in your bags, on what you wear only', async () => {
        const user = await openSample()
        const shoulder = screen.getByRole('button', {
            name: "Shoulder: Serpent's Shoulders, 17.8 EP below the sim's best",
        })
        expect(description(shoulder)).toBe('better in bags')
        expect(
            description(screen.getByRole('button', { name: /^Head: / }))
        ).toBe('')

        await showBis(user)
        expect(screen.queryByText('better in bags')).toBeNull()
    })

    test('the worn view says moving a role switches to the plan; the plan view does not', async () => {
        const HINT = "Moving a role switches the gear to the sim's plan."
        const user = await openSample()
        expect(screen.getByText(HINT)).toBeDefined()

        await showBis(user)
        expect(screen.queryByText(HINT)).toBeNull()
    })
})

describe('the readings', () => {
    test("the plan view adds each reading's change from what you wear", async () => {
        const user = await openSample()
        expect(readingChange(DPS_LONG)).toBeNull()

        await showBis(user)

        expect(readingChange(DPS_SOLO)).toBe('+14.7')
        expect(readingChange(DPS_LONG)).toBe('+8.7')
        expect(readingChange('Health')).toBe('-65')
        expect(readingChange('Armor')).toBe('+58')
        expect(readingChange('Resource Empty')).toBe('+9.00 s later')
        expect(readingChange('Lifespan')).toBe('-3.00 s')
    })

    test('a plan not simmed on the fight has no change to say', async () => {
        const user = await openFile(
            variant((file) => {
                file.results = (
                    file.results as { gear: string; fight_id: string }[]
                ).filter(
                    (result) =>
                        !(
                            result.gear === 'max-damage' &&
                            result.fight_id === 'chain-4'
                        )
                )
            })
        )
        await chooseFight(user, 'Chain, 4 pulls 20 s apart vs level 33')
        await showBis(user)
        // The chain fight's readings: the plan has no result there.
        expect(readingChange('Resource Empty')).toBeNull()
        expect(readingChange('Health')).toBeNull()
        // Solo and the 2-minute fight are still simmed for the plan.
        expect(readingChange(DPS_LONG)).toBe('+8.7')
    })
})

describe('the item picker', () => {
    test('flags an alternative that is already in your bags', async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: /^Shoulder: / }))
        const dialog = screen.getByRole('dialog', { name: 'Shoulder' })
        const row = within(dialog)
            .getByText('Berylline Pads')
            .closest('li') as HTMLElement
        expect(within(row).getByText('in your bags')).toBeDefined()
        expect(
            within(
                within(dialog).getByText('Batwing Mantle').closest('li')!
            ).queryByText('in your bags')
        ).toBeNull()
    })
})

describe('the talents', () => {
    test('each talent tile shows its initials', async () => {
        const user = await openSample()
        await user.click(
            screen.getByRole('button', { name: 'Talents, 21 points' })
        )
        const dialog = screen.getByRole('dialog', { name: 'Talents' })
        const flurry = within(dialog).getByLabelText(
            'Flurry, 5/5, changed from 4/5'
        )
        expect(within(flurry).getByText('Fl')).toBeDefined()
        expect(initials('Ancestral Knowledge')).toBe('AK')
        expect(initials("Earth's Grasp")).toBe('EG')
    })
})

describe('the new visitor', () => {
    test('the bring-in card sits in the middle of the gear pane, the slots are disabled, and no card shows', () => {
        renderApp()

        expect(
            screen.getByText(
                'See your gear, what the sim would change, and how a fight plays out.'
            )
        ).toBeDefined()
        const gear = screen.getByRole('region', { name: 'Gear' })
        expect(
            within(gear).getByRole('heading', {
                level: 2,
                name: 'Bring your character in',
            })
        ).toBeDefined()
        const head = screen.getByRole('button', { name: 'Head: Empty' })
        expect((head as HTMLButtonElement).disabled).toBe(true)
        expect(
            screen.queryByRole('complementary', { name: "The sim's numbers" })
        ).toBeNull()
    })

    test('the card shows dimmed and inert, as the mockup does: it says what unlocks, and nothing in it can be used', () => {
        renderApp()

        const locked = screen.getByRole('region', {
            name: 'What unlocks with a character',
        })
        expect(
            within(locked).getByText('These unlock once a character is loaded.')
        ).toBeDefined()
        const body = locked.querySelector('[data-slot="locked-body"]')
        expect(body?.hasAttribute('inert')).toBe(true)
        expect(body?.getAttribute('aria-hidden')).toBe('true')
        expect(body?.className).toContain('opacity-40')
        expect(
            body?.querySelectorAll('button, input, [tabindex]')
        ).toHaveLength(0)
        // Its placeholders are hidden from a screen reader.
        expect(within(locked).queryAllByRole('button')).toHaveLength(0)
        expect(within(locked).queryAllByRole('slider')).toHaveLength(0)
        expect(
            screen.queryByRole('region', { name: 'Across the fight' })
        ).toBeNull()
    })
})

describe('the mockup details', () => {
    test('unnamed items read as the mockup names them, in the slots, the picker and the bags line', async () => {
        const user = await openSample()

        // Each with its gap to the plan's item, as the slot names it.
        for (const name of [
            "Back: Unnamed cloak (279848), 6.2 EP below the sim's best",
            "Wrist: Unnamed bracers (279875), 15.0 EP below the sim's best",
            "Feet: Unnamed boots (251963), 18.7 EP below the sim's best",
            "Finger 2: Unnamed ring (6748), 15.5 EP below the sim's best",
            'Totem: Unnamed totem (263412)',
        ])
            expect(screen.getByRole('button', { name })).toBeDefined()
        expect(screen.queryByText(/^Item \d+$/)).toBeNull()

        await user.click(screen.getByRole('button', { name: /^Back: / }))
        const dialog = screen.getByRole('dialog', { name: 'Back' })
        expect(within(dialog).getByText('Unnamed cloak (279848)')).toBeDefined()
    })

    test('empty trinket slots say there are no trinkets in the data yet; an empty off hand says nothing more', async () => {
        await openFile(
            variant((file) => {
                // An off-hand alternative keeps the off-hand slot shown.
                const slots = file.slots as {
                    slot: string
                    alternatives: unknown[]
                }[]
                const off = slots.find((entry) => entry.slot === 'off_hand')
                const main = slots.find((entry) => entry.slot === 'main_hand')
                if (!off || !main) throw new Error('no weapon slots')
                off.alternatives = [structuredClone(main.alternatives[1])]
            })
        )
        for (const name of ['Trinket 1', 'Trinket 2'])
            expect(
                within(
                    screen.getByRole('button', {
                        name: `${name}: Nothing equipped`,
                    })
                ).getByText('No trinkets in the data yet')
            ).toBeDefined()
        expect(
            within(
                screen.getByRole('button', {
                    name: /^Off hand: Nothing equipped/,
                })
            ).queryByText('No trinkets in the data yet')
        ).toBeNull()
    })

    test('the fight band is headed Across the fight, the fight in words, Provisional and the sample tag', async () => {
        await openSample()
        const band = screen.getByRole('region', { name: 'Across the fight' })
        const heading = within(band).getByRole('heading', {
            name: 'Across the fight',
        })
        expect(heading.parentElement?.textContent).toBe(
            `Across the fightDungeon, 2 minutes vs level 33Provisional${'Sim numbers are estimates until matched to real fights.'}Sample file`
        )
    })
})
