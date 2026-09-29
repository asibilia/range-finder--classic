/**
 * Debug mode under the fake game: `/turbo debug` switches a log of which
 * values each module sees as readable or secret, under which restrictions.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - Modules report a value they got with
 *   `ns.debug.record(moduleId, valueName, value)`. The log never keeps the
 *   value itself when it's secret, and never reads it.
 * - `ns.debug.entries()` returns the log, oldest first, as a list of
 *   `{ module, value, status, restrictions }`: `status` is `"readable"` or
 *   `"secret"`, and `restrictions` lists the restriction kinds on when the
 *   value was recorded (`{}` when none is).
 * - `ns.debug.isOn()` answers whether debug mode is on.
 * - Restrictions: combat follows `PLAYER_REGEN_DISABLED` / `_ENABLED`; the
 *   other kinds follow `ADDON_RESTRICTION_STATE_CHANGED` (type 1 encounter,
 *   4 map; state 0 inactive, 2 active).
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { loadTurbo, type FakeGame } from './fake-game/fake-game'
import { scriptIdleShaman } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined
let extraGames: FakeGame[] = []

afterEach(() => {
    game?.close()
    game = undefined
    for (const g of extraGames) g.close()
    extraGames = []
})

type Entry = {
    module: string
    value: string
    status: string
    restrictions: string[]
}

/** Loads Turbo as a Shaman on Forever, out of combat with no target. */
function start(savedVariables?: Record<string, unknown>): FakeGame {
    const g = loadTurbo(savedVariables ? { savedVariables } : {})
    scriptIdleShaman(g)
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

function enterCombat(g: FakeGame) {
    g.setReading('inCombat', true)
    g.fire('PLAYER_REGEN_DISABLED')
}

function leaveCombat(g: FakeGame) {
    g.setReading('inCombat', false)
    g.fire('PLAYER_REGEN_ENABLED')
}

const ENCOUNTER = 1
const MAP = 4
const INACTIVE = 0
const ACTIVE = 2

function restriction(g: FakeGame, kind: number, on: boolean) {
    g.fire('ADDON_RESTRICTION_STATE_CHANGED', kind, on ? ACTIVE : INACTIVE)
}

/** A module reports one value it got from the game. */
function record(g: FakeGame, module: string, name: string, value: unknown) {
    g.run('ns.debug.record(...)', module, name, value)
}

function entries(g: FakeGame): Entry[] {
    const list = g.run('return ns.debug.entries()')[0]
    return Array.isArray(list) ? (list as Entry[]) : []
}

function isOn(g: FakeGame): unknown {
    return g.run('return ns.debug.isOn()')[0]
}

/** Every non-table value in a saved table, keyed by its dotted path. */
function leaves(value: unknown, path = ''): Record<string, unknown> {
    if (value !== null && typeof value === 'object') {
        return Object.assign(
            {},
            ...Object.entries(value).map(([k, v]) =>
                leaves(v, path ? `${path}.${k}` : k)
            )
        )
    }
    return { [path]: value }
}

/** The player's stored changes: every saved value but the schema version. */
function storedChanges(g: FakeGame): Record<string, unknown> {
    const all = leaves(g.global('TurboDB'))
    delete all.schemaVersion
    return all
}

/** Logs in with debug mode switched on by `/turbo debug`. */
function startDebugging(): FakeGame {
    const g = start()
    login(g)
    g.slash('/turbo debug')
    return g
}

describe('/turbo debug', () => {
    test('debug mode is off by default: nothing is logged and nothing is saved', () => {
        game = start()
        login(game)

        expect(isOn(game)).toBe(false)
        record(game, 'manaBar', 'maxMana', 4200)
        record(game, 'manaBar', 'mana', game.secret('mana'))

        expect(entries(game)).toEqual([])
        expect(storedChanges(game)).toEqual({})
    })

    test('/turbo debug turns logging on, and typing it again turns it off', () => {
        game = start()
        login(game)

        game.slash('/turbo debug')
        expect(isOn(game)).toBe(true)
        record(game, 'manaBar', 'maxMana', 4200)
        expect(entries(game).map((e) => e.value)).toEqual(['maxMana'])

        game.slash('/turbo debug')
        expect(isOn(game)).toBe(false)
        const before = entries(game).length
        record(game, 'manaBar', 'mana', game.secret('mana'))
        record(game, 'swingTimer', 'swingDuration', 3.4)
        expect(entries(game)).toHaveLength(before)
    })

    test('/tb debug toggles debug mode just like /turbo debug', () => {
        game = start()
        login(game)

        game.slash('/tb debug')
        expect(isOn(game)).toBe(true)
        game.slash('/tb debug')
        expect(isOn(game)).toBe(false)
    })

    test('toggling debug mode tells the player whether it is now on or off', () => {
        game = start()
        login(game)

        let mark = game.printed().length
        game.slash('/turbo debug')
        const on = game.printed().slice(mark).join('\n')
        expect(on).toMatch(/debug/i)
        expect(on).toMatch(/\bon\b/i)

        mark = game.printed().length
        game.slash('/turbo debug')
        const off = game.printed().slice(mark).join('\n')
        expect(off).toMatch(/debug/i)
        expect(off).toMatch(/\boff\b/i)
    })

    test('the /turbo help names the debug command', () => {
        game = start()
        login(game)
        const mark = game.printed().length

        game.slash('/turbo help')

        const help = game.printed().slice(mark).join('\n')
        expect(help).toMatch(/\/turbo debug/)
    })

    test('debug mode stays on after a reload, and turning it off again leaves nothing saved', () => {
        const first = startDebugging()
        extraGames.push(first)
        expect(Object.keys(storedChanges(first)).length).toBeGreaterThan(0)
        const saved = first.global('TurboDB')

        game = start({ TurboDB: saved })
        login(game)
        expect(isOn(game)).toBe(true)
        record(game, 'manaBar', 'maxMana', 4200)
        expect(entries(game).map((e) => e.value)).toEqual(['maxMana'])

        game.slash('/turbo debug')
        expect(isOn(game)).toBe(false)
        expect(storedChanges(game)).toEqual({})
    })
})

describe('the debug log', () => {
    test('a plain value is logged as readable, under the module that saw it', () => {
        game = startDebugging()

        record(game, 'manaBar', 'maxMana', 4200)

        expect(entries(game)).toEqual([
            {
                module: 'manaBar',
                value: 'maxMana',
                status: 'readable',
                restrictions: [],
            },
        ])
    })

    test('a secret stand-in is logged as secret without being read', () => {
        const g = startDebugging()
        game = g
        const mana = g.secret('mana')

        // The fake game fails this step if the log reads, compares,
        // stringifies or does math on the stand-in, even inside a pcall.
        expect(() => record(g, 'manaBar', 'mana', mana)).not.toThrow()

        expect(entries(g)).toEqual([
            {
                module: 'manaBar',
                value: 'mana',
                status: 'secret',
                restrictions: [],
            },
        ])
    })

    test('the same value name is logged separately for each module that reports it', () => {
        game = startDebugging()

        record(game, 'swingTimer', 'rangeBand', 'melee')
        record(game, 'rangeFinder', 'rangeBand', game.secret('band'))

        expect(entries(game).map((e) => [e.module, e.value, e.status])).toEqual(
            [
                ['swingTimer', 'rangeBand', 'readable'],
                ['rangeFinder', 'rangeBand', 'secret'],
            ]
        )
    })

    test('each value is logged with the restrictions that were on: none out of combat, combat in combat', () => {
        game = startDebugging()

        record(game, 'manaBar', 'maxMana', 4200)
        enterCombat(game)
        record(game, 'manaBar', 'mana', game.secret('mana'))
        leaveCombat(game)
        record(game, 'manaBar', 'mana', 3100)

        expect(
            entries(game).map((e) => [e.value, e.status, e.restrictions])
        ).toEqual([
            ['maxMana', 'readable', []],
            ['mana', 'secret', ['combat']],
            ['mana', 'readable', []],
        ])
    })

    test('restrictions beyond combat are logged too: an encounter and a restricted map', () => {
        game = startDebugging()

        enterCombat(game)
        restriction(game, ENCOUNTER, true)
        record(game, 'lightningShield', 'charges', game.secret('charges'))
        restriction(game, ENCOUNTER, false)
        leaveCombat(game)
        restriction(game, MAP, true)
        record(game, 'weaponImbue', 'timeLeft', 1800)

        const logged = entries(game)
        expect(logged).toHaveLength(2)
        expect(logged[0]?.module).toBe('lightningShield')
        expect(logged[0]?.status).toBe('secret')
        expect([...(logged[0]?.restrictions ?? [])].sort()).toEqual([
            'combat',
            'encounter',
        ])
        expect(logged[1]?.module).toBe('weaponImbue')
        expect(logged[1]?.status).toBe('readable')
        expect(logged[1]?.restrictions).toEqual(['map'])
    })

    test('the log never keeps a secret value: not in the log, the saved data or anywhere in the namespace', () => {
        game = startDebugging()

        enterCombat(game)
        record(game, 'manaBar', 'mana', game.secret('mana'))
        record(game, 'lightningShield', 'charges', game.secret('charges'))
        leaveCombat(game)

        expect(entries(game)).toHaveLength(2)
        expect(JSON.stringify(entries(game))).not.toContain('$secret')
        expect(JSON.stringify(game.global('TurboDB'))).not.toContain('$secret')
        expect(JSON.stringify(game.run('return ns'))).not.toContain('$secret')
    })

    test('the log is bounded: it stops growing, and keeps the newest values', () => {
        game = startDebugging()
        const total = 5000

        game.run(
            `
            local total = ...
            for i = 1, total do
                ns.debug.record("manaBar", "value" .. i, i)
            end
            `,
            total
        )

        const logged = entries(game)
        expect(logged.length).toBeGreaterThan(0)
        expect(logged.length).toBeLessThan(total)
        expect(logged[logged.length - 1]?.value).toBe(`value${total}`)
        expect(logged.some((e) => e.value === 'value1')).toBe(false)
    })
})

/** Saved data with debug mode left on by the last session. */
const DEBUG_SAVED = {
    TurboDB: { schemaVersion: 1, classes: { SHAMAN: { debug: true } } },
}

/** The game's totem slot for Earth. */
const EARTH = 2

/** The log's entries for one module, as `[value, status, restrictions]`. */
function loggedFor(g: FakeGame, module: string): [string, string, string[]][] {
    return entries(g)
        .filter((e) => e.module === module)
        .map((e) => [e.value, e.status, e.restrictions])
}

function isSecretArg(value: unknown, label: string): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { $secret?: string }).$secret === label
    )
}

/** An Earth totem down, as the game reports it in combat. */
function scriptEarthTotemInCombat(g: FakeGame) {
    g.setReading('totemTimeLeft', 42)
    g.setReading('totemDuration', g.secret('earth-duration', 'userdata'))
    g.setReading(
        'totemInfo',
        true,
        'Strength of Earth Totem',
        g.secret('earth-start'),
        g.secret('earth-length'),
        136023
    )
}

describe("the debug log, fed by the modules' own readings", () => {
    test("a login with debug mode saved leaves the modules' first reads out of the log", () => {
        game = start(DEBUG_SAVED)
        login(game)

        expect(isOn(game)).toBe(true)
        // The mana bar read a secret mana while it started; it isn't logged,
        // though a secret is logged at any other time.
        expect(game.reads().some((r) => r.name === 'mana')).toBe(true)
        expect(loggedFor(game, 'manaBar')).toEqual([])
        expect(loggedFor(game, 'totemTimers')).toEqual([])
    })

    test("in combat, the mana bar's secret mana and a totem's readings are logged with the combat restriction", () => {
        game = start(DEBUG_SAVED)
        login(game)

        enterCombat(game)
        game.setReading('mana', game.secret('combat-mana'))
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')
        scriptEarthTotemInCombat(game)
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        const mana = loggedFor(game, 'manaBar')
        expect(mana).toContainEqual(['mana', 'secret', ['combat']])
        const totems = loggedFor(game, 'totemTimers')
        expect(totems).toContainEqual(['totemTimeLeft', 'readable', ['combat']])
        expect(totems).toContainEqual(['totemDuration', 'secret', ['combat']])
    })

    test("a reading's later return values are logged as name#2, name#3, each with its own status", () => {
        game = start(DEBUG_SAVED)
        login(game)

        enterCombat(game)
        scriptEarthTotemInCombat(game)
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        const totemInfo = loggedFor(game, 'totemTimers').filter(([value]) =>
            value.startsWith('totemInfo')
        )
        expect(totemInfo).toEqual([
            ['totemInfo', 'readable', ['combat']],
            ['totemInfo#2', 'readable', ['combat']],
            ['totemInfo#3', 'secret', ['combat']],
            ['totemInfo#4', 'secret', ['combat']],
            ['totemInfo#5', 'readable', ['combat']],
        ])
    })

    test('out of every restriction, a plain reading is not logged but a secret one is', () => {
        game = start(DEBUG_SAVED)
        login(game)

        game.setReading('manaMax', 4200)
        game.setReading('mana', game.secret('idle-mana'))
        game.fire('UNIT_MAXPOWER', 'player', 'MANA')
        game.setReading('totemTimeLeft', 42)
        game.setReading(
            'totemDuration',
            game.secret('idle-duration', 'userdata')
        )
        game.setReading(
            'totemInfo',
            true,
            'Strength of Earth Totem',
            100,
            120,
            136023
        )
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        const mana = loggedFor(game, 'manaBar')
        expect(mana).toContainEqual(['mana', 'secret', []])
        expect(mana.some(([value]) => value === 'manaMax')).toBe(false)
        const totems = loggedFor(game, 'totemTimers')
        expect(totems).toContainEqual(['totemDuration', 'secret', []])
        expect(totems.some(([value]) => value === 'totemTimeLeft')).toBe(false)
        expect(totems.some(([value]) => value.startsWith('totemInfo'))).toBe(
            false
        )
    })

    test('a reading that returns nothing is not logged, even in combat', () => {
        game = start(DEBUG_SAVED)
        login(game)

        enterCombat(game)
        // Time left but no duration object: the slot reads as empty.
        game.setReading('totemTimeLeft', 42)
        game.setReading('totemDuration', undefined)
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        const totems = loggedFor(game, 'totemTimers')
        expect(totems).toContainEqual(['totemTimeLeft', 'readable', ['combat']])
        expect(totems.some(([value]) => value === 'totemDuration')).toBe(false)
    })

    test('logging a reading hands every return value on to the module unchanged', () => {
        game = start(DEBUG_SAVED)
        login(game)

        enterCombat(game)
        game.setReading('mana', game.secret('passed-mana'))
        game.setReading(
            'manaColor',
            game.secret('passed-r'),
            game.secret('passed-g'),
            game.secret('passed-b')
        )
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')
        scriptEarthTotemInCombat(game)
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        expect(
            game
                .calls({ method: 'SetValue' })
                .some((c) => isSecretArg(c.args[0], 'passed-mana'))
        ).toBe(true)
        const colored = game
            .calls({ method: 'SetStatusBarColor' })
            .filter((c) => isSecretArg(c.args[0], 'passed-r'))
        expect(colored).toHaveLength(1)
        expect(isSecretArg(colored[0]?.args[1], 'passed-g')).toBe(true)
        expect(isSecretArg(colored[0]?.args[2], 'passed-b')).toBe(true)
        expect(
            game
                .calls({ method: 'SetCooldownFromDurationObject' })
                .some((c) => isSecretArg(c.args[0], 'earth-duration'))
        ).toBe(true)
    })

    test("with debug mode off, the modules' readings in combat leave the log empty", () => {
        game = start()
        login(game)

        enterCombat(game)
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')
        scriptEarthTotemInCombat(game)
        game.fire('PLAYER_TOTEM_UPDATE', EARTH)

        expect(entries(game)).toEqual([])
    })
})
