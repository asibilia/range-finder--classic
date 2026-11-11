/**
 * Spell macros under the fake game: `/turbo macros` (and `/tb macros`) finds
 * every spell on the player's action bars with more than one rank, makes one
 * macro for each (by name, so every rank shares it), swaps every action slot
 * holding that spell for its macro, and prints a summary. Attacking spells get
 * the attack variant, which starts auto-attack too, except crowd control that
 * damage breaks. It works for every class, and only acts out of combat, with
 * nothing on the cursor, and when there's room for every new macro: Turbo's
 * own unneeded character macros first, then free character slots, then free
 * general ones.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - `spellName(id)`: a spell's name in the player's language, the same for
 *   every rank; nil for a spell the game doesn't have.
 * - `spellHarmful(id)`: whether the spell can be cast on an enemy.
 * - `spellSubtext(id)`: its rank line ("Rank 2") once the player knows more
 *   than one rank; empty for a spell with one.
 * - `knownSpellID(name)`: the spell ID for a name the player knows, or nil.
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

/**
 * A spell as the game describes it. `ranked: false` is a spell the player
 * knows one rank of (no rank line); every other spell has a rank line.
 */
type Spell = { name: string; harmful: boolean; ranked?: boolean }

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
    [STORMSTRIKE]: { name: 'Stormstrike', harmful: true, ranked: false },
    [GHOST_WOLF]: { name: 'Ghost Wolf', harmful: false, ranked: false },
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

/** Adds Turbo's macro for a spell name, as an earlier run made it. */
function addTurboMacro(
    g: FakeGame,
    name: string,
    body: string,
    perCharacter: boolean
) {
    g.addMacro({ name, icon: QUESTION_MARK, body, perCharacter })
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
    g.setReading('spellSubtext', null)
    g.setReading('knownSpellID', null)
    for (const [id, s] of Object.entries(options.spells ?? SPELLS)) {
        describeSpell(g, Number(id), s)
    }
    return g
}

/** Scripts what the game says about one spell. */
function describeSpell(g: FakeGame, id: number, s: Spell) {
    g.setReadingFor('spellName', [id], s.name)
    g.setReadingFor('spellHarmful', [id], s.harmful)
    g.setReadingFor('spellSubtext', [id], s.ranked === false ? '' : 'Rank 2')
    g.setReadingFor('knownSpellID', [s.name], id)
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
            name: `Mine ${String(i).padStart(2, '0')}`,
            body: `/say ${i}`,
            perCharacter: true,
        })
    }
}

/** Adds `count` general (account) macros of the player's own. */
function fillGeneralMacros(g: FakeGame, count: number) {
    for (let i = 1; i <= count; i++) {
        g.addMacro({
            name: `Shared ${String(i).padStart(3, '0')}`,
            body: `/say ${i}`,
            perCharacter: false,
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

    test('a spell with one rank (Ghost Wolf) gets no macro, and its button is left alone', () => {
        game = start()
        game.setAction(1, spell(GHOST_WOLF))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(GHOST_WOLF) })
        expect(printed).toEqual(['Turbo made 0 macros and swapped 0 buttons.'])
    })

    test('an offensive spell with one rank (Stormstrike) gets no macro either', () => {
        game = start()
        game.setAction(1, spell(STORMSTRIKE))
        login(game)

        typed(game, '/turbo macros')

        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(STORMSTRIKE) })
    })

    test('a spell that gains its second rank on level-up starts getting a macro', () => {
        game = start()
        game.setAction(1, spell(LIGHTNING_BOLT))
        // Only rank 1 known: Forever shows no rank line.
        game.setReadingFor('spellSubtext', [LIGHTNING_BOLT], '')
        login(game)
        expect(typed(game, '/turbo macros')).toEqual([
            'Turbo made 0 macros and swapped 0 buttons.',
        ])
        expect(game.macros()).toEqual([])

        // Level-up: rank 2 learned, so the rank line shows.
        game.setReadingFor('spellSubtext', [LIGHTNING_BOLT], 'Rank 1')
        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Lightning Bolt')])
        expect(game.actions()).toEqual({ 1: onBar('Lightning Bolt') })
        expect(printed).toEqual(['Turbo made 1 macro and swapped 1 button.'])
    })

    test('a rank line in another language counts, by its number', () => {
        game = start()
        game.setAction(1, spell(HEALING_WAVE))
        game.setReadingFor('spellSubtext', [HEALING_WAVE], 'Ранг 3')
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Healing Wave', castBody('Healing Wave')),
        ])
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
        game.setAction(180, spell(LIGHTNING_BOLT))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Earth Shock'),
            turboMacro('Healing Wave', castBody('Healing Wave')),
            turboMacro('Lightning Bolt'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            61: onBar('Healing Wave'),
            180: onBar('Lightning Bolt'),
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
        // And Lightning Bolt's as not.
        game.addMacro({
            name: 'Lightning Bolt',
            icon: QUESTION_MARK,
            body: castBody('Lightning Bolt'),
            perCharacter: true,
        })
        game.setAction(1, spell(HEALING_WAVE))
        game.setAction(2, spell(LIGHTNING_BOLT))
        game.setAction(3, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Earth Shock'),
            turboMacro('Healing Wave', castBody('Healing Wave')),
            turboMacro('Lightning Bolt'),
        ])
        expect(game.actions()).toEqual({
            1: onBar('Healing Wave'),
            2: onBar('Lightning Bolt'),
            3: onBar('Earth Shock'),
        })
        expect(printed).toEqual([
            'Turbo made 1 macro, updated 2 and swapped 3 buttons.',
        ])
    })
})

describe("Turbo's macros as the game gives them back after a reload", () => {
    // After a reload, the game can give a macro's body back with a line
    // break at the end, or Windows line breaks. It is still Turbo's.
    const AFTER_RELOAD: [string, (body: string) => string][] = [
        ['a line break at the end', (body) => `${body}\n`],
        ['Windows line breaks', (body) => body.replaceAll('\n', '\r\n')],
        ['spaces at the end', (body) => `${body}  `],
    ]

    for (const [what, reloaded] of AFTER_RELOAD) {
        test(`with ${what}: an earlier Turbo's macro is reused, not skipped, and not updated`, () => {
            game = start({
                spells: {
                    [STRENGTH_OF_EARTH_TOTEM]: {
                        name: 'Strength of Earth Totem',
                        harmful: false,
                    },
                },
            })
            addTurboMacro(
                game,
                'Strength of Eart',
                reloaded(castBody('Strength of Earth Totem')),
                true
            )
            game.setAction(1, spell(STRENGTH_OF_EARTH_TOTEM))
            login(game)

            const printed = typed(game, '/turbo macros')

            expect(printed).toEqual([
                'Turbo made 0 macros and swapped 1 button.',
            ])
            expect(game.macros()).toHaveLength(1)
            expect(game.actions()).toEqual({ 1: onBar('Strength of Eart') })
        })
    }

    test("an earlier Turbo's Ghost Wolf macro with a line break at the end still gives the buttons the spell back", () => {
        game = start()
        addTurboMacro(game, 'Ghost Wolf', `${castBody('Ghost Wolf')}\n`, true)
        game.setAction(1, onBar('Ghost Wolf'))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 0 macros, removed 1 and swapped 0 buttons.',
            'Put Ghost Wolf back on your bars: it has one rank, so no macro.',
        ])
        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({ 1: spell(GHOST_WOLF) })
    })

    test("a full character list of an earlier Turbo's macros, all with a line break at the end, is recycled before any general slot", () => {
        game = start()
        // 30 old Turbo macros for spells now on no bar.
        for (let i = 1; i <= 30; i++) {
            const name = `Old Spell ${String(i).padStart(2, '0')}`
            addTurboMacro(game, name, `${castBody(name)}\n`, true)
        }
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 1 macro, removed 30 and swapped 1 button.',
        ])
        expect(macroList(game)).toEqual([turboMacro('Earth Shock')])
    })

    test("a macro with something more after the cast is still the player's", () => {
        game = start()
        game.addMacro({
            name: 'Healing Wave',
            body: `${castBody('Healing Wave')}\n/say Healing!`,
            perCharacter: true,
        })
        game.setAction(1, spell(HEALING_WAVE))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 0 macros and swapped 0 buttons.',
            'Skipped Healing Wave: you already have a macro with that name.',
        ])
        expect(game.actions()).toEqual({ 1: spell(HEALING_WAVE) })
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
        // A general macro of the player's, with another body.
        game.addMacro({
            name: 'Earth Shock',
            body: '/cast Earth Shock',
            perCharacter: false,
        })
        game.addMacro({
            name: 'Healing Wave',
            body: '/cast [@mouseover] Healing Wave',
            perCharacter: true,
        })
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        game.setAction(3, spell(LIGHTNING_BOLT))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            {
                name: 'Earth Shock',
                icon: null,
                body: '/cast Earth Shock',
                perCharacter: false,
            },
            {
                name: 'Healing Wave',
                icon: null,
                body: '/cast [@mouseover] Healing Wave',
                perCharacter: true,
            },
            turboMacro('Lightning Bolt'),
        ])
        expect(game.actions()).toEqual({
            1: spell(EARTH_SHOCK),
            2: spell(HEALING_WAVE),
            3: onBar('Lightning Bolt'),
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

    test('with no room left in either list it says how many slots are missing and which macros are not on the bars, and edits nothing either', () => {
        game = start()
        game.addMacro({
            name: 'Healing Wave',
            icon: QUESTION_MARK,
            body: attackBody('Healing Wave'),
            perCharacter: true,
        })
        // 28 of 30 character slots used and 119 of 120 general: 3 free, 4
        // needed.
        fillCharacterMacros(game, 27)
        fillGeneralMacros(game, 119)
        // These two are on the bars, so they aren't offered for deleting.
        game.setAction(10, { type: 'macro', name: 'Mine 01' })
        game.setAction(11, { type: 'macro', name: 'Shared 001' })
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(FIREBALL))
        game.setAction(3, spell(LIGHTNING_BOLT))
        game.setAction(4, spell(HEALING_WAVE))
        game.setAction(5, spell(ARCANE_INTELLECT))
        login(game)
        const before = game.macros()
        const actions = game.actions()

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo needs 4 free macro slots and you have 3. Free up 1 more. Nothing was changed.',
            'Not on your bars, so you could delete: Mine 02, Mine 03, Mine 04, Mine 05, Mine 06, Mine 07, Mine 08, Mine 09, Mine 10, Mine 11 and 134 more.',
            'General macros are shared: check your other characters first.',
        ])
        expect(game.macros()).toEqual(before)
        expect(game.actions()).toEqual(actions)
    })

    test('with every slot full and every macro on the bars, it says to delete some in the macro window', () => {
        game = start()
        fillCharacterMacros(game, 30)
        fillGeneralMacros(game, 120)
        // All 150 macros on the bars, in slots 2 to 151.
        game.macros().forEach((macro, i) => {
            game!.setAction(i + 2, {
                type: 'macro',
                name: macro.name,
                perCharacter: macro.perCharacter,
            })
        })
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)
        const before = game.macros()

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo needs 1 free macro slot and you have 0. Free up 1 more. Nothing was changed.',
            "Every macro you have is on your bars or Turbo's. Delete some in the macro window (/macro).",
        ])
        expect(game.macros()).toEqual(before)
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
        expect(game.macros().every((m) => m.perCharacter)).toBe(true)
    })

    test("Turbo's character macro that is on no bar any more is recycled for a new spell before a free slot is used", () => {
        game = start()
        // Full: 29 of the player's and Turbo's old Frost Shock, on no bar.
        fillCharacterMacros(game, 29)
        game.addMacro({
            name: 'Frost Shock',
            icon: QUESTION_MARK,
            body: attackBody('Frost Shock'),
            perCharacter: true,
        })
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 1 macro, removed 1 and swapped 1 button.',
        ])
        const turbos = macroList(game).filter((m) => !m.name.startsWith('Mine'))
        expect(turbos).toEqual([turboMacro('Earth Shock')])
        expect(game.macros()).toHaveLength(30)
        expect(game.actions()).toEqual({ 1: onBar('Earth Shock') })
    })

    test("Turbo's character macros that nothing needs are deleted, even with room to spare", () => {
        game = start()
        game.addMacro({
            name: 'Frost Shock',
            icon: QUESTION_MARK,
            body: attackBody('Frost Shock'),
            perCharacter: true,
        })
        game.addMacro({
            name: 'Healing Wave',
            icon: QUESTION_MARK,
            body: castBody('Healing Wave'),
            perCharacter: true,
        })
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 0 macros, removed 2 and swapped 0 buttons.',
        ])
        expect(game.macros()).toEqual([])
    })

    test("Turbo's macro on the bars for a spell with one rank gives the buttons the spell back and is removed", () => {
        game = start()
        // From an earlier Turbo, which made one for Ghost Wolf.
        game.addMacro({
            name: 'Ghost Wolf',
            icon: QUESTION_MARK,
            body: castBody('Ghost Wolf'),
            perCharacter: true,
        })
        game.setAction(1, onBar('Ghost Wolf'))
        game.setAction(7, onBar('Ghost Wolf'))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 0 macros, removed 1 and swapped 0 buttons.',
            'Put Ghost Wolf back on your bars: it has one rank, so no macro.',
        ])
        expect(game.macros()).toEqual([])
        expect(game.actions()).toEqual({
            1: spell(GHOST_WOLF),
            7: spell(GHOST_WOLF),
        })
        expect(game.cursor()).toBeNull()
    })

    test("Turbo's macro on the bars for a spell with ranks, or one the player doesn't know, is kept", () => {
        game = start()
        addTurboMacro(game, 'Earth Shock', attackBody('Earth Shock'), true)
        // Not known on this character (say, after a respec).
        addTurboMacro(game, 'Frost Shock', attackBody('Frost Shock'), true)
        game.setAction(1, onBar('Earth Shock'))
        game.setAction(2, onBar('Frost Shock'))
        login(game)
        const before = game.macros()

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual(['Turbo made 0 macros and swapped 0 buttons.'])
        expect(game.macros()).toEqual(before)
        expect(game.actions()).toEqual({
            1: onBar('Earth Shock'),
            2: onBar('Frost Shock'),
        })
    })

    test('with the character list full, new macros go in free general slots, and the player is told', () => {
        game = start()
        fillCharacterMacros(game, 30)
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 2 macros and swapped 2 buttons.',
            'Your character macros are full, so Turbo put 2 in general macro slots, shared by your characters.',
        ])
        expect(macroList(game).filter((m) => !m.perCharacter)).toEqual([
            { ...turboMacro('Earth Shock'), perCharacter: false },
            {
                ...turboMacro('Healing Wave', castBody('Healing Wave')),
                perCharacter: false,
            },
        ])
        expect(game.actions()).toEqual({
            1: { type: 'macro', name: 'Earth Shock', perCharacter: false },
            2: { type: 'macro', name: 'Healing Wave', perCharacter: false },
        })
    })

    test('character slots are used first, then general ones', () => {
        game = start()
        fillCharacterMacros(game, 29)
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        login(game)

        typed(game, '/turbo macros')

        expect(game.actions()).toEqual({
            1: { type: 'macro', name: 'Earth Shock', perCharacter: true },
            2: { type: 'macro', name: 'Healing Wave', perCharacter: false },
        })
    })

    test('a general Turbo macro another character made is shared, not made again, and never removed from this one', () => {
        game = start()
        addTurboMacro(game, 'Earth Shock', attackBody('Earth Shock'), false)
        // Another character's: on no bar here, for a spell this one lacks.
        addTurboMacro(game, 'Fireball', attackBody('Fireball'), false)
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual(['Turbo made 0 macros and swapped 1 button.'])
        expect(macroList(game)).toEqual([
            { ...turboMacro('Earth Shock'), perCharacter: false },
            { ...turboMacro('Fireball'), perCharacter: false },
        ])
        expect(game.actions()).toEqual({
            1: { type: 'macro', name: 'Earth Shock', perCharacter: false },
        })
    })

    test("a general Turbo macro on the bars for a spell with one rank gives this character's buttons the spell back, and stays for the others", () => {
        game = start()
        addTurboMacro(game, 'Ghost Wolf', castBody('Ghost Wolf'), false)
        game.setAction(1, {
            type: 'macro',
            name: 'Ghost Wolf',
            perCharacter: false,
        })
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(printed).toEqual([
            'Turbo made 0 macros and swapped 0 buttons.',
            'Put Ghost Wolf back on your bars: it has one rank, so no macro.',
        ])
        expect(game.macros()).toHaveLength(1)
        expect(game.actions()).toEqual({ 1: spell(GHOST_WOLF) })
    })
})

describe('auto-attack', () => {
    test('an attacking spell starts auto-attack; a heal does not', () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        game.setAction(2, spell(HEALING_WAVE))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Earth Shock', attackBody('Earth Shock')),
            turboMacro('Healing Wave', castBody('Healing Wave')),
        ])
    })

    // Every spell on Turbo's breaks-on-damage list, by its spell ID there.
    const BREAKS_ON_DAMAGE: Record<number, string> = {
        1776: 'Gouge',
        6770: 'Sap',
        2094: 'Blind',
        118: 'Polymorph',
        28272: 'Polymorph: Pig',
        28271: 'Polymorph: Turtle',
        122: 'Frost Nova',
        2637: 'Hibernate',
        339: 'Entangling Roots',
        1499: 'Freezing Trap',
        19503: 'Scatter Shot',
        19386: 'Wyvern Sting',
        1513: 'Scare Beast',
        20066: 'Repentance',
        2878: 'Turn Undead',
        9484: 'Shackle Undead',
        8122: 'Psychic Scream',
        5782: 'Fear',
        5484: 'Howl of Terror',
        6358: 'Seduction',
        5246: 'Intimidating Shout',
        51514: 'Hex',
    }

    test('crowd control that damage breaks (Gouge, Hex and the rest) gets the plain macro, at any rank', () => {
        game = start()
        let slot = 1
        for (const [id, name] of Object.entries(BREAKS_ON_DAMAGE)) {
            describeSpell(game, Number(id), { name, harmful: true })
            // Another rank of it on the bars: matched by name.
            const otherRank = 900000 + Number(id)
            describeSpell(game, otherRank, { name, harmful: true })
            game.setAction(slot++, spell(otherRank))
        }
        login(game)

        const printed = typed(game, '/turbo macros')

        const macros = macroList(game)
        expect(macros).toHaveLength(Object.keys(BREAKS_ON_DAMAGE).length)
        for (const macro of macros) {
            expect(macro.body).not.toContain('/startattack')
        }
        expect(macros.map((m) => m.body)).toContain(castBody('Gouge'))
        expect(macros.map((m) => m.body)).toContain(castBody('Hex'))
        expect(printed[0]).toMatch(/^Turbo made 22 macros/)
    })

    test("a spell the game doesn't have (Hex, before Forever adds it) is skipped from the list without fuss", () => {
        game = start()
        game.setAction(1, spell(EARTH_SHOCK))
        login(game)

        typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([turboMacro('Earth Shock')])
    })

    test("Turbo's attack macro for a crowd-control spell, from before, loses /startattack", () => {
        game = start()
        describeSpell(game, 1776, { name: 'Gouge', harmful: true })
        addTurboMacro(game, 'Gouge', attackBody('Gouge'), true)
        game.setAction(1, spell(1776))
        login(game)

        const printed = typed(game, '/turbo macros')

        expect(macroList(game)).toEqual([
            turboMacro('Gouge', castBody('Gouge')),
        ])
        expect(printed).toEqual([
            'Turbo made 0 macros, updated 1 and swapped 1 button.',
        ])
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
                for _, name in ipairs({ "spellName", "spellHarmful", "spellSubtext", "knownSpellID", "inCombat" }) do
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
