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
import { alternative, squeeze } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

/**
 * A slot's name with its gap to the plan's item:
 * `<base>, 21.6 EP below the sim's best`.
 */
function gapName(base: string, gap: string): string {
    return `${base}, ${gap} below the sim's best`
}

/**
 * The gap badge in `element` that reads `text` (`↓ 23.6`, spaces aside).
 * Throws when there is none.
 */
function gapBadge(element: HTMLElement, text: string): HTMLElement {
    const found = [
        ...element.querySelectorAll<HTMLElement>('[data-size]'),
    ].find((candidate) => squeeze(candidate.textContent) === squeeze(text))
    if (!found) throw new Error(`no gap badge reading ${text}`)
    return found
}

/** Whether `element` is a slot button (named `<Label>: …`). */
function isSlot(element: Element): boolean {
    return /^(?!Best: |Next: )[A-Z][\w -]*: /.test(
        element.getAttribute('aria-label') ?? ''
    )
}

/**
 * The `Best: <item>` line under the slot `button`, spaces taken out, or
 * null when the slot has none.
 */
function bestLine(button: HTMLElement): string | null {
    for (let box = button.parentElement; box; box = box.parentElement) {
        if ([...box.querySelectorAll('button')].filter(isSlot).length > 1)
            return null
        const line = [...box.querySelectorAll('p')].find((candidate) =>
            squeeze(candidate.textContent).startsWith('Best:')
        )
        if (line) return squeeze(line.textContent)
    }
    return null
}

const HANDS = gapName('Hands: Toughened Leather Gloves', '21.6 EP')
const NECK = gapName("Neck: Archmagister's Faceted Pendant", '1.7 EP')
const LEGS = gapName("Legs: Trapper's Leather Legguards", '23.6 EP')
const FINGER_1 = gapName('Finger 1: Seal of Sylvanas', '19.2 EP')
const FINGER_2 = gapName('Finger 2: Unnamed ring (6748)', '15.5 EP')
/** The plan's Back item, Sergeant Major's Cape. */
const PLAN_BACK = 16315

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

function gapSize(slot: HTMLElement, gap: string): string | null {
    return gapBadge(slot, gap).getAttribute('data-size')
}

async function closeDialog(user: User, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
}

afterEach(() => {
    cleanup()
})

describe('gaps on the slots', () => {
    test('Legs shows ↓ 23.6 and Best: Ferine Leggings', async () => {
        await openSample()
        const legs = screen.getByRole('button', { name: LEGS })

        expect(gapBadge(legs, '↓ 23.6')).toBeDefined()
        expect(bestLine(legs)).toBe(squeeze('Best: Ferine Leggings'))
    })

    test('Two-hand shows ↓ 6.0 DPS and Best: Corpsemaker', async () => {
        await openSample()
        const mainHand = screen.getByRole('button', {
            name: gapName("Two-hand: Guardian's Dualblade", '6.0 DPS'),
        })

        expect(gapBadge(mainHand, '↓ 6.0 DPS')).toBeDefined()
        expect(bestLine(mainHand)).toBe(squeeze('Best: Corpsemaker'))
    })

    test('the Neck gap is drawn small and the Legs gap big', async () => {
        await openSample()

        expect(
            gapSize(screen.getByRole('button', { name: NECK }), '↓ 1.7')
        ).toBe('small')
        expect(
            gapSize(screen.getByRole('button', { name: LEGS }), '↓ 23.6')
        ).toBe('big')
    })

    test("the plan's Back item with gain_ep 0 shows no gap, no Best: line and the worn source text", async () => {
        const changed = variant((file) => {
            alternative(file, 'back', PLAN_BACK).gain_ep = 0
        })

        // The unchanged sample shows the Back gap, so the copy's lack of
        // one comes from the zero gain.
        await openSample()
        const before = screen.getByRole('button', {
            name: gapName('Back: Unnamed cloak (279848)', '6.2 EP'),
        })
        expect(gapBadge(before, '↓ 6.2')).toBeDefined()
        expect(bestLine(before)).toBe(squeeze("Best: Sergeant Major's Cape"))
        cleanup()

        await openFile(changed)
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })

        expect(pills(slot)).toEqual([])
        expect(bestLine(slot)).toBeNull()
        expect(within(slot).getByText('Source unknown')).toBeDefined()
    })

    test("the plan's Back item gaining 0.04 EP, shown as 0.0, shows no gap, no Best: line and the worn source text", async () => {
        await openFile(
            variant((file) => {
                alternative(file, 'back', PLAN_BACK).gain_ep = 0.04
            })
        )
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })

        expect(pills(slot)).toEqual([])
        expect(bestLine(slot)).toBeNull()
        expect(within(slot).getByText('Source unknown')).toBeDefined()
    })

    test("the plan's Back item with no gain_ep and no gain_dps shows no gap, here or in the picker", async () => {
        const user = await openFile(
            variant((file) => {
                const cape = alternative(file, 'back', PLAN_BACK)
                cape.gain_ep = null
                cape.gain_dps = null
            })
        )
        const slot = screen.getByRole('button', {
            name: 'Back: Unnamed cloak (279848)',
        })
        expect(pills(slot)).toEqual([])
        expect(bestLine(slot)).toBeNull()

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

describe('Equip', () => {
    test('puts the bag item on: the slot, the numbers and the card change; Undo puts it back', async () => {
        const user = await openSample()
        expect(readingValue('Dungeon')).toBe('75.4')

        await user.click(screen.getByRole('button', { name: 'Equip' }))

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
        expect(screen.getByRole('button', { name: 'Equip' })).toBeDefined()
    })

    test('a bag upgrade without results (not simmed) has no Equip button', async () => {
        await openFile(
            variant((file) => {
                for (const upgrade of file.bag_upgrades as Record<
                    string,
                    unknown
                >[])
                    delete upgrade.results
            })
        )
        const equip = screen.queryByRole('button', { name: 'Equip' })
        expect(equip !== null).toBe(false)
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
