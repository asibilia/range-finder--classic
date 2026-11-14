/**
 * The sim's plan view and the role sliders (spec section 10). The DOM helper
 * must be the first import.
 */
import './dom'

import { afterEach, describe, expect, test } from 'bun:test'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../src/app'
import firstRun from '../src/sample-truncha-first-run.json'
import sample from '../src/sample-truncha.json'

type Json = Record<string, unknown>
type User = ReturnType<typeof userEvent.setup>

const SHOW_PLAN = "Show the sim's plan"
const SHOW_WORN = 'Show what I wear'
const ROLES = ['Damage', 'Survival', 'Healing', 'Utility'] as const
const NOTHING_RESIMMED =
    'These pick from plans the sim already made. Nothing is re-simmed here.'
const SWITCHED = "Switched to the sim's plan for this mix."

/** Renders the page and loads the bundled sample. */
async function openSample(): Promise<User> {
    render(<App />)
    const user = userEvent.setup()
    await user.click(
        screen.getByRole('button', { name: 'Look at a sample character' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Truncha' })
    return user
}

/** Renders the page and picks `data` as a results file. */
async function openFile(data: unknown): Promise<User> {
    render(<App />)
    const user = userEvent.setup()
    await user.upload(
        screen.getByLabelText('Open a results file'),
        new File([JSON.stringify(data)], 'truncha.json', {
            type: 'application/json',
        })
    )
    await screen.findByRole('heading', { level: 1, name: 'Truncha' })
    return user
}

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
        const noPlans = structuredClone(sample) as unknown as Json
        noPlans.plans = []
        noPlans.results = (noPlans.results as { gear: string }[]).filter(
            (result) => result.gear === 'worn'
        )

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
