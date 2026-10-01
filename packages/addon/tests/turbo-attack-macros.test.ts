/**
 * Attack macros under the fake game: `/turbo macros` (and `/tb macros`) makes
 * one per-character macro for each attack spell in the class kit that the
 * player knows, swaps every action slot holding one of those spells (at any
 * rank) for its macro, and prints a summary. It only acts out of combat, with
 * nothing on the cursor, and when there's room for every new macro.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - `spellKnown(id)`: whether the player knows a spell. The Shaman kit lists
 *   each attack spell by its rank-1 ID.
 * - `spellName(id)`: a spell's name in the player's language, the same for
 *   every rank; nil for a spell the game doesn't have.
 * - `inCombat`: combat lockdown, which blocks macro and action bar changes.
 * - The fake game's macro lists, action slots and cursor: a test sets them up
 *   with `addMacro`, `setAction` and `setCursor`, and reads them back with
 *   `macros()`, `actions()` and `cursor()`. Each macro list stays in name
 *   order, as in the game, so a new macro can move others to a new index.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLuaVm } from '../scripts/lua-vm'
import {
    SAFE_LAYER_FILE,
    TURBO_DIR,
    loadTurbo,
    type Action,
    type FakeGame,
    type Macro,
} from './fake-game/fake-game'
import { SHAMAN, scriptIdleShaman } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const MAGE = ['Mage', 'MAGE', 8]

// The Shaman kit's attack spells, by rank-1 spell ID.
const EARTH_SHOCK = 8042
const FLAME_SHOCK = 8050
const FROST_SHOCK = 8056
const LIGHTNING_BOLT = 403
const CHAIN_LIGHTNING = 421
const ATTACK_SPELLS = [
    EARTH_SHOCK,
    FLAME_SHOCK,
    FROST_SHOCK,
    LIGHTNING_BOLT,
    CHAIN_LIGHTNING,
]

// Higher ranks, and things that aren't attack spells.
const EARTH_SHOCK_RANK_4 = 8046
const LIGHTNING_BOLT_RANK_4 = 915
const HEALING_WAVE = 331
const HEARTHSTONE = 6948

/** The question-mark icon, so `#showtooltip` shows the spell's own icon. */
const QUESTION_MARK = 134400

const ENGLISH: Record<number, string> = {
    [EARTH_SHOCK]: 'Earth Shock',
    [EARTH_SHOCK_RANK_4]: 'Earth Shock',
    [FLAME_SHOCK]: 'Flame Shock',
    [FROST_SHOCK]: 'Frost Shock',
    [LIGHTNING_BOLT]: 'Lightning Bolt',
    [LIGHTNING_BOLT_RANK_4]: 'Lightning Bolt',
    [CHAIN_LIGHTNING]: 'Chain Lightning',
    [HEALING_WAVE]: 'Healing Wave',
}

/** An attack macro's body for a spell name. */
function attackBody(name: string): string {
    return `#showtooltip\n/startattack\n/cast ${name}`
}

/** Turbo's macro for a spell name, as `macroList` shows it. */
function turboMacro(name: string): Omit<Macro, 'index'> {
    return {
        name,
        icon: QUESTION_MARK,
        body: attackBody(name),
        perCharacter: true,
    }
}

/** Turbo's macro for a spell name, as an action slot holds it. */
function onBar(name: string): Action {
    return { type: 'macro', name, perCharacter: true }
}

function spell(id: number): Action {
    return { type: 'spell', id }
}

/**
 * Loads Turbo as an idle Shaman on Forever. The player knows every attack
 * spell unless `known` lists the ones they do, and spell names are English
 * unless `names` says otherwise.
 */
function start(
    options: {
        known?: number[]
        names?: Record<number, string>
        playerClass?: unknown[]
    } = {}
): FakeGame {
    const g = loadTurbo()
    scriptIdleShaman(g, { playerClass: options.playerClass ?? SHAMAN })
    g.setReading('spellName', null)
    for (const [id, name] of Object.entries(options.names ?? ENGLISH)) {
        g.setReadingFor('spellName', [Number(id)], name)
    }
    if (options.known) {
        g.setReading('spellKnown', false)
        for (const id of options.known) {
            g.setReadingFor('spellKnown', [id], true)
        }
    }
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

/** Every macro, without the game's indexes. */
function macroList(g: FakeGame): Omit<Macro, 'index'>[] {
    return g.macros().map(({ index: _, ...macro }) => macro)
}

/** Adds `count` per-character macros of the player's own. */
function fillCharacterMacros(g: FakeGame, count: number) {
    for (let i = 1; i <= count; i++) {
        g.addMacro({
            name: `Mine ${i}`,
            body: `/say ${i}`,
            perCharacter: true,
        })
    }
}

describe('the first run', () => {
    test('makes a per-character attack macro, with the question-mark icon, for every attack spell the player knows', () => {
        game = start()
        game.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Chain Lightning'),
            turboMacro('Earth Shock'),
            turboMacro('Flame Shock'),
            turboMacro('Frost Shock'),
            turboMacro('Lightning Bolt'),
            {
                name: 'Mount',
                icon: null,
                body: '/cast Ghost Wolf',
                perCharacter: true,
            },
        ])
    })

    test('swaps every action slot holding one of those spells for its macro, leaves every other slot alone, and clears the cursor', () => {
        game = start()
        game.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(LIGHTNING_BOLT))
        game.setAction(3, spell(HEALING_WAVE))
        game.setAction(4, { type: 'item', id: HEARTHSTONE })
        game.setAction(5, { type: 'macro', name: 'Mount' })
        game.setAction(61, spell(FLAME_SHOCK))
        game.setAction(180, spell(CHAIN_LIGHTNING))
        login(game)

        typed(game, '/turbo macros')

        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            2: onBar('Lightning Bolt'),
            3: spell(HEALING_WAVE),
            4: { type: 'item', id: HEARTHSTONE },
            5: { type: 'macro', name: 'Mount', perCharacter: true },
            61: onBar('Flame Shock'),
            180: onBar('Chain Lightning'),
        })
        expect(game.cursor()).toBeNull()
    })

    test('prints one summary line', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(LIGHTNING_BOLT))
        game.setAction(3, spell(FROST_SHOCK))
        login(game)

        expect(typed(game, '/turbo macros')).toEqual([
            'Turbo made 5 macros and swapped 3 buttons.',
        ])
    })
})

describe('running it again', () => {
    test('leaves the same macros, with no duplicates, and changes nothing', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(LIGHTNING_BOLT))
        login(game)
        typed(game, '/turbo macros')
        const macros = game.macros()
        const actions = game.actions()

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual(macros)
        expect(macros).toHaveLength(5)
        expect(game.actions()).toEqual(actions)
        expect(printed).toEqual(['Turbo made 0 macros and swapped 0 buttons.'])
    })

    test('swaps a button added since the last run for the macro it already made', () => {
        game = start()
        login(game)
        typed(game, '/turbo macros')
        const macros = game.macros()
        game.setAction(10, spell(EARTH_SHOCK))

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual(macros)
        expect(game.actions()).toEqual({ 10: onBar('Earth Shock') })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 1 button.'])
    })
})

describe('any rank', () => {
    test("swaps a button holding any rank of an attack spell, though the kit lists only rank 1's ID", () => {
        game = start({
            known: [
                ...ATTACK_SPELLS,
                EARTH_SHOCK_RANK_4,
                LIGHTNING_BOLT_RANK_4,
            ],
        })
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(EARTH_SHOCK_RANK_4))
        game.setAction(3, spell(LIGHTNING_BOLT_RANK_4))
        login(game)

        typed(game, '/turbo macros')

        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            2: onBar('Earth Shock'),
            3: onBar('Lightning Bolt'),
        })
    })
})

describe('which spells', () => {
    test('a spell the player does not know gets no macro', () => {
        // A new Shaman knows only Lightning Bolt.
        game = start({ known: [LIGHTNING_BOLT] })
        game.setAction(1, spell(LIGHTNING_BOLT))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Lightning Bolt')])
        expect(game.actions()).toEqual({ 1: onBar('Lightning Bolt') })
        expect(printed).toEqual(['Turbo made 1 macro and swapped 1 button.'])
    })

    test("each macro is named for its spell, and casts it, in the player's language", () => {
        // Each Russian name is under 16 letters but over 16 bytes.
        const russian = {
            [EARTH_SHOCK]: 'Земной шок',
            [FLAME_SHOCK]: 'Огненный шок',
            [FROST_SHOCK]: 'Ледяной шок',
            [LIGHTNING_BOLT]: 'Молния',
            [CHAIN_LIGHTNING]: 'Цепная молния',
        }
        game = start({ names: russian })
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        typed(game, '/turbo macros')

        const made = macroList(game)
        expect(made).toHaveLength(5)
        for (const name of Object.values(russian)) {
            expect(made).toContainEqual(turboMacro(name))
        }
        expect(game.actions()).toEqual({ 1: onBar('Земной шок') })
    })

    test("a name longer than the game's 16-letter macro name limit gets no macro, and the player is told", () => {
        game = start({
            names: {
                [EARTH_SHOCK]: 'Erdschock',
                [FLAME_SHOCK]: 'Flammenschock',
                [FROST_SHOCK]: 'Frostschock',
                // 16 letters: just fits.
                [LIGHTNING_BOLT]: 'Blitzschlagserie',
                // 17 letters.
                [CHAIN_LIGHTNING]: 'Kettenblitzschlag',
            },
        })
        game.setAction(1, spell(CHAIN_LIGHTNING))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game).map((m) => m.name)).toEqual([
            'Blitzschlagserie',
            'Erdschock',
            'Flammenschock',
            'Frostschock',
        ])
        expect(game.actions()).toEqual({ 1: spell(CHAIN_LIGHTNING) })
        expect(printed).toContain('Turbo made 4 macros and swapped 0 buttons.')
        expect(printed).toContain(
            'Skipped Kettenblitzschlag: its name is too long for a macro.'
        )
    })
})

describe("the player's own macros", () => {
    test("a macro the player already has with a spell's name is left alone, so are that spell's buttons, and the player is told", () => {
        game = start()
        // An account macro is never Turbo's, even with the attack body.
        game.addMacro({
            name: 'Flame Shock',
            body: attackBody('Flame Shock'),
            perCharacter: false,
        })
        game.addMacro({
            name: 'Frost Shock',
            body: '/cast [@focus] Frost Shock',
            perCharacter: true,
        })
        game.setAction(1, spell(FLAME_SHOCK))
        game.setAction(2, spell(FROST_SHOCK))
        game.setAction(3, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            {
                name: 'Flame Shock',
                icon: null,
                body: attackBody('Flame Shock'),
                perCharacter: false,
            },
            turboMacro('Chain Lightning'),
            turboMacro('Earth Shock'),
            {
                name: 'Frost Shock',
                icon: null,
                body: '/cast [@focus] Frost Shock',
                perCharacter: true,
            },
            turboMacro('Lightning Bolt'),
        ])
        expect(game.actions()).toEqual({
            1: spell(FLAME_SHOCK),
            2: spell(FROST_SHOCK),
            3: onBar('Earth Shock'),
        })
        expect(printed).toContain('Turbo made 3 macros and swapped 1 button.')
        expect(printed).toContain(
            'Skipped Flame Shock: you already have a macro with that name.'
        )
        expect(printed).toContain(
            'Skipped Frost Shock: you already have a macro with that name.'
        )
    })
})

describe('when Turbo changes nothing', () => {
    test('in combat it prints "Try again after combat"', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)
        game.setReading('inCombat', true)
        game.fire('PLAYER_REGEN_DISABLED')

        const printed = typed(game, '/turbo macros')

        expect(printed.join('\n')).toMatch(/Try again after combat/)
        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(EARTH_SHOCK) })
    })

    test('with something on the cursor it asks the player to drop it first', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setCursor({ type: 'item', id: HEARTHSTONE })
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed.join('\n')).toMatch(/Drop what's on your cursor first/)
        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(EARTH_SHOCK) })
        expect(game.cursor()).toEqual({ type: 'item', id: HEARTHSTONE })
    })

    test('with too few free character macro slots it says how many it needs', () => {
        game = start()
        // 26 of 30 used: 4 free, 5 needed.
        fillCharacterMacros(game, 26)
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)
        const before = game.macros()

        const printed = typed(game, '/turbo macros')

        expect(printed.join('\n')).toMatch(/needs 5 free character macro slots/)
        expect(game.macros()).toEqual(before)
        expect(game.actions()).toEqual({ 1: spell(EARTH_SHOCK) })
    })

    test('a class whose kit has no attack spells is told so', () => {
        game = start({ playerClass: MAGE })
        game.run('ns.classKits.MAGE = { modules = {} }')
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo has no attack macros for your class yet.',
        ])
        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(EARTH_SHOCK) })
    })

    test('a class Turbo does not support gets no /turbo command at all', () => {
        game = start({ playerClass: MAGE })
        login(game)

        expect(game.printed()).toContain("Turbo doesn't support Mages yet.")
        expect(() => game!.slash('/turbo macros')).toThrow(/no slash command/)
        expect(game.macros()).toEqual([])
    })
})

describe('room for the macros', () => {
    test('exactly enough free character macro slots is enough, and a full list is fine once they exist', () => {
        game = start()
        // 25 of 30 used: 5 free, 5 needed.
        fillCharacterMacros(game, 25)
        login(game)

        expect(typed(game, '/turbo macros')).toEqual([
            'Turbo made 5 macros and swapped 0 buttons.',
        ])
        expect(game.macros()).toHaveLength(30)

        expect(typed(game, '/turbo macros')).toEqual([
            'Turbo made 0 macros and swapped 0 buttons.',
        ])
    })
})

describe('the commands', () => {
    test('/tb macros does what /turbo macros does', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/tb macros')

        expect(printed).toEqual(['Turbo made 5 macros and swapped 1 button.'])
        expect(game.actions()).toEqual({ 1: onBar('Earth Shock') })
    })

    test('/turbo help lists the macros command', () => {
        game = start()
        login(game)

        const help = typed(game, '/turbo help')

        expect(help.some((line) => /\/turbo macros\b/.test(line))).toBe(true)
    })
})

describe('the real safe layer', () => {
    test('offers every reading attack macros use', () => {
        const vm = createLuaVm()
        vm.setString(
            '__src',
            readFileSync(join(TURBO_DIR, SAFE_LAYER_FILE), 'utf8')
        )
        const missing = JSON.parse(
            vm.run(`
                local frame = setmetatable({}, { __index = function() return function() end end })
                local env = setmetatable({
                    CreateFrame = function() return frame end,
                    GetTime = function() return 0 end,
                    C_Timer = { After = function() end, NewTicker = function() end },
                    issecretvalue = function() return false end,
                    print = function() end,
                }, { __index = _G })
                local chunk = assert(loadstring(__src, "@Turbo/core/safe-layer.lua"))
                setfenv(chunk, env)
                local ns = {}
                chunk("Turbo", ns)
                local missing = {}
                for _, name in ipairs({ "spellName", "spellKnown", "inCombat" }) do
                    local ok, err = pcall(ns.safe.read, name, ${EARTH_SHOCK})
                    if not ok and tostring(err):find("no reading named", 1, true) then
                        table.insert(missing, '"' .. name .. '"')
                    end
                end
                return "[" .. table.concat(missing, ",") .. "]"
            `) ?? '[]'
        )
        vm.close()

        expect(missing).toEqual([])
    })
})
