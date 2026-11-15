/**
 * The card on the right: the fight picker and its settings, the readings
 * table, the fight and pull charts with their sentences, where the damage
 * comes from, the stat weights, how sure the sim is, and the provisional
 * marker. The DOM helper must be the first import.
 */
import './dom'
import {
    chooseFight,
    fightOptions,
    fightSelect,
    openFile,
    readingRow,
    shownFight,
    variant,
    type Json,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'

import firstRun from '../src/sample-truncha-first-run.json'
import sample from '../src/sample-truncha.json'

type Result = Json & { gear: string; fight_id: string }

const SOLO = 'Solo, 30 s, level 31'
const DUNGEON_SHORT = 'Dungeon, 30 s, level 32'
const DUNGEON_LONG = 'Dungeon, 2 min, level 33'
const CHAIN = 'Chain, 4 pulls 20 s apart, level 33'
const TIME_CHART = 'DPS and mana over the fight'
const PULL_CHART = 'DPS and mana per pull'
const PROVISIONAL_TEXT = "The sim isn't checked against real fights yet."

/** The results entries of a file copy that match `gear` and `fight_id`. */
function resultsOf(file: Json, gear: string, fightId: string): Result[] {
    return (file.results as Result[]).filter(
        (result) => result.gear === gear && result.fight_id === fightId
    )
}

function chart(name: string): Element | null {
    const found = screen.queryByLabelText(name)
    if (found && found.tagName.toLowerCase() !== 'svg')
        throw new Error(`${name} is not an SVG`)
    return found
}

afterEach(() => {
    cleanup()
})

describe('the fight picker', () => {
    test('lists the four fights and starts on the chain fight', async () => {
        const user = await openFile(sample)

        expect(shownFight()).toBe(CHAIN)
        expect(await fightOptions(user)).toEqual([
            SOLO,
            DUNGEON_SHORT,
            DUNGEON_LONG,
            CHAIN,
        ])
        expect(fightSelect().getAttribute('aria-expanded')).not.toBe('true')
    })

    test('the 2-minute fight shows its settings as read-only text', async () => {
        const user = await openFile(sample)
        await chooseFight(user, DUNGEON_LONG)

        for (const text of [
            'Target level 33',
            'Fight length 2:00',
            'Starting mana 100%',
            'Being hit: no',
            'Pulls: 1',
            'Gap between pulls: 0 s',
            'Drinks between pulls: no',
            'Target armor 1200',
        ]) {
            const element = screen.getByText(text)
            expect(
                element.closest('input, select, textarea, [contenteditable]')
            ).toBeNull()
        }
        expect(screen.getAllByRole('combobox')).toHaveLength(1)
        expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
        expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    })
})

describe('the chain fight', () => {
    test('shows pull length, pulls, out of mana times, the pull chart and the run-dry sentences', async () => {
        await openFile(sample)

        expect(screen.getByText('Pull length 0:30')).toBeDefined()
        expect(screen.getByText('Pulls: 4')).toBeDefined()
        expect(readingRow('Out of mana at')).toEqual(['1:58', '2:04'])
        expect(chart(PULL_CHART)).not.toBeNull()
        expect(chart(TIME_CHART)).toBeNull()
        expect(
            screen.getByText('In what you wear you run dry in pull 3.')
        ).toBeDefined()
        expect(
            screen.getByText("The sim's plan runs dry in pull 3.")
        ).toBeDefined()
    })

    test('a chain fight that never runs dry keeps mana through every pull', async () => {
        await openFile(
            variant((file) => {
                for (const result of file.results as Result[]) {
                    if (result.fight_id !== 'chain-4') continue
                    result.out_of_mana_s = 'never'
                    for (const pull of result.pulls as Json[])
                        pull.mana_end = 100
                }
            })
        )

        expect(
            screen.getByText(
                'In what you wear you keep mana through every pull.'
            )
        ).toBeDefined()
        expect(
            screen.getByText("The sim's plan keeps mana through every pull.")
        ).toBeDefined()
    })

    test('a chain fight with out of mana not simmed says the sim did not check it', async () => {
        await openFile(
            variant((file) => {
                for (const result of file.results as Result[])
                    if (result.fight_id === 'chain-4')
                        result.out_of_mana_s = null
            })
        )

        expect(readingRow('Out of mana at')).toEqual([
            'Not simmed',
            'Not simmed',
        ])
        expect(
            screen.getByText(
                "In what you wear the sim didn't check when mana runs out."
            )
        ).toBeDefined()
        expect(
            screen.getByText(
                "The sim's plan wasn't checked for running out of mana."
            )
        ).toBeDefined()
    })

    test('a chain fight with pulls null says there is no pull data', async () => {
        await openFile(
            variant((file) => {
                for (const result of file.results as Result[]) {
                    if (result.fight_id === 'chain-4') result.pulls = null
                }
            })
        )

        expect(screen.getByText('No pull data in this file.')).toBeDefined()
    })
})

describe('the readings table', () => {
    test('the 2-minute fight reads what you wear against Max damage', async () => {
        const user = await openFile(sample)

        expect(
            screen.getByRole('heading', { name: 'What the sim says' })
        ).toBeDefined()
        expect(
            screen.getByRole('columnheader', { name: 'Max damage' })
        ).toBeDefined()

        await chooseFight(user, DUNGEON_LONG)

        expect(readingRow('DPS')).toEqual(['75.4', '84.1'])
        expect(readingRow('Health')).toEqual(['1375', '1310'])
        expect(readingRow('Armor')).toEqual(['952', '1010'])
        expect(readingRow('Out of mana at')).toEqual(['0:48', '0:57'])
        expect(readingRow('Time to die')).toEqual(['34 s', '31 s'])
    })

    test('choosing the solo fight changes DPS and reads Never for out of mana', async () => {
        const user = await openFile(sample)
        await chooseFight(user, SOLO)

        expect(readingRow('DPS')).toEqual(['103.7', '118.4'])
        expect(readingRow('Out of mana at')).toEqual(['Never', 'Never'])
    })

    test('a null time to die beside one that is simmed reads Not simmed', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of resultsOf(
                    file,
                    'max-damage',
                    'dungeon-long'
                ))
                    result.time_to_die_s = null
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(readingRow('Time to die')).toEqual(['34 s', 'Not simmed'])
    })

    test('the first-run sample has no Time to die row and no 2-minute timeline', async () => {
        const user = await openFile(firstRun)

        expect(readingRow('DPS')).not.toBeNull()
        expect(readingRow('Time to die')).toBeNull()

        await chooseFight(user, DUNGEON_LONG)

        expect(readingRow('Time to die')).toBeNull()
        expect(
            screen.getByText('No fight timeline in this file.')
        ).toBeDefined()
    })

    test('out of mana reads m:ss for a time, Never for never and Not simmed for null', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of resultsOf(file, 'worn', 'dungeon-long'))
                    result.out_of_mana_s = 'never'
                for (const result of resultsOf(
                    file,
                    'max-damage',
                    'dungeon-long'
                ))
                    result.out_of_mana_s = null
                for (const result of resultsOf(file, 'worn', 'solo-hit-short'))
                    result.out_of_mana_s = 61
            })
        )
        await chooseFight(user, DUNGEON_LONG)
        expect(readingRow('Out of mana at')).toEqual(['Never', 'Not simmed'])

        await chooseFight(user, SOLO)
        expect(readingRow('Out of mana at')).toEqual(['1:01', 'Never'])
    })

    test('the first-run sample reads Not simmed for out of mana', async () => {
        await openFile(firstRun)

        expect(readingRow('Out of mana at')).toEqual([
            'Not simmed',
            'Not simmed',
        ])
    })

    test('an out of mana time of 47.6 s reads 0:47', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of resultsOf(file, 'worn', 'dungeon-long'))
                    result.out_of_mana_s = 47.6
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(readingRow('Out of mana at')).toEqual(['0:47', '0:57'])
    })
})

describe('a file with no plans', () => {
    test('shows only the What you wear column and no plan in the 2-minute chart', async () => {
        const user = await openFile(
            variant((file) => {
                file.plans = []
                file.results = (file.results as Result[]).filter(
                    (result) => result.gear === 'worn'
                )
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.queryByRole('columnheader', { name: 'Max damage' })
        ).toBeNull()
        expect(readingRow('DPS')).toEqual(['75.4'])
        expect(chart(TIME_CHART)).not.toBeNull()
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(screen.queryByText(/^The sim's plan/)).toBeNull()
    })
})

describe('the fight chart', () => {
    test('the 2-minute fight draws the chart with its legend and out-of-mana markers', async () => {
        const user = await openFile(sample)
        await chooseFight(user, DUNGEON_LONG)

        expect(chart(TIME_CHART)).not.toBeNull()
        expect(chart(PULL_CHART)).toBeNull()
        for (const entry of [
            'DPS, what you wear',
            "DPS, sim's plan",
            'Mana, what you wear',
            "Mana, sim's plan",
        ])
            expect(screen.getByText(entry)).toBeDefined()
        expect(screen.getByText('Worn: out of mana 0:48')).toBeDefined()
        expect(screen.getByText('Plan: out of mana 0:57')).toBeDefined()
    })

    test('the 2-minute fight says when each runs out of mana', async () => {
        const user = await openFile(sample)
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.getByText('In what you wear you run out of mana at 0:48.')
        ).toBeDefined()
        expect(
            screen.getByText("The sim's plan runs out at 0:57.")
        ).toBeDefined()
    })

    test('the solo fight has no timeline and no chart', async () => {
        const user = await openFile(sample)
        await chooseFight(user, SOLO)

        expect(
            screen.getByText('No fight timeline in this file.')
        ).toBeDefined()
        expect(chart(TIME_CHART)).toBeNull()
        expect(chart(PULL_CHART)).toBeNull()
    })

    test('worn gear that never runs dry keeps mana to the end', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of resultsOf(file, 'worn', 'dungeon-long'))
                    result.out_of_mana_s = 'never'
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.getByText('In what you wear you keep mana to the end.')
        ).toBeDefined()
        expect(screen.queryByText('Worn: out of mana 0:48')).toBeNull()
    })

    test('a plan that never runs dry keeps mana to the end', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of resultsOf(
                    file,
                    'max-damage',
                    'dungeon-long'
                ))
                    result.out_of_mana_s = 'never'
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.getByText("The sim's plan keeps mana to the end.")
        ).toBeDefined()
    })

    test('out of mana not simmed says the sim did not check it, with no marker', async () => {
        const user = await openFile(
            variant((file) => {
                for (const gear of ['worn', 'max-damage'])
                    for (const result of resultsOf(file, gear, 'dungeon-long'))
                        result.out_of_mana_s = null
            })
        )
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.getByText(
                "In what you wear the sim didn't check when mana runs out."
            )
        ).toBeDefined()
        expect(
            screen.getByText(
                "The sim's plan wasn't checked for running out of mana."
            )
        ).toBeDefined()
        expect(screen.queryByText(/: out of mana \d/)).toBeNull()
        expect(screen.queryByText(/keep mana|keeps mana/)).toBeNull()
    })
})

describe('the damage split and stat weights', () => {
    test('Where the damage comes from lists Melee first and Lightning Shield last', async () => {
        await openFile(sample)

        expect(
            screen.getByRole('heading', { name: 'Where the damage comes from' })
        ).toBeDefined()
        const lines = screen
            .getAllByText(
                /^(Melee|Windfury|Flame Shock|Stormstrike|Earth Shock|Lightning Shield) \d+%$/
            )
            .map((line) => line.textContent)
        expect(lines[0]).toBe('Melee 33%')
        expect(lines.at(-1)).toBe('Lightning Shield 9%')
        expect(lines).toHaveLength(6)
    })

    test('the stat weights are in attack power, with Intellect and Mana per 5 s on the 2-minute fight', async () => {
        const user = await openFile(sample)
        await chooseFight(user, DUNGEON_LONG)

        expect(
            screen.getByRole('heading', {
                name: 'What a point of each stat is worth',
            })
        ).toBeDefined()
        expect(
            screen.getByText('In attack power (1 attack power = 1).')
        ).toBeDefined()
        const page = document.body.textContent ?? ''
        expect(page).toMatch(/Intellect\s*:?\s*4\.04(?!\d)/)
        expect(page).toMatch(/Mana per 5 s\s*:?\s*3\.89(?!\d)/)
    })

    test('a fight with no stat weights says so', async () => {
        await openFile(sample)

        expect(
            screen.getByText('No stat weights for this fight.')
        ).toBeDefined()
    })
})

describe('how sure the sim is', () => {
    test('How sure is this? opens to the counts and one line per check', async () => {
        const user = await openFile(sample)
        await user.click(screen.getByText('How sure is this?'))

        expect(screen.getByText('14 checks passed, 0 failed.')).toBeDefined()
        expect(
            screen.getByText('Passed: sheet strength. Matches the game.')
        ).toBeDefined()
    })

    test('a copy with one failed check counts it and lists it as Failed', async () => {
        const user = await openFile(
            variant((file) => {
                const checks = file.checks as Json[]
                checks[1] = {
                    name: 'sheet strength',
                    passed: false,
                    detail: 'Off by 2.',
                }
            })
        )
        await user.click(screen.getByText('How sure is this?'))

        expect(screen.getByText('13 checks passed, 1 failed.')).toBeDefined()
        expect(screen.getByText(/^Failed: /).textContent).toBe(
            'Failed: sheet strength. Off by 2.'
        )
    })

    test('the sample shows the Provisional marker described by its text', async () => {
        await openFile(sample)

        const marker = screen.getByText('Provisional')
        const described = marker.closest('[aria-describedby]')
        expect(described).not.toBeNull()
        const ids = (described?.getAttribute('aria-describedby') ?? '').split(
            /\s+/
        )
        const text = ids
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        expect(text).toContain(PROVISIONAL_TEXT)
    })

    test('a copy with provisional false shows no marker', async () => {
        await openFile(
            variant((file) => {
                file.provisional = false
            })
        )

        expect(
            screen.getByRole('heading', { name: 'What the sim says' })
        ).toBeDefined()
        expect(screen.queryByText('Provisional')).toBeNull()
    })
})
