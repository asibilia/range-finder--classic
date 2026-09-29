/**
 * The Lightning Shield module under the fake game: exact charges (3 / 2 / 1)
 * on the card through Blizzard's aura container widget, Turbo's own charge
 * counter as the fallback, and a reminder once the shield is gone.
 *
 * The game, as these tests script it (see turbo-imbue-reminders.test.ts for
 * the reminder system and turbo-card.test.ts for the rest):
 *
 * - Reading `lightningShield`: the player's Lightning Shield aura as a plain
 *   table, `{ charges = <n>, timeLeft = <seconds> }`, or `false` when the
 *   player has none. Aura reads throw in combat: the real safe layer wraps
 *   the read, and a failed read gives nil. So Turbo only learns the real
 *   charges out of combat, and resyncs from this reading after every fight.
 *   The real safe layer asks `C_UnitAuras.GetPlayerAuraBySpellID` for each
 *   Lightning Shield rank (324, 325, 905, 945, 8134, 10431, 10432).
 * - Reading `auraContainerSupported`: whether the client has Blizzard's aura
 *   container widget. When it does, the charges are shown by a frame made as
 *   `CreateFrame("AuraContainer", name, parent, "CustomAuraContainerTemplate")`
 *   inside the card's icons row (`TurboCardIcons`), set to the unit "player"
 *   (`SetUnit`) with one aura slot (`AddAuraSlot(key, "HELPFUL", options)`)
 *   whose `candidateFilters.includeSpellIDs` holds the Lightning Shield ranks.
 *   It's built out of combat only. In combat its child frames are forbidden
 *   objects, so Turbo never calls anything on it or on any frame inside it
 *   there: the fake records every widget call, so any touch shows up.
 * - When the widget is missing, Turbo's own counter shows the charges: a
 *   visible font string inside the frame `TurboLightningShield` (in the icons
 *   row) whose text is the count, "3", "2" or "1".
 * - A successful cast fires `UNIT_SPELLCAST_SUCCEEDED` (unit, castGUID,
 *   spellID) with a Lightning Shield rank, and the counter goes back to 3.
 * - Each charge used fires `SPELL_UPDATE_COOLDOWN` with a proc spell ID, twice
 *   for one charge (26545 and 26365, the same frame), and `UNIT_AURA`
 *   ("player"). Proc events within about 0.3s count as one charge.
 * - At 0 charges, or when the shield's time runs out, the module raises the
 *   reminder `ns.reminders.show("lightningShield", <icon>)`: a glowing
 *   Lightning Shield icon (file ID 136051) in `TurboReminders`.
 * - The other v1 modules are turned off in saved data, so only Lightning
 *   Shield and reminders run. The real-safe-layer tests stand in for the beta
 *   client; the in-game checklist (a dev build and `/turbo debug`) confirms
 *   the charges in combat and the reminder at 0 before each release.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLuaVm } from '../scripts/lua-vm'
import {
    SAFE_LAYER_FILE,
    TURBO_DIR,
    loadTurbo,
    type FakeGame,
    type FrameState,
    type WidgetCall,
} from './fake-game/fake-game'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const CARD = 'TurboCard'
const ICONS_ROW = 'TurboCardIcons'
const SHIELD = 'TurboLightningShield'
const REMINDERS = 'TurboReminders'

/** Lightning Shield's icon. */
const SHIELD_ICON = 136051
/** Lightning Shield, ranks 1 and 2. */
const LIGHTNING_SHIELD = 324
const LIGHTNING_SHIELD_RANK_2 = 325
/** The two proc spell IDs the game reports for one charge used. */
const PROC_IDS = [26545, 26365]
const EARTH_SHOCK = 8042

/** The other v1 modules, off here so only Lightning Shield and reminders run. */
const OTHER_MODULES_OFF = {
    rangeFinder: false,
    swingTimer: false,
    totemTimers: false,
    weaponImbue: false,
    keyCooldowns: false,
    manaBar: false,
    maelstromWeapon: false,
}

/** The Lightning Shield reading out of combat: the aura, or none. */
type Shield = { charges: number; timeLeft: number } | false

const FULL: Shield = { charges: 3, timeLeft: 600 }

type Options = {
    /** The aura at login. Defaults to none. */
    shield?: Shield
    /** Whether the client has the aura container widget. Defaults to yes. */
    widget?: boolean
    /** Whether the player logs in mid-fight. */
    inCombat?: boolean
}

/** Loads Turbo as a Shaman on Forever, with no target. */
function start(options: Options = {}): FakeGame {
    const TurboDB = {
        schemaVersion: 1,
        classes: { SHAMAN: { modules: OTHER_MODULES_OFF } },
    }
    const g = loadTurbo({ savedVariables: { TurboDB } })
    g.setReading('interface', 16001)
    g.setReading('flavor', 'forever')
    g.setReading('playerClass', 'Shaman', 'SHAMAN', 7)
    g.setReading('inCombat', options.inCombat === true)
    g.setReading('targetAttackable', false)
    g.setReading('resting', false)
    g.setReading('mounted', false)
    g.setReading('onTaxi', false)
    g.setReading('auraContainerSupported', options.widget ?? true)
    // In combat the aura read throws; the wrapped read gives nothing.
    g.setReading(
        'lightningShield',
        options.inCombat ? null : (options.shield ?? false)
    )
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
    settle(g)
}

/** Lets fades and any short delays finish. */
function settle(g: FakeGame) {
    g.advance(0.5)
}

function enterCombat(g: FakeGame) {
    g.setReading('inCombat', true)
    g.setReading('lightningShield', null)
    g.fire('PLAYER_REGEN_DISABLED')
    settle(g)
}

/** Leaves combat; the aura reads plainly again, as `shield`. */
function leaveCombat(g: FakeGame, shield: Shield) {
    g.setReading('inCombat', false)
    g.setReading('lightningShield', shield)
    g.fire('PLAYER_REGEN_ENABLED')
    g.advance(2)
}

/**
 * The player casts Lightning Shield successfully. `after` is the aura as it
 * reads afterwards: the full shield out of combat, nothing (null) in combat.
 */
function castShield(
    g: FakeGame,
    after: Shield | null,
    spellID = LIGHTNING_SHIELD
) {
    g.setReading('lightningShield', after)
    g.fire('UNIT_SPELLCAST_SUCCEEDED', 'player', castGuid(spellID), spellID)
    g.fire('UNIT_AURA', 'player', { isFullUpdate: false })
    settle(g)
}

function castGuid(spellID: number): string {
    return `Cast-3-5000-0-1-${spellID}-000000000${spellID % 10}`
}

/** One charge used: the game's two proc events in one frame, then a pause. */
function proc(g: FakeGame) {
    for (const id of PROC_IDS) {
        g.fire('SPELL_UPDATE_COOLDOWN', id, id)
    }
    g.fire('UNIT_AURA', 'player', { isFullUpdate: false })
    g.advance(1)
}

function setResting(g: FakeGame, resting: boolean) {
    g.setReading('resting', resting)
    g.fire('PLAYER_UPDATE_RESTING')
    settle(g)
}

function frameState(g: FakeGame, id: string): FrameState {
    const state = g.frame(id)
    if (!state) throw new Error(`no ${id} frame`)
    return state
}

/** Whether a frame and every parent up to the screen are shown and opaque. */
function visible(g: FakeGame, id: string): boolean {
    let current: string | null = id
    for (let depth = 0; current && depth < 20; depth++) {
        const state = g.frame(current)
        if (!state) return false
        if (state.shown !== true || !(Number(state.alpha) > 0)) return false
        current = state.parent as string | null
    }
    return true
}

/** Whether a frame sits inside another (or is it). */
function inside(g: FakeGame, id: string, ancestor: string): boolean {
    let current: string | null = id
    for (let depth = 0; current && depth < 20; depth++) {
        if (current === ancestor) return true
        current = (g.frame(current)?.parent as string | null) ?? null
    }
    return false
}

/** A recorded `Set*` state's first value (multi-argument sets are lists). */
function first(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value
}

/** The visible textures inside a frame. */
function visibleTextures(g: FakeGame, ancestor: string): FrameState[] {
    return g
        .frames()
        .filter(
            (id) =>
                inside(g, id, ancestor) &&
                g.frame(id)?.type === 'Texture' &&
                visible(g, id)
        )
        .map((id) => frameState(g, id))
}

/** The icons (file IDs) of every reminder on screen now. */
function reminderIcons(g: FakeGame): number[] {
    return visibleTextures(g, REMINDERS)
        .map((t) => first(t.Texture))
        .filter((icon): icon is number => typeof icon === 'number')
}

/** Whether a glowing texture is on screen among the reminders. */
function reminderGlows(g: FakeGame): boolean {
    return visibleTextures(g, REMINDERS).some(
        (t) =>
            first(t.BlendMode) === 'ADD' || /glow/i.test(String(first(t.Atlas)))
    )
}

/** The charge counts Turbo's own counter shows on screen now ("3"...). */
function counterTexts(g: FakeGame): string[] {
    return g
        .frames()
        .filter(
            (id) =>
                inside(g, id, SHIELD) &&
                g.frame(id)?.type === 'FontString' &&
                visible(g, id)
        )
        .map((id) => first(frameState(g, id).Text))
        .filter((text): text is string => typeof text === 'string')
        .map((text) => text.trim())
        .filter((text) => /^\d+$/.test(text))
}

/** The aura container widget's frame id, once built. */
function container(g: FakeGame): string | undefined {
    return g.frames().find((id) => g.frame(id)?.type === 'AuraContainer')
}

/** Whether a recorded value holds a spell ID, as a map key or a value. */
function mentionsSpell(value: unknown, spellID: number): boolean {
    if (value === spellID) return true
    if (Array.isArray(value))
        return value.some((v) => mentionsSpell(v, spellID))
    if (value && typeof value === 'object') {
        return Object.entries(value).some(
            ([k, v]) =>
                k === `[${spellID}]` ||
                k === String(spellID) ||
                mentionsSpell(v, spellID)
        )
    }
    return false
}

/** The widget calls made on a frame or anything inside it, since `from`. */
function callsInside(
    g: FakeGame,
    ancestor: string,
    from: number
): WidgetCall[] {
    return g
        .calls()
        .slice(from)
        .filter((c) => inside(g, c.frame, ancestor))
}

describe("Blizzard's aura container widget", () => {
    test("out of combat at login, the charges are shown by Blizzard's aura container, built in the icons row for the player's Lightning Shield", () => {
        game = start({ shield: FULL })
        login(game)

        const id = container(game)
        expect(id).toBeDefined()
        if (!id) return
        expect(inside(game, id, ICONS_ROW)).toBe(true)

        const created = game.calls({ frame: id, method: 'CreateFrame' })
        expect(created).toHaveLength(1)
        expect(created[0]?.args[0]).toBe('AuraContainer')
        expect(created[0]?.args[3]).toBe('CustomAuraContainerTemplate')

        expect(
            game
                .calls({ frame: id, method: 'SetUnit' })
                .some((c) => c.args[0] === 'player')
        ).toBe(true)

        const slots = game.calls({ frame: id, method: 'AddAuraSlot' })
        expect(slots.length).toBeGreaterThan(0)
        const slot = slots[0]
        expect(slot?.args[1]).toBe('HELPFUL')
        expect(mentionsSpell(slot?.args[2], LIGHTNING_SHIELD)).toBe(true)
        expect(mentionsSpell(slot?.args[2], LIGHTNING_SHIELD_RANK_2)).toBe(true)
    })

    test('in combat the aura container is on screen in the card', () => {
        game = start({ shield: FULL })
        login(game)
        enterCombat(game)

        expect(visible(game, CARD)).toBe(true)
        const id = container(game)
        expect(id).toBeDefined()
        expect(visible(game, id ?? '')).toBe(true)
    })

    test('logging in mid-fight builds no aura container until the fight ends', () => {
        game = start({ inCombat: true })
        login(game)
        game.fire('UNIT_AURA', 'player', { isFullUpdate: true })
        castShield(game, null)
        proc(game)
        game.advance(10)

        expect(container(game)).toBeUndefined()

        leaveCombat(game, { charges: 2, timeLeft: 580 })

        const id = container(game)
        expect(id).toBeDefined()
        expect(
            game.calls({ frame: id ?? '', method: 'CreateFrame' })[0]?.args[3]
        ).toBe('CustomAuraContainerTemplate')
    })

    test('in combat nothing ever queries or touches the aura container or any frame inside it', () => {
        game = start({ shield: FULL })
        login(game)
        const id = container(game)
        expect(id).toBeDefined()
        if (!id) return

        const from = game.calls().length
        enterCombat(game)

        game.setReading('targetAttackable', true)
        game.fire('PLAYER_TARGET_CHANGED')
        game.fire('UNIT_AURA', 'player', { isFullUpdate: true })
        proc(game)
        proc(game)
        proc(game)
        // The module is at work in this fight: the last charge raised the
        // reminder.
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
        castShield(game, null)
        expect(reminderIcons(game)).toEqual([])
        proc(game)
        game.advance(30)
        game.setReading('targetAttackable', false)
        game.fire('PLAYER_TARGET_CHANGED')
        settle(game)

        expect(callsInside(game, id, from)).toEqual([])
    })
})

describe("Turbo's own charge counter (the fallback)", () => {
    test("without the aura container, a Lightning Shield cast shows 3 charges on the card from Turbo's own counter", () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)

        expect(container(game)).toBeUndefined()
        expect(inside(game, SHIELD, ICONS_ROW)).toBe(true)
        expect(counterTexts(game)).toEqual(['3'])
    })

    test('each charge used takes one off the count: 3, 2, 1', () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)
        expect(counterTexts(game)).toEqual(['3'])

        proc(game)
        expect(counterTexts(game)).toEqual(['2'])

        proc(game)
        expect(counterTexts(game)).toEqual(['1'])
    })

    test('proc events within 0.3s of each other count as one charge', () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)

        game.fire('SPELL_UPDATE_COOLDOWN', PROC_IDS[0], PROC_IDS[0])
        game.advance(0.1)
        game.fire('SPELL_UPDATE_COOLDOWN', PROC_IDS[1], PROC_IDS[1])
        game.advance(0.1)
        game.fire('SPELL_UPDATE_COOLDOWN', PROC_IDS[0], PROC_IDS[0])
        settle(game)

        expect(counterTexts(game)).toEqual(['2'])
    })

    test('proc events further apart than 0.3s count as separate charges', () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)

        game.fire('SPELL_UPDATE_COOLDOWN', PROC_IDS[0], PROC_IDS[0])
        game.advance(0.6)
        game.fire('SPELL_UPDATE_COOLDOWN', PROC_IDS[0], PROC_IDS[0])
        settle(game)

        expect(counterTexts(game)).toEqual(['1'])
    })

    test("other spells' cooldown updates take no charge", () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)

        game.fire('SPELL_UPDATE_COOLDOWN', EARTH_SHOCK, EARTH_SHOCK)
        game.advance(1)
        game.fire('SPELL_UPDATE_COOLDOWN')
        game.advance(1)
        game.fire('SPELL_UPDATE_COOLDOWN', LIGHTNING_SHIELD, LIGHTNING_SHIELD)
        settle(game)

        expect(counterTexts(game)).toEqual(['3'])
    })

    test('a successful Lightning Shield cast mid-fight resets the count to 3', () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)
        proc(game)
        proc(game)
        expect(counterTexts(game)).toEqual(['1'])

        castShield(game, null, LIGHTNING_SHIELD_RANK_2)

        expect(counterTexts(game)).toEqual(['3'])
    })

    test("only the player's successful Lightning Shield casts reset the count", () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)
        proc(game)
        proc(game)
        expect(counterTexts(game)).toEqual(['1'])

        const guid = castGuid(LIGHTNING_SHIELD)
        game.fire('UNIT_SPELLCAST_FAILED', 'player', guid, LIGHTNING_SHIELD)
        game.fire('UNIT_SPELLCAST_SUCCEEDED', 'party1', guid, LIGHTNING_SHIELD)
        game.fire(
            'UNIT_SPELLCAST_SUCCEEDED',
            'player',
            castGuid(EARTH_SHOCK),
            EARTH_SHOCK
        )
        settle(game)

        expect(counterTexts(game)).toEqual(['1'])
    })

    test('after a fight the count resyncs from the real aura', () => {
        game = start({ widget: false })
        login(game)
        castShield(game, FULL)
        enterCombat(game)
        proc(game)
        proc(game)
        expect(counterTexts(game)).toEqual(['1'])

        // One of those procs never took a charge: the aura still holds 2.
        leaveCombat(game, { charges: 2, timeLeft: 540 })
        enterCombat(game)

        expect(counterTexts(game)).toEqual(['2'])
    })

    test('after a fight where the counter reached 0 but the shield kept a charge, the reminder goes', () => {
        game = start({ shield: FULL })
        login(game)
        enterCombat(game)
        proc(game)
        proc(game)
        proc(game)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])

        leaveCombat(game, { charges: 1, timeLeft: 500 })

        expect(reminderIcons(game)).toEqual([])
    })

    test('after a fight where the shield is gone though the counter had charges left, the reminder shows', () => {
        game = start({ shield: FULL })
        login(game)
        enterCombat(game)
        proc(game)
        expect(reminderIcons(game)).toEqual([])

        leaveCombat(game, false)

        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })
})

describe('the Lightning Shield reminder', () => {
    test('with no Lightning Shield out of combat, a glowing Lightning Shield reminder shows while the card is hidden', () => {
        game = start({ shield: false })
        login(game)

        expect(frameState(game, CARD).shown).toBe(false)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
        expect(reminderGlows(game)).toBe(true)
    })

    test('with Lightning Shield up, the charges show and no reminder does', () => {
        game = start({ shield: FULL })
        login(game)

        expect(container(game)).toBeDefined()
        expect(reminderIcons(game)).toEqual([])
    })

    test('using the last charge in combat raises the reminder, not before', () => {
        game = start({ shield: FULL })
        login(game)
        enterCombat(game)

        proc(game)
        proc(game)
        expect(reminderIcons(game)).toEqual([])

        proc(game)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })

    test('recasting Lightning Shield at 0 charges drops the reminder', () => {
        game = start({ shield: FULL })
        login(game)
        enterCombat(game)
        proc(game)
        proc(game)
        proc(game)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])

        castShield(game, null)

        expect(reminderIcons(game)).toEqual([])
    })

    test('the shield running out mid-fight raises the reminder', () => {
        game = start({ shield: { charges: 3, timeLeft: 30 } })
        login(game)
        enterCombat(game)

        game.advance(20)
        expect(reminderIcons(game)).toEqual([])

        game.advance(15)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })

    test('the shield ending out of combat raises the reminder', () => {
        game = start({ shield: FULL })
        login(game)
        expect(reminderIcons(game)).toEqual([])

        game.setReading('lightningShield', false)
        game.fire('UNIT_AURA', 'player', { isFullUpdate: false })
        settle(game)

        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })

    test('casting Lightning Shield out of combat drops the reminder', () => {
        game = start({ shield: false })
        login(game)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])

        castShield(game, FULL)

        expect(reminderIcons(game)).toEqual([])
    })

    test('the Lightning Shield reminder stays quiet while resting', () => {
        game = start({ shield: false })
        game.setReading('resting', true)
        login(game)
        expect(reminderIcons(game)).toEqual([])

        setResting(game, false)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })
})

type RealShieldReading = {
    kind: string
    charges?: number
    timeLeft?: number
    threw: boolean
    auraCalls: number[]
}

/**
 * Runs the real safe layer's `lightningShield` reading against a stand-in
 * game where `GetTime()` is 100 and `C_UnitAuras.GetPlayerAuraBySpellID` runs
 * `auraLua` (a Lua function body; `spellID` is its argument).
 */
function realShieldReading(auraLua: string): RealShieldReading {
    const vm = createLuaVm()
    try {
        vm.setString(
            '__src',
            readFileSync(join(TURBO_DIR, SAFE_LAYER_FILE), 'utf8')
        )
        const result = vm.run(`
            local auraCalls = {}
            local frame = setmetatable({}, { __index = function() return function() end end })
            local env = setmetatable({
                CreateFrame = function() return frame end,
                GetTime = function() return 100 end,
                C_Timer = { After = function() end, NewTicker = function() end },
                issecretvalue = function() return false end,
                print = function() end,
                C_UnitAuras = {
                    GetPlayerAuraBySpellID = function(spellID)
                        table.insert(auraCalls, spellID)
                        ${auraLua}
                    end,
                },
            }, { __index = _G })
            local chunk = assert(loadstring(__src, "@Turbo/core/safe-layer.lua"))
            setfenv(chunk, env)
            local ns = {}
            chunk("Turbo", ns)
            local ok, info = pcall(ns.safe.read, "lightningShield")
            local calls = {}
            for i, id in ipairs(auraCalls) do calls[i] = tostring(id) end
            local fields = ""
            if ok and type(info) == "table" then
                fields = string.format(
                    ',"charges":%s,"timeLeft":%s',
                    tostring(info.charges),
                    tostring(info.timeLeft)
                )
            end
            return string.format(
                '{"kind":"%s","threw":%s,"auraCalls":[%s]%s}',
                ok and (info == nil and "nil" or type(info) == "boolean" and tostring(info) or type(info)) or "error",
                tostring(not ok),
                table.concat(calls, ","),
                fields
            )
        `)
        return JSON.parse(result ?? 'null')
    } finally {
        vm.close()
    }
}

describe("the real safe layer's Lightning Shield reading", () => {
    test('reads the charges and time left from the player aura of any Lightning Shield rank', () => {
        const result = realShieldReading(`
            if spellID == ${LIGHTNING_SHIELD_RANK_2} then
                return {
                    spellId = spellID,
                    applications = 2,
                    duration = 600,
                    expirationTime = 640,
                    icon = ${SHIELD_ICON},
                    auraInstanceID = 77,
                }
            end
        `)

        expect(result.threw).toBe(false)
        expect(result.auraCalls).toContain(LIGHTNING_SHIELD_RANK_2)
        expect(result.kind).toBe('table')
        expect(result.charges).toBe(2)
        expect(result.timeLeft).toBe(540)
    })

    test('reports false when the player has no Lightning Shield', () => {
        const result = realShieldReading('return nil')

        expect(result.threw).toBe(false)
        expect(result.auraCalls).toContain(LIGHTNING_SHIELD)
        expect(result.kind).toBe('false')
    })

    test('gives nothing, without an error, when the aura read throws in combat', () => {
        const result = realShieldReading(
            'error("Auras cannot be accessed when secret while tainted")'
        )

        expect(result.threw).toBe(false)
        expect(result.kind).toBe('nil')
    })
})
