/**
 * The enemy level's con colour (`src/con-colour.ts`): the game's
 * `GetQuestDifficultyColor` rule with Classic's green range.
 */
import { describe, expect, test } from 'bun:test'

import { conColour, greenRange } from '../src/con-colour'

describe('conColour', () => {
    test('at level 33: 31 to 35 yellow, 36 and 37 orange, 38 and up red', () => {
        for (const level of [31, 32, 33, 34, 35])
            expect(conColour(level, 33)).toBe('yellow')
        expect(conColour(36, 33)).toBe('orange')
        expect(conColour(37, 33)).toBe('orange')
        expect(conColour(38, 33)).toBe('red')
        expect(conColour(45, 33)).toBe('red')
    })

    test('at level 33: 25 to 30 green (a green range of 8), 24 and below grey', () => {
        expect(conColour(30, 33)).toBe('green')
        expect(conColour(25, 33)).toBe('green')
        expect(conColour(24, 33)).toBe('grey')
        expect(conColour(20, 33)).toBe('grey')
    })

    test("the green range is Classic's: 5 to level 5, level/10 + 5 to 39, level/5 + 1 to 59, then 9", () => {
        expect(greenRange(1)).toBe(5)
        expect(greenRange(5)).toBe(5)
        expect(greenRange(6)).toBe(5)
        expect(greenRange(10)).toBe(6)
        expect(greenRange(33)).toBe(8)
        expect(greenRange(39)).toBe(8)
        expect(greenRange(40)).toBe(9)
        expect(greenRange(55)).toBe(12)
        expect(greenRange(59)).toBe(12)
        expect(greenRange(60)).toBe(9)
    })

    test('at level 60: 51 green, 50 grey', () => {
        expect(conColour(51, 60)).toBe('green')
        expect(conColour(50, 60)).toBe('grey')
    })
})
