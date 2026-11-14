/**
 * Which plan the page picks: the default plan it opens on, and the plan
 * closest to the sliders. Both break ties by file order.
 */
import { describe, expect, test } from 'bun:test'

import { closestPlan, defaultPlan, type Mix, type Plan } from '../src/plans'
import { SLOTS } from '../src/results-file'

function plan(plan_id: string, damage: number, survival: number): Plan {
    return {
        plan_id,
        label: plan_id,
        mix: { damage, survival, healing: 0, utility: 0 },
        gear: Object.fromEntries(
            SLOTS.map((slot) => [slot, null])
        ) as Plan['gear'],
    }
}

const mix = (damage: number, survival: number): Mix => ({
    damage,
    survival,
    healing: 0,
    utility: 0,
})

describe('the default plan', () => {
    test('on equal max damage, the first plan in file order wins', () => {
        const first = plan('first', 80, 20)
        const second = plan('second', 80, 60)
        expect(defaultPlan([first, second])).toBe(first)
        expect(defaultPlan([second, first])).toBe(second)
    })

    test('no plans, no default plan', () => {
        expect(defaultPlan([])).toBeNull()
    })
})

describe('the closest plan', () => {
    test('on equal distance, the first plan in file order wins', () => {
        // (50, 50) is as far from (100, 0) as from (0, 100).
        const damage = plan('damage', 100, 0)
        const survival = plan('survival', 0, 100)
        expect(closestPlan([damage, survival], mix(50, 50))).toBe(damage)
        expect(closestPlan([survival, damage], mix(50, 50))).toBe(survival)
    })

    test('a nearer plan beats an earlier one', () => {
        const damage = plan('damage', 100, 0)
        const survival = plan('survival', 0, 100)
        expect(closestPlan([damage, survival], mix(49, 51))).toBe(survival)
    })
})
