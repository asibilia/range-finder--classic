/**
 * The data each chart is given (`src/chart-data.ts`), apart from how
 * Recharts draws it: the fight chart's series and out-of-mana markers, the
 * pull chart's groups, the damage split's parts and the stat weights' bars.
 */
import { describe, expect, test } from 'bun:test'

import {
    averageWords,
    barGrouping,
    fightChartData,
    pullChartData,
    splitParts,
    statWeightsData,
    timeTicks,
    timelineAverages,
    fightWords,
    splitHasSchools,
    valueTicks,
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

    test('marks out of mana for both, earlier first, on two rows; as in the mockup the earlier label reads left of its line', () => {
        const { markers } = fightChartData(long, worn, plan)!
        expect(markers).toEqual([
            {
                who: 'worn',
                at_s: 48,
                label: 'Worn: out of mana 0:48',
                row: 0,
                anchor: 'end',
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

    test('a lone marker reads rightwards, and an early one never reads off the left edge', () => {
        expect(fightChartData(long, worn, null)!.markers[0]?.anchor).toBe(
            'start'
        )
        const early = { ...worn, out_of_mana_s: 20 }
        expect(
            fightChartData(long, early, plan)!.markers.map(
                (marker) => marker.anchor
            )
        ).toEqual(['start', 'start'])
    })

    test('the averages: mean DPS for each, and the spacing of the points', () => {
        const averages = timelineAverages(worn, plan)!
        const mean = (values: number[]) =>
            values.reduce((sum, value) => sum + value, 0) / values.length
        expect(averages.worn).toBeCloseTo(
            mean(worn.timeline!.map((point) => point.dps)),
            9
        )
        expect(averages.plan).toBeCloseTo(
            mean(plan.timeline!.map((point) => point.dps)),
            9
        )
        expect(averages.spacing_s).toBe(5)
        expect(averageWords(averages, 'Max damage')).toBe(
            `Average about ${averages.worn.toFixed(1)} DPS in what you wear, ${averages.plan!.toFixed(1)} with the sim's plan (max damage). Bars every 5 seconds.`
        )
        expect(averageWords({ ...averages, plan: null }, null)).toBe(
            `Average about ${averages.worn.toFixed(1)} DPS in what you wear. Bars every 5 seconds.`
        )
        const uneven = {
            ...worn,
            timeline: [
                { t_s: 0, dps: 10, mana: 1 },
                { t_s: 5, dps: 20, mana: 1 },
                { t_s: 12, dps: 30, mana: 1 },
            ],
        }
        expect(timelineAverages(uneven, null)).toEqual({
            worn: 20,
            plan: null,
            spacing_s: null,
        })
    })

    test('bars: 5-second points over 2 minutes stay ungrouped (bar_s 5); 1-second points over 5 minutes group by 2 seconds, each group the mean', () => {
        expect(barGrouping(5, 120)).toBe(1)
        expect(barGrouping(1, 120)).toBe(1)
        expect(barGrouping(1, 180)).toBe(1)
        expect(barGrouping(1, 300)).toBe(2)
        expect(fightChartData(long, worn, plan)!.bar_s).toBe(5)

        const perSecond = {
            ...worn,
            timeline: Array.from({ length: 300 }, (_, t_s) => ({
                t_s,
                dps: t_s % 2 === 0 ? 100 : 200,
                mana: 1000,
            })),
        }
        const data = fightChartData(
            { ...long, duration_s: 300 },
            perSecond,
            null
        )!
        expect(data.bar_s).toBe(2)
        expect(data.points).toHaveLength(150)
        expect(data.points[1]).toEqual({
            t_s: 2,
            dps_worn: 150,
            mana_worn: 1000,
        })
    })

    test('uneven points, too few to group, give no bar spacing', () => {
        const uneven = {
            ...worn,
            timeline: [
                { t_s: 0, dps: 10, mana: 1 },
                { t_s: 5, dps: 20, mana: 1 },
                { t_s: 12, dps: 30, mana: 1 },
            ],
        }
        expect(fightChartData(long, uneven, null)!.bar_s).toBeNull()
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
    test('six parts in file order, as whole percents, coloured by spell school', () => {
        const parts = splitParts(result(sample, 'worn', 'dungeon-long'))
        expect(parts.map((part) => part.text)).toEqual([
            'Melee 33%',
            'Windfury 17%',
            'Flame Shock 15%',
            'Stormstrike 15%',
            'Earth Shock 11%',
            'Lightning Shield 9%',
        ])
        expect(parts.map((part) => part.color)).toEqual([
            'var(--school-physical)',
            'color-mix(in oklch, var(--school-physical), black 22%)',
            'var(--school-fire)',
            'var(--school-nature)',
            'color-mix(in oklch, var(--school-nature), black 22%)',
            'color-mix(in oklch, var(--school-nature), black 44%)',
        ])
        expect(splitHasSchools(result(sample, 'worn', 'dungeon-long'))).toBe(
            true
        )
    })

    test('without schools (the first-run sample), parts are coloured by order', () => {
        const worn = result(firstRun, 'worn', 'dungeon-long')
        expect(splitHasSchools(worn)).toBe(false)
        const parts = splitParts(worn)
        expect(parts.slice(0, 5).map((part) => part.color)).toEqual([
            'var(--chart-1)',
            'var(--chart-2)',
            'var(--chart-3)',
            'var(--chart-4)',
            'var(--chart-5)',
        ])
        expect(parts[5]?.color).toContain('var(--chart-1)')
    })
})

describe('the stat weights', () => {
    test("solo solid and the 2-minute fight dashed: the mockup's eight stats, in its order", () => {
        const data = statWeightsData(sample, 'solo-hit-short', 'dungeon-long')!
        expect(data.compare?.fight_id).toBe('dungeon-long')
        expect(data.compareNote).toBe(
            'Dashed: in 2-minute dungeon fights, once you run dry.'
        )
        expect(
            data.rows.map((row) => [row.label, row.ep, row.compare_ep])
        ).toEqual([
            ['Strength', 2, null],
            ['Spell damage', 1.41, null],
            ['Hit rating', 1.39, null],
            ['Intellect', 1.15, 4.04],
            ['Attack power', 1, null],
            ['Agility', 0.94, null],
            ['Crit rating', 0.8, null],
            ['Mana per 5', null, 3.89],
        ])
        expect(data.max).toBe(4.04)
    })

    test('Weapon DPS is said in words, off the bar scale', () => {
        const data = statWeightsData(sample, 'solo-hit-short')!
        expect(data.rows.some((row) => row.stat === 'weapon_dps')).toBe(false)
        expect(data.offScale).toEqual([
            'Weapon DPS is worth 14.19 per point, off this scale.',
        ])
    })

    test('with no fight to compare (or the same fight) there is no second bar', () => {
        for (const compare of [null, 'solo-hit-short']) {
            const data = statWeightsData(sample, 'solo-hit-short', compare)!
            expect(data.compare).toBeNull()
            expect(data.compareNote).toBeNull()
            expect(data.rows.every((row) => row.compare_ep === null)).toBe(true)
        }
    })

    test('a fight with no weights has none (a copy without the solo weights)', () => {
        const without = {
            ...sample,
            stat_weights: sample.stat_weights.filter(
                (entry) => entry.fight_id !== 'solo-hit-short'
            ),
        }
        expect(statWeightsData(without, 'solo-hit-short')).toBeNull()
    })
})

describe('fight words and axis ticks', () => {
    test('a single fight reads as the mockup words it; a chain keeps its label', () => {
        expect(fightWords(fight(sample, 'dungeon-long'))).toBe(
            'Dungeon, 2 minutes vs level 33'
        )
        expect(fightWords(fight(sample, 'solo-hit-short'))).toBe(
            'Solo, 30 seconds vs level 31'
        )
        expect(fightWords(fight(sample, 'chain-4'))).toBe(
            fight(sample, 'chain-4').label
        )
    })

    test("the value axes run to a round top, as the mockup's 140 DPS and 2400 mana", () => {
        expect(valueTicks(118.5, 4, 1.1, 20)).toEqual([0, 35, 70, 105, 140])
        expect(valueTicks(1660, 3, 1.3, 300)).toEqual([0, 800, 1600, 2400])
    })
})
