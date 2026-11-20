/**
 * The talents and Pawn strings dialogs (spec section 11). The DOM helper
 * must be the first import.
 */
import './dom'
import { openFile, openSample, type User } from './open-app'

import { afterEach, describe, expect, jest, mock, test } from 'bun:test'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'

import sample from '../src/sample-truncha.json'
import firstRun from '../src/sample-truncha-first-run.json'

const SOLO_PAWN = sample.pawn[0]
const DUNGEON_PAWN = sample.pawn[1]
if (!SOLO_PAWN || !DUNGEON_PAWN) throw new Error('the sample has no pawn')

/** The talents pill on the character (both samples: 21 points, no dot). */
const TALENTS = 'Talents, 21 points'

async function openTalents(user: User): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: TALENTS }))
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

function mockClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
    })
}

afterEach(() => {
    // The Copy test runs on fake timers: what it left pending runs before
    // the page goes, and every test ends on real timers.
    if (jest.isFakeTimers()) act(() => jest.runOnlyPendingTimers())
    cleanup()
    jest.useRealTimers()
})

describe('the talents dialog', () => {
    test('the talents pill is named Talents, 21 points, with the main sample and the first-run one', async () => {
        await openSample()
        expect(screen.getByRole('button', { name: TALENTS })).toBeDefined()
        cleanup()
        localStorage.clear()
        await openFile(firstRun)
        expect(screen.getByRole('button', { name: TALENTS })).toBeDefined()
    })

    test('Talents opens a dialog with a Best simmed | Your build radio group (a segmented control) on Best simmed', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        const group = within(dialog).getByRole('group', {
            name: 'Which build to show',
        })
        const best = within(group).getByRole('radio', {
            name: 'Best simmed',
        }) as HTMLInputElement
        const yours = within(group).getByRole('radio', {
            name: 'Your build',
        }) as HTMLInputElement
        expect(best.checked).toBe(true)
        expect(yours.checked).toBe(false)
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

    test('Your build shows Flurry 4/5 and Anticipation 1/3, still ringed where the sim differs, and the points', async () => {
        const user = await openSample()
        const dialog = await openTalents(user)
        await user.click(
            within(dialog).getByRole('radio', { name: 'Your build' })
        )

        const flurry = within(dialog).getByLabelText('Flurry, 4/5')
        expect(within(flurry).getByText('4/5')).toBeDefined()
        const anticipation = within(dialog).getByLabelText('Anticipation, 1/3')
        expect(within(anticipation).getByText('1/3')).toBeDefined()
        expect(dialog.querySelectorAll('[data-changed="true"]')).toHaveLength(2)
        expect(
            within(dialog).getByText(
                'Your 21 points. Dashed rings mark where the sim would differ.'
            )
        ).toBeDefined()
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

    test("the dialog says what the best build moves and gains, in the mockup's words", async () => {
        const user = await openSample()
        const dialog = await openTalents(user)

        const line = dialog.querySelector('[data-best-build]')
        expect(line?.textContent).toBe(
            'Best simmed moves the point from Anticipation into Flurry 5/5: about +1.6 DPS solo.'
        )
        expect(
            [...(line?.querySelectorAll('b') ?? [])].map((b) => b.textContent)
        ).toEqual(['Anticipation', 'Flurry 5/5', '+1.6 DPS'])
    })

    test('with best null, Best simmed is disabled and explains that no best build was simmed', async () => {
        const user = await openFile(firstRun)
        const dialog = await openTalents(user)

        const best = within(dialog).getByRole('radio', {
            name: 'Best simmed',
        }) as HTMLInputElement
        const yours = within(dialog).getByRole('radio', {
            name: 'Your build',
        }) as HTMLInputElement
        expect(best.disabled).toBe(true)
        expect(yours.checked).toBe(true)
        expect(
            within(dialog).getByText(
                'Your 21 points. Best simmed: Not simmed yet; this file has no best build.'
            )
        ).toBeDefined()
        expect(within(dialog).queryByText(/^Best simmed moves/)).toBeNull()
    })
})

describe('the Pawn strings dialog', () => {
    test('Export Pawn string opens Pawn strings with the how-to and each string under its label', async () => {
        const user = await openSample()
        const dialog = await openPawn(user)

        expect(
            within(dialog).getByText(
                'In the game, open Pawn, then Scale, then Import, and paste one.'
            )
        ).toBeDefined()
        for (const pawn of [SOLO_PAWN, DUNGEON_PAWN]) {
            const heading = within(dialog).getByRole('heading', {
                level: 3,
                name: pawn.label,
            })
            const item = heading.closest('li') as HTMLElement
            expect(item.querySelector('pre')?.textContent).toBe(pawn.text)
        }
        expect(
            within(dialog)
                .getAllByRole('button', { name: /^Copy / })
                .map((button) => button.textContent)
        ).toEqual(['Copy solo string', 'Copy dungeon string'])
    })

    test('Copy writes the string and says Copied beside the button for 2.4 seconds', async () => {
        const user = await openSample()
        const dialog = await openPawn(user)
        const writeText = mock((_text: string) => Promise.resolve())
        mockClipboard(writeText)

        // The note's 2.4 seconds pass on fake timers, not real ones.
        jest.useFakeTimers()
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Copy solo string' })
        )

        expect(writeText).toHaveBeenCalledWith(SOLO_PAWN.text)
        // The note shows once the clipboard write's promise settles.
        await act(async () => {})
        expect(within(dialog).getByText('Copied')).toBeDefined()
        act(() => {
            jest.advanceTimersByTime(2000)
        })
        expect(within(dialog).getByText('Copied')).toBeDefined()
        act(() => {
            jest.advanceTimersByTime(400)
        })
        expect(within(dialog).queryByText('Copied')).toBeNull()
        expect(
            within(dialog).getByRole('button', { name: 'Copy solo string' })
        ).toBeDefined()
    })

    test('a rejected clipboard write says how to copy by hand', async () => {
        const user = await openSample()
        const writeText = mock((_text: string) =>
            Promise.reject(new Error('denied'))
        )
        mockClipboard(writeText)
        const dialog = await openPawn(user)

        await user.click(
            within(dialog).getByRole('button', { name: 'Copy dungeon string' })
        )

        expect(
            await within(dialog).findByText(
                'Copy failed. Select the text and copy it by hand.'
            )
        ).toBeDefined()
    })
})

describe('keyboard', () => {
    test('the talents dialog takes focus, keeps Tab inside, closes on Escape and gives focus back', async () => {
        const user = await openSample()
        const opener = screen.getByRole('button', { name: TALENTS })
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
