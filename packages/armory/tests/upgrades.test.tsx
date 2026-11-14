/**
 * Upgrades, the item picker, the wishlist and the dialog behaviour (spec
 * sections 6, 7 and 8). The DOM helper must be the first import.
 */
import './dom'
import { openFile, openSample, variant, type User } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

const HANDS = 'Hands: Toughened Leather Gloves, +21.6 EP'
const NECK = "Neck: Archmagister's Faceted Pendant, +1.7 EP"
const LEGS = "Legs: Trapper's Leather Legguards, +23.6 EP"
const FINGER_1 = 'Finger 1: Seal of Sylvanas, +19.2 EP'
const FINGER_2 = 'Finger 2: Item 6748, +19.2 EP'

/** Clicks the slot button named `name` and returns the picker it opens. */
async function openPicker(
    user: User,
    name: string,
    title: string
): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name }))
    return screen.getByRole('dialog', { name: title })
}

/** The picker's alternative rows: list items with a wishlist toggle. */
function alternativeRows(dialog: HTMLElement): HTMLElement[] {
    return within(dialog)
        .getAllByRole('listitem')
        .filter(
            (row) =>
                within(row).queryByRole('button', {
                    name: /^(Add to wishlist|On your wishlist)$/,
                }) !== null
        )
}

function rowFor(dialog: HTMLElement, itemName: string): HTMLElement {
    const row = alternativeRows(dialog).find((candidate) =>
        within(candidate).queryByText(itemName)
    )
    if (!row) throw new Error(`no alternative row for ${itemName}`)
    return row
}

function headerButton(name: string): HTMLElement {
    return screen.getByRole('button', { name, hidden: true })
}

function gainSize(slot: HTMLElement, gain: string): string | null {
    return (
        within(slot)
            .getByText(gain)
            .closest('[data-size]')
            ?.getAttribute('data-size') ?? null
    )
}

async function closeDialog(user: User, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
}

afterEach(() => {
    cleanup()
})

describe('gains on the slots', () => {
    test('Legs shows +23.6 EP and Best: Ferine Leggings', async () => {
        await openSample()
        const legs = screen.getByRole('button', { name: LEGS })

        expect(within(legs).getByText('+23.6 EP')).toBeDefined()
        expect(within(legs).getByText('Best: Ferine Leggings')).toBeDefined()
    })

    test('Main hand shows +6.0 DPS and Best: Corpsemaker', async () => {
        await openSample()
        const mainHand = screen.getByRole('button', {
            name: "Main hand: Guardian's Dualblade, +6.0 DPS",
        })

        expect(within(mainHand).getByText('+6.0 DPS')).toBeDefined()
        expect(within(mainHand).getByText('Best: Corpsemaker')).toBeDefined()
    })

    test('the Neck gain is drawn small and the Legs gain big', async () => {
        await openSample()

        expect(
            gainSize(screen.getByRole('button', { name: NECK }), '+1.7 EP')
        ).toBe('small')
        expect(
            gainSize(screen.getByRole('button', { name: LEGS }), '+23.6 EP')
        ).toBe('big')
    })

    test('a Back first alternative with gain_ep 0 shows no gain and the worn source text', async () => {
        const changed = variant((file) => {
            const slots = file.slots as {
                slot: string
                alternatives: { gain_ep: number | null }[]
            }[]
            const back = slots.find((entry) => entry.slot === 'back')
            if (!back) throw new Error('the sample has no back slot')
            const first = back.alternatives[0]
            if (!first) throw new Error('the sample back has no alternative')
            first.gain_ep = 0
        })

        // The unchanged sample shows the Back gain, so the copy's lack of
        // one comes from the zero gain.
        await openSample()
        const before = screen.getByRole('button', {
            name: 'Back: Item 279848, +6.2 EP',
        })
        expect(within(before).getByText('+6.2 EP')).toBeDefined()
        cleanup()

        await openFile(changed)
        const slot = screen.getByRole('button', { name: 'Back: Item 279848' })

        expect(within(slot).queryByText(/EP$/)).toBeNull()
        expect(within(slot).queryByText(/^Best: /)).toBeNull()
        expect(within(slot).getByText('Source unknown')).toBeDefined()
    })

    test('the bag upgrade shows under the left column', async () => {
        await openSample()
        const note = screen.getByText(
            'In your bags: Berylline Pads, +7.0 EP over what you wear.'
        )
        const wrist = screen.getByRole('button', { name: /^Wrist: / })

        expect(
            wrist.compareDocumentPosition(note) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })
})

describe('the item picker', () => {
    test('the Hands picker shows what you wear, then Gloves of the Greatfather first', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, HANDS, 'Hands')

        const wearHeading = within(dialog).getByText('What you wear')
        const worn = within(dialog).getByText('Toughened Leather Gloves')
        const betterHeading = within(dialog).getByText('Better for you')
        expect(
            wearHeading.compareDocumentPosition(worn) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(
            worn.compareDocumentPosition(betterHeading) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()

        const [first] = alternativeRows(dialog)
        if (!first) throw new Error('no alternatives listed')
        expect(
            betterHeading.compareDocumentPosition(first) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(
            within(first).getByText('Gloves of the Greatfather')
        ).toBeDefined()
        expect(within(first).getByText('+21.6 EP')).toBeDefined()
        expect(within(first).getByText('Crafted: Leatherworking')).toBeDefined()
        expect(within(first).getByText('Needs level 33')).toBeDefined()
        expect(within(first).getByText('Classic data')).toBeDefined()
    })

    test('Classic data comes with Stats and source may predate Forever.', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, HANDS, 'Hands')
        const row = rowFor(dialog, 'Gloves of the Greatfather')

        expect(
            within(row).getByText('Stats and source may predate Forever.')
        ).toBeDefined()
    })

    test('an alternative needing level 30 or less shows no Needs level line', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, HANDS, 'Hands')

        expect(
            within(rowFor(dialog, "Violet Sorcerer's Wraps")).queryByText(
                /^Needs level/
            )
        ).toBeNull()
        expect(
            within(rowFor(dialog, 'Insignia Gloves')).queryByText(
                /^Needs level/
            )
        ).toBeNull()
        expect(
            within(rowFor(dialog, 'Dog Training Gloves')).getByText(
                'Needs level 31'
            )
        ).toBeDefined()
    })

    test('the Neck picker lists Mark of the Marsh at -1.7 EP and leaves out the worn pendant', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, NECK, 'Neck')

        expect(
            within(rowFor(dialog, 'Mark of the Marsh')).getByText('-1.7 EP')
        ).toBeDefined()
        const rows = alternativeRows(dialog)
        expect(rows).toHaveLength(4)
        for (const row of rows) {
            expect(
                within(row).queryByText("Archmagister's Faceted Pendant")
            ).toBeNull()
        }
    })
})

describe('the wishlist', () => {
    test('Add to wishlist toggles to a pressed On your wishlist and back, and the header counts', async () => {
        const user = await openSample()
        expect(headerButton('Wishlist (0)')).toBeDefined()
        const dialog = await openPicker(user, HANDS, 'Hands')
        const row = rowFor(dialog, 'Gloves of the Greatfather')

        await user.click(
            within(row).getByRole('button', { name: 'Add to wishlist' })
        )
        const on = within(row).getByRole('button', {
            name: 'On your wishlist',
        })
        expect(on.getAttribute('aria-pressed')).toBe('true')
        expect(headerButton('Wishlist (1)')).toBeDefined()

        await user.click(on)
        expect(
            within(row).getByRole('button', { name: 'Add to wishlist' })
        ).toBeDefined()
        expect(headerButton('Wishlist (0)')).toBeDefined()
    })

    test('an item added from Finger 1 is On your wishlist in the Finger 2 picker', async () => {
        const user = await openSample()
        const first = await openPicker(user, FINGER_1, 'Finger 1')
        await user.click(
            within(rowFor(first, 'Quick Strike Ring')).getByRole('button', {
                name: 'Add to wishlist',
            })
        )
        await closeDialog(user, first)

        const second = await openPicker(user, FINGER_2, 'Finger 2')
        expect(
            within(rowFor(second, 'Quick Strike Ring')).getByRole('button', {
                name: 'On your wishlist',
            })
        ).toBeDefined()
        await closeDialog(user, second)
        expect(headerButton('Wishlist (1)')).toBeDefined()
    })

    test('the wishlist dialog lists the item with its slot and source, and Remove empties it', async () => {
        const user = await openSample()
        const picker = await openPicker(user, HANDS, 'Hands')
        await user.click(
            within(rowFor(picker, 'Gloves of the Greatfather')).getByRole(
                'button',
                { name: 'Add to wishlist' }
            )
        )
        await closeDialog(user, picker)

        await user.click(screen.getByRole('button', { name: 'Wishlist (1)' }))
        const dialog = screen.getByRole('dialog', { name: 'Wishlist' })
        expect(
            within(dialog).getByText('Gloves of the Greatfather')
        ).toBeDefined()
        expect(within(dialog).getByText('Hands')).toBeDefined()
        expect(
            within(dialog).getByText('Crafted: Leatherworking')
        ).toBeDefined()

        await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
        expect(
            within(dialog).getByText('Nothing on your wishlist yet.')
        ).toBeDefined()
        expect(
            within(dialog).queryByText('Gloves of the Greatfather')
        ).toBeNull()
    })

    test('Quick Strike Ring added from Finger 1 shows once in the wishlist, under Finger 1', async () => {
        const user = await openSample()
        const first = await openPicker(user, FINGER_1, 'Finger 1')
        await user.click(
            within(rowFor(first, 'Quick Strike Ring')).getByRole('button', {
                name: 'Add to wishlist',
            })
        )
        await closeDialog(user, first)
        const second = await openPicker(user, FINGER_2, 'Finger 2')
        await closeDialog(user, second)

        await user.click(screen.getByRole('button', { name: 'Wishlist (1)' }))
        const dialog = screen.getByRole('dialog', { name: 'Wishlist' })
        expect(within(dialog).getAllByText('Quick Strike Ring')).toHaveLength(1)
        expect(within(dialog).getByText('Finger 1')).toBeDefined()
        expect(within(dialog).queryByText('Finger 2')).toBeNull()
    })
})

describe('dialogs', () => {
    test('the picker and the wishlist are modal dialogs named by their titles', async () => {
        const user = await openSample()
        const picker = await openPicker(user, HANDS, 'Hands')
        expect(picker.getAttribute('aria-modal')).toBe('true')
        await closeDialog(user, picker)

        await user.click(screen.getByRole('button', { name: 'Wishlist (0)' }))
        const wishlist = screen.getByRole('dialog', { name: 'Wishlist' })
        expect(wishlist.getAttribute('aria-modal')).toBe('true')
    })

    test('the picker takes focus, keeps Tab inside, closes on Escape and gives focus back to the slot', async () => {
        const user = await openSample()
        const slot = screen.getByRole('button', { name: HANDS })
        const dialog = await openPicker(user, HANDS, 'Hands')

        expect(document.activeElement).toBe(
            within(dialog).getByRole('button', { name: 'Close' })
        )
        for (let i = 0; i < 12; i++) {
            await user.tab()
            expect(dialog.contains(document.activeElement)).toBe(true)
        }
        for (let i = 0; i < 12; i++) {
            await user.tab({ shift: true })
            expect(dialog.contains(document.activeElement)).toBe(true)
        }

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(slot)
    })

    test('the wishlist takes focus, keeps Tab inside, closes on Escape and gives focus back to its button', async () => {
        const user = await openSample()
        const opener = screen.getByRole('button', { name: 'Wishlist (0)' })
        await user.click(opener)
        const dialog = screen.getByRole('dialog', { name: 'Wishlist' })

        expect(document.activeElement).toBe(
            within(dialog).getByRole('button', { name: 'Close' })
        )
        await user.tab()
        expect(dialog.contains(document.activeElement)).toBe(true)
        await user.tab({ shift: true })
        expect(dialog.contains(document.activeElement)).toBe(true)

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(opener)
    })

    test('after Remove from the keyboard, Escape still closes the wishlist and gives focus back to its button', async () => {
        const user = await openSample()
        const picker = await openPicker(user, HANDS, 'Hands')
        await user.click(
            within(rowFor(picker, 'Gloves of the Greatfather')).getByRole(
                'button',
                { name: 'Add to wishlist' }
            )
        )
        await closeDialog(user, picker)

        const opener = screen.getByRole('button', { name: 'Wishlist (1)' })
        await user.click(opener)
        const dialog = screen.getByRole('dialog', { name: 'Wishlist' })
        within(dialog).getByRole('button', { name: 'Remove' }).focus()
        await user.keyboard('{Enter}')
        expect(
            within(dialog).getByText('Nothing on your wishlist yet.')
        ).toBeDefined()

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'Wishlist (0)' })
        )
    })
})
