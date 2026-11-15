/**
 * The approved C2 layout: at desktop width the gear and the card sit side by
 * side, the gear on the left, the card (28rem) on the right. Tailwind's
 * `lg:` classes on the page body say so; the build test checks those
 * classes reach the CSS.
 */
import './dom'
import { openSample } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'

afterEach(() => {
    cleanup()
})

describe('the page layout (approved C2 layout: gear on the left, the card on the right)', () => {
    test('at desktop width the gear and the card sit side by side in two columns', async () => {
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
                'lg:grid-cols-[minmax(0,1fr)_28rem]',
            ])
        )
        expect(
            gear.compareDocumentPosition(card) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })
})
