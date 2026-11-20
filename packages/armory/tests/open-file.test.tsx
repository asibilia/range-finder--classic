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
/** The line under the character sheet, spaces as shown. */
function sheetLine(): string | undefined {
    const sheet = screen.getByLabelText('Character sheet')
    return sheet.parentElement?.querySelector('p')?.textContent ?? undefined
}

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

    test("Or look at a sample character loads Truncha with the design's header line: the name and level on one line", async () => {
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
        // The owner's design: `Level 30 Enhancement Shaman` beside the
        // name, and no weapon line or export date in the gear card's header.
        const card = document.querySelector('[data-slot="gear-pane"]')
        expect(card?.textContent).toContain('Level 30 Enhancement Shaman')
        expect(document.body.textContent).not.toContain(
            "Guardian's Dualblade with Windfury Weapon."
        )
        expect(
            screen.queryByText('Data exported', { exact: false })
        ).not.toBeNull() // the line under the sheet keeps the date
        expect(
            card?.querySelector('#gear-heading')?.parentElement?.textContent
        ).toBe('TrunchaLevel 30 Enhancement Shaman')
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

    test("the header has no weapon line, with or without an imbue (the owner's design)", async () => {
        await openFile(
            variant((file) => {
                for (const entry of file.slots as Json[]) delete entry.imbue
            })
        )

        // The weapon is the Two-hand tile; the header names no weapon.
        expect(document.body.textContent).not.toContain("Guardian's Dualblade.")
        expect(document.body.textContent).not.toContain('with Windfury Weapon')
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

    test("the middle has no placeholder figure, and the sheet is the owner's design's: short names, Wp. Skill last (its full name the game's Two-Handed Axes said short)", async () => {
        await openFile(sample)

        expect(screen.queryByText('Character model goes here')).toBeNull()
        const middle = document.querySelector('[data-slot="doll-middle"]')
        expect(middle?.querySelector('figure')).toBeNull()
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
            'Sp. Crit 7.32%',
            'Dodge 11.75%',
            'Hit 0%',
            'Armor 952',
            'Wp. Skill 148/150',
        ])
        expect(sheet.querySelector('abbr[title="Strength"]')).not.toBeNull()
        expect(sheet.querySelector('abbr[title="Spell crit"]')).not.toBeNull()
        expect(
            sheet.querySelector('abbr[title="Axe skill"]')?.textContent
        ).toBe('Wp. Skill')
        expect(sheetLine()).toBe(
            'Data exported Nov. 13, as worn, with the buffs you had up.'
        )
    })

    test('without a weapon skill the sheet leaves that line out; unbuffed says so', async () => {
        await openFile(
            variant((file) => {
                file.sheet_buffed = false
                delete (file.sheet as Json).weapon_skill
            })
        )

        const sheet = screen.getByLabelText('Character sheet')
        expect(sheet.textContent).not.toContain('Skill')
        expect(sheet.querySelectorAll('dt')).toHaveLength(11)
        expect(sheetLine()).toBe('Data exported Nov. 13, as worn.')
    })

    test('filtered_buffs renders Unbuffed sheet., all four how labels, and unsized health/mana note when calibration was not checked', async () => {
        await openFile(
            variant((file) => {
                file.sheet_buffed = false
                file.filtered_buffs = [
                    {
                        name: 'Arcane Intellect',
                        spell_id: 1461,
                        source: 'other player',
                        how: 'modelled',
                        how_detail: 'modelled',
                    },
                    {
                        name: "Warchief's Blessing",
                        spell_id: 16609,
                        source: 'not a player',
                        how: 'game_numbers',
                        how_detail: 'list',
                        numbers: { health: 300, mp5: 10, haste_pct: 15 },
                    },
                    {
                        name: 'Ghost Wolf',
                        spell_id: 2645,
                        source: 'self',
                        how: 'no_stats',
                        how_detail: 'no_stats (name rule)',
                    },
                    {
                        name: 'Camp Benefits',
                        spell_id: 1229741,
                        source: 'self',
                        how: 'unknown',
                        how_detail: 'unknown',
                    },
                ]
                ;(file.checks as Json[]).push({
                    name: 'calibration',
                    passed: false,
                    not_checked: true,
                    detail: "Solved from a sheet with a buff the sim can't size.",
                })
            })
        )

        expect(sheetLine()).toBe('Data exported Nov. 13, as worn.')
        expect(screen.getByText('Unbuffed sheet.')).toBeDefined()
        expect(
            screen.getByText(
                "Health and mana may include a buff the sim can't size."
            )
        ).toBeDefined()
        expect(screen.getByText('Buffs taken off the sheet:')).toBeDefined()
        expect(
            screen.getByText('Arcane Intellect: modelled by the sim')
        ).toBeDefined()
        expect(
            screen.getByText("Warchief's Blessing: the game's numbers")
        ).toBeDefined()
        expect(screen.getByText('Ghost Wolf: no stats')).toBeDefined()
        expect(
            screen.getByText("Camp Benefits: couldn't size it")
        ).toBeDefined()
    })
})
