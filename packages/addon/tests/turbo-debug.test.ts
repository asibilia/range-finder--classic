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
