/**
 * The sim's plan view and the role sliders (spec section 10). The DOM helper
 * must be the first import.
 */
import './dom'
import {
    chooseFight,
    sentence,
    description,
    openFile,
    openSample,
    readingValue,
    variant,
    type User,
} from './open-app'
import { gearPane, lineWith, squeeze } from './gear-card'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

import firstRun from '../src/sample-truncha-first-run.json'

const ROLES = ['Damage', 'Survival', 'Healing', 'Utility'] as const
const NOTHING_RESIMMED =
    'These pick from plans the sim already made. Nothing is re-simmed here.'
const SWITCHED = "Switched the gear to the sim's plan for this mix."
const CHAIN = 'Chain, 4 pulls 20 s apart vs level 33'

/**
 * What the gear pane says it shows, in its heading row: the line that
 * starts with `What you wear` or `The sim's plan` in bold.
 */
function paneStatus(): string {
    const pane = document.querySelector('[data-slot="gear-pane"]')
    const bold = [...(pane?.querySelectorAll('b') ?? [])].find((element) =>
        ['What you wear', "The sim's plan"].includes(element.textContent ?? '')
    )
    return bold?.parentElement?.textContent ?? ''
}

/** Whether the gear card has its `View` switch. */
function hasViewSwitch(): boolean {
    return screen.queryByRole('group', { name: 'View' }) !== null
}

/** The `View` switch's radio: `BIS` shows the plan, `Current` what you wear. */
function viewRadio(name: 'Current' | 'BIS'): HTMLInputElement {
    const group = screen.getByRole('group', { name: 'View' })
    return within(group).getByRole('radio', { name }) as HTMLInputElement
}

/** Shows the sim's plan. */
async function showPlan(user: User) {
    await user.click(viewRadio('BIS'))
}

/** The line that names the plan the mix picks. */
function picksLine(): string {
    return (
        screen.getByText('Your mix picks the', { exact: false }).textContent ??
        ''
    )
}

/** Moves Damage to 45, then Survival to 35 and 80: Damage and survival. */
function toDamageAndSurvival() {
    setSlider('Damage', 45)
    setSlider('Survival', 35)
    setSlider('Survival', 80)
}

function slider(name: string): HTMLInputElement {
    return screen.getByRole('slider', { name }) as HTMLInputElement
}

function setSlider(name: string, value: number) {
    fireEvent.change(slider(name), { target: { value: String(value) } })
}

/** The smallest element around `input` that holds no other slider. */
function sliderBox(input: HTMLElement): HTMLElement {
    let box: HTMLElement = input
    while (
        box.parentElement &&
        box.parentElement.querySelectorAll('input[type="range"]').length === 1
    )
        box = box.parentElement
    return box
}

function slot(prefix: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${prefix}: `) })
}

/** The sample with no plans, and only what you wear's results. */
function noPlansFile() {
    return variant((file) => {
        file.plans = []
        file.results = (file.results as { gear: string }[]).filter(
            (result) => result.gear === 'worn'
        )
    })
}

/** Every slot button in the gear card (named `<Label>: …`). */
function slotButtons(): HTMLElement[] {
    return [...gearPane().querySelectorAll<HTMLElement>('button')].filter(
        (button) =>
            /^[A-Z][\w -]*: /.test(button.getAttribute('aria-label') ?? '')
    )
}

/** Whether the page's text holds `text`, spaces aside. */
function pageSays(text: string): boolean {
    return squeeze(document.body.textContent).includes(squeeze(text))
}

/** Whether a button named exactly `name` is on the page. */
function hasButton(name: string): boolean {
    return screen.queryByRole('button', { name }) !== null
}

/** Whether any slot button shows a gap (`↓`) or `BIS` badge. */
function anySlotBadge(): boolean {
    return slotButtons().some(
        (button) =>
            button.querySelector('[data-size]') !== null ||
            button.querySelector('[data-sim-best]') !== null ||
            /↓|\bBIS\b/.test(button.textContent ?? '') ||
            (button.getAttribute('aria-label') ?? '').includes("the sim's best")
    )
}

afterEach(() => {
    cleanup()
})

describe('the plan view', () => {
    test('the sample opens on What you wear, with Current chosen in the View switch', async () => {
        await openSample()

        expect(paneStatus()).toBe('What you wear')
        expect(viewRadio('Current').checked).toBe(true)
        expect(viewRadio('BIS').checked).toBe(false)
    })

    test('choosing BIS shows Max damage and Ferine Leggings in Legs', async () => {
        const user = await openSample()
        await showPlan(user)

        expect(paneStatus()).toBe("The sim's plan for your mix: max damage")
        expect(viewRadio('BIS').checked).toBe(true)
        expect(within(slot('Legs')).getByText('Ferine Leggings')).toBeDefined()
    })

    test('in the plan view Totem is the same as what you wear, and Legs shows where Ferine Leggings come from and says what it replaces', async () => {
        const user = await openSample()
        await showPlan(user)

        const relic = screen.getByRole('button', {
            name: 'Totem: Unnamed totem (263412), same as what you wear',
        })
        expect(within(relic).getByText('Same as you wear')).toBeDefined()
        expect(relic.querySelector('[data-size]')).toBeNull()

        // The plan view's slots have no gap badge, so no gap in the name.
        const legs = screen.getByRole('button', {
            name: 'Legs: Ferine Leggings',
        })
        // The line under the name is the new item's source, as the mockup
        // shows it (`Drop: ` left off); what it replaces is the button's
        // description, read out after its name, and not shown.
        const note = within(legs).getByText(
            'Agathelos the Raging, Razorfen Kraul'
        )
        expect(note.className).not.toContain('sr-only')
        expect(description(legs)).toBe("Replaces Trapper's Leather Legguards")
        expect(
            within(legs).getByText("Replaces Trapper's Leather Legguards")
                .className
        ).toContain('sr-only')
    })

    test('a file with no plans has no View switch and no Stat Priority', async () => {
        const noPlans = noPlansFile()

        // The sample has both, so their absence below comes from the plans.
        await openSample()
        expect(hasViewSwitch()).toBe(true)
        expect(screen.getByText('Stat Priority')).toBeDefined()
        cleanup()

        await openFile(noPlans)

        expect(hasViewSwitch()).toBe(false)
        expect(screen.queryByText('Stat Priority')).toBeNull()
        expect(screen.queryByRole('slider', { name: 'Damage' })).toBeNull()
    })

    test('a file with no plans shows no slot badge, no total line, no Best: line, no callout card and no reading gap line', async () => {
        const noPlans = noPlansFile()

        // The sample shows each of them, so their absence below comes from
        // the plans.
        await openSample()
        expect(anySlotBadge()).toBe(true)
        expect(lineWith("in total below the sim's best set")).not.toBeNull()
        expect(hasButton('About the total')).toBe(true)
        expect(screen.queryAllByText('Best:').length).toBeGreaterThan(0)
        expect(hasButton("Defender's Leather Helm")).toBe(true)
        expect(pageSays('Berylline Pads are in your bags')).toBe(true)
        expect(hasButton('Equip')).toBe(true)
        expect(document.querySelector('[data-reading-gap]')).not.toBeNull()
        cleanup()
        localStorage.clear()

        await openFile(noPlans)

        // What you wear still shows, with its readings.
        expect(slotButtons().length).toBeGreaterThan(0)
        expect(
            screen.getByRole('button', {
                name: "Head: Brawler's Leather Hood",
            })
        ).toBeDefined()
        expect(readingValue('Solo')).toBe('103.7')

        // No slot badge (`↓ N` or `BIS`).
        expect(anySlotBadge()).toBe(false)
        // No total line.
        expect(lineWith("below the sim's best set")).toBeNull()
        expect(lineWith("Every slot matches the sim's best set")).toBeNull()
        expect(hasButton('About the total')).toBe(false)
        // No `Best:` lines.
        expect(screen.queryByText('Best:')).toBeNull()
        expect(hasButton("Defender's Leather Helm")).toBe(false)
        // No callout card, not even for the bag upgrade.
        expect(pageSays('Berylline Pads are in your bags')).toBe(false)
        expect(hasButton('Equip')).toBe(false)
        expect(hasButton('Wear them')).toBe(false)
        expect(hasButton('Add to wishlist')).toBe(false)
        expect(hasButton('Other options')).toBe(false)
        expect(pageSays('Best-in-slot for level')).toBe(false)
        // No gap line under any reading.
        expect(document.querySelector('[data-reading-gap]')).toBeNull()
    })
    test('the item picker opened from the plan view shows what it shows from the worn view', async () => {
        const user = await openSample()
        await user.click(slot('Legs'))
        const fromWorn = screen.getByRole('dialog', { name: 'Legs' })
        const wornText = fromWorn.textContent
        await user.click(
            within(fromWorn).getByRole('button', { name: 'Close' })
        )

        await showPlan(user)
        await user.click(slot('Legs'))
        const fromPlan = screen.getByRole('dialog', { name: 'Legs' })

        expect(wornText).toContain('Ferine Leggings')
        expect(fromPlan.textContent).toBe(wornText)
    })

    test('a plan item in a slot with nothing worn is described as Replaces nothing', async () => {
        const withTrinket = variant((file) => {
            const slots = file.slots as {
                slot: string
                alternatives: unknown[]
            }[]
            const trinket = slots.find((entry) => entry.slot === 'trinket_1')
            const ring = slots.find((entry) => entry.slot === 'finger_1')
                ?.alternatives[0] as { item: Record<string, unknown> }
            if (!trinket || !ring) throw new Error('the sample changed')
            trinket.alternatives.push({
                item: { ...ring.item, item_id: 999001, name: 'Test Trinket' },
                gain_ep: 5,
                gain_dps: null,
            })
            const plans = file.plans as { gear: Record<string, unknown> }[]
            for (const plan of plans) plan.gear.trinket_1 = 999001
        })
        const user = await openFile(withTrinket)
        await showPlan(user)

        const trinket = slot('Trinket 1')
        expect(within(trinket).getByText('Test Trinket')).toBeDefined()
        expect(within(trinket).getByText('Source unknown')).toBeDefined()
        expect(description(trinket)).toBe('Replaces nothing')
    })
})

describe('the role sliders', () => {
    test('Stat Priority sits in the card after the readings; the chart and damage split are in the band under the gear', async () => {
        await openSample()

        const card = screen.getByRole('complementary', {
            name: "The sim's numbers",
        })
        const sliders = screen
            .getByRole('heading', { name: 'Stat Priority' })
            .closest('section')
        expect(sliders).not.toBeNull()
        expect(card.contains(sliders)).toBe(true)

        const readings = within(card).getByRole('heading', {
            name: 'Simulator Data',
        })
        const follows = (a: Node, b: Node) =>
            Boolean(
                a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            )
        expect(follows(readings, sliders as Node)).toBe(true)

        const band = screen.getByRole('region', { name: 'Across the fight' })
        expect(card.contains(band)).toBe(false)
        expect(
            within(band).getByLabelText('DPS and mana over the fight')
        ).toBeDefined()
        expect(
            within(band).getByRole('heading', {
                name: 'Where the damage comes from',
            })
        ).toBeDefined()
        expect(follows(card, band)).toBe(true)
    })

    test('Damage, Survival, Healing and Utility start at 100, 0, 0 and 0', async () => {
        await openSample()

        expect(
            screen.getByRole('heading', { name: 'Stat Priority' })
        ).toBeDefined()
        expect(ROLES.map((role) => slider(role).value)).toEqual([
            '100',
            '0',
            '0',
            '0',
        ])
    })

    test('Healing and Utility are disabled and Not simmed yet; Damage and Survival are enabled', async () => {
        await openSample()

        for (const role of ['Healing', 'Utility']) {
            const input = slider(role)
            expect(input.disabled).toBe(true)
            expect(input.value).toBe('0')
            expect(input.getAttribute('aria-valuetext')).toBe('Not simmed yet')
            expect(sliderBox(input).textContent).toContain('Not simmed yet')
        }
        for (const role of ['Damage', 'Survival']) {
            expect(slider(role).disabled).toBe(false)
            expect(sliderBox(slider(role)).textContent).not.toContain(
                'Not simmed yet'
            )
        }
    })

    test('each slider says how far it can reach with this mix, and the track past it is hatched', async () => {
        await openSample()

        expect(
            screen.getByText(
                'Raising one role lowers how far the others can go. The hatched part is out of reach with this mix.'
            )
        ).toBeDefined()
        const reach = ROLES.map(
            (role) =>
                sliderBox(slider(role)).querySelector('p')?.textContent ?? ''
        )
        expect(reach).toEqual([
            'No limit with this mix',
            'Can reach 35 with this mix',
            'Can reach 20 with this mix',
            'Can reach 40 with this mix',
        ])
        expect(description(slider('Survival'))).toBe(
            'Can reach 35 with this mix'
        )
        expect(slider('Survival').getAttribute('aria-valuetext')).toBe(
            '0, can reach up to 35'
        )
        expect(
            sliderBox(slider('Damage')).querySelector(
                '[data-slot="slider-out-of-reach"]'
            )
        ).toBeNull()
        expect(
            (
                sliderBox(slider('Survival')).querySelector(
                    '[data-slot="slider-out-of-reach"]'
                ) as HTMLElement
            ).style.left
        ).toBe('35%')
    })

    test('a slider stops at its reach: Survival stops at 35 while Damage is at 100', async () => {
        await openSample()
        setSlider('Survival', 80)
        expect(slider('Survival').value).toBe('35')
        expect(picksLine()).toBe('Your mix picks the max damage set.')
    })

    test('a file without reach shows no Can reach line and no hatching, and the sliders go anywhere', async () => {
        await openFile(
            variant((file) => {
                for (const plan of file.plans as Record<string, unknown>[])
                    delete plan.reach
            })
        )
        expect(document.body.textContent ?? '').not.toContain('Can reach')
        expect(document.body.textContent ?? '').not.toContain('hatched')
        expect(
            document.querySelector('[data-slot="slider-out-of-reach"]')
        ).toBeNull()
        setSlider('Survival', 80)
        expect(slider('Survival').value).toBe('80')
    })

    test('each slider is a native range input from 0 to 100 in steps of 1', async () => {
        await openSample()

        for (const role of ROLES) {
            const input = slider(role)
            expect(input.tagName.toLowerCase()).toBe('input')
            expect(input.getAttribute('type')).toBe('range')
            expect(input.getAttribute('min')).toBe('0')
            expect(input.getAttribute('max')).toBe('100')
            expect(input.getAttribute('step')).toBe('1')
        }
    })

    test('arrow keys are left to the browser: each slider is a native range in steps of 1 that takes a change', async () => {
        // happy-dom doesn't step a range input on an arrow key, so this
        // checks what the browser needs to: a native range, step 1, and a
        // handled change event, which is what an arrow key fires.
        await openSample()

        for (const role of ['Damage', 'Survival']) {
            const input = slider(role)
            expect(input.type).toBe('range')
            expect(input.step).toBe('1')
            const next = Number(input.value) === 100 ? 99 : 1
            setSlider(role, next)
            expect(slider(role).value).toBe(String(next))
        }
    })

    test('Damage 45 and Survival 80 pick Damage and survival and put Kodohide Legguards in Legs', async () => {
        await openSample()
        toDamageAndSurvival()

        expect(picksLine()).toBe('Your mix picks the damage and survival set.')
        expect(slider('Damage').value).toBe('45')
        expect(slider('Survival').value).toBe('80')
        expect(
            within(slot('Legs')).getByText('Kodohide Legguards')
        ).toBeDefined()
    })

    test('then Damage at 40 picks Max survival, whose numbers the readings show', async () => {
        await openSample()
        toDamageAndSurvival()
        setSlider('Damage', 40)

        expect(picksLine()).toBe('Your mix picks the max survival set.')
        expect(paneStatus()).toBe("The sim's plan for your mix: max survival")
        expect(readingValue('Health')).toBe('1790')
    })

    test('moving a slider on the worn view switches to the plan and says so, until Current is chosen', async () => {
        const user = await openSample()
        expect(screen.queryByText(SWITCHED)).toBeNull()

        toDamageAndSurvival()

        expect(paneStatus()).toBe(
            "The sim's plan for your mix: damage and survival"
        )
        expect(viewRadio('BIS').checked).toBe(true)
        expect(screen.getByText(SWITCHED, { exact: false })).toBeDefined()

        // Going back to what you wear clears the line.
        await user.click(viewRadio('Current'))

        expect(paneStatus()).toBe('What you wear')
        expect(screen.queryByText(SWITCHED, { exact: false })).toBeNull()
    })

    test('the page always says the sliders pick from ready-made plans', async () => {
        const user = await openSample()
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()

        await showPlan(user)
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()

        toDamageAndSurvival()
        expect(screen.getByText(NOTHING_RESIMMED)).toBeDefined()
    })

    test('a picked plan with no chain result reads Not simmed and leaves the pull chart to what you wear, until a fight it has', async () => {
        const user = await openSample()
        await chooseFight(user, CHAIN)
        toDamageAndSurvival()

        // Damage and survival has no result on the chain fight.
        expect(readingValue('Solo')).toBe('111.0')
        expect(readingValue('Health')).toBe('Not simmed')
        expect(readingValue('Armor')).toBe('Not simmed')
        expect(readingValue('Resource Empty')).toBe('Not simmed')
        expect(screen.getByLabelText('DPS and mana per pull')).toBeDefined()
        expect(screen.getByText('DPS, what you wear')).toBeDefined()
        expect(screen.getByText('Mana, what you wear')).toBeDefined()
        expect(screen.queryByText("DPS, sim's plan")).toBeNull()
        expect(screen.queryByText("Mana, sim's plan")).toBeNull()
        expect(
            screen.getByText('In what you wear you run dry in pull 3.')
        ).toBeDefined()
        expect(document.body.textContent ?? '').not.toMatch(
            /The sim's plan (runs|holds|keeps|wasn't)/
        )

        await chooseFight(user, 'Dungeon, 2 min vs level 33')

        expect(readingValue('Dungeon')).toBe('80.2')
        expect(
            screen.getByLabelText('DPS and mana over the fight')
        ).toBeDefined()
        expect(screen.getByText("DPS, sim's plan")).toBeDefined()
        expect(screen.getByText("Mana, sim's plan")).toBeDefined()
        expect(screen.getByText('Worn: out of mana 0:48')).toBeDefined()
        expect(screen.getByText('Plan: out of mana 0:52')).toBeDefined()
        expect(
            screen.getByText(sentence("The sim's plan holds out to 0:52."))
        ).toBeDefined()
    })

    test('the one-plan sample says so, enables only Damage, and keeps Max damage when it moves', async () => {
        await openFile(firstRun)

        expect(
            screen.getByText(`${NOTHING_RESIMMED} This file has one plan.`)
        ).toBeDefined()
        expect(slider('Damage').disabled).toBe(false)
        for (const role of ['Survival', 'Healing', 'Utility'])
            expect(slider(role).disabled).toBe(true)

        setSlider('Damage', 40)

        expect(slider('Damage').value).toBe('40')
        expect(paneStatus()).toBe("The sim's plan for your mix: max damage")
    })
})
