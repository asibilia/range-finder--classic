/**
 * The out-of-mana sentences: the plan's in the approved mockup's words,
 * compared with what you wear, and the never and not-simmed variants.
 */
import { describe, expect, test } from 'bun:test'

import { planManaWords, wornManaWords } from '../src/mana-words'

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
