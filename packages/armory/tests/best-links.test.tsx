/**
 * `Best:` links (spec #109 section 6): in the `Current` view, under each
 * slot with a gap, `Best: <item>` names the plan's item after the `best`
 * icon, and the item's name is a button that opens the slot's item picker
 * with that item's row focused. The DOM helper must be the first import.
 */
import './dom'
import { openSample, type User } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'

const HELM = "Defender's Leather Helm"

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** Text with every space taken out. */
function squeeze(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, '')
}

function gearPane(): HTMLElement {
    const pane = document.querySelector<HTMLElement>('[data-slot="gear-pane"]')
    if (!pane) throw new Error('no gear card')
    return pane
}

/** The `Best:` button for the helm, or null (a plain error when missing). */
function helmLink(): HTMLElement | null {
    return within(gearPane()).queryByRole('button', { name: HELM })
}

/** The innermost element holding the link whose text starts with `Best:`. */
function bestLine(link: HTMLElement): HTMLElement | null {
    let element = link.parentElement
    while (element && element !== gearPane()) {
        if (squeeze(element.textContent).startsWith('Best:')) return element
        element = element.parentElement
    }
    return null
}

/** The first SVG or non-blank text in `element`, in document order. */
function firstThing(element: HTMLElement): Node | null {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    )
    let node = walker.nextNode()
    while (node) {
        if (node.nodeType === Node.TEXT_NODE && squeeze(node.textContent))
            return node
        if (node.nodeName.toLowerCase() === 'svg') return node
        node = walker.nextNode()
    }
    return null
}

async function showBis(user: User) {
    const group = within(gearPane()).getByRole('group', { name: 'View' })
    await user.click(within(group).getByRole('radio', { name: 'BIS' }))
}

describe('Best: links', () => {
    test("with the sample, Head shows Best: and a Defender's Leather Helm button that opens the Head picker focused on its row", async () => {
        const user = await openSample()

        const link = helmLink()
        expect(link).not.toBeNull()
        const line = bestLine(link!)
        expect(line).not.toBeNull()
        // The slot button keeps its name.
        expect(
            screen.queryByRole('button', {
                name: "Head: Brawler's Leather Hood, 16.7 EP below the sim's best",
            })
        ).not.toBeNull()

        await user.click(link!)
        const dialog = screen.getByRole('dialog', { name: 'Head' })
        await waitFor(() => {
            const focused = document.activeElement
            if (
                !focused ||
                focused.tagName !== 'LI' ||
                !dialog.contains(focused) ||
                !(focused.textContent ?? '').includes(HELM)
            )
                throw new Error("focus is not on the helm's row")
        })
    })

    test('the Best: line starts with an aria-hidden SVG', async () => {
        await openSample()

        const link = helmLink()
        expect(link).not.toBeNull()
        const line = bestLine(link!)
        expect(line).not.toBeNull()
        const first = firstThing(line!) as Element | null
        expect(first?.nodeName.toLowerCase()).toBe('svg')
        expect(first?.getAttribute('aria-hidden')).toBe('true')
    })

    test('in the BIS view no Best: button shows', async () => {
        const user = await openSample()
        expect(helmLink()).not.toBeNull()

        await showBis(user)

        expect(helmLink()).toBeNull()
        const links = within(gearPane())
            .queryAllByRole('button')
            .filter((button) => bestLine(button) !== null)
            .map((button) => button.textContent ?? '')
        expect(links).toEqual([])
    })
})
