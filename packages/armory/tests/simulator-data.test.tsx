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
    test('with the sample, the only h1 is Armory and the gear card is headed by the character, level, spec, class and weapon', async () => {
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
        expect(
            text.indexOf("Guardian's Dualblade with Windfury Weapon.")
        ).toBeGreaterThan(who)
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

    test('reads Solo, Dungeon, Resource Empty, Health, Armor and Lifespan with their numbers, units and gaps below the plan', async () => {
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
        expect(readingValue('Resource Empty')).toBe('48')
        expect(readingValue('Health')).toBe('1375')
        expect(readingValue('Armor')).toBe('952')
        expect(readingValue('Lifespan')).toBe('34')

        expect(cell('Solo').textContent).toContain('DPS')
        expect(cell('Dungeon').textContent).toContain('DPS')
        expect(cell('Resource Empty').textContent).toContain('sec')
        expect(cell('Lifespan').textContent).toContain('sec')
        expect(
            cell('Solo')
                .querySelector('[data-reading-value]')
                ?.className.split(/\s+/)
        ).toContain('font-mono')

        const gaps: [string, RegExp][] = [
            ['Solo', /↓\s*14\.7/],
            ['Dungeon', /↓\s*8\.7/],
            ['Resource Empty', /↓\s*9(?!\d)/],
        ]
        for (const [label, shown] of gaps) {
            const gap = gapLine(label)
            expect(gap).not.toBeNull()
            expect(gap!.textContent).toMatch(shown)
            expect(holdsBestIcon(gap!)).toBe(true)
        }
        expect(gapLine('Lifespan')).toBeNull()
        expect(cell('Lifespan').textContent).not.toContain('↓')
    })

    test("each gap line reads out as N DPS or N sec below the sim's plan, without the arrow or the icon", async () => {
        await load(sample)

        expect(spoken(gapLine('Solo')!)).toBe("14.7 DPS below the sim's plan")
        expect(spoken(gapLine('Dungeon')!)).toBe("8.7 DPS below the sim's plan")
        expect(spoken(gapLine('Resource Empty')!)).toBe(
            "9 sec below the sim's plan"
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

        await load(wornOnLongFight((result) => (result.out_of_mana_s = null)))
        expect(readingValue('Resource Empty')).toBe('Not simmed')
        expect(cell('Resource Empty').textContent).not.toContain('↓')
    })

    test('Health and Armor have no gap line and no info button', async () => {
        // A plan with more health and armor than what you wear: still no gap.
        await load(
            wornOnLongFight((result) => {
                result.health = 1000
                result.armor = 500
            })
        )

        for (const label of ['Health', 'Armor']) {
            expect(gapLine(label)).toBeNull()
            expect(cell(label).textContent).not.toContain('↓')
            expect(cell(label).querySelector('button')).toBeNull()
            expect(
                screen.queryByRole('button', { name: `About ${label}` })
            ).toBeNull()
        }
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
