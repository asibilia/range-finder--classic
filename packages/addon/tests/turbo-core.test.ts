/**
 * Turbo's core under the fake game: the Forever-only TOC, client and class
 * checks, the slash commands and their help, and never touching the player's
 * settings.
 *
 * The game, as these tests script it:
 *
 * - Readings: `interface` (the client's interface number), `flavor`
 *   (`'forever'` on Forever), `playerClass` (`UnitClass("player")`: name,
 *   token, id) and `inCombat` (a boolean).
 * - Login: `ADDON_LOADED` ("Turbo"), then `PLAYER_LOGIN`, then
 *   `PLAYER_ENTERING_WORLD`. Turbo reads nothing while its files load.
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
import {
    SHAMAN,
    scriptShamanOnForever,
} from './fake-game/shaman-on-forever.test'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const MAGE = ['Mage', 'MAGE', 8]

type Client = {
    interface?: number
    flavor?: string
    playerClass?: unknown[]
}

/** Loads Turbo with the game's readings scripted for one client. */
function start(client: Client = {}): FakeGame {
    const g = loadTurbo()
    scriptShamanOnForever(g, {
        interface: [client.interface ?? 16001],
        flavor: [client.flavor ?? 'forever'],
        playerClass: client.playerClass ?? SHAMAN,
    })
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

/** Types a slash command and returns the lines it printed. */
function typed(g: FakeGame, line: string): string[] {
    const mark = g.printed().length
    g.slash(line)
    return g.printed().slice(mark)
}

/** Whether /turbo is registered. */
function hasSlash(g: FakeGame): boolean {
    try {
        g.slash('/turbo help')
        return true
    } catch {
        return false
    }
}

describe('the TOC', () => {
    test('Turbo ships one Forever-only TOC: interface 16001, titled Turbo, by the Turbo crew, with a version placeholder and no saved data', () => {
        const tocs = readdirSync(TURBO_DIR).filter((f) => f.endsWith('.toc'))
        expect(tocs).toEqual([TURBO_TOC])
        expect(TURBO_TOC).toBe('Turbo_Camelot.toc')

        const toc = readFileSync(join(TURBO_DIR, TURBO_TOC), 'utf8')
        expect(toc).toMatch(/^## Interface:\s*16001\s*$/m)
        expect(toc).toMatch(/^## Title:\s*Turbo\s*$/m)
        expect(toc).toMatch(/^## Author:\s*Turbo crew\s*$/m)
        expect(toc).toMatch(/^## Version:\s*@project-version@\s*$/m)
        expect(toc).not.toMatch(/SavedVariables/)
    })
})

describe('Forever only', () => {
    test('on Forever (interface 16001, forever flavor) Turbo starts, even though the project ID says retail', () => {
        game = start()
        login(game)

        expect(hasSlash(game)).toBe(true)
        expect(game.printed().some((l) => /Forever/.test(l))).toBe(false)
        const projectReads = game.reads().filter((r) => /project/i.test(r.name))
        expect(projectReads).toEqual([])
    })

    test.each([
        ['a Classic Era client', 11507, 'classic'],
        ['a retail client', 110200, 'mainline'],
        [
            'interface 16001 alone is not enough: a client of another flavor',
            16001,
            'classic',
        ],
        [
            'the forever flavor alone is not enough: a client with another interface',
            11507,
            'forever',
        ],
    ])('%s keeps Turbo off and says why, once', (_what, iface, flavor) => {
        game = start({ interface: iface, flavor })
        login(game)

        expect(hasSlash(game)).toBe(false)
        expect(
            game.printed().filter((l) => /Turbo/.test(l) && /Forever/.test(l))
        ).toHaveLength(1)
    })
})

describe('unsupported classes', () => {
    test("a Mage keeps Turbo off and is told once that Turbo doesn't support Mages yet", () => {
        game = start({ playerClass: MAGE })
        login(game)
        // A zone change fires the world event again; the message stays single.
        game.fire('PLAYER_ENTERING_WORLD', false, false)

        expect(hasSlash(game)).toBe(false)
        const told = game
            .printed()
            .filter((l) => /Turbo doesn['’]t support Mages? yet/.test(l))
        expect(told).toHaveLength(1)
    })
})

describe('the Shaman class kit', () => {
    test('lists the attack spells /turbo macros makes macros for, and nothing else', () => {
        game = start()
        expect(game.run('return ns.classKits.SHAMAN')).toEqual([
            { attackSpells: [8042, 8050, 8056, 403, 421] },
        ])
    })
})

describe('slash commands', () => {
    test('/turbo prints help that lists only help and macros, and /tb', () => {
        game = start()
        login(game)

        const help = typed(game, '/turbo')

        expect(help.length).toBeGreaterThan(0)
        const commands = help
            .map((l) => l.match(/^\s*(\/\S+(?: \S+)?)\s+-/)?.[1])
            .filter(Boolean)
        expect(commands).toEqual(['/turbo help', '/turbo macros', '/tb'])
    })

    test('/tb, /turbo help and an unknown command print the same help as /turbo', () => {
        game = start()
        login(game)

        const turbo = typed(game, '/turbo')
        expect(turbo.length).toBeGreaterThan(0)
        expect(typed(game, '/tb')).toEqual(turbo)
        expect(typed(game, '/turbo help')).toEqual(turbo)
        expect(typed(game, '/turbo debug')).toEqual(turbo)
    })
})

describe("the player's own UI", () => {
    test('Turbo never writes a CVar', () => {
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
    })
})
