/**
 * The sim's plan view and the role sliders (spec section 10). The DOM helper
 * must be the first import.
 */
import './dom'
import { openFile, openSample, readingRow, variant } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

import firstRun from '../src/sample-truncha-first-run.json'

const SHOW_PLAN = "Show the sim's plan"
const SHOW_WORN = 'Show what I wear'
const ROLES = ['Damage', 'Survival', 'Healing', 'Utility'] as const
const NOTHING_RESIMMED =
    'These pick from plans the sim already made. Nothing is re-simmed here.'
const SWITCHED = "Switched to the sim's plan for this mix."

function slider(name: string): HTMLInputElement {
    return screen.getByRole('slider', { name }) as HTMLInputElement
}

function setSlider(name: string, value: number) {
    fireEvent.change(slider(name), { target: { value: String(value) } })
}

/** The smallest element around `input` that holds no other slider. */
function sliderBox(input: HTMLElement): HTMLElement {
    let box: HTMLElement = input
    while (
        box.parentElement &&
        box.parentElement.querySelectorAll('input[type="range"]').length === 1
    )
        box = box.parentElement
    return box
}

function slot(prefix: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${prefix}: `) })
}

afterEach(() => {
    cleanup()
})

describe('the plan view', () => {
    test("the sample opens on What you wear with a Show the sim's plan button", async () => {
        await openSample()

        expect(
            screen.getByRole('heading', { name: 'What you wear' })
        ).toBeDefined()
        expect(screen.getByRole('button', { name: SHOW_PLAN })).toBeDefined()
    })

    test("pressing Show the sim's plan shows Max damage and Ferine Leggings in Legs", async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))

        expect(
            screen.getByRole('heading', { name: "Sim's plan: Max damage" })
        ).toBeDefined()
        expect(screen.getByRole('button', { name: SHOW_WORN })).toBeDefined()
        expect(screen.queryByRole('button', { name: SHOW_PLAN })).toBeNull()
        expect(within(slot('Legs')).getByText('Ferine Leggings')).toBeDefined()
    })

    test('in the plan view Relic is the same as what you wear and Legs replaces the worn legguards', async () => {
        const user = await openSample()
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))

        const relic = screen.getByRole('button', {
            name: 'Relic: Item 263412, same as what you wear',
        })
        expect(within(relic).getByText('Same as what you wear')).toBeDefined()
        expect(within(relic).queryByText(/(EP|DPS)$/)).toBeNull()

        const legs = screen.getByRole('button', {
            name: 'Legs: Ferine Leggings, +23.6 EP',
        })
        expect(
            within(legs).getByText("Replaces Trapper's Leather Legguards")
        ).toBeDefined()
    })

    test('a file with no plans has no plan button and no What to gear for', async () => {
        const noPlans = variant((file) => {
            file.plans = []
            file.results = (file.results as { gear: string }[]).filter(
                (result) => result.gear === 'worn'
            )
        })

        // The sample has both, so their absence below comes from the plans.
        await openSample()
        expect(screen.getByRole('button', { name: SHOW_PLAN })).toBeDefined()
        expect(screen.getByText('What to gear for')).toBeDefined()
        cleanup()

        await openFile(noPlans)

        expect(screen.queryByRole('button', { name: SHOW_PLAN })).toBeNull()
        expect(screen.queryByText('What to gear for')).toBeNull()
        expect(screen.queryAllByRole('slider')).toHaveLength(0)
    })
})

describe('the role sliders', () => {
    test('What to gear for sits in the card, after the fight chart and before the damage split', async () => {
        await openSample()

        const card = screen.getByRole('complementary', {
            name: "The sim's numbers",
        })
        const sliders = screen
            .getByRole('heading', { name: 'What to gear for' })
            .closest('section')
        expect(sliders).not.toBeNull()
        expect(card.contains(sliders)).toBe(true)

        const chart = within(card).getByLabelText('DPS and mana per pull')
        const split = within(card).getByRole('heading', {
            name: 'Where the damage comes from',
        })
        const follows = (a: Node, b: Node) =>
            Boolean(
                a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            )
        expect(follows(chart, sliders as Node)).toBe(true)
        expect(follows(sliders as Node, split)).toBe(true)
    })

    test('Damage, Survival, Healing and Utility start at 100, 0, 0 and 0', async () => {
        await openSample()

        expect(
            screen.getByRole('heading', { name: 'What to gear for' })
        ).toBeDefined()
        expect(ROLES.map((role) => slider(role).value)).toEqual([
            '100',
            '0',
            '0',
            '0',
        ])
    })

    test('Healing and Utility are disabled and Not simmed yet; Damage and Survival are enabled', async () => {
        await openSample()

        for (const role of ['Healing', 'Utility']) {
            const input = slider(role)
            expect(input.disabled).toBe(true)
            expect(input.value).toBe('0')
            expect(input.getAttribute('aria-valuetext')).toBe('Not simmed yet')
            expect(sliderBox(input).textContent).toContain('Not simmed yet')
        }
        for (const role of ['Damage', 'Survival']) {
            expect(slider(role).disabled).toBe(false)
            expect(sliderBox(slider(role)).textContent).not.toContain(
                'Not simmed yet'
            )
        }
    })

    test('no slider shows a Can reach line', async () => {
        await openSample()
        setSlider('Survival', 80)

        expect(screen.queryByText(/Can reach/)).toBeNull()
        expect(document.body.textContent ?? '').not.toContain('Can reach')
    })

    test('each slider is a native range input from 0 to 100 in steps of 1', async () => {
        await openSample()

        for (const role of ROLES) {
            const input = slider(role)
            expect(input.tagName.toLowerCase()).toBe('input')
            expect(input.getAttribute('type')).toBe('range')
            expect(input.getAttribute('min')).toBe('0')
            expect(input.getAttribute('max')).toBe('100')
            expect(input.getAttribute('step')).toBe('1')
        }
    })

    test('Survival at 80 picks Damage and survival and puts Kodohide Legguards in Legs', async () => {
        await openSample()
        setSlider('Survival', 80)

        expect(
            screen.getByText('Closest ready-made plan: Damage and survival.')
        ).toBeDefined()
        expect(slider('Damage').value).toBe('100')
        expect(slider('Survival').value).toBe('80')
        expect(
            within(slot('Legs')).getByText('Kodohide Legguards')
        ).toBeDefined()
    })

    test('then Damage at 40 picks Max survival, which heads the card plan column', async () => {
        await openSample()
        setSlider('Survival', 80)
        setSlider('Damage', 40)

        expect(
            screen.getByText('Closest ready-made plan: Max survival.')
        ).toBeDefined()
        expect(
            screen.getByRole('heading', { name: "Sim's plan: Max survival" })
        ).toBeDefined()
        expect(
            screen.getByRole('columnheader', { name: 'Max survival' })
        ).toBeDefined()
        expect(
            screen.queryByRole('columnheader', { name: 'Max damage' })
        ).toBeNull()
    })

    test('moving a slider on the worn view switches to the plan and says so, until Show what I wear', async () => {
        const user = await openSample()
        expect(screen.queryByText(SWITCHED)).toBeNull()

        setSlider('Survival', 80)

        expect(
            screen.getByRole('heading', {
                name: "Sim's plan: Damage and survival",
            })
        ).toBeDefined()
        expect(screen.getByText(SWITCHED)).toBeDefined()

        await user.click(screen.getByRole('button', { name: SHOW_WORN }))

        expect(
            screen.getByRole('heading', { name: 'What you wear' })
        ).toBeDefined()
        expect(screen.queryByText(SWITCHED)).toBeNull()
    })

    test('the page always says the sliders pick from ready-made plans', async () => {
        const user = await openSample()
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()

        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()

        setSlider('Survival', 80)
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()
    })

    test('a picked plan with no chain result reads Not simmed and leaves the pull chart to what you wear, until a fight it has', async () => {
        const user = await openSample()
        setSlider('Survival', 80)

        // The sample opens on the chain fight, where Damage and survival has no result.
        expect(
            screen.getByRole('columnheader', { name: 'Damage and survival' })
        ).toBeDefined()
        expect(readingRow('DPS')).toEqual(['82.0', 'Not simmed'])
        expect(readingRow('Health')).toEqual(['1375', 'Not simmed'])
        expect(readingRow('Armor')).toEqual(['952', 'Not simmed'])
        expect(readingRow('Out of mana at')).toEqual(['1:58', 'Not simmed'])
        expect(
            screen.getByRole('img', { name: 'DPS and mana per pull' })
        ).toBeDefined()
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.getByText('Mana, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(screen.queryByText("Mana, sim's plan")).toBeNull()
        expect(
            screen.getByText('In what you wear you run dry in pull 3.')
        ).toBeDefined()
        expect(screen.queryByText(/^The sim's plan/)).toBeNull()

        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Fight' }),
            screen.getByRole('option', { name: 'Dungeon, 2 min, level 33' })
        )

        expect(readingRow('DPS')).toEqual(['75.4', '80.2'])
        expect(
            screen.getByRole('img', { name: 'DPS and mana over the fight' })
        ).toBeDefined()
        expect(screen.getByText("DPS, sim's plan")).toBeDefined()
        expect(screen.getByText("Mana, sim's plan")).toBeDefined()
        expect(screen.getByText('Out of mana 0:48')).toBeDefined()
        expect(screen.getByText('Out of mana 0:52')).toBeDefined()
        expect(
            screen.getByText("The sim's plan runs out at 0:52.")
        ).toBeDefined()
    })

    test('the one-plan sample says so, enables only Damage, and keeps Max damage when it moves', async () => {
        await openFile(firstRun)

        expect(screen.getByText('This file has one plan.')).toBeDefined()
        expect(slider('Damage').disabled).toBe(false)
        for (const role of ['Survival', 'Healing', 'Utility'])
            expect(slider(role).disabled).toBe(true)

        setSlider('Damage', 40)

        expect(slider('Damage').value).toBe('40')
        expect(
            screen.getByRole('heading', { name: "Sim's plan: Max damage" })
        ).toBeDefined()
    })
})
