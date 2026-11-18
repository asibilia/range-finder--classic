/**
 * Upgrades, the item picker, the wishlist and the dialog behaviour (spec
 * sections 6, 7 and 8). The DOM helper must be the first import.
 */
import './dom'
import {
    openFile,
    openSample,
    pills,
    readingValue,
    variant,
    type User,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

function escaped(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A slot's name with its gain: `<base>, +21.6 EP` before #113, or
 * `<base>, 21.6 EP below the sim's best` (the plan's item's gap) after it.
 */
function slotName(base: string, oldGain: string, newGap = oldGain): RegExp {
    const gap = newGap.replace(/^\+/, '')
    return new RegExp(
        `^${escaped(base)}, (${escaped(oldGain)}|${escaped(gap)} below the sim's best)$`
    )
}

/** Text with every space taken out. */
function squeeze(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, '')
}

/**
 * The gain pill reading `oldText` (`+23.6 EP`), or, after #113, the gap
 * badge reading `newText` (`↓ 23.6`).
 */
function gapPill(
    element: HTMLElement,
    oldText: string,
    newText: string
): HTMLElement {
    const found = [
        ...element.querySelectorAll<HTMLElement>('[data-size]'),
    ].find((candidate) =>
        [squeeze(oldText), squeeze(newText)].includes(
            squeeze(candidate.textContent)
        )
    )
    if (!found) throw new Error(`no badge reading ${oldText} or ${newText}`)
    return found
}

/**
 * Whether the slot `button` shows `text` as its note: inside the button
 * before #114, or (`Best: <item>`) on its own line under it after #114.
 */
function slotNoteHas(button: HTMLElement, text: string): boolean {
    const isSlot = (element: Element) =>
        /^[A-Z][\w -]*: /.test(element.getAttribute('aria-label') ?? '')
    const parent = button.parentElement
    const near = [button, parent, parent?.parentElement]
    return near.some(
        (element) =>
            element != null &&
            [...element.querySelectorAll('button')].filter(isSlot).length <=
                1 &&
            squeeze(element.textContent).includes(squeeze(text))
    )
}

const HANDS = slotName('Hands: Toughened Leather Gloves', '+21.6 EP')
const NECK = slotName("Neck: Archmagister's Faceted Pendant", '+1.7 EP')
const LEGS = slotName("Legs: Trapper's Leather Legguards", '+23.6 EP')
const FINGER_1 = slotName('Finger 1: Seal of Sylvanas', '+19.2 EP')
const FINGER_2 = slotName(
    'Finger 2: Unnamed ring (6748)',
    '+19.2 EP',
    '15.5 EP'
)

/** Clicks the slot button named `name` and returns the picker it opens. */
async function openPicker(
    user: User,
    name: string | RegExp,
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
                    name: /^(Add to wishlist|On wishlist)$/,
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

function gainSize(slot: HTMLElement, gain: string, gap: string): string | null {
    return gapPill(slot, gain, gap).getAttribute('data-size')
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

        expect(gapPill(legs, '+23.6 EP', '↓ 23.6')).toBeDefined()
        expect(slotNoteHas(legs, 'Best: Ferine Leggings')).toBe(true)
    })

    test('Two-hand shows +6.0 DPS and Best: Corpsemaker', async () => {
        await openSample()
        const mainHand = screen.getByRole('button', {
            name: slotName("Two-hand: Guardian's Dualblade", '+6.0 DPS'),
        })

        expect(gapPill(mainHand, '+6.0 DPS', '↓ 6.0 DPS')).toBeDefined()
        expect(slotNoteHas(mainHand, 'Best: Corpsemaker')).toBe(true)
    })

    test('the Neck gain is drawn small and the Legs gain big', async () => {
        await openSample()

        expect(
            gainSize(
                screen.getByRole('button', { name: NECK }),
                '+1.7 EP',
                '↓ 1.7'
            )
        ).toBe('small')
        expect(
            gainSize(
                screen.getByRole('button', { name: LEGS }),
                '+23.6 EP',
                '↓ 23.6'
            )
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
            name: slotName('Back: Unnamed cloak (279848)', '+6.2 EP'),
        })
        expect(gapPill(before, '+6.2 EP', '↓ 6.2')).toBeDefined()
        cleanup()

        await openFile(changed)
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })

        expect(pills(slot)).toEqual([])
        expect(within(slot).queryByText(/^Best: /)).toBeNull()
        expect(within(slot).getByText('Source unknown')).toBeDefined()
    })

    test('a Back first alternative gaining 0.04 EP, shown as +0.0, shows no gain and the worn source text', async () => {
        await openFile(
            variant((file) => {
                const slots = file.slots as {
                    slot: string
                    alternatives: { gain_ep: number | null }[]
                }[]
                const first = slots.find((entry) => entry.slot === 'back')
                    ?.alternatives[0]
                if (!first)
                    throw new Error('the sample back has no alternative')
                first.gain_ep = 0.04
            })
        )
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })

        expect(pills(slot)).toEqual([])
        expect(within(slot).queryByText(/^Best: /)).toBeNull()
        expect(within(slot).getByText('Source unknown')).toBeDefined()
    })

    test('a Back first alternative with no gain_ep and no gain_dps shows no gain, here or in the picker', async () => {
        const user = await openFile(
            variant((file) => {
                const slots = file.slots as {
                    slot: string
                    alternatives: {
                        gain_ep: number | null
                        gain_dps: number | null
                    }[]
                }[]
                const first = slots.find((entry) => entry.slot === 'back')
                    ?.alternatives[0]
                if (!first)
                    throw new Error('the sample back has no alternative')
                first.gain_ep = null
                first.gain_dps = null
            })
        )
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })
        expect(pills(slot)).toEqual([])
        expect(within(slot).queryByText(/^Best: /)).toBeNull()

        const dialog = await openPicker(
            user,
            'Back: Unnamed cloak (279848)',
            'Back'
        )
        const row = rowFor(dialog, "Sergeant Major's Cape")
        expect(row.textContent).not.toMatch(/(EP|DPS)/)
        expect(
            rowFor(dialog, 'Tattered Kirin Tor Cloak').textContent
        ).toContain('+6.0 EP')
    })

    test("the bag upgrade shows under the left column, in the mockup's words", async () => {
        await openSample()
        const note = screen.getByText(
            (_, element) =>
                element?.tagName === 'P' &&
                element.textContent ===
                    'Berylline Pads are in your bags, +7.0 EP over the shoulders you wear. No dungeon needed.'
        )
        const wrist = screen.getByRole('button', { name: /^Wrist: / })

        expect(
            wrist.compareDocumentPosition(note) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })
})

describe('Wear them', () => {
    test('puts the bag item on: the slot, the numbers and the card change; Undo puts it back', async () => {
        const user = await openSample()
        expect(readingValue('Dungeon')).toBe('75.4')

        await user.click(screen.getByRole('button', { name: 'Wear them' }))

        expect(
            screen.getByRole('button', { name: /^Shoulder: Berylline Pads, / })
        ).toBeDefined()
        expect(
            screen.getByText(
                (_, element) =>
                    element?.tagName === 'P' &&
                    element.textContent ===
                        "You wear Berylline Pads now. Serpent's Shoulders went to your bags."
            )
        ).toBeDefined()
        expect(readingValue('Dungeon')).toBe('75.7')
        expect(readingValue('Solo')).toBe('104.1')

        await user.click(screen.getByRole('button', { name: 'Undo' }))
        expect(
            screen.getByRole('button', {
                name: /^Shoulder: Serpent's Shoulders, /,
            })
        ).toBeDefined()
        expect(readingValue('Dungeon')).toBe('75.4')
        expect(screen.getByRole('button', { name: 'Wear them' })).toBeDefined()
    })

    test('a bag upgrade without results (not simmed) has no Wear them button', async () => {
        await openFile(
            variant((file) => {
                for (const upgrade of file.bag_upgrades as Record<
                    string,
                    unknown
                >[])
                    delete upgrade.results
            })
        )
        expect(screen.queryByRole('button', { name: 'Wear them' })).toBeNull()
        expect(
            screen.getByText('are in your bags,', { exact: false })
        ).toBeDefined()
    })
})

describe('slot names', () => {
    test('a name cut off with an ellipsis shows whole in a tooltip', async () => {
        const user = await openSample()
        const hands = screen.getByRole('button', { name: HANDS })
        await user.hover(hands)
        expect(
            await screen.findByText('Toughened Leather Gloves', {
                selector: '[data-slot="tooltip-content"]',
            })
        ).toBeDefined()
    })
})

describe('the item picker', () => {
    test('the Hands picker shows what is in the slot now, then Gloves of the Greatfather first', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, HANDS, 'Hands')

        expect(
            within(dialog).getByText(
                'Comparing with what you wear. Scores are EP, attack power = 1.',
                { exact: false }
            )
        ).toBeDefined()
        const wearHeading = within(dialog).getByText('In this slot now')
        const worn = within(dialog).getByText('Toughened Leather Gloves')
        const betterHeading = within(dialog).getByRole('list', {
            name: 'Better for you',
        })
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
        expect(betterHeading.contains(first)).toBe(true)
        expect(
            within(first).getByText('Gloves of the Greatfather')
        ).toBeDefined()
        expect(first.textContent).toContain('+21.6 EP')
        expect(within(first).getByText('Crafted: Leatherworking')).toBeDefined()
        expect(within(first).getByText('needs level 33')).toBeDefined()
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
                /^needs level/
            )
        ).toBeNull()
        expect(
            within(rowFor(dialog, 'Insignia Gloves')).queryByText(
                /^needs level/
            )
        ).toBeNull()
        expect(
            within(rowFor(dialog, 'Dog Training Gloves')).getByText(
                'needs level 31'
            )
        ).toBeDefined()
    })

    test('the Neck picker lists Mark of the Marsh at -1.7 EP and leaves out the worn pendant', async () => {
        const user = await openSample()
        const dialog = await openPicker(user, NECK, 'Neck')

        expect(rowFor(dialog, 'Mark of the Marsh').textContent).toContain(
            '-1.7 EP'
        )
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
    test('Add to wishlist toggles to a pressed On wishlist and back, and the header counts', async () => {
        const user = await openSample()
        expect(headerButton('Wishlist 0')).toBeDefined()
        const dialog = await openPicker(user, HANDS, 'Hands')
        const row = rowFor(dialog, 'Gloves of the Greatfather')

        await user.click(
            within(row).getByRole('button', { name: 'Add to wishlist' })
        )
        const on = within(row).getByRole('button', {
            name: 'On wishlist',
        })
        expect(on.getAttribute('aria-pressed')).toBe('true')
        expect(headerButton('Wishlist 1')).toBeDefined()

        await user.click(on)
        expect(
            within(row).getByRole('button', { name: 'Add to wishlist' })
        ).toBeDefined()
        expect(headerButton('Wishlist 0')).toBeDefined()
    })

    test('an item added from Finger 1 is On wishlist in the Finger 2 picker', async () => {
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
                name: 'On wishlist',
            })
        ).toBeDefined()
        await closeDialog(user, second)
        expect(headerButton('Wishlist 1')).toBeDefined()
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

        await user.click(screen.getByRole('button', { name: 'Wishlist 1' }))
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

        await user.click(screen.getByRole('button', { name: 'Wishlist 1' }))
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

        await user.click(screen.getByRole('button', { name: 'Wishlist 0' }))
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
        const opener = screen.getByRole('button', { name: 'Wishlist 0' })
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

        const opener = screen.getByRole('button', { name: 'Wishlist 1' })
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
            screen.getByRole('button', { name: 'Wishlist 0' })
        )
    })
})
