/**
 * The Current / BIS switch on the gear card (spec #109 section 5): a
 * `Segmented` group named `View` that replaces the Show the sim's plan /
 * Show what I wear buttons. The DOM helper must be the first import.
 */
import './dom'
import { openFile, openSample, variant } from './open-app'
import { gearPane } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

const SHOW_PLAN = "Show the sim's plan"
const SHOW_WORN = 'Show what I wear'
const SWITCHED = "Switched the gear to the sim's plan for this mix."
const WORN_STATUS = 'What you wear'
const PLAN_STATUS = "The sim's plan for your mix: max damage"

/**
 * What the gear pane says it shows, as `plan-view.test.tsx` reads it: the
 * line that starts with `What you wear` or `The sim's plan` in bold.
 */
function paneStatus(): string {
    const bold = [...gearPane().querySelectorAll('b')].find((element) =>
        ['What you wear', "The sim's plan"].includes(element.textContent ?? '')
    )
    return bold?.parentElement?.textContent ?? ''
}

function viewGroup(): HTMLElement {
    return within(gearPane()).getByRole('group', { name: 'View' })
}

function radio(name: string): HTMLInputElement {
    return within(viewGroup()).getByRole('radio', {
        name,
    }) as HTMLInputElement
}

function slot(prefix: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${prefix}: `) })
}

function setSlider(name: string, value: number) {
    fireEvent.change(screen.getByRole('slider', { name }), {
        target: { value: String(value) },
    })
}

afterEach(() => {
    cleanup()
    localStorage.clear()
})

describe('the View switch', () => {
    test('the gear card has a View group with the radios Current, checked, and BIS', async () => {
        await openSample()

        const radios = within(viewGroup()).getAllByRole('radio')
        expect(radios.length).toBe(2)
        expect(radios[0]).toBe(radio('Current'))
        expect(radios[1]).toBe(radio('BIS'))
        expect(radio('Current').checked).toBe(true)
        expect(radio('BIS').checked).toBe(false)
        expect(paneStatus()).toBe(WORN_STATUS)
        // The owner's design has no status line: in the Current view it is
        // there for screen readers only.
        const status = [...gearPane().querySelectorAll('[aria-live]')].find(
            (element) => element.textContent === WORN_STATUS
        )
        expect(status?.className.split(/\s+/)).toContain('sr-only')
    })

    test("choosing BIS shows the sim's plan, and Current goes back to what you wear", async () => {
        const user = await openSample()

        await user.click(radio('BIS'))

        expect(radio('BIS').checked).toBe(true)
        expect(paneStatus()).toBe(PLAN_STATUS)
        expect(within(slot('Legs')).getByText('Ferine Leggings')).toBeDefined()

        await user.click(radio('Current'))

        expect(radio('Current').checked).toBe(true)
        expect(paneStatus()).toBe(WORN_STATUS)
    })

    test('arrow keys move between Current and BIS', async () => {
        const user = await openSample()
        radio('Current').focus()

        await user.keyboard('{ArrowRight}')

        expect(radio('BIS').checked).toBe(true)
        expect(paneStatus()).toBe(PLAN_STATUS)

        await user.keyboard('{ArrowLeft}')

        expect(radio('Current').checked).toBe(true)
        expect(paneStatus()).toBe(WORN_STATUS)
    })

    test("no Show the sim's plan or Show what I wear button exists, before or after a slider moves", async () => {
        const oldButtons = () =>
            screen
                .queryAllByRole('button')
                .map((button) => button.textContent ?? '')
                .filter((text) => [SHOW_PLAN, SHOW_WORN].includes(text))
        await openSample()
        expect(oldButtons()).toEqual([])

        setSlider('Damage', 45)
        setSlider('Survival', 35)

        // The note still says the gear switched; only its button goes.
        expect(screen.getByText(SWITCHED, { exact: false })).toBeDefined()
        expect(oldButtons()).toEqual([])
    })

    test('moving a slider checks BIS', async () => {
        await openSample()
        expect(radio('BIS').checked).toBe(false)

        setSlider('Damage', 45)

        expect(radio('BIS').checked).toBe(true)
        expect(radio('Current').checked).toBe(false)
        expect(paneStatus()).toContain("The sim's plan for your mix")
    })

    test('a file with no plans has no View group', async () => {
        const noPlans = variant((file) => {
            file.plans = []
            file.results = (file.results as { gear: string }[]).filter(
                (result) => result.gear === 'worn'
            )
        })
        // The sample has plans, so the absence below comes from the plans.
        await openSample()
        expect(viewGroup()).toBeDefined()
        cleanup()
        localStorage.clear()

        await openFile(noPlans)

        expect(screen.queryByRole('group', { name: 'View' })).toBeNull()
        expect(screen.queryByRole('radio', { name: 'BIS' })).toBeNull()
    })
})
