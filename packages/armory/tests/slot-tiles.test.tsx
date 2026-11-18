/**
 * The gear tiles as the owner's design draws them: one glass button per
 * slot, with an empty icon square bordered in the item's quality colour
 * (owner decision F), the gap or `BIS` badge inside the tile on the edge
 * facing the figure, and a third line that is either `Best: <item>` (a
 * button of its own, beside the slot's button, not in it) or the first part
 * of the worn item's source. The DOM helper must be the first import.
 */
import './dom'
import { openFile, openSample, variant } from './open-app'
import { entry, gearPane, keepAllWorn } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

const HEAD = "Head: Brawler's Leather Hood, 16.7 EP below the sim's best"
const HELM = "Defender's Leather Helm"

afterEach(() => {
    cleanup()
    localStorage.clear()
})

/** The slot button whose name starts with `<label>: `. */
function slot(label: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${label}: `) })
}

/** Every slot button in the gear card (named `<Label>: …`). */
function slotButtons(): HTMLElement[] {
    return [...gearPane().querySelectorAll<HTMLElement>('button')].filter(
        (button) =>
            /^[A-Z][\w -]*: /.test(button.getAttribute('aria-label') ?? '')
    )
}

/** The slot's badge (a gap or `BIS`), or null. */
function badge(button: HTMLElement): HTMLElement | null {
    return button.querySelector<HTMLElement>('[data-size], [data-bis]')
}

function classes(element: Element | null | undefined): string[] {
    return (element?.getAttribute('class') ?? '').split(/\s+/)
}

describe('the gear tiles', () => {
    test("the Best: link sits beside the slot's button, not inside it, and comes right after it in focus order", async () => {
        await openSample()

        const head = screen.getByRole('button', { name: HEAD })
        const link = within(gearPane()).getByRole('button', { name: HELM })
        expect(head.contains(link)).toBe(false)
        expect(link.parentElement?.closest('button')).toBeNull()
        // Same tile: the line is laid over the tile's third line.
        const line = link.closest('p')
        expect(line?.parentElement).toBe(head.parentElement)
        expect(classes(line)).toContain('absolute')
        // Focus order: the slot, then its Best: link.
        const buttons = [...gearPane().querySelectorAll<HTMLElement>('button')]
        expect(buttons.indexOf(link)).toBe(buttons.indexOf(head) + 1)
        // The slot's own name doesn't change.
        expect(head.getAttribute('aria-label')).toBe(HEAD)
    })

    test("with no gap, the third line is the worn item's source, its first part only", async () => {
        await openFile(
            variant((file) => {
                keepAllWorn(file)
                const waist = entry(file, 'waist').worn
                if (!waist) throw new Error('the sample wears a belt')
                waist.source = {
                    kind: 'crafted',
                    text: 'Crafted: Leatherworking; Drop: World Drop',
                }
            })
        )

        const waist = slot('Waist')
        expect(waist.querySelector('[data-slot-note]')?.textContent).toBe(
            'Crafted: Leatherworking'
        )
        expect(waist.textContent).not.toContain('World Drop')
    })

    test("the icon square is empty and bordered in the item's quality colour; an empty slot's is dashed", async () => {
        await openSample()

        const square = (label: string) =>
            slot(label).querySelector('[data-icon-square]')
        // The sample's helm is rare, its pendant uncommon.
        expect(classes(square('Head'))).toContain('border-quality-rare')
        expect(classes(square('Neck'))).toContain('border-quality-uncommon')
        expect(square('Head')?.childNodes).toHaveLength(0)
        expect(classes(square('Trinket 1'))).toContain('border-dashed')
        // No slot draws a glyph.
        for (const button of slotButtons())
            expect(button.querySelector('[data-icon-square] svg')).toBeNull()
    })

    test('every badge sits inside its tile: on the right in the left column and the bottom row, on the left in the right column, a small rounded rectangle', async () => {
        await openSample()

        const right = gearPane().querySelector('[data-slot="slots-right"]')
        const placed = slotButtons().filter((button) => badge(button))
        expect(placed.length).toBeGreaterThan(0)
        for (const button of placed) {
            const shown = classes(badge(button))
            expect(shown).toContain('absolute')
            expect(shown).toContain('rounded-sm')
            // No negative offset: it never sticks out of the tile.
            expect(shown.filter((name) => name.startsWith('-'))).toEqual([
                '-translate-y-1/2',
            ])
            expect(shown).toContain(
                right?.contains(button) ? 'left-2.5' : 'right-2.5'
            )
        }
        expect(
            placed.some((button) => right?.contains(button)) &&
                placed.some((button) => !right?.contains(button))
        ).toBe(true)
    })

    test('a slot that matches the plan has a green outlined BIS badge inside its tile', async () => {
        await openFile(variant(keepAllWorn))

        const head = slot('Head')
        const bis = head.querySelector('[data-bis]')
        expect(bis?.textContent).toBe('BIS')
        expect(classes(bis)).toEqual(
            expect.arrayContaining(['border-owned-border', 'rounded-sm'])
        )
        expect(bis?.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
            'true'
        )
    })
})
