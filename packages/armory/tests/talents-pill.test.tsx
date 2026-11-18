/**
 * The talents pill on the character (spec #109 section 7, ticket #115). The
 * DOM helper must be the first import.
 *
 * The pill is looked up with queryByRole and a null check, not getByRole: a
 * failing getByRole lists every role on the full sample's page, which takes
 * minutes.
 */
import './dom'
import { openFile, openSample, variant } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

import firstRun from '../src/sample-truncha-first-run.json'

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** The sample with its best build's DPS gain set to `gain`. */
function withBestGain(gain: number) {
    return variant((file) => {
        const talents = file.talents as { best: { dps_gain: number } }
        talents.best.dps_gain = gain
    })
}

/** The button of that exact name; fails fast when there is none. */
function pill(name: string): HTMLElement {
    const button = screen.queryByRole('button', { name })
    expect(button).not.toBeNull()
    return button as HTMLElement
}

/**
 * The text around the pill: the pill's own text and that of the elements
 * right before and after it (what sits beside it).
 */
function besideText(button: HTMLElement): string {
    return [button.previousElementSibling, button, button.nextElementSibling]
        .map((element) => element?.textContent ?? '')
        .join(' ')
}

describe('the talents pill', () => {
    test('with best null, a Talents, 21 points pill shows 21 pts, has no dot, and opens the Talents dialog with focus back on close', async () => {
        const user = await openFile(firstRun)

        const button = pill('Talents, 21 points')
        expect(button.textContent).toContain('21 pts')
        const mono = [
            ...button.querySelectorAll<HTMLElement>('.font-mono'),
        ].some((element) => (element.textContent ?? '').includes('21'))
        expect(mono || button.classList.contains('font-mono')).toBe(true)
        expect(button.hasAttribute('data-better')).toBe(false)
        expect(besideText(button)).not.toContain('DPS')

        await user.click(button)
        expect(screen.queryByRole('dialog', { name: 'Talents' })).not.toBeNull()
        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(button)
    })

    test('a best build 3.1 DPS up names the pill, marks it data-better and shows ↓ 3.1 DPS beside it', async () => {
        await openFile(withBestGain(3.1))

        const button = pill('Talents, 21 points, a better build is 3.1 DPS up')
        expect(button.getAttribute('data-better')).toBe('true')
        expect(besideText(button)).toContain('↓ 3.1 DPS')
    })

    test('a best build 2.9 DPS up, or the sample at 1.6, gives no dot and no DPS beside the pill', async () => {
        await openFile(withBestGain(2.9))

        let button = pill('Talents, 21 points')
        expect(button.hasAttribute('data-better')).toBe(false)
        expect(besideText(button)).not.toContain('DPS')

        cleanup()
        localStorage.clear()
        await openSample()
        button = pill('Talents, 21 points')
        expect(button.hasAttribute('data-better')).toBe(false)
        expect(besideText(button)).not.toContain('DPS')
    })

    test('no button in the right card has a name starting Talents:', async () => {
        await openSample()

        const card = screen.queryByRole('complementary', {
            name: "The sim's numbers",
        })
        expect(card).not.toBeNull()
        // Compared as text: a failing toEqual on DOM elements prints the
        // whole page graph and hangs.
        const names = within(card as HTMLElement)
            .queryAllByRole('button', { name: /^Talents:/ })
            .map((button) => button.textContent ?? '')
        expect(names).toEqual([])
    })
})
