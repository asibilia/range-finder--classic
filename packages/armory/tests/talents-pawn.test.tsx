/**
 * The talents and Pawn strings dialogs (spec section 11). The DOM helper
 * must be the first import.
 */
import './dom'

import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../src/app'
import sample from '../src/sample-truncha.json'
import firstRun from '../src/sample-truncha-first-run.json'

type User = ReturnType<typeof userEvent.setup>

const SOLO_PAWN = sample.pawn[0]
const DUNGEON_PAWN = sample.pawn[1]
if (!SOLO_PAWN || !DUNGEON_PAWN) throw new Error('the sample has no pawn')

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
    await screen.findByRole('heading', { level: 1 })
    return user
}

async function openTalents(user: User): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: 'Talents' }))
    return screen.getByRole('dialog', { name: 'Talents' })
}

async function openPawn(user: User): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: 'Export Pawn string' }))
    return screen.getByRole('dialog', { name: 'Pawn strings' })
}

/** The talent elements: everything labelled `Name, rank/max...`. */
function talents(dialog: HTMLElement): HTMLElement[] {
    return Array.from(
        dialog.querySelectorAll<HTMLElement>('[aria-label]')
    ).filter((element) =>
        /^[^,]+, \d+\/\d+(, changed from \d+\/\d+)?$/.test(
            element.getAttribute('aria-label') ?? ''
        )
    )
}

function talentNamed(dialog: HTMLElement, name: string): HTMLElement {
    const found = talents(dialog).find((element) =>
        (element.getAttribute('aria-label') ?? '').startsWith(`${name}, `)
    )
    if (!found) throw new Error(`no talent named ${name}`)
    return found
}

function changedFlag(element: HTMLElement): string | null {
    return (
        element.closest('[data-changed]')?.getAttribute('data-changed') ?? null
    )
}

const ROW = '[role="row"], tr'
const CELL = '[role="gridcell"], [role="cell"], td'

/** The 1-based row and column of a talent in the tree grid. */
function gridPlace(element: HTMLElement): { row: number; column: number } {
    const row = element.closest<HTMLElement>(ROW)
    const cell = element.closest<HTMLElement>(CELL)
    if (!row || !cell) throw new Error('the talent is not in a grid cell')
    const grid = row.closest<HTMLElement>(
        '[role="grid"], [role="table"], table'
    )
    if (!grid) throw new Error('the talent is not in a grid')

    const rowIndex = row.getAttribute('aria-rowindex')
    const rows = Array.from(grid.querySelectorAll<HTMLElement>(ROW)).filter(
        (candidate) => candidate.querySelector(CELL) !== null
    )
    const colIndex = cell.getAttribute('aria-colindex')
    const cells = Array.from(row.querySelectorAll<HTMLElement>(CELL))

    return {
        row: rowIndex ? Number(rowIndex) : rows.indexOf(row) + 1,
        column: colIndex ? Number(colIndex) : cells.indexOf(cell) + 1,
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function mockClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
    })
}

afterEach(() => {
    cleanup()
})

describe('the talents dialog', () => {
    test('Talents opens a dialog with 21 points and a Build radio group on Best simmed', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        expect(within(dialog).getByText('21 points')).toBeDefined()
        const group = within(dialog).getByRole('radiogroup', { name: 'Build' })
        const best = within(group).getByRole('radio', { name: 'Best simmed' })
        const yours = within(group).getByRole('radio', { name: 'Your build' })
        expect((best as HTMLInputElement).checked).toBe(true)
        expect((yours as HTMLInputElement).checked).toBe(false)
    })

    test('Best simmed marks Flurry 5/5 changed from 4/5 and Anticipation 0/3 changed', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        const flurry = within(dialog).getByLabelText(
            'Flurry, 5/5, changed from 4/5'
        )
        expect(within(flurry).getByText('5/5')).toBeDefined()
        expect(changedFlag(flurry)).toBe('true')

        const anticipation = talentNamed(dialog, 'Anticipation')
        expect(within(anticipation).getByText('0/3')).toBeDefined()
        expect(changedFlag(anticipation)).toBe('true')

        const stormstrike = talentNamed(dialog, 'Stormstrike')
        expect(stormstrike.getAttribute('aria-label')).toBe('Stormstrike, 1/1')
        expect(changedFlag(stormstrike)).not.toBe('true')
    })

    test('Your build shows Flurry 4/5 and Anticipation 1/3 with nothing marked changed', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)
        await user.click(
            within(dialog).getByRole('radio', { name: 'Your build' })
        )

        const flurry = within(dialog).getByLabelText('Flurry, 4/5')
        expect(within(flurry).getByText('4/5')).toBeDefined()
        const anticipation = within(dialog).getByLabelText('Anticipation, 1/3')
        expect(within(anticipation).getByText('1/3')).toBeDefined()
        expect(dialog.querySelectorAll('[data-changed="true"]')).toHaveLength(0)
    })

    test('talents sit by tier and column, 18 in the grid', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        expect(talents(dialog)).toHaveLength(18)
        expect(gridPlace(talentNamed(dialog, "Earth's Grasp"))).toEqual({
            row: 1,
            column: 1,
        })
        expect(gridPlace(talentNamed(dialog, 'Stormstrike'))).toEqual({
            row: 4,
            column: 3,
        })
        expect(gridPlace(talentNamed(dialog, 'Rage of the Farseer'))).toEqual({
            row: 7,
            column: 2,
        })
    })

    test('the dialog says what the best build gains', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        expect(
            within(dialog).getByText(
                "The sim's best build: +1.6 DPS in Solo, 30 s, level 31."
            )
        ).toBeDefined()
    })

    test('with best null, Best simmed is disabled, Your build is checked, and No best build in this file. shows', async () => {
        const user = await openFile(firstRun)
        const dialog = await openTalents(user)

        const best = within(dialog).getByRole('radio', { name: 'Best simmed' })
        const yours = within(dialog).getByRole('radio', { name: 'Your build' })
        expect((best as HTMLInputElement).disabled).toBe(true)
        expect((yours as HTMLInputElement).checked).toBe(true)
        expect(
            within(dialog).getByText('No best build in this file.')
        ).toBeDefined()
        expect(within(dialog).queryByText(/^The sim's best build/)).toBeNull()
    })
})

describe('the Pawn strings dialog', () => {
    test('Export Pawn string opens Pawn strings with the how-to and both strings in read-only text boxes', async () => {
        const user = await openSample()
        const dialog = await openPawn(user)

        expect(
            within(dialog).getByText(
                'In game: Pawn, then Scale, then Import. Paste one string.'
            )
        ).toBeDefined()
        for (const pawn of [SOLO_PAWN, DUNGEON_PAWN]) {
            const box = within(dialog).getByRole('textbox', {
                name: pawn.label,
            }) as HTMLInputElement | HTMLTextAreaElement
            expect(box.value).toBe(pawn.text)
            expect(box.readOnly).toBe(true)
        }
    })

    test('Copy writes the string, reads Copied, then Copy again after 2 seconds', async () => {
        const user = await openSample()
        const writeText = mock((_text: string) => Promise.resolve())
        mockClipboard(writeText)
        const dialog = await openPawn(user)

        const [first] = within(dialog).getAllByRole('button', { name: 'Copy' })
        if (!first) throw new Error('no Copy button')
        await user.click(first)

        expect(writeText).toHaveBeenCalledWith(SOLO_PAWN.text)
        expect(
            await within(dialog).findByRole('button', { name: 'Copied' })
        ).toBeDefined()
        await wait(1500)
        expect(
            within(dialog).getByRole('button', { name: 'Copied' })
        ).toBeDefined()
        await wait(800)
        expect(
            within(dialog).queryByRole('button', { name: 'Copied' })
        ).toBeNull()
        expect(
            within(dialog).getAllByRole('button', { name: 'Copy' })
        ).toHaveLength(2)
    })

    test('a rejected clipboard write reads Copy failed, then Copy again after 2 seconds', async () => {
        const user = await openSample()
        const writeText = mock((_text: string) =>
            Promise.reject(new Error('denied'))
        )
        mockClipboard(writeText)
        const dialog = await openPawn(user)

        const [first] = within(dialog).getAllByRole('button', { name: 'Copy' })
        if (!first) throw new Error('no Copy button')
        await user.click(first)

        expect(
            await within(dialog).findByRole('button', { name: 'Copy failed' })
        ).toBeDefined()
        await wait(1500)
        expect(
            within(dialog).getByRole('button', { name: 'Copy failed' })
        ).toBeDefined()
        await wait(800)
        expect(
            within(dialog).queryByRole('button', { name: 'Copy failed' })
        ).toBeNull()
        expect(
            within(dialog).getAllByRole('button', { name: 'Copy' })
        ).toHaveLength(2)
    })
})

describe('keyboard', () => {
    test('the talents dialog takes focus, keeps Tab inside, closes on Escape and gives focus back', async () => {
        const user = await openSample()
        const opener = screen.getByRole('button', { name: 'Talents' })
        const dialog = await openTalents(user)

        expect(document.activeElement).toBe(
            within(dialog).getByRole('button', { name: 'Close' })
        )
        for (let i = 0; i < 6; i++) {
            await user.tab()
            expect(dialog.contains(document.activeElement)).toBe(true)
        }
        for (let i = 0; i < 6; i++) {
            await user.tab({ shift: true })
            expect(dialog.contains(document.activeElement)).toBe(true)
        }

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(opener)
    })

    test('the Pawn dialog takes focus, keeps Tab inside, closes on Escape and gives focus back', async () => {
        const user = await openSample()
        const opener = screen.getByRole('button', {
            name: 'Export Pawn string',
        })
        const dialog = await openPawn(user)

        expect(document.activeElement).toBe(
            within(dialog).getByRole('button', { name: 'Close' })
        )
        for (let i = 0; i < 6; i++) {
            await user.tab()
            expect(dialog.contains(document.activeElement)).toBe(true)
        }
        for (let i = 0; i < 6; i++) {
            await user.tab({ shift: true })
            expect(dialog.contains(document.activeElement)).toBe(true)
        }

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(document.activeElement).toBe(opener)
    })
})
