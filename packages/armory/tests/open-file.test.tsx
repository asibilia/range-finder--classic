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

import { stopLines } from '../src/components/bring-in'
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
function slotLabelsInOrder(labels: string[] = SLOT_LABELS): string[] {
    const slots = labels.map((label) => ({
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

        expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Bring your character in',
            })
        ).toBeDefined()
        const input = screen.getByLabelText('Open a results file')
        expect(input.tagName).toBe('INPUT')
        expect(input.getAttribute('type')).toBe('file')

        const drop = screen.getByRole('region', { name: 'Drop a results file' })
        expect(drop.textContent).toContain('Drop your results file here')
        expect(drop.textContent).toContain('or select to open it')
        // The drop box is the file picker too.
        expect(drop.contains(input)).toBe(true)

        expect(
            screen.getByRole('button', {
                name: 'Or look at a sample character',
            })
        ).toBeDefined()
    })

    test('the picker takes .json and .lua, and the state says the export is simmed on this computer and never leaves it', () => {
        renderApp()

        const input = screen.getByLabelText('Open a results file')
        expect(input.getAttribute('accept')).toBe('.json,application/json,.lua')
        expect(
            screen.getByText(
                'Drop your TurboCharExport.lua here to sim your character on this computer. It never leaves your computer.'
            )
        ).toBeDefined()
        expect(
            screen.queryByText(
                'Simming your own export right here is coming later.'
            )
        ).toBeNull()
    })

    test('lists the three steps to bring a character in, in order', () => {
        renderApp()

        const section = screen
            .getByRole('heading', { level: 2, name: 'Bring your character in' })
            .closest('section')
        expect(section).not.toBeNull()
        const list = within(section as HTMLElement).getByRole('list')
        expect(list.tagName).toBe('OL')
        const steps = within(list).getAllByRole('listitem')
        expect(steps).toHaveLength(3)
        expect(steps[0]!.textContent).toContain('/tbexport')
    })

    test('the three steps are /tbexport, /reload, then drop TurboCharExport.lua from the SavedVariables folder', () => {
        renderApp()

        const section = screen
            .getByRole('heading', { level: 2, name: 'Bring your character in' })
            .closest('section')
        const list = within(section as HTMLElement).getByRole('list')
        const steps = within(list)
            .getAllByRole('listitem')
            .map((item) => item.textContent)
        expect(steps).toHaveLength(3)
        expect(steps[0]).toContain('type /tbexport in the game.')
        expect(steps.slice(1)).toEqual([
            'Type /reload so the game writes the file.',
            "Drop TurboCharExport.lua here. It's in your game folder, inside WTF, then Account, in your character's SavedVariables folder.",
        ])
    })

    test('the first step names the TurboCharExport addon, not Turbo', () => {
        renderApp()

        const section = screen
            .getByRole('heading', { level: 2, name: 'Bring your character in' })
            .closest('section')
        const list = within(section as HTMLElement).getByRole('list')
        expect(
            within(list)
                .getAllByRole('listitem')
                .map((item) => item.textContent)
        ).toEqual([
            'Install the TurboCharExport addon and type /tbexport in the game.',
            'Type /reload so the game writes the file.',
            "Drop TurboCharExport.lua here. It's in your game folder, inside WTF, then Account, in your character's SavedVariables folder.",
        ])
    })

    test('shows 17 empty slot buttons, no Wishlist or Talents button, and Export Pawn string disabled (as the mockup)', () => {
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
        expect(screen.queryByRole('button', { name: /^Talents/ })).toBeNull()
        const pawn = screen.getByRole('button', { name: 'Export Pawn string' })
        expect(pawn.hasAttribute('disabled')).toBe(true)
    })
})

describe('opening the wrong file', () => {
    test('an export of format 99 says to update the TurboCharExport addon', () => {
        expect(
            stopLines({ kind: 'format', format: 99, accepted: [7] })
        ).toEqual([
            'This export is format 99. The page reads formats 7. Update the TurboCharExport addon and export again.',
        ])
    })

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

    test('a file that cannot be read says so', async () => {
        const unreadable = new File([''], 'a-folder.json', {
            type: 'application/json',
        })
        Object.defineProperty(unreadable, 'text', {
            value: () => Promise.reject(new Error('NotReadableError')),
        })
        await pick(renderApp(), unreadable)

        expect(
            await screen.findByText("This file couldn't be read.")
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
            await screen.findByRole('heading', { name: 'Truncha' })
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
            await screen.findByRole('heading', { name: 'Truncha' })
        ).toBeDefined()
    })

    test('dropping the sample anywhere on the page loads it', async () => {
        renderApp()
        const file = jsonFile(sample)

        const over = fireEvent.dragOver(document.body, {
            dataTransfer: { files: [file] },
        })
        expect(over).toBe(false)
        const dropped = fireEvent.drop(document.body, {
            dataTransfer: { files: [file] },
        })
        expect(dropped).toBe(false)

        expect(
            await screen.findByRole('heading', { name: 'Truncha' })
        ).toBeDefined()
    })

    test('once a file is open, a drop on the page is ignored and the browser does not open it', async () => {
        await openFile(sample)
        const other = variant((file) => {
            ;(file.character as Json).name = 'Someone'
        })

        const dropped = fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(other)] },
        })
        expect(dropped).toBe(false)
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(screen.getByRole('heading', { name: 'Truncha' })).toBeDefined()
    })

    test("Or look at a sample character loads Truncha with the mockup's header line and export date", async () => {
        const user = renderApp()
        await user.click(
            screen.getByRole('button', {
                name: 'Or look at a sample character',
            })
        )

        expect(
            await screen.findByRole('heading', { name: 'Truncha' })
        ).toBeDefined()
        expect(
            screen.queryByRole('heading', { level: 1, name: 'Armory planner' })
        ).toBeNull()
        // The weapon line (on the gear card, under the character's name).
        expect(document.body.textContent).toContain(
            "Guardian's Dualblade with Windfury Weapon."
        )
        expect(
            screen.getByText(', from your export of 13 November', {
                exact: false,
            })
        ).toBeDefined()
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
    test('the slots run left column, right column, then the bottom row: Two-hand and Totem for a shaman with a two-hander, as the mockup', async () => {
        await openFile(sample)

        const labels = [...SLOT_LABELS.slice(0, 14), 'Two-hand', 'Totem']
        expect(slotLabelsInOrder([...labels].reverse())).toEqual(labels)
        expect(screen.queryByRole('button', { name: /^Off hand: / })).toBeNull()
        expect(
            screen.queryByRole('button', { name: /^Main hand: / })
        ).toBeNull()
    })

    test('a file with an off-hand item keeps Main hand and Off hand', async () => {
        await openFile(
            variant((file) => {
                const slots = file.slots as Json[]
                const main = slots.find((entry) => entry.slot === 'main_hand')
                const off = slots.find((entry) => entry.slot === 'off_hand')
                if (!main || !off) throw new Error('no weapon slots')
                off.worn = structuredClone(main.worn)
            })
        )

        const labels = [...SLOT_LABELS.slice(0, 16), 'Totem']
        expect(slotLabelsInOrder([...labels].reverse())).toEqual(labels)
    })

    test('the header names the weapon alone when the file has no imbue', async () => {
        await openFile(
            variant((file) => {
                for (const entry of file.slots as Json[]) delete entry.imbue
            })
        )

        // The weapon line, on the gear card.
        expect(document.body.textContent).toContain("Guardian's Dualblade.")
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

    test("the middle shows the model placeholder and the sheet as the mockup lays it out, Axe skill last (the game's Two-Handed Axes, said short)", async () => {
        await openFile(sample)

        expect(screen.getByText('Character model goes here')).toBeDefined()
        const sheet = screen.getByLabelText('Character sheet')
        const pairs = [...sheet.querySelectorAll('dt')].map(
            (term) =>
                `${term.textContent} ${term.nextElementSibling?.textContent}`
        )
        expect(pairs).toEqual([
            'Str 73',
            'Agi 96',
            'Sta 122',
            'Int 85',
            'Spi 103',
            'AP 289',
            'Crit 11.95%',
            'Spell crit 7.32%',
            'Dodge 11.75%',
            'Hit 0%',
            'Armor 952',
            'Axe skill 148/150',
        ])
        expect(sheet.querySelector('abbr[title="Strength"]')).not.toBeNull()
        expect(
            screen.getByText(
                'Sheet from your export of 13 November, as worn, with the buffs you had up.'
            )
        ).toBeDefined()
    })

    test('without a weapon skill the sheet leaves that line out; unbuffed says so', async () => {
        await openFile(
            variant((file) => {
                file.sheet_buffed = false
                delete (file.sheet as Json).weapon_skill
            })
        )

        const sheet = screen.getByLabelText('Character sheet')
        expect(sheet.textContent).not.toContain('skill')
        expect(sheet.querySelectorAll('dt')).toHaveLength(11)
        expect(
            screen.getByText('Sheet from your export of 13 November, as worn.')
        ).toBeDefined()
    })
})
