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

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

import { initials } from '../src/components/talents-dialog'

const SHOW_PLAN = "Show the sim's plan"
const DUNGEON_LONG = 'Dungeon, 2 min, level 33'
const DPS_SOLO = 'DPS, Solo, 30 s, level 31'
const DPS_LONG = `DPS, ${DUNGEON_LONG}`

afterEach(() => {
    cleanup()
})

describe('the gear pane', () => {
    test('explains the gain pills in the worn view, with an example pill and the count of big upgrades', async () => {
        await openSample()
        const gear = screen.getByRole('region', { name: 'Gear' })

        expect(
            within(gear).getByText(
                'is the best gain the sim found for that slot. 11 slots have a big upgrade (15 EP or 3 DPS and up).'
            )
        ).toBeDefined()
        const example = within(gear)
            .getAllByText('+16.7 EP')
            .find((pill) => !pill.closest('button'))
        expect(example?.getAttribute('data-size')).toBe('big')
    })

    test('in the plan view says what the labels and faded slots mean, and fades unchanged slots', async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))

        expect(
            screen.getByText(
                'Labels show the gain over what you wear. Faded slots stay as they are.'
            )
        ).toBeDefined()
        expect(
            screen
                .getByRole('button', {
                    name: 'Relic: Unnamed totem (263412), same as what you wear',
                })
                .getAttribute('data-same')
        ).toBe('true')
        expect(
            screen
                .getByRole('button', { name: /^Legs: Ferine Leggings/ })
                .hasAttribute('data-same')
        ).toBe(false)
    })

    test('a plan item above your level carries a Needs level chip, and the slot name stays exact', async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))

        const hands = screen.getByRole('button', {
            name: 'Hands: Gloves of the Greatfather, +21.6 EP',
        })
        expect(within(hands).getByText('Needs level 33')).toBeDefined()
        expect(description(hands)).toBe(
            'Needs level 33 Replaces Toughened Leather Gloves'
        )
    })

    test('the shoulder slot says a better one is in your bags, on what you wear only', async () => {
        const user = await openSample()
        const shoulder = screen.getByRole('button', {
            name: "Shoulder: Serpent's Shoulders, +17.8 EP",
        })
        expect(description(shoulder)).toBe('Better in bags')
        expect(
            description(screen.getByRole('button', { name: /^Head: / }))
        ).toBe('')

        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
        expect(screen.queryByText('Better in bags')).toBeNull()
    })

    test('the worn view says moving a role switches to the plan; the plan view does not', async () => {
        const HINT = "Moving a role switches the gear to the sim's plan."
        const user = await openSample()
        expect(screen.getByText(HINT)).toBeDefined()

        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
        expect(screen.queryByText(HINT)).toBeNull()
    })
})

describe('the readings', () => {
    test("the plan view adds each reading's change from what you wear", async () => {
        const user = await openSample()
        await chooseFight(user, DUNGEON_LONG)
        expect(readingChange(DPS_LONG)).toBeNull()

        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))

        expect(readingChange(DPS_SOLO)).toBe('+14.7 vs what you wear')
        expect(readingChange(DPS_LONG)).toBe('+8.7 vs what you wear')
        expect(readingChange('Health')).toBe('-65 vs what you wear')
        expect(readingChange('Armor')).toBe('+58 vs what you wear')
        expect(readingChange('Out of mana at')).toBe('+9 s vs what you wear')
        expect(readingChange('Time to die')).toBe('-3 s vs what you wear')
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
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
        // The chain fight's readings: the plan has no result there.
        expect(readingChange('Out of mana at')).toBeNull()
        expect(readingChange('Health')).toBeNull()
        // Solo and the 2-minute fight are still simmed for the plan.
        expect(readingChange(DPS_LONG)).toBe('+8.7 vs what you wear')
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
        expect(within(row).getByText('In your bags')).toBeDefined()
        expect(
            within(
                within(dialog).getByText('Batwing Mantle').closest('li')!
            ).queryByText('In your bags')
        ).toBeNull()
    })
})

describe('the talents', () => {
    test('each talent tile shows its initials', async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: /^Talents: / }))
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

        for (const name of [
            'Back: Unnamed cloak (279848), +6.2 EP',
            'Wrist: Unnamed bracers (279875), +16.8 EP',
            'Feet: Unnamed boots (251963), +18.7 EP',
            'Finger 2: Unnamed ring (6748), +19.2 EP',
            'Relic: Unnamed totem (263412)',
        ])
            expect(screen.getByRole('button', { name })).toBeDefined()
        expect(screen.queryByText(/^Item \d+$/)).toBeNull()

        await user.click(screen.getByRole('button', { name: /^Back: / }))
        const dialog = screen.getByRole('dialog', { name: 'Back' })
        expect(within(dialog).getByText('Unnamed cloak (279848)')).toBeDefined()
    })

    test('empty trinket slots say there are no trinkets in the data yet; the empty off hand says nothing more', async () => {
        await openSample()
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
                    name: 'Off hand: Nothing equipped',
                })
            ).queryByText('No trinkets in the data yet')
        ).toBeNull()
    })

    test('the fight band is headed Across the fight, the fight, and Provisional', async () => {
        const user = await openSample()
        await chooseFight(user, DUNGEON_LONG)
        const band = screen.getByRole('region', { name: 'Across the fight' })
        const heading = within(band).getByRole('heading', {
            name: 'Across the fight',
        })
        expect(heading.parentElement?.textContent).toBe(
            `Across the fight·${DUNGEON_LONG}·Provisional${'Sim numbers are estimates until matched to real fights.'}`
        )
    })
})
