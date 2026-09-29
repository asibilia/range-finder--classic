/**
 * The range finder under the fake game: the range band in the card's header
 * row, how it follows the game, the two-miss melee rule, when it hides, when
 * it polls, and how other modules ask about melee.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - `spellInRange(spellID, 'target')` answers `C_Spell.IsSpellInRange`: true,
 *   false, or nil when there's nothing to check. Every Earth Shock (20 yd)
 *   and Lightning Bolt (30 yd) rank gets the same answer, so Turbo may ask
 *   with any rank it likes, but only ever by spell ID.
 * - `itemInRange(8149, 'target')` answers `C_Item.IsItemInRange` for the
 *   5-yard item: the melee check.
 * - `targetAttackable` (true for a live enemy) with `PLAYER_TARGET_CHANGED`,
 *   and `UNIT_FLAGS` ("target") when the target dies.
 * - `SPELL_RANGE_CHECK_UPDATE` (spellID, inRange, checksRange) fires with the
 *   rank-1 IDs, after the reading has changed.
 * - The band is text in a font string inside the `TurboCardRange` row:
 *   "Melee", "Shock range", "Bolt range" or "Out of range", coloured with
 *   `SetTextColor` (or a `|cffRRGGBB` code in the text).
 * - Other modules get melee from `ns.range.inMelee()` and the
 *   'Turbo.RangeChanged' message, whose payload is the band key ("melee",
 *   "shock", "bolt", "out"), or nil when the band is hidden.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { TURBO_DIR, loadTurbo, type FakeGame } from './fake-game/fake-game'
import { scriptShamanOnForever } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const RANGE_ROW = 'TurboCardRange'

const EARTH_SHOCK = 8042
const LIGHTNING_BOLT = 403
const EARTH_SHOCK_RANKS = [8042, 8044, 8045, 8046, 10412, 10413, 10414]
const LIGHTNING_BOLT_RANKS = [
    403, 529, 548, 915, 943, 6041, 10391, 10392, 15207, 15208,
]
/** The item whose range check reaches 5 yards. */
const MELEE_ITEM = 8149

/** The melee check's poll interval: 5 times a second. */
const POLL = 0.2

/** What the game's range checks answer; null is "nothing to check". */
type Checks = {
    melee: boolean | null
    shock: boolean | null
    bolt: boolean | null
}

const IN_MELEE: Checks = { melee: true, shock: true, bolt: true }
const AT_SHOCK: Checks = { melee: false, shock: true, bolt: true }
const AT_BOLT: Checks = { melee: false, shock: false, bolt: true }
const OUT: Checks = { melee: false, shock: false, bolt: false }
const NOTHING: Checks = { melee: null, shock: null, bolt: null }

/** Every other v1 module, turned off so these tests script only range. */
const OTHER_MODULES = [
    'swingTimer',
    'totemTimers',
    'weaponImbue',
    'lightningShield',
    'keyCooldowns',
    'manaBar',
    'maelstromWeapon',
    'reminders',
]

/** Loads Turbo as a Shaman on Forever, out of combat with no target. */
function start(): FakeGame {
    const g = loadTurbo({
        savedVariables: {
            TurboDB: {
                schemaVersion: 1,
                classes: {
                    SHAMAN: {
                        modules: Object.fromEntries(
                            OTHER_MODULES.map((id) => [id, false])
                        ),
                    },
                },
            },
        },
    })
    scriptShamanOnForever(g)
    setChecks(g, NOTHING)
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

/** Scripts what the range checks answer from now on. */
function setChecks(g: FakeGame, checks: Checks) {
    for (const id of EARTH_SHOCK_RANKS) {
        g.setReadingFor('spellInRange', [id, 'target'], checks.shock)
    }
    for (const id of LIGHTNING_BOLT_RANKS) {
        g.setReadingFor('spellInRange', [id, 'target'], checks.bolt)
    }
    g.setReadingFor('itemInRange', [MELEE_ITEM, 'target'], checks.melee)
}

/** The spell ranges change, and the game says so. Melee waits for a poll. */
function spellsChange(g: FakeGame, checks: Checks) {
    setChecks(g, checks)
    g.fire('SPELL_RANGE_CHECK_UPDATE', EARTH_SHOCK, checks.shock === true, true)
    g.fire(
        'SPELL_RANGE_CHECK_UPDATE',
        LIGHTNING_BOLT,
        checks.bolt === true,
        true
    )
}

/** Targets a live enemy at a distance. */
function targetEnemy(g: FakeGame, checks: Checks) {
    setChecks(g, checks)
    g.setReading('targetAttackable', true)
    g.fire('PLAYER_TARGET_CHANGED')
}

/** Targets a friendly player standing right next to us. */
function targetFriend(g: FakeGame) {
    setChecks(g, { melee: true, shock: null, bolt: null })
    g.setReading('targetAttackable', false)
    g.fire('PLAYER_TARGET_CHANGED')
}

/** Targets an enemy corpse right next to us. */
function targetCorpse(g: FakeGame) {
    setChecks(g, IN_MELEE)
    g.setReading('targetAttackable', false)
    g.fire('PLAYER_TARGET_CHANGED')
}

function clearTarget(g: FakeGame) {
    setChecks(g, NOTHING)
    g.setReading('targetAttackable', false)
    g.fire('PLAYER_TARGET_CHANGED')
}

/** The targeted enemy dies where it stands. */
function targetDies(g: FakeGame) {
    g.setReading('targetAttackable', false)
    g.fire('UNIT_FLAGS', 'target')
}

/** Frames inside a frame, at any depth. */
function descendants(g: FakeGame, root: string): string[] {
    return g.frames().filter((id) => {
        let parent = g.frame(id)?.parent
        for (let depth = 0; parent && depth < 10; depth++) {
            if (parent === root) return true
            parent = g.frame(parent)?.parent
        }
        return false
    })
}

/** Whether a frame and its parents, up to and including `root`, are shown. */
function shownWithin(g: FakeGame, id: string, root: string): boolean {
    let current: string | null | undefined = id
    for (let depth = 0; current && depth < 10; depth++) {
        const state = g.frame(current)
        if (!state || state.shown !== true) return false
        if (current === root) return true
        current = state.parent as string | null
    }
    return false
}

type Rgb = [number, number, number]

const COLOUR_CODE = /\|c([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i

function plainText(text: string): string {
    return text
        .replace(/\|c[0-9a-f]{8}/gi, '')
        .replace(/\|r/g, '')
        .trim()
}

function colourOf(state: Record<string, unknown>, text: string): Rgb | null {
    const code = text.match(COLOUR_CODE)
    if (code) {
        return [code[2]!, code[3]!, code[4]!].map(
            (hex) => parseInt(hex, 16) / 255
        ) as Rgb
    }
    for (const key of ['TextColor', 'VertexColor']) {
        const value = state[key]
        if (Array.isArray(value) && value.length >= 3) {
            return value.slice(0, 3).map(Number) as Rgb
        }
    }
    return null
}

type Band = { text: string; colour: Rgb | null }

/** The band the header shows now, or null when it shows none. */
function band(g: FakeGame): Band | null {
    const shown: Band[] = []
    for (const id of descendants(g, RANGE_ROW)) {
        const state = g.frame(id)!
        if (typeof state.Text !== 'string') continue
        const text = plainText(state.Text)
        if (text === '' || !shownWithin(g, id, RANGE_ROW)) continue
        shown.push({ text, colour: colourOf(state, state.Text) })
    }
    expect(shown.length).toBeLessThanOrEqual(1)
    return shown[0] ?? null
}

function bandText(g: FakeGame): string | null {
    return band(g)?.text ?? null
}

/** A colour's hue in degrees, or null for greys and dark colours. */
function hue([r, g, b]: Rgb): number | null {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max < 0.5 || max - min < 0.35) return null
    let h: number
    if (max === r) h = ((g - b) / (max - min)) % 6
    else if (max === g) h = (b - r) / (max - min) + 2
    else h = (r - g) / (max - min) + 4
    return (h * 60 + 360) % 360
}

type ColourName = 'gold' | 'green' | 'teal' | 'red'

function colourName(colour: Rgb | null): ColourName | null {
    const h = colour && hue(colour)
    if (h === null || h === undefined) return null
    if (h >= 35 && h <= 60) return 'gold'
    if (h >= 85 && h <= 150) return 'green'
    if (h >= 160 && h <= 200) return 'teal'
    if (h <= 15 || h >= 345) return 'red'
    return null
}

function rangeReads(g: FakeGame) {
    return g
        .reads()
        .filter((r) => r.name === 'spellInRange' || r.name === 'itemInRange')
}

function meleeChecks(g: FakeGame): number {
    return g.reads().filter((r) => r.name === 'itemInRange').length
}

function inMelee(g: FakeGame): unknown {
    return g.run('return ns.range.inMelee()')[0]
}

describe('range bands', () => {
    test('an enemy within 5 yards shows Melee, in gold', () => {
        game = start()
        login(game)

        targetEnemy(game, IN_MELEE)

        const shown = band(game)
        expect(shown?.text).toBe('Melee')
        expect(colourName(shown?.colour ?? null)).toBe('gold')
    })

    test('an enemy within Earth Shock range but out of melee shows Shock range, in green', () => {
        game = start()
        login(game)

        targetEnemy(game, AT_SHOCK)

        const shown = band(game)
        expect(shown?.text).toBe('Shock range')
        expect(colourName(shown?.colour ?? null)).toBe('green')
    })

    test('an enemy past Earth Shock range but within Lightning Bolt range shows Bolt range, in teal', () => {
        game = start()
        login(game)

        targetEnemy(game, AT_BOLT)

        const shown = band(game)
        expect(shown?.text).toBe('Bolt range')
        expect(colourName(shown?.colour ?? null)).toBe('teal')
    })

    test('an enemy past Lightning Bolt range shows Out of range, in red', () => {
        game = start()
        login(game)

        targetEnemy(game, OUT)

        const shown = band(game)
        expect(shown?.text).toBe('Out of range')
        expect(colourName(shown?.colour ?? null)).toBe('red')
    })

    test("the Shock and Bolt bands follow the game's range-change event, without waiting for a poll", () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, OUT)
        game.advance(POLL / 2)
        expect(bandText(game)).toBe('Out of range')

        spellsChange(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        spellsChange(game, AT_SHOCK)
        expect(bandText(game)).toBe('Shock range')

        spellsChange(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        spellsChange(game, OUT)
        expect(bandText(game)).toBe('Out of range')
    })

    test('the spell range checks ask about Earth Shock and Lightning Bolt by spell ID, on the target', () => {
        game = start()
        login(game)
        targetEnemy(game, OUT)
        spellsChange(game, AT_BOLT)
        spellsChange(game, AT_SHOCK)
        game.advance(1)

        const spellReads = game.reads().filter((r) => r.name === 'spellInRange')
        const asked = (ranks: number[]) =>
            spellReads.some(
                (r) =>
                    ranks.includes(r.args[0] as number) &&
                    r.args[1] === 'target'
            )
        expect(asked(EARTH_SHOCK_RANKS)).toBe(true)
        expect(asked(LIGHTNING_BOLT_RANKS)).toBe(true)
        for (const r of spellReads) {
            expect(typeof r.args[0]).toBe('number')
        }
    })

    test('walking into melee shows Melee on the next melee check', () => {
        game = start()
        login(game)
        targetEnemy(game, AT_SHOCK)
        game.advance(POLL / 2)
        expect(bandText(game)).toBe('Shock range')

        setChecks(game, IN_MELEE)
        game.advance(POLL)

        expect(bandText(game)).toBe('Melee')
    })

    test('the melee check asks the 5-yard item about the target', () => {
        game = start()
        login(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)

        const itemReads = game.reads().filter((r) => r.name === 'itemInRange')
        expect(itemReads.length).toBeGreaterThan(0)
        for (const r of itemReads) {
            expect(r.args).toEqual([MELEE_ITEM, 'target'])
        }
    })
})

describe('the two-miss melee rule', () => {
    test('one missed melee check keeps Melee; a second miss in a row leaves it', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)
        expect(bandText(game)).toBe('Melee')

        setChecks(game, AT_SHOCK)
        game.advance(POLL)
        expect(bandText(game)).toBe('Melee')

        game.advance(POLL)
        expect(bandText(game)).toBe('Shock range')
    })

    test('a miss, a hit, then a miss at the edge of melee never leaves Melee', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)

        for (const checks of [AT_SHOCK, IN_MELEE, AT_SHOCK, IN_MELEE]) {
            setChecks(game, checks)
            game.advance(POLL)
            expect(bandText(game)).toBe('Melee')
        }
    })

    test('after two misses the band falls to whatever the spell checks say', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)

        setChecks(game, OUT)
        game.advance(POLL * 2)

        expect(bandText(game)).toBe('Out of range')
    })
})

describe('polling', () => {
    test('with an enemy targeted, the melee check runs 5 times a second', () => {
        game = start()
        login(game)
        targetEnemy(game, AT_SHOCK)
        game.advance(POLL / 2)

        const before = meleeChecks(game)
        game.advance(2)
        const polled = meleeChecks(game) - before

        expect(polled).toBeGreaterThanOrEqual(9)
        expect(polled).toBeLessThanOrEqual(11)
    })

    test('with no target, nothing is checked, in or out of combat', () => {
        game = start()
        login(game)
        game.advance(3)
        enterCombat(game)
        game.advance(3)

        expect(rangeReads(game)).toEqual([])

        targetEnemy(game, AT_SHOCK)
        game.advance(1)
        expect(meleeChecks(game)).toBeGreaterThan(0)
    })

    test('a friendly target is never polled', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetFriend(game)
        game.advance(3)

        expect(meleeChecks(game)).toBe(0)

        targetEnemy(game, AT_SHOCK)
        game.advance(1)
        expect(meleeChecks(game)).toBeGreaterThan(0)
    })

    test('dropping the enemy target stops the polling', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)
        expect(meleeChecks(game)).toBeGreaterThan(0)

        clearTarget(game)
        const before = meleeChecks(game)
        game.advance(3)

        expect(meleeChecks(game)).toBe(before)
    })

    test('an enemy that dies while targeted stops the polling', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)
        expect(meleeChecks(game)).toBeGreaterThan(0)

        targetDies(game)
        const before = meleeChecks(game)
        game.advance(3)

        expect(meleeChecks(game)).toBe(before)
    })

    test('turning the range finder off hides the band and stops the polling', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)
        expect(bandText(game)).toBe('Melee')

        game.run('ns.modules.disable("rangeFinder")')
        const before = meleeChecks(game)
        game.advance(3)

        expect(bandText(game)).toBeNull()
        expect(meleeChecks(game)).toBe(before)
    })
})

describe('when the band is hidden', () => {
    test('with no target the header shows no band, even in combat', () => {
        game = start()
        login(game)
        enterCombat(game)
        game.advance(1)

        expect(bandText(game)).toBeNull()

        // The band has somewhere to show once there is an enemy to range.
        targetEnemy(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')
    })

    test('a friendly target shows no band, even standing right next to it', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        targetFriend(game)
        game.advance(1)

        expect(bandText(game)).toBeNull()
    })

    test('a dead enemy target shows no band', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        targetCorpse(game)
        game.advance(1)

        expect(bandText(game)).toBeNull()
    })

    test('an enemy that dies while targeted clears the band', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)
        expect(bandText(game)).toBe('Melee')

        targetDies(game)

        expect(bandText(game)).toBeNull()
    })

    test('clearing the target clears the band', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        clearTarget(game)

        expect(bandText(game)).toBeNull()
    })

    test('switching from a friend to an enemy shows the enemy band at once', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetFriend(game)
        game.advance(1)

        targetEnemy(game, AT_SHOCK)

        expect(bandText(game)).toBe('Shock range')
    })
})

describe('melee range for other modules', () => {
    test('other modules can ask whether the player is in melee, with the two-miss rule applied', () => {
        game = start()
        login(game)
        enterCombat(game)
        expect(inMelee(game)).toBe(false)

        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)
        expect(inMelee(game)).toBe(true)

        setChecks(game, AT_SHOCK)
        game.advance(POLL)
        expect(inMelee(game)).toBe(true)

        game.advance(POLL)
        expect(inMelee(game)).toBe(false)

        setChecks(game, IN_MELEE)
        game.advance(POLL)
        expect(inMelee(game)).toBe(true)

        clearTarget(game)
        expect(inMelee(game)).toBe(false)
    })

    test('band changes go out as the Turbo.RangeChanged message, and hiding sends no band', () => {
        game = start()
        login(game)
        game.run(`
            ns.testBands = {}
            ns.events.on("Turbo.RangeChanged", function(_, key)
                table.insert(ns.testBands, key or "hidden")
            end)
        `)
        enterCombat(game)

        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)
        setChecks(game, AT_SHOCK)
        game.advance(POLL * 2)
        spellsChange(game, AT_BOLT)
        spellsChange(game, OUT)
        clearTarget(game)

        const sent = game.run('return ns.testBands')[0] as string[]
        const changes = sent.filter((key, i) => key !== sent[i - 1])
        expect(changes).toEqual(['melee', 'shock', 'bolt', 'out', 'hidden'])
    })
})

describe('never by action-bar slot', () => {
    test('range is only ever checked by spell and item, never through an action-bar slot', () => {
        const luaFiles = readdirSync(TURBO_DIR, {
            recursive: true,
            encoding: 'utf8',
        }).filter((f) => f.endsWith('.lua'))
        for (const file of luaFiles) {
            const source = readFileSync(join(TURBO_DIR, file), 'utf8')
            expect(source).not.toMatch(
                /\b(IsActionInRange|ActionHasRange|GetActionInfo|HasAction|GetActionTexture)\b|C_ActionBar\b/
            )
        }

        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        game.advance(1)
        spellsChange(game, AT_BOLT)
        game.advance(1)

        const names = game.reads().map((r) => r.name)
        expect(names).toContain('spellInRange')
        expect(names).toContain('itemInRange')
        expect(names.filter((n) => /action|slot/i.test(n))).toEqual([])
    })
})

describe('inside a dungeon', () => {
    test('zoning into a dungeon, the bands and the two-miss rule work the same', () => {
        game = start()
        login(game)
        game.fire('PLAYER_ENTERING_WORLD', false, false)
        // A restricted map (Enum.AddOnRestrictionType.Map), now active.
        game.fire('ADDON_RESTRICTION_STATE_CHANGED', 4, 2)
        enterCombat(game)

        targetEnemy(game, IN_MELEE)
        game.advance(POLL / 2)
        expect(bandText(game)).toBe('Melee')

        setChecks(game, AT_SHOCK)
        game.advance(POLL)
        expect(bandText(game)).toBe('Melee')
        game.advance(POLL)
        expect(bandText(game)).toBe('Shock range')

        spellsChange(game, AT_BOLT)
        expect(bandText(game)).toBe('Bolt range')

        targetDies(game)
        expect(bandText(game)).toBeNull()
    })
})
