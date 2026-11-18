/**
 * Each chart drawn on its own, in a fixed-size container (see
 * `chart-layout.ts`): its accessible name and description, and the series
 * the SVG holds (lines, areas, bars, reference lines). The DOM helper must
 * be the first import.
 */
import './dom'
import './chart-layout'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen, within } from '@testing-library/react'

import { chartsLoaded } from './open-app'

import { DamageSplit, SPLIT_CHART_NAME } from '../src/components/damage-split'
import { FIGHT_CHART_NAME, FightChart } from '../src/components/fight-chart'
import { PULL_CHART_NAME, PullChart } from '../src/components/pull-chart'
import { inLegendOrder } from '../src/components/series-key'
import { StatWeights, WEIGHTS_CHART_NAME } from '../src/components/stat-weights'
import { readResultsFile, type ResultsFile } from '../src/results-file'
import sampleJson from '../src/sample-truncha.json'

function read(input: unknown): ResultsFile {
    const outcome = readResultsFile(input)
    if (!outcome.ok) throw new Error('the sample no longer reads')
    return outcome.file
}

const sample = read(sampleJson)
const fight = (id: string) =>
    sample.fights.find((entry) => entry.fight_id === id)!
const result = (gear: string, id: string) =>
    sample.results.find(
        (entry) => entry.gear === gear && entry.fight_id === id
    )!

/** The text of the elements an element's `aria-describedby` names. */
function description(element: Element): string {
    return (element.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
}

function count(selector: string): number {
    return document.querySelectorAll(selector).length
}

afterEach(() => {
    cleanup()
})

describe('the fight chart', () => {
    test('is one SVG named DPS and mana over the fight, described by its sentences', async () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={result('max-damage', 'dungeon-long')}
            />
        )
        const chart = await screen.findByRole('img', { name: FIGHT_CHART_NAME })
        expect(chart.tagName.toLowerCase()).toBe('svg')
        expect(description(chart)).toBe(
            "In what you wear you run out of mana at 0:48. The sim's plan holds out to 0:57."
        )
        expect(count('svg[role="img"]')).toBe(1)
    })

    test('draws DPS as wide bars (8 groups of 15 s, worn then plan, no dots), the plan mana area and line, the worn mana dashed, and two markers', async () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={result('max-damage', 'dungeon-long')}
                planLabel="Max damage"
            />
        )
        await chartsLoaded()
        // Bars: one worn and one plan bar in each of 8 groups (2 minutes in
        // 15 s). Lines: mana worn (dashed) and the plan's mana line over
        // the bars. Area: mana plan. No dots.
        const worn = [...document.querySelectorAll('rect[data-bar="worn"]')]
        const planBars = [...document.querySelectorAll('rect[data-bar="plan"]')]
        expect(worn).toHaveLength(8)
        expect(planBars).toHaveLength(8)
        expect(worn.map((bar) => bar.getAttribute('data-start'))).toEqual([
            '0',
            '15',
            '30',
            '45',
            '60',
            '75',
            '90',
            '105',
        ])
        expect(new Set(worn.map((bar) => bar.getAttribute('fill')))).toEqual(
            new Set(['var(--muted-foreground)'])
        )
        expect(
            new Set(planBars.map((bar) => bar.getAttribute('fill')))
        ).toEqual(new Set(['var(--chart-1)']))
        // Side by side, worn on the left, a gap before the next group.
        const at = (bar: Element, name: string) =>
            Number(bar.getAttribute(name))
        expect(at(worn[0]!, 'x') + at(worn[0]!, 'width')).toBeLessThan(
            at(planBars[0]!, 'x')
        )
        expect(at(planBars[0]!, 'x') + at(planBars[0]!, 'width')).toBeLessThan(
            at(worn[1]!, 'x')
        )
        expect(at(worn[0]!, 'width')).toBeGreaterThan(4)
        expect(count('.recharts-line-curve')).toBe(2)
        expect(count('.recharts-area-area')).toBe(1)
        expect(count('.recharts-dot')).toBe(0)
        expect(
            document
                .querySelector('.recharts-line-curve[stroke-dasharray="4 3"]')
                ?.getAttribute('stroke')
        ).toBe('var(--chart-2)')
        expect(count('.recharts-reference-line-line')).toBe(2)
        expect(screen.getByText('Worn: out of mana 0:48')).toBeDefined()
        expect(screen.getByText('Plan: out of mana 0:57')).toBeDefined()
        // Two y-axes: DPS on the left, mana on the right; time in m:ss.
        expect(count('.recharts-yAxis')).toBe(2)
        expect(screen.getByText('2:00')).toBeDefined()
        // The legend in the mockup's order.
        const legend = document.querySelector('.recharts-legend-wrapper')
        expect(legend?.textContent).toBe(
            "DPS, sim's planDPS, what you wearMana, sim's planMana, what you wear"
        )
        // The times in the sentence are coloured; the mana ticks are in the
        // mana colour.
        expect(screen.getByText('0:57', { selector: 'span' }).className).toBe(
            'text-chart-1-text'
        )
        expect(
            document.querySelectorAll(
                'text.recharts-cartesian-axis-tick-value[style*="--chart-2-text"]'
            ).length
        ).toBeGreaterThan(0)
        expect(
            screen.getByText(
                /^Average about \d+\.\d DPS in what you wear, \d+\.\d with the sim's plan \(max damage\)\. Bars every 15 seconds\.$/
            )
        ).toBeDefined()
    })

    test("the key item DPS, sim's plan draws the sim's best icon before its swatch; Mana, sim's plan doesn't", async () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={result('max-damage', 'dungeon-long')}
            />
        )
        await chartsLoaded()
        /** The outermost element whose text is just `label`. */
        const keyItem = (label: string): HTMLElement => {
            let item = screen.getByText(label)
            while (item.parentElement?.textContent === label)
                item = item.parentElement
            return item
        }

        const dpsPlan = keyItem("DPS, sim's plan")
        expect(dpsPlan.querySelector('circle[stroke-dasharray]')).not.toBeNull()
        // The swatch is a bar, as drawn.
        expect(dpsPlan.querySelectorAll('rect')).toHaveLength(1)
        expect(
            keyItem('DPS, what you wear').querySelectorAll('rect')
        ).toHaveLength(1)
        expect(keyItem("Mana, sim's plan").querySelector('circle')).toBeNull()
    })

    test('without the plan: one bar per group, the mana line, no area, one marker, no plan legend', async () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={null}
            />
        )
        await chartsLoaded()
        expect(count('rect[data-bar="worn"]')).toBe(8)
        expect(count('rect[data-bar="plan"]')).toBe(0)
        expect(count('.recharts-line-curve')).toBe(1)
        expect(count('.recharts-area-area')).toBe(0)
        expect(count('.recharts-reference-line-line')).toBe(1)
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(screen.queryByText("Mana, sim's plan")).toBeNull()
    })
})

describe('the fight chart on a long fight', () => {
    test('a 5-minute fight with a point every second groups its bars by 30 seconds (10 groups) and says so', async () => {
        const worn = result('worn', 'dungeon-long')
        const plan = result('max-damage', 'dungeon-long')
        const perSecond = (base: typeof worn) => ({
            ...base,
            out_of_mana_s: null,
            timeline: Array.from({ length: 301 }, (_, t_s) => ({
                t_s,
                dps: 100 + (t_s % 7),
                mana: 2000 - t_s,
            })),
        })
        render(
            <FightChart
                fight={{ ...fight('dungeon-long'), duration_s: 300 }}
                worn={perSecond(worn)}
                plan={perSecond(plan)}
                planLabel="Max damage"
            />
        )
        await chartsLoaded()
        // 10 groups (0, 30, ... 270; the end point joins the last), two
        // bars each.
        expect(count('rect[data-bar="worn"]')).toBe(10)
        expect(count('rect[data-bar="plan"]')).toBe(10)
        expect(screen.getByText(/Bars every 30 seconds\.$/)).toBeDefined()
    })
})

describe('tooltip order', () => {
    test('tooltip items sort in the legend order (Recharts skips itemSorter with custom content)', () => {
        expect(
            inLegendOrder([
                { dataKey: 'mana_plan' },
                { dataKey: 'mana_worn' },
                { dataKey: 'dps_worn' },
                { dataKey: 'dps_plan' },
            ]).map((item) => item.dataKey)
        ).toEqual(['dps_plan', 'dps_worn', 'mana_plan', 'mana_worn'])
    })
})

describe('the pull chart', () => {
    test('is one SVG named DPS and mana per pull, with four bars per pull', async () => {
        render(
            <PullChart
                fight={fight('chain-4')}
                worn={result('worn', 'chain-4')}
                plan={result('max-damage', 'chain-4')}
            />
        )
        const chart = await screen.findByRole('img', { name: PULL_CHART_NAME })
        expect(chart.tagName.toLowerCase()).toBe('svg')
        expect(description(chart)).toBe(
            "In what you wear you run dry in pull 3. The sim's plan runs dry in pull 3."
        )
        // DPS worn, DPS plan, mana worn, mana plan, for 4 pulls; pull 3 and
        // 4 of what you wear end at 0 mana, still drawn as a span.
        expect(count('.recharts-bar-rectangle')).toBe(16)
        expect(count('.recharts-yAxis')).toBe(2)
        // Tick labels in the SVG (Recharts also measures text in a hidden
        // span outside it).
        for (const pull of ['Pull 1', 'Pull 2', 'Pull 3', 'Pull 4'])
            expect(
                within(chart).getByText(pull, { selector: 'tspan' })
            ).toBeDefined()
    })

    test('without the plan: two bars per pull and no plan legend', async () => {
        render(
            <PullChart
                fight={fight('chain-4')}
                worn={result('worn', 'chain-4')}
                plan={null}
            />
        )
        await chartsLoaded()
        expect(count('.recharts-bar-rectangle')).toBe(8)
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
    })
})

/** A legend entry's text, name then share (`Melee 33%`). */
function legend(): string[] {
    return [...document.querySelectorAll('li')].map((item) =>
        (item.textContent ?? '').replace(/\s+/g, ' ').trim()
    )
}

describe('the damage split', () => {
    test('is one 100% bar of six parts, sized by share, with a legend', () => {
        render(
            <DamageSplit
                worn={result('worn', 'solo-hit-short')}
                fightLabel="Solo, 30 seconds vs level 31"
            />
        )
        const bar = screen.getByRole('img', { name: SPLIT_CHART_NAME })
        const parts = [...bar.querySelectorAll<HTMLElement>('[data-part]')]
        expect(parts.map((part) => part.style.flexGrow)).toEqual([
            '33',
            '17',
            '15',
            '15',
            '11',
            '9',
        ])
        expect(legend()[0]).toBe('Melee 33%')
        expect(legend()[5]).toBe('Lightning Shield 9%')
        // The owner's design: no colour squares in the legend.
        for (const item of document.querySelectorAll('li'))
            expect(item.querySelector('[style*="background"]')).toBeNull()
        expect(
            screen.getByText(
                'Solo, 30 seconds vs level 31, what you wear. Colour is the spell school.'
            )
        ).toBeDefined()
    })

    test('without spell schools it says nothing about colour', () => {
        const worn = result('worn', 'solo-hit-short')
        render(
            <DamageSplit
                worn={{
                    ...worn,
                    damage_split: worn.damage_split.map(
                        ({ school: _school, ...part }) => part
                    ),
                }}
                fightLabel="Solo"
            />
        )
        expect(screen.getByText('Solo, what you wear.')).toBeDefined()
    })
})

describe('the damage split with two parts of one name', () => {
    test('draws both (keys by place, not name)', () => {
        const worn = result('worn', 'dungeon-long')
        render(
            <DamageSplit
                worn={{
                    ...worn,
                    damage_split: [
                        { name: 'Melee', share_pct: 60 },
                        { name: 'Melee', share_pct: 40 },
                    ],
                }}
            />
        )
        const bar = screen.getByRole('img', { name: SPLIT_CHART_NAME })
        expect(bar.querySelectorAll('[data-part="Melee"]')).toHaveLength(2)
        expect(legend()).toEqual(['Melee 60%', 'Melee 40%'])
    })
})

describe('the stat weights', () => {
    test('solo solid and the 2-minute fight dashed where it differs, with both values', () => {
        render(
            <StatWeights
                file={sample}
                fightId="solo-hit-short"
                compareId="dungeon-long"
            />
        )
        const bars = screen.getByLabelText(WEIGHTS_CHART_NAME)
        expect(bars.querySelectorAll('[data-bar="fight"]')).toHaveLength(7)
        expect(bars.querySelectorAll('[data-bar="compare"]')).toHaveLength(2)
        expect(bars.textContent).toMatch(/Intellect1\.15 4\.04/)
        expect(bars.textContent).toMatch(/Mana per 5 3\.89$/)
        expect(
            screen.getByText(
                'In attack power (1 attack power = 1). Dashed: in 2-minute dungeon fights, once you run dry.'
            )
        ).toBeDefined()
        expect(
            screen.getByText(
                'Weapon DPS is worth 14.19 per point, off this scale.'
            )
        ).toBeDefined()
    })

    test('with nothing to compare: no dashed bar and no dashed note', () => {
        render(<StatWeights file={sample} fightId="dungeon-long" />)
        const bars = screen.getByLabelText(WEIGHTS_CHART_NAME)
        expect(bars.querySelectorAll('[data-bar="compare"]')).toHaveLength(0)
        expect(screen.queryByText(/Dashed:/)).toBeNull()
    })

    test('a fight without weights says so', () => {
        const without = {
            ...sample,
            stat_weights: sample.stat_weights.filter(
                (entry) => entry.fight_id !== 'chain-4'
            ),
        }
        render(<StatWeights file={without} fightId="chain-4" />)
        expect(
            screen.getByText('No stat weights for this fight.')
        ).toBeDefined()
    })
})
