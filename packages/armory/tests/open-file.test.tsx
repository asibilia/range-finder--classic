/**
 * Opening a results file: the new-visitor state, picking, dropping or loading
 * the sample, the error messages, and the header and gear pane once a file
 * loads. The DOM helper must be the first import.
 */
import './dom'
import {
    jsonFile,
    openFile,
    pick,
    renderApp,
    variant,
    type Json,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

import sample from '../src/sample-truncha.json'

const SLOT_LABELS = [
    'Head',
    'Neck',
    'Shoulder',
    'Back',
    'Chest',
    'Wrist',
    'Hands',
    'Waist',
    'Legs',
    'Feet',
    'Finger 1',
    'Finger 2',
    'Trinket 1',
    'Trinket 2',
    'Main hand',
    'Off hand',
    'Relic',
]

const SAMPLE_NOTE =
    'Sample file: some numbers here are made up to try the page.'

/** Renders the page and picks `data`, a file the page should refuse. */
async function openWrongFile(data: unknown) {
    await pick(renderApp(), jsonFile(data))
}

/** The slot buttons' labels (the part before the colon), in page order. */
function slotLabelsInOrder(): string[] {
    const slots = SLOT_LABELS.map((label) => ({
        label,
        button: screen.getByRole('button', {
            name: new RegExp(`^${label}: `),
        }),
    }))
    return slots
        .sort((a, b) =>
            a.button.compareDocumentPosition(b.button) &
            Node.DOCUMENT_POSITION_FOLLOWING
                ? -1
                : 1
        )
        .map((slot) => slot.label)
}

afterEach(() => {
    cleanup()
})

describe('the new-visitor state', () => {
    test('shows the bring-your-character-in state with a picker, a drop target and the sample button', () => {
        renderApp()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Armory planner' })
        ).toBeDefined()
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Bring your character in',
            })
        ).toBeDefined()
        expect(
            screen.getByText(
                'Open a results file from the gear sim to see your character.'
            )
        ).toBeDefined()

        const input = screen.getByLabelText('Open a results file')
        expect(input.tagName).toBe('INPUT')
        expect(input.getAttribute('type')).toBe('file')
        expect(input.getAttribute('accept')).toBe('.json,application/json')

        const drop = screen.getByRole('region', { name: 'Drop a results file' })
        expect(within(drop).getByText('Or drop the file here.')).toBeDefined()

        expect(
            screen.getByText(
                'Simming your own export right here is coming later.'
            )
        ).toBeDefined()
        expect(
            screen.getByRole('button', { name: 'Look at a sample character' })
        ).toBeDefined()
    })

    test('lists the three steps to bring a character in, in order', () => {
        renderApp()

        const section = screen
            .getByRole('heading', { level: 2, name: 'Bring your character in' })
            .closest('section')
        expect(section).not.toBeNull()
        const list = within(section as HTMLElement).getByRole('list')
        expect(list.tagName).toBe('OL')
        expect(
            within(list)
                .getAllByRole('listitem')
                .map((item) => item.textContent)
        ).toEqual([
            'Install the Turbo addon and type /tbexport in the game.',
            'Run the gear sim on that export to get a results file.',
            'Open the results file here, or drop it on this page.',
        ])
    })

    test('shows 17 empty slot buttons and no Wishlist, Talents or Export Pawn string button', () => {
        renderApp()

        for (const label of SLOT_LABELS) {
            expect(
                screen.getByRole('button', { name: `${label}: Empty` })
            ).toBeDefined()
        }
        expect(
            screen.getAllByRole('button', { name: /^[A-Z][a-z0-9 ]*: Empty$/ })
        ).toHaveLength(17)

        expect(screen.queryByRole('button', { name: /^Wishlist/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Talents' })).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Export Pawn string' })
        ).toBeNull()
    })
})

describe('opening the wrong file', () => {
    test('a .json file that is not JSON says it is not JSON', async () => {
        await pick(
            renderApp(),
            new File(['this is { not json'], 'notes.json', {
                type: 'application/json',
            })
        )

        expect(
            await screen.findByText(
                "This file isn't a results file: it isn't JSON."
            )
        ).toBeDefined()
    })

    test('a file of schema version 2 names its version', async () => {
        await openWrongFile(
            variant((file) => {
                file.schema_version = 2
            })
        )

        expect(
            await screen.findByText(
                'This results file is version 2. The planner reads version 1.'
            )
        ).toBeDefined()
    })

    test('a file without character.level lists the problem by its path', async () => {
        await openWrongFile(
            variant((file) => {
                delete (file.character as Json).level
            })
        )

        expect(
            await screen.findByText(
                "This file isn't a results file the planner can read."
            )
        ).toBeDefined()
        expect(screen.getByText(/^character\.level: /)).toBeDefined()
    })

    test('picking the sample after an error shows the character and drops the error', async () => {
        const user = renderApp()
        await pick(
            user,
            jsonFile(
                variant((file) => {
                    file.schema_version = 2
                })
            )
        )
        await screen.findByText(
            'This results file is version 2. The planner reads version 1.'
        )

        await pick(user, jsonFile(sample))

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Truncha' })
        ).toBeDefined()
        expect(
            screen.queryByText(
                'This results file is version 2. The planner reads version 1.'
            )
        ).toBeNull()
    })
})

describe('loading a results file', () => {
    test('dropping the sample on the drop target loads it', async () => {
        renderApp()
        const drop = screen.getByRole('region', { name: 'Drop a results file' })
        const file = jsonFile(sample)

        fireEvent.dragOver(drop, { dataTransfer: { files: [file] } })
        fireEvent.drop(drop, { dataTransfer: { files: [file] } })

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Truncha' })
        ).toBeDefined()
        expect(
            screen.getByText('Level 30 Orc Enhancement Shaman')
        ).toBeDefined()
    })

    test('Look at a sample character loads Truncha with the level line and export date', async () => {
        const user = renderApp()
        await user.click(
            screen.getByRole('button', { name: 'Look at a sample character' })
        )

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Truncha' })
        ).toBeDefined()
        expect(
            screen.queryByRole('heading', { level: 1, name: 'Armory planner' })
        ).toBeNull()
        expect(
            screen.getByText('Level 30 Orc Enhancement Shaman')
        ).toBeDefined()
        expect(screen.getByText('From your export of 2026-11-13')).toBeDefined()
    })

    test('the sample says it holds made-up numbers', async () => {
        await openFile(sample)

        expect(screen.getByText(SAMPLE_NOTE)).toBeDefined()
    })

    test('a copy with sample false has no sample note', async () => {
        await openFile(
            variant((file) => {
                file.sample = false
            })
        )

        expect(screen.queryByText(SAMPLE_NOTE)).toBeNull()
    })
})

describe('the gear pane with a file', () => {
    test('the slots run left column, right column, then the bottom row', async () => {
        await openFile(sample)

        expect(slotLabelsInOrder()).toEqual(SLOT_LABELS)
    })

    test('shows the worn legs and an empty trinket slot', async () => {
        await openFile(sample)

        expect(
            screen.getByRole('button', {
                name: /^Legs: Trapper's Leather Legguards/,
            })
        ).toBeDefined()
        expect(
            screen.getByRole('button', { name: 'Trinket 1: Nothing equipped' })
        ).toBeDefined()
    })

    test('the middle shows the model placeholder, the sheet and the buffed note', async () => {
        await openFile(sample)

        expect(screen.getByText('Character model goes here')).toBeDefined()
        const page = document.body.textContent ?? ''
        expect(page).toMatch(/Strength\s*:?\s*73(?!\d)/)
        expect(page).toMatch(/Mana\s*:?\s*1660(?!\d)/)
        expect(
            screen.getByText(
                'Buffed sheet: as the game showed it at export, with the buffs you had up.'
            )
        ).toBeDefined()
        expect(screen.queryByText('Unbuffed sheet.')).toBeNull()
    })

    test('a copy with sheet_buffed false says Unbuffed sheet.', async () => {
        await openFile(
            variant((file) => {
                file.sheet_buffed = false
            })
        )

        expect(screen.getByText('Unbuffed sheet.')).toBeDefined()
    })
})
