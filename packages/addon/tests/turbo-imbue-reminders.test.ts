/**
 * The weapon imbue and the reminder system under the fake game: the imbue's
 * icon and time left on the card, and the silent, glowing reminders that show
 * at the card's position, even while the card is hidden.
 *
 * The game, as these tests script it (see turbo-core.test.ts and
 * turbo-card.test.ts for the rest):
 *
 * - Reading `mainHandEnchant`: the main-hand imbue as a plain table,
 *   `{ timeLeft = <seconds>, icon = <icon file ID>, enchantID = <id> }`, or nil
 *   when the main hand has none. The real safe layer builds it from the item
 *   namespace's `C_Item.GetWeaponEnchantInfo(Enum.WeaponSlot.MainHand)`
 *   (a list of enchants, `timeLeft` in milliseconds), picking the temporary
 *   one; it never calls the legacy global `GetWeaponEnchantInfo()`.
 * - An imbue changing (applied, replaced, run out) fires
 *   `UNIT_INVENTORY_CHANGED` ("player") and `WEAPON_ENCHANT_CHANGED`. Time
 *   passing keeps the reading in step with the clock.
 * - Readings `resting` (IsResting), `mounted` (IsMounted) and `onTaxi`
 *   (UnitOnTaxi("player")), all booleans. They change with
 *   `PLAYER_UPDATE_RESTING`, `PLAYER_MOUNT_DISPLAY_CHANGED`, and
 *   `PLAYER_CONTROL_LOST` / `PLAYER_CONTROL_GAINED` (a flight path).
 * - The card's imbue icon is the frame `TurboImbue`, inside the icons row
 *   (`TurboCardIcons`). Its icon is a texture set to the imbue's icon; its
 *   time left is a font string's `SetText`, as "<minutes>m" ("30m").
 * - Reminders live in the frame `TurboReminders`, which is not inside the card
 *   and is anchored to the card (or at the card's own saved point). Each shown
 *   reminder is a visible texture set to the missing thing's icon (file ID),
 *   with a glow: a visible texture drawn with the `ADD` blend mode or a glow
 *   atlas. The imbue reminder's icon is the last imbue seen, or a fixed imbue
 *   icon (file ID) before any. Reminders make no sound and print nothing.
 * - Other modules use the reminder system through
 *   `ns.reminders.show(id, icon)` and `ns.reminders.hide(id)`.
 * - Settings (declared options of the weapon imbue module, read with
 *   `ns.settings.get`, stored per class): `imbueWarnMinutes` (5: out of combat,
 *   remind under 5 minutes left) and `imbueCombatWarnMinutes` (0: in combat,
 *   remind only once it's gone).
 * - The other v1 modules are turned off in saved data, so only the weapon
 *   imbue and reminders run. The real-safe-layer tests stand in for the beta
 *   client; the in-game checklist (a dev build and `/turbo debug`) confirms
 *   the same reading before each release.
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
} from './fake-game/fake-game'
import { scriptShamanOnForever } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const CARD = 'TurboCard'
const ICONS_ROW = 'TurboCardIcons'
const IMBUE = 'TurboImbue'
const REMINDERS = 'TurboReminders'

/** Windfury Weapon's icon, as the enchant query reports it. */
const IMBUE_ICON = 136018
/** Lightning Shield's icon. */
const SHIELD_ICON = 136051

/** The other v1 modules, off here so only the imbue and reminders run. */
const OTHER_MODULES_OFF = {
    rangeFinder: false,
    swingTimer: false,
    totemTimers: false,
    lightningShield: false,
    keyCooldowns: false,
    manaBar: false,
    maelstromWeapon: false,
}

type SavedDb = {
    schemaVersion: number
    classes?: { SHAMAN?: Record<string, unknown> }
    position?: unknown
}

/** Loads Turbo as a Shaman on Forever, out of combat with no target. */
function start(imbueLeft: number | null, db?: SavedDb): FakeGame {
    const shaman = db?.classes?.SHAMAN ?? {}
    const TurboDB = {
        ...db,
        schemaVersion: db?.schemaVersion ?? 1,
        classes: {
            ...db?.classes,
            SHAMAN: { ...shaman, modules: OTHER_MODULES_OFF },
        },
    }
    const g = loadTurbo({ savedVariables: { TurboDB } })
    scriptShamanOnForever(g)
    g.setReading('resting', false)
    g.setReading('mounted', false)
    g.setReading('onTaxi', false)
    setImbue(g, imbueLeft)
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

/** Scripts the main-hand imbue: seconds left, or null for none. */
function setImbue(g: FakeGame, left: number | null) {
    g.setReading(
        'mainHandEnchant',
        left === null || left <= 0
            ? null
            : { timeLeft: left, icon: IMBUE_ICON, enchantID: 283 }
    )
}

/** The imbue changes in game: applied, refreshed or gone. */
function changeImbue(g: FakeGame, left: number | null) {
    setImbue(g, left)
    g.fire('UNIT_INVENTORY_CHANGED', 'player')
    g.fire('WEAPON_ENCHANT_CHANGED')
    settle(g)
}

/**
 * Lets time pass with the imbue ticking down, the reading always in step
 * with the clock. When it runs out, the game says so.
 *
 * @returns seconds left afterwards
 */
function passTime(g: FakeGame, seconds: number, left: number | null) {
    const chunk = 5
    let remaining = left
    for (let passed = 0; passed < seconds; passed += chunk) {
        const step = Math.min(chunk, seconds - passed)
        const before = remaining
        remaining =
            remaining === null ? null : Math.max(0, remaining - step) || null
        setImbue(g, remaining)
        g.advance(step)
        if (before !== null && remaining === null) {
            g.fire('UNIT_INVENTORY_CHANGED', 'player')
        }
    }
    return remaining
}

function enterCombat(g: FakeGame) {
    g.setReading('inCombat', true)
    g.fire('PLAYER_REGEN_DISABLED')
    settle(g)
}

function leaveCombat(g: FakeGame) {
    g.setReading('inCombat', false)
    g.fire('PLAYER_REGEN_ENABLED')
    settle(g)
}

function setResting(g: FakeGame, resting: boolean) {
    g.setReading('resting', resting)
    g.fire('PLAYER_UPDATE_RESTING')
    settle(g)
}

function setMounted(g: FakeGame, mounted: boolean) {
    g.setReading('mounted', mounted)
    g.fire('PLAYER_MOUNT_DISPLAY_CHANGED')
    settle(g)
}

function setOnTaxi(g: FakeGame, onTaxi: boolean) {
    g.setReading('onTaxi', onTaxi)
    g.fire(onTaxi ? 'PLAYER_CONTROL_LOST' : 'PLAYER_CONTROL_GAINED')
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

/** The text of every visible font string inside the card's imbue icon. */
function imbueTexts(g: FakeGame): string[] {
    return g
        .frames()
        .filter(
            (id) =>
                inside(g, id, IMBUE) &&
                g.frame(id)?.type === 'FontString' &&
                visible(g, id)
        )
        .map((id) => first(frameState(g, id).Text))
        .filter((text): text is string => typeof text === 'string')
}

/** Whether the card's imbue icon is on screen showing the imbue's icon. */
function imbueIconShown(g: FakeGame): boolean {
    return visibleTextures(g, IMBUE).some(
        (t) => first(t.Texture) === IMBUE_ICON
    )
}

type Anchor = {
    point: string
    relativeTo: string | null
    relativePoint: string
    x: number
    y: number
}

/** Reads a recorded `SetPoint` call in any of its WoW forms. */
function anchor(args: unknown[]): Anchor {
    const [point, ...rest] = args as [string, ...unknown[]]
    if (rest.length === 0) {
        return { point, relativeTo: null, relativePoint: point, x: 0, y: 0 }
    }
    if (typeof rest[0] === 'number') {
        return {
            point,
            relativeTo: null,
            relativePoint: point,
            x: rest[0],
            y: Number(rest[1] ?? 0),
        }
    }
    const rel = rest[0] as { $frame?: string } | string | null
    const relativeTo = typeof rel === 'string' ? rel : (rel?.$frame ?? null)
    if (typeof rest[1] === 'number') {
        return {
            point,
            relativeTo,
            relativePoint: point,
            x: rest[1],
            y: Number(rest[2] ?? 0),
        }
    }
    return {
        point,
        relativeTo,
        relativePoint: typeof rest[1] === 'string' ? rest[1] : point,
        x: Number(rest[2] ?? 0),
        y: Number(rest[3] ?? 0),
    }
}

/**
 * Runs the real safe layer's `mainHandEnchant` reading against a stand-in
 * game whose item-namespace query returns `enchantsLua`. `Enum` answers any
 * name with a distinct number, so the reading may name the enum values it
 * needs (`Enum.WeaponSlot.MainHand`, `Enum.ItemEnchantType.Temporary`...).
 */
function realEnchantReading(enchantsLua: string): {
    reading: { timeLeft: number; icon: number; enchantID: number } | null
    legacyCalls: number
    itemCalls: number
} {
    const vm = createLuaVm()
    try {
        vm.setString(
            '__src',
            readFileSync(join(TURBO_DIR, SAFE_LAYER_FILE), 'utf8')
        )
        const result = vm.run(`
            local counter = 0
            local Enum = setmetatable({}, { __index = function(t, group)
                local values = setmetatable({}, { __index = function(g, name)
                    counter = counter + 1
                    rawset(g, name, counter)
                    return counter
                end })
                rawset(t, group, values)
                return values
            end })
            local legacyCalls, itemCalls = 0, 0
            local frame = setmetatable({}, { __index = function() return function() end end })
            local env = setmetatable({
                CreateFrame = function() return frame end,
                GetTime = function() return 0 end,
                C_Timer = { After = function() end, NewTicker = function() end },
                issecretvalue = function() return false end,
                print = function() end,
                Enum = Enum,
                C_Item = {
                    GetWeaponEnchantInfo = function()
                        itemCalls = itemCalls + 1
                        return ${enchantsLua}
                    end,
                },
                GetWeaponEnchantInfo = function()
                    legacyCalls = legacyCalls + 1
                    return true, 999000, 0, 1, false, 0, 0, 0
                end,
            }, { __index = _G })
            local chunk = assert(loadstring(__src, "@Turbo/core/safe-layer.lua"))
            setfenv(chunk, env)
            local ns = {}
            chunk("Turbo", ns)
            local info = ns.safe.read("mainHandEnchant")
            local reading = "null"
            if info ~= nil then
                reading = string.format(
                    '{"timeLeft":%s,"icon":%s,"enchantID":%s}',
                    tostring(info.timeLeft),
                    tostring(info.icon),
                    tostring(info.enchantID)
                )
            end
            return string.format(
                '{"reading":%s,"legacyCalls":%d,"itemCalls":%d}',
                reading,
                legacyCalls,
                itemCalls
            )
        `)
        return JSON.parse(result ?? 'null')
    } finally {
        vm.close()
    }
}

describe('the weapon imbue on the card', () => {
    test('the real safe layer reads the main-hand imbue from the item-namespace enchant query, in seconds, never the legacy global', () => {
        const result = realEnchantReading(`{
            {
                hasEnchant = true,
                enchantType = Enum.ItemEnchantType.Permanent,
                timeLeft = 0,
                charges = 0,
                enchantID = 1900,
                enchantIconID = 135913,
            },
            {
                hasEnchant = true,
                enchantType = Enum.ItemEnchantType.Temporary,
                timeLeft = 1800000,
                charges = 0,
                enchantID = 283,
                enchantIconID = ${IMBUE_ICON},
            },
        }`)

        expect(result.itemCalls).toBeGreaterThan(0)
        expect(result.legacyCalls).toBe(0)
        expect(result.reading).toEqual({
            timeLeft: 1800,
            icon: IMBUE_ICON,
            enchantID: 283,
        })
    })

    test('the real safe layer reports no imbue when the main hand has none, never asking the legacy global', () => {
        const result = realEnchantReading('{}')

        expect(result.itemCalls).toBeGreaterThan(0)
        expect(result.legacyCalls).toBe(0)
        expect(result.reading).toBeNull()
    })

    test("in combat the card's icons row shows the imbue's icon and its time left", () => {
        game = start(1800)
        login(game)
        enterCombat(game)

        expect(visible(game, CARD)).toBe(true)
        expect(inside(game, IMBUE, ICONS_ROW)).toBe(true)
        expect(imbueIconShown(game)).toBe(true)
        expect(imbueTexts(game).some((t) => /\b30\s*m\b/.test(t))).toBe(true)
    })

    test('the time left counts down as the imbue runs', () => {
        game = start(1800)
        login(game)
        enterCombat(game)

        passTime(game, 600, 1800)

        expect(imbueIconShown(game)).toBe(true)
        const texts = imbueTexts(game)
        expect(texts.some((t) => /\b20\s*m\b/.test(t))).toBe(true)
        expect(texts.some((t) => /\b30\s*m\b/.test(t))).toBe(false)
    })

    test('refreshing the imbue shows the new time left', () => {
        game = start(240)
        login(game)
        enterCombat(game)

        changeImbue(game, 1800)

        expect(imbueTexts(game).some((t) => /\b30\s*m\b/.test(t))).toBe(true)
    })
})

describe('the imbue reminder out of combat', () => {
    test('with under 5 minutes left, a reminder shows the imbue icon while the card is hidden', () => {
        game = start(240)
        login(game)

        expect(frameState(game, CARD).shown).toBe(false)
        expect(inside(game, REMINDERS, CARD)).toBe(false)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })

    test('with more than 5 minutes left, no reminder shows until the imbue is gone', () => {
        game = start(360)
        login(game)
        expect(reminderIcons(game)).toEqual([])

        changeImbue(game, null)

        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })

    test('with no imbue at all, a reminder shows', () => {
        game = start(null)
        login(game)

        expect(frameState(game, CARD).shown).toBe(false)
        expect(reminderIcons(game)).toHaveLength(1)
    })

    test('the reminder appears once the imbue drops under 5 minutes, and goes when it is refreshed', () => {
        game = start(320)
        login(game)
        expect(reminderIcons(game)).toEqual([])

        passTime(game, 40, 320)
        settle(game)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        changeImbue(game, 1800)
        expect(reminderIcons(game)).toEqual([])
    })

    test('the out-of-combat threshold is a setting, 5 minutes by default', () => {
        game = start(1800)
        login(game)

        expect(game.run('return ns.settings.get("imbueWarnMinutes")')[0]).toBe(
            5
        )
    })

    test('raising the out-of-combat threshold to 10 minutes reminds with 8 minutes left', () => {
        game = start(480, {
            schemaVersion: 1,
            classes: { SHAMAN: { imbueWarnMinutes: 10 } },
        })
        login(game)

        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        changeImbue(game, 660)
        expect(reminderIcons(game)).toEqual([])
    })
})

describe('the imbue reminder in combat', () => {
    test('in combat an imbue with under 5 minutes left raises no reminder', () => {
        game = start(120)
        login(game)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        enterCombat(game)

        expect(reminderIcons(game)).toEqual([])
    })

    test('an imbue that runs out mid-fight raises its reminder with its icon', () => {
        game = start(20)
        login(game)
        enterCombat(game)
        expect(reminderIcons(game)).toEqual([])

        passTime(game, 30, 20)
        settle(game)

        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })

    test('leaving combat with under 5 minutes left brings the reminder back', () => {
        game = start(120)
        login(game)
        enterCombat(game)
        expect(reminderIcons(game)).toEqual([])

        leaveCombat(game)

        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })

    test('the in-combat threshold is a setting, 0 minutes (only once gone) by default', () => {
        game = start(1800)
        login(game)

        expect(
            game.run('return ns.settings.get("imbueCombatWarnMinutes")')[0]
        ).toBe(0)
    })

    test('raising the in-combat threshold to 1 minute reminds before the imbue is gone', () => {
        game = start(45, {
            schemaVersion: 1,
            classes: { SHAMAN: { imbueCombatWarnMinutes: 1 } },
        })
        login(game)
        enterCombat(game)

        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        changeImbue(game, 120)
        expect(reminderIcons(game)).toEqual([])
    })
})

describe('how a reminder looks', () => {
    test('a reminder is a silent, glowing icon at the card position, shown while the card is hidden', () => {
        game = start(null, {
            schemaVersion: 1,
            position: { point: 'CENTER', x: 42, y: -130 },
        })
        const printedBefore = game.printed().length
        login(game)

        expect(frameState(game, CARD).shown).toBe(false)
        expect(reminderIcons(game)).toHaveLength(1)
        expect(reminderGlows(game)).toBe(true)

        const points = frameState(game, REMINDERS).points
        expect(points.length).toBeGreaterThan(0)
        const at = anchor(points[0] as unknown[])
        if (at.relativeTo !== CARD) {
            expect([null, 'UIParent']).toContain(at.relativeTo)
            expect(at).toMatchObject({
                point: 'CENTER',
                relativePoint: 'CENTER',
                x: 42,
                y: -130,
            })
        }

        expect(game.printed().slice(printedBefore)).toEqual([])
        expect(game.reads().filter((r) => /sound/i.test(r.name))).toEqual([])
        expect(game.calls().filter((c) => /sound/i.test(c.method))).toEqual([])
    })

    test('reminders stay up when the card fades in for a fight and out again', () => {
        game = start(null)
        login(game)
        expect(reminderIcons(game)).toHaveLength(1)

        enterCombat(game)
        expect(visible(game, CARD)).toBe(true)
        expect(reminderIcons(game)).toHaveLength(1)

        leaveCombat(game)
        expect(frameState(game, CARD).shown).toBe(false)
        expect(reminderIcons(game)).toHaveLength(1)
    })
})

describe('reminder suppression', () => {
    test('while resting in town or an inn, no reminder shows, and it comes back on leaving', () => {
        game = start(null)
        game.setReading('resting', true)
        login(game)
        expect(reminderIcons(game)).toEqual([])

        setResting(game, false)
        expect(reminderIcons(game)).toHaveLength(1)

        setResting(game, true)
        expect(reminderIcons(game)).toEqual([])
    })

    test('while mounted, no reminder shows, and it comes back on dismounting', () => {
        game = start(120)
        login(game)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        setMounted(game, true)
        expect(reminderIcons(game)).toEqual([])

        setMounted(game, false)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })

    test('on a flight path, no reminder shows, and it comes back on landing', () => {
        game = start(120)
        login(game)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])

        setOnTaxi(game, true)
        expect(reminderIcons(game)).toEqual([])

        setOnTaxi(game, false)
        expect(reminderIcons(game)).toEqual([IMBUE_ICON])
    })
})

describe('reminders for other modules', () => {
    test('another module (Lightning Shield) can show and hide its own reminder beside the imbue one', () => {
        game = start(null)
        login(game)
        expect(reminderIcons(game)).toHaveLength(1)

        game.run('ns.reminders.show("lightningShield", ...)', SHIELD_ICON)
        settle(game)
        const icons = reminderIcons(game)
        expect(icons).toHaveLength(2)
        expect(icons).toContain(SHIELD_ICON)

        game.run('ns.reminders.hide("lightningShield")')
        settle(game)
        const after = reminderIcons(game)
        expect(after).toHaveLength(1)
        expect(after).not.toContain(SHIELD_ICON)
    })

    test("another module's reminder glows, shows while the card is hidden, and is suppressed while resting", () => {
        game = start(1800)
        login(game)
        expect(reminderIcons(game)).toEqual([])

        game.run('ns.reminders.show("lightningShield", ...)', SHIELD_ICON)
        settle(game)
        expect(frameState(game, CARD).shown).toBe(false)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
        expect(reminderGlows(game)).toBe(true)

        setResting(game, true)
        expect(reminderIcons(game)).toEqual([])

        setResting(game, false)
        expect(reminderIcons(game)).toEqual([SHIELD_ICON])
    })
})
