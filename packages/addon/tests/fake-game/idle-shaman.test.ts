/**
 * The baseline game the Turbo tests start from: a Shaman on Forever, out of
 * combat with no target, and nothing for any module to report.
 *
 * This file holds no tests. It ends in `.test.ts` only so it lives with the
 * tests; bun shares modules between test files, so a test declared here
 * would run under whichever file imported it first.
 *
 * @example
 * ```typescript
 * const g = loadTurbo()
 * scriptIdleShaman(g, { inCombat: [true] })
 * ```
 */
import type { FakeGame } from './fake-game'

/** Readings to script over the baseline: each name's return values. */
export type Readings = Record<string, unknown[]>

/** `UnitClass("player")` for a Shaman: name, token, id. */
export const SHAMAN = ['Shaman', 'SHAMAN', 7]

function apply(g: FakeGame, readings: Readings) {
    for (const [name, values] of Object.entries(readings)) {
        g.setReading(name, ...values)
    }
}

/**
 * Scripts the readings Turbo's core takes at login: a Shaman on the Forever
 * client, out of combat with no target. Modules' readings are left
 * unscripted, so a module that reads one fails loudly.
 *
 * @param overrides - readings to script instead of the baseline's
 */
export function scriptShamanOnForever(g: FakeGame, overrides: Readings = {}) {
    apply(g, {
        interface: [16001],
        flavor: ['forever'],
        playerClass: SHAMAN,
        inCombat: [false],
        targetAttackable: [false],
        // Forever's project ID says "retail" (1). Turbo must never rely on it.
        projectId: [1],
        ...overrides,
    })
}

/**
 * Scripts a Shaman on Forever with every v1 module idle: no target in range,
 * no totems down, no imbue, no Lightning Shield, no Maelstrom Weapon, every
 * shock ready and castable, and a secret mana value.
 *
 * @param overrides - readings to script instead of the baseline's
 */
export function scriptIdleShaman(g: FakeGame, overrides: Readings = {}) {
    scriptShamanOnForever(g)
    apply(g, {
        // The range finder: nothing to report.
        spellInRange: [null],
        itemInRange: [null],
        // Totem timers: no totems down (the have-totem flag says true anyway).
        totemDurationSupported: [true],
        totemTimeLeft: [0],
        totemDuration: [undefined],
        totemInfo: [true, '', 0, 0, undefined],
        // The weapon imbue and reminders.
        mainHandEnchant: [null],
        resting: [false],
        mounted: [false],
        onTaxi: [false],
        // Lightning Shield: no aura, and the aura container widget exists.
        lightningShield: [false],
        auraContainerSupported: [true],
        // Maelstrom Weapon: no stacks.
        maelstromWeapon: [0],
        // Key cooldowns.
        spellKnown: [true],
        spellTexture: [136026],
        spellCooldown: [{ isActive: false, isOnGCD: false }],
        spellCooldownDuration: [g.secret('cooldown', 'userdata')],
        spellUsable: [true, false],
        // The mana bar.
        manaMax: [1000],
        mana: [g.secret('mana')],
        manaColor: [g.secret('r'), g.secret('g'), g.secret('b')],
        ...overrides,
    })
}
