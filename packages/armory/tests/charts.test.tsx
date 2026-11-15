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

import { DamageSplit, SPLIT_CHART_NAME } from '../src/components/damage-split'
import { FIGHT_CHART_NAME, FightChart } from '../src/components/fight-chart'
import { PULL_CHART_NAME, PullChart } from '../src/components/pull-chart'
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
    test('is one SVG named DPS and mana over the fight, described by its sentences', () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={result('max-damage', 'dungeon-long')}
            />
        )
        const chart = screen.getByRole('img', { name: FIGHT_CHART_NAME })
        expect(chart.tagName.toLowerCase()).toBe('svg')
        expect(description(chart)).toBe(
            "In what you wear you run out of mana at 0:48.The sim's plan runs out at 0:57."
        )
        expect(count('svg[role="img"]')).toBe(1)
    })

    test('draws DPS lines, the plan mana area, the worn mana dashed, and two markers', () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={result('max-damage', 'dungeon-long')}
            />
        )
        // Lines: DPS worn, DPS plan, mana worn. Area: mana plan.
        expect(count('.recharts-line-curve')).toBe(3)
        expect(count('.recharts-area-area')).toBe(1)
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
        for (const entry of [
            'DPS, what you wear',
            "DPS, sim's plan",
            'Mana, what you wear',
            "Mana, sim's plan",
        ])
            expect(screen.getByText(entry)).toBeDefined()
    })

    test('without the plan: two lines, no area, one marker, no plan legend', () => {
        render(
            <FightChart
                fight={fight('dungeon-long')}
                worn={result('worn', 'dungeon-long')}
                plan={null}
            />
        )
        expect(count('.recharts-line-curve')).toBe(2)
        expect(count('.recharts-area-area')).toBe(0)
        expect(count('.recharts-reference-line-line')).toBe(1)
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(screen.queryByText("Mana, sim's plan")).toBeNull()
    })
})

describe('the pull chart', () => {
    test('is one SVG named DPS and mana per pull, with four bars per pull', () => {
        render(
            <PullChart
                worn={result('worn', 'chain-4')}
                plan={result('max-damage', 'chain-4')}
            />
        )
        const chart = screen.getByRole('img', { name: PULL_CHART_NAME })
        expect(chart.tagName.toLowerCase()).toBe('svg')
        expect(description(chart)).toBe(
            "In what you wear you run dry in pull 3.The sim's plan runs dry in pull 3."
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

    test('without the plan: two bars per pull and no plan legend', () => {
        render(<PullChart worn={result('worn', 'chain-4')} plan={null} />)
        expect(count('.recharts-bar-rectangle')).toBe(8)
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
    })
})

describe('the damage split', () => {
    test('is one 100% bar of six parts, sized by share, with a legend', () => {
        render(<DamageSplit worn={result('worn', 'dungeon-long')} />)
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
        expect(screen.getByText('Melee 33%')).toBeDefined()
        expect(screen.getByText('Lightning Shield 9%')).toBeDefined()
    })
})

describe('the stat weights', () => {
    test('on the solo fight: a bar per stat and a dashed 2-minute bar, with both values', () => {
        render(<StatWeights file={sample} fightId="solo-hit-short" />)
        const bars = screen.getByLabelText(WEIGHTS_CHART_NAME)
        expect(bars.querySelectorAll('[data-bar="fight"]')).toHaveLength(9)
        expect(bars.querySelectorAll('[data-bar="compare"]')).toHaveLength(9)
        expect(bars.textContent).toMatch(/Intellect1\.154\.04/)
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

    test('on the 2-minute fight: no dashed bar and no dashed note', () => {
        render(<StatWeights file={sample} fightId="dungeon-long" />)
        const bars = screen.getByLabelText(WEIGHTS_CHART_NAME)
        expect(bars.querySelectorAll('[data-bar="compare"]')).toHaveLength(0)
        expect(screen.queryByText(/Dashed:/)).toBeNull()
    })

    test('the chain fight says it has no weights', () => {
        render(<StatWeights file={sample} fightId="chain-4" />)
        expect(
            screen.getByText('No stat weights for this fight.')
        ).toBeDefined()
    })
})
