/**
 * The data each chart is given (`src/chart-data.ts`), apart from how
 * Recharts draws it: the fight chart's series and out-of-mana markers, the
 * pull chart's groups, the damage split's parts and the stat weights' bars.
 */
import { describe, expect, test } from 'bun:test'

import {
    fightChartData,
    pullChartData,
    splitParts,
    statWeightsData,
    timeTicks,
} from '../src/chart-data'
import { readResultsFile, type ResultsFile } from '../src/results-file'
import firstRunJson from '../src/sample-truncha-first-run.json'
import sampleJson from '../src/sample-truncha.json'

function read(input: unknown): ResultsFile {
    const outcome = readResultsFile(input)
    if (!outcome.ok) throw new Error('the sample no longer reads')
    return outcome.file
}

const sample = read(sampleJson)
const firstRun = read(firstRunJson)

const fight = (file: ResultsFile, id: string) =>
    file.fights.find((entry) => entry.fight_id === id)!
const result = (file: ResultsFile, gear: string, id: string) =>
    file.results.find((entry) => entry.gear === gear && entry.fight_id === id)!

describe('the fight chart data', () => {
    const long = fight(sample, 'dungeon-long')
    const worn = result(sample, 'worn', 'dungeon-long')
    const plan = result(sample, 'max-damage', 'dungeon-long')

    test('joins what you wear and the plan on time: 25 points, 4 series', () => {
        const data = fightChartData(long, worn, plan)!
        expect(data.withPlan).toBe(true)
        expect(data.duration_s).toBe(120)
        expect(data.points).toHaveLength(25)
        expect(data.points[0]).toEqual({
            t_s: 0,
            dps_worn: worn.timeline![0]!.dps,
            mana_worn: 1660,
            dps_plan: plan.timeline![0]!.dps,
            mana_plan: plan.timeline![0]!.mana,
        })
        expect(data.points.map((point) => point.t_s)).toEqual(
            Array.from({ length: 25 }, (_, index) => index * 5)
        )
    })

    test('marks out of mana for both, earlier first, on two rows', () => {
        const { markers } = fightChartData(long, worn, plan)!
        expect(markers).toEqual([
            {
                who: 'worn',
                at_s: 48,
                label: 'Worn: out of mana 0:48',
                row: 0,
                anchor: 'start',
            },
            {
                who: 'plan',
                at_s: 57,
                label: 'Plan: out of mana 0:57',
                row: 1,
                anchor: 'start',
            },
        ])
    })

    test('a marker late in the fight reads leftwards, inside the chart', () => {
        const late = { ...worn, out_of_mana_s: 100 }
        expect(fightChartData(long, late, null)!.markers[0]?.anchor).toBe('end')
    })

    test('without a plan timeline: only what you wear, no plan marker', () => {
        const data = fightChartData(long, worn, { ...plan, timeline: null })!
        expect(data.withPlan).toBe(false)
        expect(data.points[0]).toEqual({
            t_s: 0,
            dps_worn: worn.timeline![0]!.dps,
            mana_worn: 1660,
        })
        expect(data.markers.map((marker) => marker.who)).toEqual(['worn'])
    })

    test('never and not simmed draw no marker; no timeline draws no chart', () => {
        expect(
            fightChartData(
                long,
                { ...worn, out_of_mana_s: 'never' },
                { ...plan, out_of_mana_s: null }
            )!.markers
        ).toEqual([])
        expect(
            fightChartData(long, result(firstRun, 'worn', 'dungeon-long'), null)
        ).toBeNull()
    })

    test('time ticks every 15 s over 2 minutes, every 10 s over 30 s', () => {
        expect(timeTicks(120)).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120])
        expect(timeTicks(30)).toEqual([0, 10, 20, 30])
    })
})

describe('the pull chart data', () => {
    const worn = result(sample, 'worn', 'chain-4')
    const plan = result(sample, 'max-damage', 'chain-4')

    test('one group per pull: DPS, and mana as a span from end to start', () => {
        const data = pullChartData(worn, plan)!
        expect(data.withPlan).toBe(true)
        expect(data.groups).toHaveLength(4)
        expect(data.groups[0]).toEqual({
            pull: 1,
            label: 'Pull 1',
            dps_worn: 101,
            mana_worn: [980, 1660],
            dps_plan: 120,
            mana_plan: [1100, 1745],
        })
        expect(data.groups[2]?.mana_worn).toEqual([0, 360])
    })

    test('a plan with no pulls leaves only what you wear; no pulls is no chart', () => {
        const data = pullChartData(worn, null)!
        expect(data.withPlan).toBe(false)
        expect(data.groups[0]).toEqual({
            pull: 1,
            label: 'Pull 1',
            dps_worn: 101,
            mana_worn: [980, 1660],
        })
        expect(pullChartData({ ...worn, pulls: null }, plan)).toBeNull()
    })
})

describe('the damage split', () => {
    test('six parts in file order, as whole percents, coloured by order', () => {
        const parts = splitParts(result(sample, 'worn', 'dungeon-long'))
        expect(parts.map((part) => part.text)).toEqual([
            'Melee 33%',
            'Windfury 17%',
            'Flame Shock 15%',
            'Stormstrike 15%',
            'Earth Shock 11%',
            'Lightning Shield 9%',
        ])
        expect(parts.slice(0, 5).map((part) => part.color)).toEqual([
            'var(--chart-1)',
            'var(--chart-2)',
            'var(--chart-3)',
            'var(--chart-4)',
            'var(--chart-5)',
        ])
        expect(parts[5]?.color).toContain('var(--chart-1)')
        expect(new Set(parts.map((part) => part.color)).size).toBe(6)
    })
})

describe('the stat weights', () => {
    test('the solo fight compares with the 2-minute dungeon fight, dashed', () => {
        const data = statWeightsData(sample, 'solo-hit-short')!
        expect(data.compare?.fight_id).toBe('dungeon-long')
        expect(data.compareNote).toBe(
            'Dashed: in 2-minute dungeon fights, once you run dry.'
        )
        expect(data.rows.find((row) => row.stat === 'intellect')).toEqual({
            stat: 'intellect',
            label: 'Intellect',
            ep: 1.15,
            compare_ep: 4.04,
        })
        expect(data.rows[0]?.label).toBe('Strength')
        expect(data.max).toBe(4.04)
    })

    test('Weapon DPS is said in words, off the bar scale', () => {
        const data = statWeightsData(sample, 'solo-hit-short')!
        expect(data.rows.some((row) => row.stat === 'weapon_dps')).toBe(false)
        expect(data.offScale).toEqual([
            'Weapon DPS is worth 14.19 per point, off this scale.',
        ])
    })

    test('on the 2-minute fight itself there is no second bar', () => {
        const data = statWeightsData(sample, 'dungeon-long')!
        expect(data.compare).toBeNull()
        expect(data.compareNote).toBeNull()
        expect(data.rows.every((row) => row.compare_ep === null)).toBe(true)
        expect(data.rows[0]).toEqual({
            stat: 'intellect',
            label: 'Intellect',
            ep: 4.04,
            compare_ep: null,
        })
    })

    test('the chain fight has no weights', () => {
        expect(statWeightsData(sample, 'chain-4')).toBeNull()
    })
})
