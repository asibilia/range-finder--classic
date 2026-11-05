/**
 * The baseline game the Turbo tests start from: a Shaman on Forever, out of
 * combat, who knows every spell Turbo asks about.
 *
 * This file holds no tests. It ends in `.test.ts` only so it lives with the
 * tests; bun shares modules between test files, so a test declared here
 * would run under whichever file imported it first.
 *
 * @example
 * ```typescript
 * const g = loadTurbo()
 * scriptShamanOnForever(g, { inCombat: [true] })
 * ```
 */
import type { FakeGame } from './fake-game'

/** Readings to script over the baseline: each name's return values. */
export type Readings = Record<string, unknown[]>

/** `UnitClass("player")` for a Shaman: name, token, id. */
export const SHAMAN = ['Shaman', 'SHAMAN', 7]

/**
 * Scripts the readings Turbo takes: a Shaman on the Forever client, out of
 * combat, knowing every spell. Spell names are left unscripted, so a test
 * that needs them scripts them.
 *
 * @param overrides - readings to script instead of the baseline's
 */
export function scriptShamanOnForever(g: FakeGame, overrides: Readings = {}) {
    const readings: Readings = {
        interface: [16001],
        flavor: ['forever'],
        playerClass: SHAMAN,
        inCombat: [false],
        spellKnown: [true],
        // Forever's project ID says "retail" (1). Turbo must never rely on it.
        projectId: [1],
        ...overrides,
    }
    for (const [name, values] of Object.entries(readings)) {
        g.setReading(name, ...values)
    }
}
