/**
 * Turbo's core under the fake game: the Forever-only TOC, client and class
 * checks, the module registry and Shaman class kit, saved data, the slash
 * commands, and never touching the player's settings.
 *
 * The game, as these tests script it:
 *
 * - Readings: `interface` (the client's interface number), `flavor`
 *   (`'forever'` on Forever), `playerClass` (`UnitClass("player")`: name,
 *   token, id), `inCombat` and `targetAttackable` (booleans).
 * - Login: `ADDON_LOADED` ("Turbo"), then `PLAYER_LOGIN`, then
 *   `PLAYER_ENTERING_WORLD`. Turbo reads nothing while its files load.
 * - Modules register with `ns.modules.register(id, { onEnable, onDisable })`
 *   and are switched with `ns.modules.enable(id)` / `disable(id)`;
 *   `ns.modules.isEnabled(id)` answers.
 * - `TurboDB = { schemaVersion = 1, classes = { [CLASS_TOKEN] = changes } }`.
 * - Slash commands are typed with the fake game's `slash(line)`.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
    TURBO_DIR,
    TURBO_TOC,
    loadTurbo,
    type FakeGame,
} from './fake-game/fake-game'
import { SHAMAN, scriptIdleShaman } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined
let extraGames: FakeGame[] = []

afterEach(() => {
    game?.close()
    game = undefined
    for (const g of extraGames) g.close()
    extraGames = []
})

const MAGE = ['Mage', 'MAGE', 8]

/** The v1 modules, as the Shaman class kit names them. */
const V1_MODULES = [
    'rangeFinder',
    'swingTimer',
    'totemTimers',
    'weaponImbue',
    'lightningShield',
    'keyCooldowns',
    'manaBar',
    'maelstromWeapon',
    'reminders',
]

type Client = {
    interface?: number
    flavor?: string
    playerClass?: unknown[]
    inCombat?: boolean
}

/** Loads Turbo with the game's readings scripted for one client. */
function start(
    client: Client = {},
    savedVariables?: Record<string, unknown>
): FakeGame {
    const g = loadTurbo(savedVariables ? { savedVariables } : {})
    scriptIdleShaman(g, {
        interface: [client.interface ?? 16001],
        flavor: [client.flavor ?? 'forever'],
        playerClass: client.playerClass ?? SHAMAN,
        inCombat: [client.inCombat ?? false],
    })
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

/** Registers a test module that logs its switches into `ns.testLog`. */
function registerModule(g: FakeGame, id: string) {
    g.run(
        `
        local id = ...
        ns.testLog = ns.testLog or {}
        ns.modules.register(id, {
            onEnable = function() table.insert(ns.testLog, "enable " .. id) end,
            onDisable = function() table.insert(ns.testLog, "disable " .. id) end,
        })
        `,
        id
    )
}

/**
 * Registers a logging stand-in for a module id, unless a real Turbo module
 * already registered it. Returns whether the stand-in got in.
 */
function registerStandIn(g: FakeGame, id: string): boolean {
    const [registered] = g.run(
        `
        local id = ...
        ns.testLog = ns.testLog or {}
        return (pcall(ns.modules.register, id, {
            onEnable = function() table.insert(ns.testLog, "enable " .. id) end,
            onDisable = function() table.insert(ns.testLog, "disable " .. id) end,
        }))
        `,
        id
    )
    return registered === true
}

/**
 * Registers a logging stand-in for every v1 module Turbo doesn't register
 * itself, so each kit module has a switch to watch. Returns the stand-ins.
 */
function registerKitStandIns(g: FakeGame): string[] {
    return V1_MODULES.filter((id) => registerStandIn(g, id))
}

function isEnabled(g: FakeGame, id: string): unknown {
    return g.run('return ns.modules.isEnabled(...)', id)[0]
}

/** The v1 modules that are on now. */
function kitModulesOn(g: FakeGame): string[] {
    return V1_MODULES.filter((id) => isEnabled(g, id) === true)
}

/** What the test modules logged, in order. */
function moduleLog(g: FakeGame): string[] {
    const log = g.run('return ns.testLog')[0]
    return Array.isArray(log) ? (log as string[]) : []
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

/** Whether the card is on screen now. */
function cardVisible(g: FakeGame): boolean {
    const card = g.frame('TurboCard')
    return card?.shown === true && Number(card.alpha) > 0
}

type WithSlash = FakeGame & { slash(line: string): void }

/** Types a slash command into chat. */
function slash(g: FakeGame, line: string) {
    ;(g as WithSlash).slash(line)
}

describe('the TOC', () => {
    test('Turbo ships one Forever-only TOC: interface 16001, titled Turbo, by the Turbo crew, with a version placeholder and an account-wide TurboDB', () => {
        const tocs = readdirSync(TURBO_DIR).filter((f) => f.endsWith('.toc'))
        expect(tocs).toEqual([TURBO_TOC])
        expect(TURBO_TOC).toBe('Turbo_Camelot.toc')

        const toc = readFileSync(join(TURBO_DIR, TURBO_TOC), 'utf8')
        expect(toc).toMatch(/^## Interface:\s*16001\s*$/m)
        expect(toc).toMatch(/^## Title:\s*Turbo\s*$/m)
        expect(toc).toMatch(/^## Author:\s*Turbo crew\s*$/m)
        expect(toc).toMatch(/^## Version:\s*@project-version@\s*$/m)
        expect(toc).toMatch(/^## SavedVariables:\s*TurboDB\s*$/m)
        expect(toc).not.toMatch(/SavedVariablesPerCharacter/)
    })
})

describe('Forever only', () => {
    test('on Forever (interface 16001, forever flavor) Turbo starts, even though the project ID says retail', () => {
        game = start()
        const standIns = registerKitStandIns(game)
        login(game)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(true)
        expect(kitModulesOn(game)).toEqual(V1_MODULES)
        expect([...moduleLog(game)].sort()).toEqual(
            standIns.map((id) => `enable ${id}`).sort()
        )
        const projectReads = game.reads().filter((r) => /project/i.test(r.name))
        expect(projectReads).toEqual([])
    })

    test('a Classic Era client keeps Turbo off and says why', () => {
        game = start({ interface: 11507, flavor: 'classic' })
        registerKitStandIns(game)
        login(game)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(false)
        expect(kitModulesOn(game)).toEqual([])
        expect(moduleLog(game)).toEqual([])
        expect(
            game.printed().filter((l) => /Turbo/.test(l) && /Forever/.test(l))
        ).toHaveLength(1)
    })

    test('a retail client keeps Turbo off and says why', () => {
        game = start({ interface: 110200, flavor: 'mainline' })
        registerKitStandIns(game)
        login(game)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(false)
        expect(kitModulesOn(game)).toEqual([])
        expect(moduleLog(game)).toEqual([])
        expect(
            game.printed().filter((l) => /Turbo/.test(l) && /Forever/.test(l))
        ).toHaveLength(1)
    })

    test('interface 16001 alone is not enough: a client of another flavor keeps Turbo off', () => {
        game = start({ interface: 16001, flavor: 'classic' })
        registerKitStandIns(game)
        login(game)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(false)
        expect(kitModulesOn(game)).toEqual([])
        expect(moduleLog(game)).toEqual([])
        expect(game.printed().some((l) => /Forever/.test(l))).toBe(true)
    })

    test('the forever flavor alone is not enough: a client with another interface keeps Turbo off', () => {
        game = start({ interface: 11507, flavor: 'forever' })
        registerKitStandIns(game)
        login(game)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(false)
        expect(kitModulesOn(game)).toEqual([])
        expect(moduleLog(game)).toEqual([])
        expect(game.printed().some((l) => /Forever/.test(l))).toBe(true)
    })
})

describe('unsupported classes', () => {
    test("a Mage keeps Turbo off and is told once that Turbo doesn't support Mages yet", () => {
        game = start({ playerClass: MAGE })
        registerKitStandIns(game)
        login(game)
        // A zone change fires the world event again; the message stays single.
        game.fire('PLAYER_ENTERING_WORLD', false, false)
        enterCombat(game)
        game.advance(0.5)

        expect(cardVisible(game)).toBe(false)
        expect(kitModulesOn(game)).toEqual([])
        expect(moduleLog(game)).toEqual([])
        const told = game
            .printed()
            .filter((l) => /Turbo doesn['’]t support Mages? yet/.test(l))
        expect(told).toHaveLength(1)
    })
})

describe('modules and the Shaman class kit', () => {
    test('the Shaman class kit turns every v1 module on at login, with no spec detection', () => {
        game = start()
        const standIns = V1_MODULES.filter((id) => registerStandIn(game!, id))
        registerModule(game, 'notInAnyKit')
        login(game)

        const log = moduleLog(game)
        expect([...log].sort()).toEqual(
            standIns.map((id) => `enable ${id}`).sort()
        )
        for (const id of V1_MODULES) expect(isEnabled(game, id)).toBe(true)
        expect(isEnabled(game, 'notInAnyKit')).toBe(false)
        const specReads = game
            .reads()
            .filter((r) => /spec|talent/i.test(r.name))
        expect(specReads).toEqual([])
    })

    test('a module can be turned off and back on, and only the change is saved', () => {
        game = start()
        registerKitStandIns(game)
        // Not in any kit, so it starts off: its switches are all the player's.
        registerModule(game, 'testModule')
        login(game)

        // A kit module: on by default.
        game.run('ns.modules.disable("rangeFinder")')
        expect(isEnabled(game, 'rangeFinder')).toBe(false)
        expect(Object.keys(storedChanges(game)).length).toBeGreaterThan(0)

        game.run('ns.modules.enable("rangeFinder")')
        expect(isEnabled(game, 'rangeFinder')).toBe(true)
        // Back on its default, so there is nothing left to store.
        expect(storedChanges(game)).toEqual({})

        // Each switch runs the module's own on and off handlers.
        game.run('ns.modules.enable("testModule")')
        expect(isEnabled(game, 'testModule')).toBe(true)
        expect(Object.keys(storedChanges(game)).length).toBeGreaterThan(0)
        game.run('ns.modules.disable("testModule")')
        expect(isEnabled(game, 'testModule')).toBe(false)
        expect(
            moduleLog(game).filter((line) => line.endsWith(' testModule'))
        ).toEqual(['enable testModule', 'disable testModule'])
        expect(storedChanges(game)).toEqual({})
    })

    test('a module the player turned off stays off after a reload', () => {
        const first = start()
        extraGames.push(first)
        registerKitStandIns(first)
        login(first)
        first.run('ns.modules.disable("rangeFinder")')
        const saved = first.global('TurboDB')

        game = start({}, { TurboDB: saved })
        registerKitStandIns(game)
        login(game)

        expect(moduleLog(game)).not.toContain('enable rangeFinder')
        expect(isEnabled(game, 'rangeFinder')).toBe(false)
        expect(kitModulesOn(game)).toEqual(
            V1_MODULES.filter((id) => id !== 'rangeFinder')
        )
    })

    test("a Shaman's module change is saved under the Shaman class", () => {
        game = start()
        registerKitStandIns(game)
        login(game)
        game.run('ns.modules.disable("rangeFinder")')

        const paths = Object.keys(storedChanges(game))
        expect(paths.length).toBeGreaterThan(0)
        for (const path of paths) {
            expect(path.startsWith('classes.SHAMAN.')).toBe(true)
        }
    })
})

describe('saved data', () => {
    test('a first login saves only the schema version, 1: defaults are never written', () => {
        game = start()
        login(game)

        expect(game.global('TurboDB')).toMatchObject({ schemaVersion: 1 })
        expect(storedChanges(game)).toEqual({})
    })

    test("the player's changes load as they were saved, split by class, with nothing added", () => {
        const saved = {
            schemaVersion: 1,
            classes: {
                SHAMAN: { alwaysShow: true },
                MAGE: { alwaysShow: false },
            },
        }
        game = start({}, { TurboDB: saved })
        login(game)

        expect(leaves(game.global('TurboDB'))).toEqual({
            'classes.MAGE.alwaysShow': false,
            'classes.SHAMAN.alwaysShow': true,
            schemaVersion: 1,
        })
    })

    test("an unsupported class's login leaves another class's saved changes alone", () => {
        const saved = {
            schemaVersion: 1,
            classes: { SHAMAN: { alwaysShow: true } },
        }
        game = start({ playerClass: MAGE }, { TurboDB: saved })
        login(game)

        expect(leaves(game.global('TurboDB'))).toEqual({
            'classes.SHAMAN.alwaysShow': true,
            schemaVersion: 1,
        })
    })
})

describe('slash commands', () => {
    test('/turbo prints help that names the command', () => {
        game = start()
        login(game)
        const before = game.printed().length

        slash(game, '/turbo')

        const help = game.printed().slice(before)
        expect(help.length).toBeGreaterThan(0)
        expect(help.join('\n')).toMatch(/\/turbo/)
    })

    test('/tb prints the same help as /turbo and /turbo help', () => {
        game = start()
        login(game)

        let mark = game.printed().length
        slash(game, '/turbo')
        const turbo = game.printed().slice(mark)

        mark = game.printed().length
        slash(game, '/tb')
        const tb = game.printed().slice(mark)

        mark = game.printed().length
        slash(game, '/turbo help')
        const help = game.printed().slice(mark)

        expect(turbo.length).toBeGreaterThan(0)
        expect(tb).toEqual(turbo)
        expect(help).toEqual(turbo)
    })
})

describe("the player's own UI", () => {
    test('Turbo never writes a CVar or takes over a Blizzard frame: no CVar writes in its code, and every frame it names is its own', () => {
        const luaFiles = readdirSync(TURBO_DIR, {
            recursive: true,
            encoding: 'utf8',
        }).filter((f) => f.endsWith('.lua'))
        expect(luaFiles.length).toBeGreaterThan(0)
        for (const file of luaFiles) {
            const source = readFileSync(join(TURBO_DIR, file), 'utf8')
            expect(source).not.toMatch(
                /\b(SetCVar|SetCVarBitfield|ResetCVar|RegisterCVar)\b|C_CVar\s*\.\s*(Set|Reset|Register)/
            )
        }

        game = start()
        login(game)
        enterCombat(game)
        game.advance(0.5)
        game.fire('EditMode.Enter')
        game.fire('EditMode.Exit')
        slash(game, '/turbo')

        const named = game
            .calls({ method: 'CreateFrame' })
            .map((c) => c.args[1])
            .filter((name): name is string => typeof name === 'string')
        expect(named).toContain('TurboCard')
        for (const name of named) expect(name.startsWith('Turbo')).toBe(true)
    })
})
