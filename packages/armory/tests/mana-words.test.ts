/**
 * The out-of-mana sentences: the plan's in the approved mockup's words,
 * compared with what you wear, and the never and not-simmed variants.
 */
import { describe, expect, test } from 'bun:test'

import { dryPull, planManaWords, wornManaWords } from '../src/mana-words'

const KEPT = 'keeps mana to the end'

describe("the sim's plan and mana", () => {
    test('holds out to a later time than what you wear', () => {
        expect(planManaWords(57, KEPT, null, 48)).toBe(
            "The sim's plan holds out to 0:57."
        )
    })

    test('runs dry sooner, or at the same time', () => {
        expect(planManaWords(45, KEPT, null, 48)).toBe(
            "The sim's plan runs dry sooner, at 0:45."
        )
        expect(planManaWords(48.7, KEPT, null, 48.2)).toBe(
            "The sim's plan runs dry at the same time."
        )
    })

    test('with nothing to compare (what you wear never runs dry, or not simmed) it says the time alone', () => {
        expect(planManaWords(57, KEPT, null, 'never')).toBe(
            "The sim's plan runs out at 0:57."
        )
        expect(planManaWords(57, KEPT, null, null)).toBe(
            "The sim's plan runs out at 0:57."
        )
    })

    test('never, not simmed and the pull it ran dry in', () => {
        expect(planManaWords('never', KEPT, null, 48)).toBe(
            "The sim's plan keeps mana to the end."
        )
        expect(planManaWords(null, KEPT, null, 48)).toBe(
            "The sim's plan wasn't checked for running out of mana."
        )
        expect(planManaWords(124, 'keeps mana', 3, 118)).toBe(
            "The sim's plan runs dry in pull 3."
        )
    })
})

describe('what you wear and mana', () => {
    test('a time, never, and not simmed', () => {
        expect(wornManaWords(48, 'keep mana to the end')).toBe(
            'In what you wear you run out of mana at 0:48.'
        )
        expect(wornManaWords('never', 'keep mana to the end')).toBe(
            'In what you wear you keep mana to the end.'
        )
        expect(wornManaWords(null, 'keep mana to the end')).toBe(
            "In what you wear the sim didn't check when mana runs out."
        )
    })
})

describe('the pull a chain fight runs dry in', () => {
    // Four 30 s pulls, 20 s apart: pull 1 is 0-30 s, pull 2 50-80 s, pull 3
    // 100-130 s, pull 4 150-180 s, wall time from the start of pull 1.
    const CHAIN = { duration_s: 30, setup: { pulls: 4, gap_s: 20 } }

    test('is the pull whose span out_of_mana_s falls in, whatever its mana_end (the sim can regain a little after 0)', () => {
        expect(dryPull(118, CHAIN)).toBe(3)
        expect(dryPull(0, CHAIN)).toBe(1)
        expect(dryPull(30, CHAIN)).toBe(1)
        expect(dryPull(100, CHAIN)).toBe(3)
        expect(dryPull(180, CHAIN)).toBe(4)
    })

    test('in a gap it is the next pull, the one you start with no mana', () => {
        expect(dryPull(31, CHAIN)).toBe(2)
        expect(dryPull(140, CHAIN)).toBe(4)
    })

    test('never, not simmed, or past the last pull is no pull', () => {
        expect(dryPull('never', CHAIN)).toBeNull()
        expect(dryPull(null, CHAIN)).toBeNull()
        expect(dryPull(181, CHAIN)).toBeNull()
        expect(dryPull(118, { duration_s: 30 })).toBeNull()
    })
})
