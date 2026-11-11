/**
 * Spell macros under the fake game: `/turbo macros` (and `/tb macros`) finds
 * every spell on the player's action bars, makes one per-character macro for
 * each (by name, so every rank shares it),
 * swaps every action slot holding that spell for its macro, and prints a
 * summary. Offensive spells get the attack variant, which starts auto-attack
 * too. It works for every class, and only acts out of combat, with nothing on
 * the cursor, and when there's room for every new macro.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - `spellName(id)`: a spell's name in the player's language, the same for
 *   every rank; nil for a spell the game doesn't have.
 * - `spellHarmful(id)`: whether the spell can be cast on an enemy.
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

/** A spell as the game describes it. */
type Spell = { name: string; harmful: boolean }

// Shaman spells, by spell ID.
const EARTH_SHOCK = 8042
const LIGHTNING_BOLT = 403
const LIGHTNING_BOLT_RANK_4 = 915
const HEALING_WAVE = 331
const HEALING_WAVE_RANK_4 = 547
const STORMSTRIKE = 17364
const GHOST_WOLF = 2645
const FLAMETONGUE_WEAPON = 8024
const STRENGTH_OF_EARTH_TOTEM = 8075
// Mage spells.
const FIREBALL = 133
const ARCANE_INTELLECT = 1459

const HEARTHSTONE = 6948

const SPELLS: Record<number, Spell> = {
    [EARTH_SHOCK]: { name: 'Earth Shock', harmful: true },
    [LIGHTNING_BOLT]: {
        name: 'Lightning Bolt',
        harmful: true,
    },
    [LIGHTNING_BOLT_RANK_4]: {
        name: 'Lightning Bolt',
        harmful: true,
    },
    [HEALING_WAVE]: { name: 'Healing Wave', harmful: false },
    [HEALING_WAVE_RANK_4]: {
        name: 'Healing Wave',
        harmful: false,
    },
    [STORMSTRIKE]: { name: 'Stormstrike', harmful: true },
    [GHOST_WOLF]: { name: 'Ghost Wolf', harmful: false },
    [FIREBALL]: { name: 'Fireball', harmful: true },
    [ARCANE_INTELLECT]: {
        name: 'Arcane Intellect',
        harmful: false,
    },
}

/** The question-mark icon, so `#showtooltip` shows the spell's own icon. */
const QUESTION_MARK = 134400

/** The attack variant's body, for an offensive spell. */
function attackBody(name: string): string {
    return `#showtooltip\n/startattack\n/cast ${name}`
}

/** The plain body, for every other spell. */
function castBody(name: string): string {
    return `#showtooltip\n/cast ${name}`
}

/** Turbo's macro for a spell name, as `macroList` shows it. */
function turboMacro(
    name: string,
    body = attackBody(name)
): Omit<Macro, 'index'> {
    return { name, icon: QUESTION_MARK, body, perCharacter: true }
}

/** Turbo's macro for a spell name, as an action slot holds it. */
function onBar(name: string): Action {
    return { type: 'macro', name, perCharacter: true }
}

function spell(id: number): Action {
    return { type: 'spell', id }
}

/**
 * Loads Turbo as an idle Shaman on Forever (or `playerClass`), with the
 * game describing `spells` (by default the ones above).
 */
function start(
    options: {
        spells?: Record<number, Spell>
        playerClass?: unknown[]
    } = {}
): FakeGame {
    const g = loadTurbo()
    scriptShamanOnForever(g, { playerClass: options.playerClass ?? SHAMAN })
    g.setReading('spellName', null)
    g.setReading('spellHarmful', false)
    for (const [id, s] of Object.entries(options.spells ?? SPELLS)) {
        g.setReadingFor('spellName', [Number(id)], s.name)
        g.setReadingFor('spellHarmful', [Number(id)], s.harmful)
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

describe('which spells get a macro', () => {
    test('a ranked heal gets a plain macro, with the question-mark icon, and its button swapped', () => {
        game = start()
        game.setAction(1, spell(HEALING_WAVE))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Healing Wave', castBody('Healing Wave')),
        ])
        expect(game.actions()).toEqual({ 1: onBar('Healing Wave') })
        expect(game.cursor()).toBeNull()
        expect(printed).toEqual(['Turbo made 1 macro and swapped 1 button.'])
    })

    test('an offensive ranked spell gets the attack macro', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Earth Shock')])
        expect(game.actions()).toEqual({ 1: onBar('Earth Shock') })
    })

    test('an offensive spell without ranks (Stormstrike) gets the attack macro', () => {
        game = start()
        game.setAction(1, spell(STORMSTRIKE))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Stormstrike')])
        expect(game.actions()).toEqual({ 1: onBar('Stormstrike') })
    })

    test('a spell that is neither ranked nor offensive (Ghost Wolf) gets a plain macro', () => {
        game = start()
        game.setAction(1, spell(GHOST_WOLF))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Ghost Wolf', castBody('Ghost Wolf')),
        ])
        expect(game.actions()).toEqual({ 1: onBar('Ghost Wolf') })
        expect(printed).toEqual(['Turbo made 1 macro and swapped 1 button.'])
    })

    test('everything that is not a spell is left alone', () => {
        game = start()
        game.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })
        game.setAction(2, { type: 'item', id: HEARTHSTONE })
        game.setAction(3, { type: 'macro', name: 'Mount' })
        // A spell the game has no name for.
        game.setAction(4, spell(99999))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            {
                name: 'Mount',
                icon: null,
                body: '/cast Ghost Wolf',
                perCharacter: true,
            },
        ])
        expect(game.actions()).toEqual({
            2: { type: 'item', id: HEARTHSTONE },
            3: { type: 'macro', name: 'Mount', perCharacter: true },
            4: spell(99999),
        })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 0 buttons.'])
    })

    test('only spells on the bars get one: every slot, 1 to 180, is looked at', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(61, spell(HEALING_WAVE))
        game.setAction(180, spell(STORMSTRIKE))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Earth Shock'),
            turboMacro('Healing Wave', castBody('Healing Wave')),
            turboMacro('Stormstrike'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            61: onBar('Healing Wave'),
            180: onBar('Stormstrike'),
        })
        expect(printed).toEqual(['Turbo made 3 macros and swapped 3 buttons.'])
    })

    test('a name in another language works', () => {
        game = start({
            spells: {
                [HEALING_WAVE]: {
                    name: 'Волна исцеления',
                    harmful: false,
                },
            },
        })
        game.setAction(1, spell(HEALING_WAVE))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Волна исцеления', castBody('Волна исцеления')),
        ])
        expect(game.actions()).toEqual({ 1: onBar('Волна исцеления') })
    })
})

describe('any rank', () => {
    test('every rank of a spell shares one macro, and every one of its buttons is swapped', () => {
        game = start()
        game.setAction(1, spell(LIGHTNING_BOLT))
        game.setAction(2, spell(LIGHTNING_BOLT_RANK_4))
        game.setAction(3, spell(HEALING_WAVE))
        game.setAction(4, spell(HEALING_WAVE_RANK_4))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Healing Wave', castBody('Healing Wave')),
            turboMacro('Lightning Bolt'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Lightning Bolt'),
            2: onBar('Lightning Bolt'),
            3: onBar('Healing Wave'),
            4: onBar('Healing Wave'),
        })
        expect(printed).toEqual(['Turbo made 2 macros and swapped 4 buttons.'])
    })
})

describe('every class', () => {
    test('a Mage gets macros for its own spells', () => {
        game = start({ playerClass: MAGE })
        game.setAction(1, spell(FIREBALL))
        game.setAction(2, spell(ARCANE_INTELLECT))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Arcane Intellect', castBody('Arcane Intellect')),
            turboMacro('Fireball'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Fireball'),
            2: onBar('Arcane Intellect'),
        })
        expect(printed).toEqual(['Turbo made 2 macros and swapped 2 buttons.'])
    })
})

describe("Turbo's macros from before", () => {
    test('an attack macro from an earlier Turbo is reused, not made again', () => {
        game = start()
        game.addMacro({
            name: 'Lightning Bolt',
            icon: QUESTION_MARK,
            body: attackBody('Lightning Bolt'),
            perCharacter: true,
        })
        game.setAction(1, spell(LIGHTNING_BOLT_RANK_4))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Lightning Bolt')])
        expect(game.actions()).toEqual({ 1: onBar('Lightning Bolt') })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 1 button.'])
    })

    test("Turbo's macro with the other body is updated in place, and the summary says so", () => {
        game = start()
        // Made when the game read Healing Wave as offensive.
        game.addMacro({
            name: 'Healing Wave',
            icon: QUESTION_MARK,
            body: attackBody('Healing Wave'),
            perCharacter: true,
        })
        // And Stormstrike's as not.
        game.addMacro({
            name: 'Stormstrike',
            icon: QUESTION_MARK,
            body: castBody('Stormstrike'),
            perCharacter: true,
        })
        game.setAction(1, spell(HEALING_WAVE))
        game.setAction(2, spell(STORMSTRIKE))
        game.setAction(3, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Earth Shock'),
            turboMacro('Healing Wave', castBody('Healing Wave')),
            turboMacro('Stormstrike'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Healing Wave'),
            2: onBar('Stormstrike'),
            3: onBar('Earth Shock'),
        })
        expect(printed).toEqual([
            'Turbo made 1 macro, updated 2 and swapped 3 buttons.',
        ])
    })
})

describe('running it again', () => {
    test('leaves the same macros, with no duplicates, and changes nothing', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        login(game)
        typed(game, '/turbo macros')
        const macros = game.macros()
        const actions = game.actions()

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual(macros)
        expect(macros).toHaveLength(2)
        expect(game.actions()).toEqual(actions)
        expect(printed).toEqual(['Turbo made 0 macros and swapped 0 buttons.'])
    })

    test('swaps a button added since the last run for the macro it already made', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)
        typed(game, '/turbo macros')
        const macros = game.macros()
        game.setAction(10, spell(EARTH_SHOCK))

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual(macros)
        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            10: onBar('Earth Shock'),
        })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 1 button.'])
    })
})

describe('names', () => {
    test('a long name gets a macro named for its first 16 letters, whose body casts the full name', () => {
        game = start({
            spells: {
                [FLAMETONGUE_WEAPON]: {
                    name: 'Flametongue Weapon',
                    harmful: false,
                },
                // 16 letters: just fits, unchanged.
                [LIGHTNING_BOLT]: {
                    name: 'Blitzschlagserie',
                    harmful: true,
                },
            },
        })
        game.setAction(1, spell(FLAMETONGUE_WEAPON))
        game.setAction(2, spell(LIGHTNING_BOLT))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Blitzschlagserie'),
            turboMacro('Flametongue Weap', castBody('Flametongue Weapon')),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Flametongue Weap'),
            2: onBar('Blitzschlagserie'),
        })
        expect(printed).toEqual(['Turbo made 2 macros and swapped 2 buttons.'])
    })

    test("running it again reuses a long name's macro, with no duplicate", () => {
        game = start({
            spells: {
                [FLAMETONGUE_WEAPON]: {
                    name: 'Flametongue Weapon',
                    harmful: false,
                },
            },
        })
        game.setAction(1, spell(FLAMETONGUE_WEAPON))
        login(game)
        typed(game, '/turbo macros')
        const macros = game.macros()
        game.setAction(2, spell(FLAMETONGUE_WEAPON))

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual(macros)
        expect(macros).toHaveLength(1)
        expect(game.actions()).toEqual({
            1: onBar('Flametongue Weap'),
            2: onBar('Flametongue Weap'),
        })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 1 button.'])
    })

    test('a long name in another language is cut by letters, not bytes, and trailing spaces are trimmed', () => {
        game = start({
            spells: {
                // 16th letter is a space: cut to 15.
                [HEALING_WAVE]: {
                    name: 'Волна исцеления прилива',
                    harmful: false,
                },
            },
        })
        game.setAction(1, spell(HEALING_WAVE))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Волна исцеления', castBody('Волна исцеления прилива')),
        ])
        expect(game.actions()).toEqual({ 1: onBar('Волна исцеления') })
    })

    test('two long names that cut to the same macro name: the first gets it, the second is skipped and the player is told', () => {
        game = start({
            spells: {
                [STRENGTH_OF_EARTH_TOTEM]: {
                    name: 'Strength of Earth Totem',
                    harmful: false,
                },
                [EARTH_SHOCK]: {
                    name: 'Strength of Earth Shock',
                    harmful: true,
                },
            },
        })
        game.setAction(1, spell(STRENGTH_OF_EARTH_TOTEM))
        game.setAction(2, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Strength of Eart', castBody('Strength of Earth Totem')),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Strength of Eart'),
            2: spell(EARTH_SHOCK),
        })
        expect(printed).toEqual([
            'Turbo made 1 macro and swapped 1 button.',
            'Skipped Strength of Earth Shock: its short macro name clashes with Strength of Earth Totem.',
        ])
    })
})

describe("the player's own macros", () => {
    test("a macro the player already has with a spell's name is left alone, so are that spell's buttons, and the player is told", () => {
        game = start()
        // An account macro is never Turbo's, even with Turbo's body.
        game.addMacro({
            name: 'Earth Shock',
            body: attackBody('Earth Shock'),
            perCharacter: false,
        })
        game.addMacro({
            name: 'Healing Wave',
            body: '/cast [@mouseover] Healing Wave',
            perCharacter: true,
        })
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        game.setAction(3, spell(STORMSTRIKE))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            {
                name: 'Earth Shock',
                icon: null,
                body: attackBody('Earth Shock'),
                perCharacter: false,
            },
            {
                name: 'Healing Wave',
                icon: null,
                body: '/cast [@mouseover] Healing Wave',
                perCharacter: true,
            },
            turboMacro('Stormstrike'),
        ])
        expect(game.actions()).toEqual({
            1: spell(EARTH_SHOCK),
            2: spell(HEALING_WAVE),
            3: onBar('Stormstrike'),
        })
        expect(printed).toEqual([
            'Turbo made 1 macro and swapped 1 button.',
            'Skipped Earth Shock: you already have a macro with that name.',
            'Skipped Healing Wave: you already have a macro with that name.',
        ])
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

    test('with too few free character macro slots it says how many it needs, and edits nothing either', () => {
        game = start()
        game.addMacro({
            name: 'Healing Wave',
            icon: QUESTION_MARK,
            body: attackBody('Healing Wave'),
            perCharacter: true,
        })
        // 28 of 30 used: 2 free, 3 needed.
        fillCharacterMacros(game, 27)
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(STORMSTRIKE))
        game.setAction(3, spell(LIGHTNING_BOLT))
        game.setAction(4, spell(HEALING_WAVE))
        login(game)
        const before = game.macros()
        const actions = game.actions()

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo needs 3 free character macro slots and you have 2. Nothing was changed.',
        ])
        expect(game.macros()).toEqual(before)
        expect(game.actions()).toEqual(actions)
    })
})

describe('room for the macros', () => {
    test('exactly enough free character macro slots is enough', () => {
        game = start()
        // 28 of 30 used: 2 free, 2 needed.
        fillCharacterMacros(game, 28)
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        login(game)

        expect(typed(game, '/turbo macros')).toEqual([
            'Turbo made 2 macros and swapped 2 buttons.',
        ])
        expect(game.macros()).toHaveLength(30)
    })
})

describe('the commands', () => {
    test('/tb macros does what /turbo macros does', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/tb macros')

        expect(printed).toEqual(['Turbo made 1 macro and swapped 1 button.'])
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
    test('offers every reading spell macros use', () => {
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
                    C_Spell = setmetatable({}, { __index = function() return function() end end }),
                    issecretvalue = function() return false end,
                    print = function() end,
                }, { __index = _G })
                local chunk = assert(loadstring(__src, "@Turbo/core/safe-layer.lua"))
                setfenv(chunk, env)
                local ns = {}
                chunk("Turbo", ns)
                local missing = {}
                for _, name in ipairs({ "spellName", "spellHarmful", "inCombat" }) do
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
