/**
 * The column on the right and the band under the gear: the readings, the
 * fight settings, the fight and pull charts with their sentences, where the
 * damage comes from, the stat weights, how sure the sim is, and the
 * provisional marker. The DOM helper must be the first import.
 */
import './dom'
import {
    chooseFight,
    chooseLength,
    lengthSelect,
    openFile,
    readingLabels,
    readingValue,
    sentence,
    shownFight,
    variant,
    type Json,
    type User,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, within } from '@testing-library/react'

import firstRun from '../src/sample-truncha-first-run.json'
import sample from '../src/sample-truncha.json'

type Result = Json & { gear: string; fight_id: string }

const SOLO = 'Solo, 30 s vs level 31'
const DUNGEON_SHORT = 'Dungeon, 30 s vs level 32'
const DUNGEON_LONG = 'Dungeon, 2 min vs level 33'
const CHAIN = 'Chain, 4 pulls 20 s apart vs level 33'
const MANA = 'Mana runs out at'
const TTD = 'Time to die vs a level 33 elite'
const TIME_CHART = 'DPS and mana over the fight'
const PULL_CHART = 'DPS and mana per pull'
const PROVISIONAL_TEXT =
    "The sim hasn't been checked against real fights yet. Treat these as estimates."
const SHOW_PLAN = "Show the sim's plan"

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

/**
 * A reading's value for what you wear and, in the plan view, the plan's;
 * back on what you wear after.
 */
async function values(user: User, label: string): Promise<(string | null)[]> {
    const worn = readingValue(label)
    await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
    const plan = readingValue(label)
    await user.click(screen.getByRole('button', { name: 'Show what I wear' }))
    return [worn, plan]
}

afterEach(() => {
    cleanup()
})

describe('the fight settings', () => {
    test("are the mockup's controls: enemy level, fight length, kind of fight, starting mana and time between pulls, on the 2-minute fight", async () => {
        await openFile(sample)

        expect(shownFight()).toBe(DUNGEON_LONG)
        const form = screen.getByRole('form', { name: 'Fight settings' })
        const level = within(form).getByRole('group', { name: 'Enemy level' })
        expect(
            within(level)
                .getAllByRole('radio')
                .map((radio) => [
                    radio.getAttribute('value'),
                    (radio as HTMLInputElement).checked,
                ])
        ).toEqual([
            ['31', false],
            ['32', false],
            ['33', true],
        ])
        expect((lengthSelect().textContent ?? '').trim()).toContain('2 minutes')
        const kind = within(form).getByRole('group', { name: 'Kind of fight' })
        const pvp = within(kind).getByRole('radio', {
            name: 'PvP',
        }) as HTMLInputElement
        expect(pvp.disabled).toBe(true)
        expect(
            (
                within(kind).getByRole('radio', {
                    name: 'PvE',
                }) as HTMLInputElement
            ).checked
        ).toBe(true)
        expect(within(form).getByText('PvP: Not simmed yet')).toBeDefined()
        const mana = within(form).getByRole('slider', {
            name: 'Starting mana',
        }) as HTMLInputElement
        expect(mana.value).toBe('1660')
        expect([mana.min, mana.max, mana.step]).toEqual(['600', '2400', '20'])
        const gap = within(form).getByRole('slider', {
            name: 'Time between pulls',
        }) as HTMLInputElement
        expect(gap.value).toBe('10')
        expect(gap.getAttribute('aria-valuetext')).toBe('10 s')
    })

    test("the fight length offers the mockup's lengths", async () => {
        const user = await openFile(sample)
        await user.click(lengthSelect())
        const options = await screen.findAllByRole('option')
        expect(options.map((option) => option.textContent?.trim())).toEqual([
            '30 seconds',
            '1 minute',
            '2 minutes',
            '3 minutes',
            '5 minutes',
        ])
        await user.keyboard('{Escape}')
    })

    test('under the enemy level, the miss sentence from the file (level 33, 0 hit)', async () => {
        const user = await openFile(sample)
        expect(
            screen.getByText(
                'With 0 hit, you miss 8.0% of melee swings at level 33.'
            )
        ).toBeDefined()
        await user.click(screen.getByRole('radio', { name: '31' }))
        expect(
            screen.getByText(
                'With 0 hit, you miss 5.5% of melee swings at level 31.'
            )
        ).toBeDefined()
    })

    test('without a miss chance in the file there is no miss sentence', async () => {
        await openFile(firstRun)
        expect(screen.queryByText(/of melee swings/)).toBeNull()
    })

    test('a combination the file has no fight for says Not simmed and keeps the last fight; picking one from the list goes there', async () => {
        const user = await openFile(sample)
        await user.click(screen.getByRole('radio', { name: '32' }))

        const status = screen.getByRole('status')
        expect(status.textContent).toContain('Not simmed for this combination.')
        expect(status.textContent).toContain(
            `Still showing ${DUNGEON_LONG}. The file has:`
        )
        expect(shownFight()).toBe(DUNGEON_LONG)
        expect(chart(TIME_CHART)).not.toBeNull()

        await chooseLength(user, '30 seconds')
        expect(shownFight()).toBe(DUNGEON_SHORT)
        expect(screen.queryByRole('status')).toBeNull()

        await chooseFight(user, CHAIN)
        expect(
            (
                screen.getByRole('slider', {
                    name: 'Time between pulls',
                }) as HTMLInputElement
            ).value
        ).toBe('20')
    })
})

describe('the chain fight', () => {
    test('shows out of mana times, the pull chart and the run-dry sentences', async () => {
        const user = await openFile(sample)
        await chooseFight(user, CHAIN)

        expect(await values(user, MANA)).toEqual(['1:58', '2:04'])
        expect(chart(PULL_CHART)).not.toBeNull()
        expect(chart(TIME_CHART)).toBeNull()
        expect(
            screen.getByText('In what you wear you run dry in pull 3.')
        ).toBeDefined()
        expect(
            screen.getByText("The sim's plan runs dry in pull 3.")
        ).toBeDefined()
    })

    test('a pull that runs dry can end a little above 0 mana: the pull is the one out_of_mana_s falls in', async () => {
        // As a real file has it: after 0 the sim regains a little, so the
        // dry pulls end at 28 mana, not 0.
        const user = await openFile(
            variant((file) => {
                for (const result of file.results as Result[]) {
                    if (result.fight_id !== 'chain-4') continue
                    for (const pull of result.pulls as Json[])
                        if (pull.mana_end === 0) pull.mana_end = 28
                }
            })
        )
        await chooseFight(user, CHAIN)

        // 1:58 and 2:04 fall in pull 3, 100 to 130 s from the start of pull 1.
        expect(
            screen.getByText('In what you wear you run dry in pull 3.')
        ).toBeDefined()
        expect(
            screen.getByText("The sim's plan runs dry in pull 3.")
        ).toBeDefined()
    })

    test('running dry in the gap after a pull says the next pull', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of file.results as Result[])
                    if (result.fight_id === 'chain-4' && result.gear === 'worn')
                        result.out_of_mana_s = 40
            })
        )
        await chooseFight(user, CHAIN)

        // 40 s is in the gap between pull 1 (0 to 30 s) and pull 2 (50 to
        // 80 s): you start pull 2 with no mana.
        expect(
            screen.getByText('In what you wear you run dry in pull 2.')
        ).toBeDefined()
    })

    test('a chain fight that never runs dry keeps mana through every pull', async () => {
        const user = await openFile(
            variant((file) => {
                for (const result of file.results as Result[]) {
                    if (result.fight_id !== 'chain-4') continue
                    result.out_of_mana_s = 'never'
                    for (const pull of result.pulls as Json[])
                        pull.mana_end = 100
                }
            })
        )
        await chooseFight(user, CHAIN)

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
        const user = await openFile(
            variant((file) => {
                for (const result of file.results as Result[])
                    if (result.fight_id === 'chain-4')
                        result.out_of_mana_s = null
            })
        )
        await chooseFight(user, CHAIN)

        expect(await values(user, MANA)).toEqual(['Not simmed', 'Not simmed'])
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
        const user = await openFile(
            variant((file) => {
                for (const result of file.results as Result[]) {
                    if (result.fight_id === 'chain-4') result.pulls = null
                }
            })
        )
        await chooseFight(user, CHAIN)

        expect(screen.getByText('No pull data in this file.')).toBeDefined()
    })
})

describe('the readings', () => {
    test("six readings in the mockup's order: solo and 2-minute DPS, mana, health, armor and time to die vs the fight's level", async () => {
        await openFile(sample)

        expect(
            screen.getByRole('heading', { name: 'What the sim says' })
        ).toBeDefined()
        expect(readingLabels()).toEqual([
            SOLO,
            DUNGEON_LONG,
            MANA,
            'Health',
            'Armor',
            TTD,
        ])
        // No sub-line under each value in the worn view.
        for (const label of readingLabels())
            expect(
                document.querySelector(
                    `[data-reading="${label}"] [data-reading-change]`
                )?.textContent
            ).toBe('')
    })

    test('the 2-minute fight reads what you wear, then Max damage in the plan view', async () => {
        const user = await openFile(sample)

        expect(await values(user, SOLO)).toEqual(['103.7', '118.4'])
        expect(await values(user, DUNGEON_LONG)).toEqual(['75.4', '84.1'])
        expect(await values(user, 'Health')).toEqual(['1375', '1310'])
        expect(await values(user, 'Armor')).toEqual(['952', '1010'])
        expect(await values(user, MANA)).toEqual(['0:48', '0:57'])
        expect(await values(user, TTD)).toEqual(['34', '31'])
    })

    test('solo and 2-minute DPS stay on every fight, as in the mockup; mana and time to die follow the fight', async () => {
        const user = await openFile(sample)
        await chooseFight(user, SOLO)

        expect(readingValue(SOLO)).toBe('103.7')
        expect(readingValue(DUNGEON_LONG)).toBe('75.4')
        expect(readingValue(MANA)).toBe('Never')
        expect(readingValue('Time to die vs a level 31 elite')).toBe('34')
    })

    test("a file without a short and a long single fight reads one DPS, the fight's", async () => {
        const user = await openFile(
            variant((file) => {
                for (const fight of file.fights as Json[])
                    if (fight.kind === 'single') fight.duration_s = 30
            })
        )
        await chooseFight(user, CHAIN)

        expect(readingValue(SOLO)).toBeNull()
        expect(readingValue(CHAIN)).toBe('82.0')
    })

    test('a null time to die reads Not simmed', async () => {
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

        expect(await values(user, TTD)).toEqual(['34', 'Not simmed'])
    })

    test('the first-run sample reads Not simmed for time to die and out of mana, and has no 2-minute timeline', async () => {
        await openFile(firstRun)

        expect(readingValue(TTD)).toBe('Not simmed')
        expect(readingValue(MANA)).toBe('Not simmed')
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
        expect(await values(user, MANA)).toEqual(['Never', 'Not simmed'])

        await chooseFight(user, SOLO)
        expect(await values(user, MANA)).toEqual(['1:01', 'Never'])
    })

    test('an out of mana time of 47.6 s reads 0:47', async () => {
        await openFile(
            variant((file) => {
                for (const result of resultsOf(file, 'worn', 'dungeon-long'))
                    result.out_of_mana_s = 47.6
            })
        )

        expect(readingValue(MANA)).toBe('0:47')
    })
})

describe('a file with no plans', () => {
    test('shows what you wear only, and no plan in the 2-minute chart', async () => {
        await openFile(
            variant((file) => {
                file.plans = []
                file.results = (file.results as Result[]).filter(
                    (result) => result.gear === 'worn'
                )
            })
        )
        expect(screen.queryByRole('button', { name: SHOW_PLAN })).toBeNull()
        expect(readingValue(DUNGEON_LONG)).toBe('75.4')
        expect(chart(TIME_CHART)).not.toBeNull()
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(document.body.textContent ?? '').not.toMatch(
            /The sim's plan (runs|holds|keeps|wasn't)/
        )
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
            screen.getByText(
                sentence('In what you wear you run out of mana at 0:48.')
            )
        ).toBeDefined()
        // The mockup's words, the plan compared with what you wear.
        expect(
            screen.getByText(sentence("The sim's plan holds out to 0:57."))
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
    test('Where the damage comes from is the solo fight, what you wear, coloured by school, Melee first and Lightning Shield last', async () => {
        await openFile(sample)

        const heading = screen.getByRole('heading', {
            name: 'Where the damage comes from',
        })
        const section = heading.closest('section') as HTMLElement
        expect(
            within(section).getByText(
                'Solo, 30 seconds vs level 31, what you wear. Colour is the spell school.'
            )
        ).toBeDefined()
        const lines = [...section.querySelectorAll('li')].map((line) =>
            (line.textContent ?? '').replace(/\s+/g, ' ').trim()
        )
        expect(lines[0]).toBe('Melee 33%')
        expect(lines.at(-1)).toBe('Lightning Shield 9%')
        expect(lines).toHaveLength(6)
    })

    test("the stat weights are the mockup's: solo solid, the 2-minute fight dashed, both values", async () => {
        await openFile(sample)

        expect(
            screen.getByRole('heading', {
                name: 'What a point of each stat is worth',
            })
        ).toBeDefined()
        expect(
            screen.getByText(
                'In attack power (1 attack power = 1). Dashed: in 2-minute dungeon fights, once you run dry.'
            )
        ).toBeDefined()
        const bars = screen.getByLabelText('Stat weights')
        expect(
            [...bars.querySelectorAll('dt')].map((term) => term.textContent)
        ).toEqual([
            'Strength',
            'Spell damage',
            'Hit rating',
            'Intellect',
            'Attack power',
            'Agility',
            'Crit rating',
            'Mana per 5',
        ])
        expect(bars.querySelectorAll('[data-bar="compare"]')).toHaveLength(2)
        expect(bars.textContent).toMatch(/Intellect1\.15 4\.04/)
        expect(
            screen.getByText(
                'Weapon DPS is worth 14.19 per point, off this scale.'
            )
        ).toBeDefined()
    })

    test('on the solo fight itself there is nothing dashed', async () => {
        const user = await openFile(sample)
        await chooseFight(user, SOLO)
        expect(
            screen
                .getByLabelText('Stat weights')
                .querySelectorAll('[data-bar="compare"]')
        ).toHaveLength(0)
        expect(screen.queryByText(/Dashed:/)).toBeNull()
    })

    test('a file with no solo weights says so', async () => {
        await openFile(
            variant((file) => {
                file.stat_weights = (
                    file.stat_weights as { fight_id: string }[]
                ).filter((entry) => entry.fight_id !== 'solo-hit-short')
            })
        )

        expect(
            screen.getByText('No stat weights for this fight.')
        ).toBeDefined()
    })
})

describe("the stat weights' source", () => {
    const withSource = (source: Json) =>
        variant((file) => {
            for (const entry of file.stat_weights as Json[])
                entry.source = structuredClone(source)
        })

    test('precomputed weights say so under the stat weights, with the spec, class and band', async () => {
        await openFile(
            withSource({ kind: 'precomputed', level_min: 30, level_max: 34 })
        )
        expect(
            screen.getByText(
                'Stat weights: precomputed for an Enhancement Shaman at level 30–34, not your gear.'
            )
        ).toBeDefined()
    })

    test('weights simmed for the gear say so', async () => {
        await openFile(withSource({ kind: 'yours' }))
        expect(
            screen.getByText('Stat weights: simmed for your gear.')
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

    test('items the sim left out are their own list, apart from the checks, and not counted with them', async () => {
        const user = await openFile(
            variant((file) => {
                file.left_out_items = [
                    {
                        item_id: 12345,
                        name: 'Made-up Helm',
                        reason: 'it has no source and needs level 1',
                    },
                    {
                        item_id: 23456,
                        name: 'Made-up Ring',
                        reason: 'it has no source.',
                    },
                ]
            })
        )
        await user.click(screen.getByText('How sure is this?'))

        expect(screen.getByText('14 checks passed, 0 failed.')).toBeDefined()
        const list = screen.getByRole('list', { name: 'Left out of the plan:' })
        expect(
            within(list)
                .getAllByRole('listitem')
                .map((item) => item.textContent)
        ).toEqual([
            'Made-up Helm (12345), because it has no source and needs level 1.',
            'Made-up Ring (23456), because it has no source.',
        ])
        expect(screen.queryByText(/^(Passed|Failed): Made-up/)).toBeNull()
    })

    test('with left_out_items absent or empty there is no left-out list', async () => {
        for (const items of [undefined, []]) {
            const user = await openFile(
                variant((file) => {
                    if (items === undefined) delete file.left_out_items
                    else file.left_out_items = items
                })
            )
            await user.click(screen.getByText('How sure is this?'))
            expect(screen.queryByText('Left out of the plan:')).toBeNull()
            expect(
                screen.queryByRole('list', { name: 'Left out of the plan:' })
            ).toBeNull()
            cleanup()
            // A new visit: the page would bring back the file it kept.
            localStorage.clear()
        }
    })

    test('the full sample shows its made-up left-out item', async () => {
        const user = await openFile(sample)
        await user.click(screen.getByText('How sure is this?'))
        const list = screen.getByRole('list', { name: 'Left out of the plan:' })
        expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    })

    test('the sample shows a Provisional marker by the readings and by the fight band, each described by its text', async () => {
        await openFile(sample)

        const texts = screen.getAllByText('Provisional').map((marker) => {
            const described = marker.closest('[aria-describedby]')
            expect(described).not.toBeNull()
            return (described?.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? '')
                .join(' ')
        })
        expect(texts).toEqual([
            PROVISIONAL_TEXT,
            'Sim numbers are estimates until matched to real fights.',
        ])
        expect(screen.getByText('Sim numbers are provisional.')).toBeDefined()
        const band = screen.getByRole('region', { name: 'Across the fight' })
        expect(within(band).getByText('Provisional')).toBeDefined()
    })

    test('a copy with provisional false shows no marker', async () => {
        await openFile(
            variant((file) => {
                file.provisional = false
            })
        )

        expect(
            screen.getByRole('complementary', { name: "The sim's numbers" })
        ).toBeDefined()
        expect(screen.queryByText('Provisional')).toBeNull()
        expect(screen.queryByText('Sim numbers are provisional.')).toBeNull()
    })
})
