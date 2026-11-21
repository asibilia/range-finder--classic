/**
 * The armory's header and the Simulator Data card (spec #109, sections 0, 2
 * and 3): the `Armory` h1 and its subtitle, the character on the gear card's
 * heading, the accuracy banner's icon, the card's title, `Stat Priority`,
 * the six readings with their gaps below the sim's plan, and the readings'
 * "i" buttons. The DOM helper must be the first import.
 *
 * These load files themselves and wait for the gear card's h2, so they
 * don't lean on a helper that waits for an older heading.
 */
import './dom'
import {
    chartsLoaded,
    jsonFile,
    pick,
    readingLabels,
    readingValue,
    renderApp,
    variant,
    type Json,
    type User,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen, waitFor, within } from '@testing-library/react'

import { meta } from '../src/routes/home'
import sample from '../src/sample-truncha.json'

type Result = Json & { gear: string; fight_id: string }

const SUBTITLE =
    'See your gear, what the sim would change, and how a fight plays out.'

afterEach(() => {
    cleanup()
})

/** Picks `data` as a results file and waits for the gear card's heading. */
async function load(data: unknown, name = 'Truncha'): Promise<User> {
    const user = renderApp()
    await pick(user, jsonFile(data))
    await screen.findByRole('heading', { level: 2, name })
    await chartsLoaded()
    return user
}

/** The reading cell labelled `label`. Throws when there is none. */
function cell(label: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(
        `[data-reading="${CSS.escape(label)}"]`
    )
    if (!found) throw new Error(`no reading labelled ${label}`)
    return found
}

/** The gap line of the reading labelled `label`, or null. */
function gapLine(label: string): HTMLElement | null {
    return cell(label).querySelector<HTMLElement>('[data-reading-gap]')
}

/**
 * What a screen reader reads for `element`: its aria-label, else its text
 * outside `aria-hidden` parts, with spaces collapsed.
 */
function spoken(element: Element): string {
    const label = element.getAttribute('aria-label')
    if (label) return label
    const parts: string[] = []
    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent ?? '')
            return
        }
        if (
            node instanceof Element &&
            node.getAttribute('aria-hidden') === 'true'
        )
            return
        for (const child of node.childNodes) walk(child)
    }
    for (const child of element.childNodes) walk(child)
    return parts.join('').replace(/\s+/g, ' ').trim()
}

/** True when `element` holds the `best` icon: a ring with a dash. */
function holdsBestIcon(element: Element): boolean {
    return [...element.querySelectorAll('svg circle')].some(
        (circle) =>
            circle.getAttribute('stroke-dasharray') !== null ||
            Boolean(
                (circle as SVGElement).style?.getPropertyValue(
                    'stroke-dasharray'
                )
            )
    )
}

/** The sample with every worn result on the 2-minute fight changed. */
function wornOnLongFight(change: (result: Result) => void): Json {
    return variant((file) => {
        for (const result of file.results as Result[])
            if (result.gear === 'worn' && result.fight_id === 'dungeon-long')
                change(result)
    })
}

describe('the header', () => {
    test('with the sample, the only h1 is Armory and the gear card is headed by the character, level, spec and class (no weapon line)', async () => {
        await load(sample)

        expect(
            screen
                .getAllByRole('heading', { level: 1 })
                .map((heading) => heading.textContent)
        ).toEqual(['Armory'])
        const heading = screen.getByRole('heading', {
            level: 2,
            name: 'Truncha',
        })
        expect(heading.id).toBe('gear-heading')
        const card = document.querySelector('[data-slot="gear-pane"]')
        const text = card?.textContent ?? ''
        const who = text.indexOf('Level 30 Enhancement Shaman')
        expect(who).toBeGreaterThan(text.indexOf('Truncha'))
        // The owner's design has no weapon line under the name.
        expect(text).not.toContain("Guardian's Dualblade with Windfury Weapon.")
        expect(screen.getByText(SUBTITLE)).toBeDefined()
    })

    test('focus moves to the gear card heading once a file is picked, and the page title is Armory', async () => {
        await load(sample)

        const heading = document.getElementById('gear-heading')
        expect(heading?.textContent).toBe('Truncha')
        expect(heading?.getAttribute('tabindex')).toBe('-1')
        await waitFor(() => expect(document.activeElement).toBe(heading))
        expect(meta()).toEqual([{ title: 'Armory' }])
    })

    test('with no file, the h1 reads Armory and the subtitle shows', () => {
        renderApp()

        expect(
            screen
                .getAllByRole('heading', { level: 1 })
                .map((heading) => heading.textContent)
        ).toEqual(['Armory'])
        expect(screen.getByText(SUBTITLE)).toBeDefined()
    })

    test('the accuracy banner starts with an aria-hidden info icon', async () => {
        await load(sample)

        const banner = screen
            .getAllByRole('note')
            .find((note) =>
                (note.textContent ?? '').includes(
                    "The sim isn't checked against real fights yet."
                )
            )
        expect(banner).toBeDefined()
        const first = banner!.firstElementChild
        expect(first?.tagName.toLowerCase()).toBe('svg')
        expect(first?.getAttribute('aria-hidden')).toBe('true')
        expect(banner!.textContent).toContain(
            "The sim isn't checked against real fights yet. Use these numbers to compare gear, not as a promise of DPS."
        )
    })
})

describe('the Simulator Data card', () => {
    test('is titled Simulator Data, its sliders Stat Priority, and the old words are gone', async () => {
        await load(sample)

        const card = screen.getByRole('complementary', {
            name: "The sim's numbers",
        })
        expect(
            within(card).getByRole('heading', { name: 'Simulator Data' })
        ).toBeDefined()
        expect(
            within(card).getByRole('heading', { name: 'Stat Priority' })
        ).toBeDefined()
        const text = document.body.textContent ?? ''
        for (const old of [
            'What the sim says',
            'What to gear for',
            'Mana runs out at',
            'Time to die',
        ])
            expect(text).not.toContain(old)
    })

    test('reads Solo, Dungeon, Resource Empty, Health, Armor and Lifespan with their numbers, units and a gap from the plan under every one', async () => {
        await load(sample)

        expect(readingLabels()).toEqual([
            'Solo',
            'Dungeon',
            'Resource Empty',
            'Health',
            'Armor',
            'Lifespan',
        ])
        expect(readingValue('Solo')).toBe('103.7')
        expect(readingValue('Dungeon')).toBe('75.4')
        // Resource Empty and Lifespan in hundredths (owner decision B).
        expect(readingValue('Resource Empty')).toBe('48.00')
        expect(readingValue('Health')).toBe('1375')
        expect(readingValue('Armor')).toBe('952')
        expect(readingValue('Lifespan')).toBe('34.00')

        expect(cell('Solo').textContent).toContain('DPS')
        expect(cell('Dungeon').textContent).toContain('DPS')
        expect(cell('Resource Empty').textContent).toContain('sec')
        expect(cell('Lifespan').textContent).toContain('sec')
        // The owner's design: bold JetBrains Mono at the stat size.
        expect(
            cell('Solo')
                .querySelector('[data-reading-value]')
                ?.className.split(/\s+/)
        ).toEqual(
            expect.arrayContaining(['font-mono', 'font-bold', 'text-stat'])
        )

        // Below the plan: orange ↓ N with the `best` icon.
        const below: [string, RegExp][] = [
            ['Solo', /↓\s*14\.7/],
            ['Dungeon', /↓\s*8\.7/],
            ['Resource Empty', /↓\s*9\.00/],
            ['Armor', /↓\s*58(?!\d)/],
        ]
        for (const [label, shown] of below) {
            const gap = gapLine(label)
            expect(gap).not.toBeNull()
            expect(gap!.textContent).toMatch(shown)
            expect(gap!.className.split(/\s+/)).toContain('text-primary')
            expect(holdsBestIcon(gap!)).toBe(true)
        }
        // Beating the plan (owner decision A): green + N with the `owned`
        // icon. The sample's max damage plan has less health and a
        // shorter life than what you wear.
        const above: [string, RegExp][] = [
            ['Health', /\+\s*65(?!\d)/],
            ['Lifespan', /\+\s*3\.00/],
        ]
        for (const [label, shown] of above) {
            const gap = gapLine(label)
            expect(gap).not.toBeNull()
            expect(gap!.textContent).toMatch(shown)
            expect(gap!.textContent).not.toContain('↓')
            expect(gap!.className.split(/\s+/)).toContain('text-owned')
            expect(gap!.querySelector('[data-sim-best="owned"]')).not.toBeNull()
            expect(holdsBestIcon(gap!)).toBe(false)
        }
    })

    test("each gap line reads out as N DPS, sec, health or armor below or above the sim's plan, without the arrow, the plus or the icon", async () => {
        await load(sample)

        expect(spoken(gapLine('Solo')!)).toBe("14.7 DPS below the sim's plan")
        expect(spoken(gapLine('Dungeon')!)).toBe("8.7 DPS below the sim's plan")
        expect(spoken(gapLine('Resource Empty')!)).toBe(
            "9.00 sec below the sim's plan"
        )
        expect(spoken(gapLine('Armor')!)).toBe("58 armor below the sim's plan")
        expect(spoken(gapLine('Health')!)).toBe(
            "65 health above the sim's plan"
        )
        expect(spoken(gapLine('Lifespan')!)).toBe(
            "3.00 sec above the sim's plan"
        )
        for (const svg of gapLine('Solo')!.querySelectorAll('svg'))
            expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    })

    test('a worn Resource Empty of never reads Never with no gap; null reads Not simmed', async () => {
        await load(
            wornOnLongFight((result) => (result.out_of_mana_s = 'never'))
        )
        expect(readingValue('Resource Empty')).toBe('Never')
        expect(gapLine('Resource Empty')).toBeNull()
        expect(cell('Resource Empty').textContent).not.toContain('↓')
        cleanup()
        // The page keeps a picked file; forget it so the next render asks again.
        localStorage.clear()

        await load(wornOnLongFight((result) => (result.out_of_mana_s = null)))
        expect(readingValue('Resource Empty')).toBe('Not simmed')
        expect(cell('Resource Empty').textContent).not.toContain('↓')
    })

    test('Health and Armor have a gap line (owner decision A) and no info button', async () => {
        // A plan with more health and armor than what you wear.
        await load(
            wornOnLongFight((result) => {
                result.health = 1000
                result.armor = 500
            })
        )

        expect(gapLine('Health')!.textContent).toMatch(/↓\s*310(?!\d)/)
        expect(gapLine('Armor')!.textContent).toMatch(/↓\s*510(?!\d)/)
        for (const label of ['Health', 'Armor']) {
            expect(cell(label).querySelector('button')).toBeNull()
            expect(
                screen.queryByRole('button', { name: `About ${label}` })
            ).toBeNull()
        }
    })
})

describe('the sliders (owner decision D)', () => {
    test('Stat Priority and the fight settings draw a white fill on a grey track, not orange', async () => {
        const user = await load(sample)
        await user.click(screen.getByRole('radio', { name: 'Sliders' }))

        const ranges = document.querySelectorAll('[data-slot="slider-range"]')
        expect(ranges.length).toBeGreaterThan(0)
        for (const range of ranges) {
            const classes = range.className.split(/\s+/)
            expect(classes).toContain('bg-foreground')
            expect(classes).not.toContain('bg-primary')
        }
        for (const track of document.querySelectorAll(
            '[data-slot="slider-track"]'
        ))
            expect(track.className.split(/\s+/)).toContain('bg-border-strong')
    })
})

describe('a reading that matches the plan', () => {
    test('has no gap line: what you wear and the plan the same, or not simmed', async () => {
        await load(
            variant((file) => {
                const plan = (file.results as Result[]).find(
                    (result) =>
                        result.gear === 'max-damage' &&
                        result.fight_id === 'dungeon-long'
                )!
                for (const result of file.results as Result[])
                    if (
                        result.gear === 'worn' &&
                        result.fight_id === 'dungeon-long'
                    ) {
                        result.health = plan.health
                        result.armor = plan.armor
                        result.time_to_die_s = null
                    }
            })
        )

        expect(gapLine('Health')).toBeNull()
        expect(gapLine('Armor')).toBeNull()
        expect(readingValue('Lifespan')).toBe('Not simmed')
        expect(gapLine('Lifespan')).toBeNull()
    })
})

describe("the readings' info buttons", () => {
    test('Solo, Dungeon, Resource Empty and Lifespan each have an About button', async () => {
        await load(sample)

        for (const label of ['Solo', 'Dungeon', 'Resource Empty', 'Lifespan'])
            expect(
                within(cell(label)).getByRole('button', {
                    name: `About ${label}`,
                })
            ).toBeDefined()
    })

    test('clicking About Solo shows the full fight', async () => {
        const user = await load(sample)

        await user.click(screen.getByRole('button', { name: 'About Solo' }))

        expect(
            await screen.findByText(
                'Solo vs a level 31 mob (+1), mob hitting you, 30 s'
            )
        ).toBeDefined()
    })

    test('Enter on a focused About Dungeon opens it; Escape closes it and focus stays on the button', async () => {
        const user = await load(sample)
        const detail = 'Dungeon vs a level 33 mob (+3), behind a tank, 2 min'
        const about = screen.getByRole('button', { name: 'About Dungeon' })

        about.focus()
        expect(document.activeElement).toBe(about)
        await user.keyboard('{Enter}')
        expect(await screen.findByText(detail)).toBeDefined()

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByText(detail)).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(about))
    })

    test('two DPS readings with the same short label add their lengths', async () => {
        await load(
            variant((file) => {
                for (const fight of file.fights as Json[])
                    if (fight.fight_id === 'solo-hit-short')
                        (fight.setup as Json).being_hit = false
            })
        )

        expect(readingLabels().slice(0, 2)).toEqual([
            'Dungeon 30 s',
            'Dungeon 2 min',
        ])
        expect(
            screen.getByRole('button', { name: 'About Dungeon 30 s' })
        ).toBeDefined()
        expect(
            screen.getByRole('button', { name: 'About Dungeon 2 min' })
        ).toBeDefined()
    })
})

describe('the locked card', () => {
    test('with no file reads Simulator Data, Stat Priority and the six labels', () => {
        renderApp()

        const locked = screen.getByRole('region', {
            name: 'What unlocks with a character',
        })
        const text = locked.textContent ?? ''
        expect(text).toContain('Simulator Data')
        expect(text).toContain('Stat Priority')
        for (const label of [
            'Solo',
            'Dungeon',
            'Resource Empty',
            'Health',
            'Armor',
            'Lifespan',
        ])
            expect(text).toContain(label)
        expect(document.body.textContent ?? '').not.toContain(
            'What the sim says'
        )
        expect(text).not.toContain('What to gear for')
    })
})
