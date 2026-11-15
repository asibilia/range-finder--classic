/**
 * The page's state and its pure actions (`src/planner-state.ts`): what any
 * caller outside the components (a test, a script, an agent) uses to set the
 * sliders, pick a plan or pick a fight, without rendering anything.
 */
import { describe, expect, test } from 'bun:test'

import {
    applyPlannerAction,
    initialPlannerState,
    pickedPlan,
    pickFight,
    pickPlan,
    plannerReducer,
    setSliders,
    showView,
} from '../src/planner-state'
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

describe('the opening state', () => {
    test('is the default fight, the sliders at Max damage, on what you wear', () => {
        expect(initialPlannerState(sample)).toEqual({
            fightId: 'chain-4',
            mix: { damage: 100, survival: 0, healing: 0, utility: 0 },
            view: 'worn',
            switched: false,
        })
        expect(pickedPlan(sample, initialPlannerState(sample))?.label).toBe(
            'Max damage'
        )
    })

    test('a file with no plans has no sliders and no plan', () => {
        const noPlans = { ...sample, plans: [] }
        const state = initialPlannerState(noPlans)
        expect(state.mix).toBeNull()
        expect(pickedPlan(noPlans, state)).toBeNull()
        expect(showView(noPlans, state, 'plan')).toBe(state)
    })
})

describe('set sliders', () => {
    test('Survival 80 picks Damage and survival and switches to the plan, saying so', () => {
        const state = setSliders(sample, initialPlannerState(sample), {
            survival: 80,
        })
        expect(state.mix).toEqual({
            damage: 100,
            survival: 80,
            healing: 0,
            utility: 0,
        })
        expect(state.view).toBe('plan')
        expect(state.switched).toBe(true)
        expect(pickedPlan(sample, state)?.plan_id).toBe('damage-survival')
    })

    test('a role no plan has stays at 0', () => {
        const state = setSliders(sample, initialPlannerState(sample), {
            healing: 70,
        })
        expect(state.mix?.healing).toBe(0)
    })

    test('the one-plan file keeps Max damage however the sliders move', () => {
        const state = setSliders(firstRun, initialPlannerState(firstRun), {
            damage: 10,
        })
        expect(state.mix?.damage).toBe(10)
        expect(pickedPlan(firstRun, state)?.plan_id).toBe('max-damage')
    })

    test('moving them on the plan view does not say it switched', () => {
        const onPlan = showView(sample, initialPlannerState(sample), 'plan')
        expect(setSliders(sample, onPlan, { survival: 80 }).switched).toBe(
            false
        )
    })
})

describe('pick plan and pick fight', () => {
    test('pick plan moves the sliders to its mix and shows it', () => {
        const state = pickPlan(
            sample,
            initialPlannerState(sample),
            'max-survival'
        )
        expect(state.mix).toEqual({
            damage: 30,
            survival: 100,
            healing: 0,
            utility: 0,
        })
        expect(state.view).toBe('plan')
        expect(pickedPlan(sample, state)?.label).toBe('Max survival')
    })

    test('pick fight puts the card on another fight; an unknown one changes nothing', () => {
        const start = initialPlannerState(sample)
        expect(pickFight(sample, start, 'dungeon-long').fightId).toBe(
            'dungeon-long'
        )
        expect(pickFight(sample, start, 'raid')).toBe(start)
        expect(pickPlan(sample, start, 'no-such-plan')).toBe(start)
    })

    test('show what I wear drops the switched line', () => {
        const switched = setSliders(sample, initialPlannerState(sample), {
            survival: 80,
        })
        const worn = plannerReducer(sample, switched, { type: 'show-worn' })
        expect(worn.view).toBe('worn')
        expect(worn.switched).toBe(false)
    })
})

describe('actions from outside the page', () => {
    test('a checked action applies', () => {
        const outcome = applyPlannerAction(
            sample,
            initialPlannerState(sample),
            {
                type: 'pick-fight',
                fight_id: 'solo-hit-short',
            }
        )
        expect(outcome.ok && outcome.state.fightId).toBe('solo-hit-short')
    })

    test('an unknown action, a slider out of range or a camelCase key is refused with a reason', () => {
        const start = initialPlannerState(sample)
        for (const input of [
            { type: 'equip', item_id: 1 },
            { type: 'set-sliders', mix: { damage: 140 } },
            { type: 'pick-fight', fightId: 'solo-hit-short' },
        ]) {
            const outcome = applyPlannerAction(sample, start, input)
            expect(outcome.ok).toBe(false)
            if (!outcome.ok) expect(outcome.problems.length).toBeGreaterThan(0)
        }
    })
})
