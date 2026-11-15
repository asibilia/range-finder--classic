/**
 * The approved C2 layout, as its mockup arranges it: the gear with the card
 * on its right (what the sim says, what to gear for, talents), from 90rem;
 * stacked below that so the gear's middle column never collapses. The fight
 * chart, damage split, stat weights and fight settings sit in a full-width
 * band under both. Slot names wrap instead of being cut off. Tailwind's
 * classes say so here; the build test checks they reach the CSS, and
 * `scripts/check-widths.ts` measures the real widths in a browser.
 */
import './dom'
import { openSample } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

afterEach(() => {
    cleanup()
})

describe('the page layout (approved C2 mockup)', () => {
    test('from 90rem the gear and the card sit side by side; the band follows, full width', async () => {
        await openSample()

        const gear = screen.getByRole('region', { name: 'Gear' })
        const card = screen.getByRole('complementary', {
            name: "The sim's numbers",
        })
        const body = gear.parentElement
        expect(body).not.toBeNull()
        expect(card.parentElement).toBe(body)
        expect(body!.className.split(/\s+/)).toEqual(
            expect.arrayContaining([
                'grid',
                'min-[90rem]:grid-cols-[minmax(0,1fr)_27.75rem]',
            ])
        )
        const band = screen.getByRole('region', { name: 'Across the fight' })
        expect(band.parentElement).toBe(body!.parentElement)
        expect(
            body!.compareDocumentPosition(band) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(band.className).toContain(
            'min-[90rem]:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,0.9fr)]'
        )
    })

    test("the doll's middle column has a minimum, by the pane's own width", async () => {
        await openSample()
        const gear = screen.getByRole('region', { name: 'Gear' })
        const container = gear.querySelector('.\\@container\\/doll')
        expect(container).not.toBeNull()
        expect(container!.firstElementChild!.className).toContain(
            '@min-[49rem]/doll:grid-cols-[minmax(14rem,20rem)_minmax(16.5rem,1fr)_minmax(14rem,20rem)]'
        )
    })

    test('slot names and their notes wrap; nothing is truncated with an ellipsis', async () => {
        await openSample()
        const gear = screen.getByRole('region', { name: 'Gear' })
        const names = gear.querySelectorAll('[data-slot-name]')
        expect(names).toHaveLength(17)
        for (const element of within(gear).getAllByRole('button')) {
            for (const part of element.querySelectorAll('*'))
                expect(String(part.getAttribute('class'))).not.toMatch(
                    /\b(truncate|text-ellipsis|line-clamp-\d)\b/
                )
        }
    })
})
