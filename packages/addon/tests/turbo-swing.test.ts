/**
 * The swing timer under the fake game: the main-hand swing bar in the card's
 * swing row, its safe-window marker, greying during hard casts, dimming out of
 * melee, and showing only while auto-attacking.
 *
 * The game, as these tests script it (see turbo-core.test.ts and
 * turbo-range.test.ts for the rest):
 *
 * - `PLAYER_SWING` (swingDuration, swingType) fires on every swing; the
 *   duration is the next swing's, a plain value. Main hand is swing type 0.
 * - Auto-attack starts with `PLAYER_ENTER_COMBAT` and stops with
 *   `PLAYER_LEAVE_COMBAT`.
 * - The player's casts: `UNIT_SPELLCAST_START`, `UNIT_SPELLCAST_SUCCEEDED`,
 *   `UNIT_SPELLCAST_STOP`, `UNIT_SPELLCAST_INTERRUPTED` and
 *   `UNIT_SPELLCAST_FAILED`, each (unit, castGUID, spellID). An instant spell
 *   fires SUCCEEDED with no START. Pressing a key mid-cast fails with a
 *   client-side cast ID that matches no cast in progress.
 * - Melee comes from the range finder (5-yard item check, two-miss rule).
 * - Time passes on the safe layer's clock; frames that set an `OnUpdate`
 *   script get it run with the elapsed time as the clock moves.
 *
 * What the HUD shows, as these tests read it:
 *
 * - The bar is the StatusBar `TurboSwingBar` inside the `TurboCardSwing` row.
 *   Its fill (`SetMinMaxValues` / `SetValue`) is the share of the swing that
 *   has passed: empty when a swing lands, full when the next one is due.
 * - The safe window is the texture `TurboSwingSafeWindow`, anchored at the
 *   bar's left edge; its width's share of the bar's width (both set with
 *   `SetWidth` or `SetSize`) is the share of the swing it covers.
 * - Grey is `SetStatusBarDesaturated(true)` or a grey `SetStatusBarColor`.
 * - Dim is an alpha of 0.7 or less on the bar or its parents up to the row,
 *   with "out of range" in a shown font string in the row.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
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
const SWING_ROW = 'TurboCardSwing'
const BAR = 'TurboSwingBar'
const SAFE_WINDOW = 'TurboSwingSafeWindow'

/** Enum.PlayerSwingType */
const MAIN_HAND = 0
const OFF_HAND = 1
const RANGED = 2

const LIGHTNING_BOLT = 403
const HEALING_WAVE = 331
const EARTH_SHOCK = 8042

/** Server cast IDs, one per cast. */
const BOLT_CAST = 'Cast-3-5164-0-7-403-00001D5A2F'
const WAVE_CAST = 'Cast-3-5164-0-7-331-00001D5A30'
const SHOCK_CAST = 'Cast-3-5164-0-7-8042-00001D5A31'
/** Client-side cast IDs: a key pressed again while a cast is under way. */
const CLIENT_BOLT = 'Cast-2-0-0-0-403-0000000000'
const CLIENT_WAVE = 'Cast-2-0-0-0-331-0000000000'

const EARTH_SHOCK_RANKS = [8042, 8044, 8045, 8046, 10412, 10413, 10414]
const LIGHTNING_BOLT_RANKS = [
    403, 529, 548, 915, 943, 6041, 10391, 10392, 15207, 15208,
]
const MELEE_ITEM = 8149

/** The range finder's melee poll interval. */
const POLL = 0.2

/** How finely time passes in `wait`. */
const STEP = 0.05
/** How close a bar's fill must be to the expected share. */
const CLOSE = 0.05

type Checks = {
    melee: boolean | null
    shock: boolean | null
    bolt: boolean | null
}

const IN_MELEE: Checks = { melee: true, shock: true, bolt: true }
const AT_SHOCK: Checks = { melee: false, shock: true, bolt: true }
const NOTHING: Checks = { melee: null, shock: null, bolt: null }

/** Every v1 module but the range finder and the swing timer, turned off. */
const OTHER_MODULES = [
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

function targetEnemy(g: FakeGame, checks: Checks) {
    setChecks(g, checks)
    g.setReading('targetAttackable', true)
    g.fire('PLAYER_TARGET_CHANGED')
}

function startAttack(g: FakeGame) {
    g.fire('PLAYER_ENTER_COMBAT')
}

function stopAttack(g: FakeGame) {
    g.fire('PLAYER_LEAVE_COMBAT')
}

/** The player swings; the next swing is due in `duration` seconds. */
function swing(g: FakeGame, duration: number, type = MAIN_HAND) {
    g.fire('PLAYER_SWING', duration, type)
}

/**
 * Logs in and fights an enemy in melee: in combat, targeted, auto-attacking,
 * with the first main-hand swing just landed.
 */
function fight(duration = 3.4): FakeGame {
    const g = start()
    login(g)
    enterCombat(g)
    targetEnemy(g, IN_MELEE)
    startAttack(g)
    swing(g, duration)
    return g
}

function castStart(
    g: FakeGame,
    castID: string,
    spellID: number,
    unit = 'player'
) {
    g.fire('UNIT_SPELLCAST_START', unit, castID, spellID)
}

function castSucceeded(g: FakeGame, castID: string, spellID: number) {
    g.fire('UNIT_SPELLCAST_SUCCEEDED', 'player', castID, spellID)
}

function castStop(g: FakeGame, castID: string, spellID: number) {
    g.fire('UNIT_SPELLCAST_STOP', 'player', castID, spellID)
}

function castInterrupted(g: FakeGame, castID: string, spellID: number) {
    g.fire('UNIT_SPELLCAST_INTERRUPTED', 'player', castID, spellID)
}

function castFailed(g: FakeGame, castID: string, spellID: number) {
    g.fire('UNIT_SPELLCAST_FAILED', 'player', castID, spellID)
}

/** Whether a frame and every parent it has are shown. */
function shownChain(g: FakeGame, id: string): boolean {
    let current: string | null | undefined = id
    for (let depth = 0; current && depth < 20; depth++) {
        const state = g.frame(current)
        if (!state || state.shown !== true) return false
        current = state.parent as string | null
    }
    return true
}

/** Whether a frame and its parents, up to and including `root`, are shown. */
function shownWithin(g: FakeGame, id: string, root: string): boolean {
    let current: string | null | undefined = id
    for (let depth = 0; current && depth < 20; depth++) {
        const state = g.frame(current)
        if (!state || state.shown !== true) return false
        if (current === root) return true
        current = state.parent as string | null
    }
    return false
}

/** Frames inside a frame, at any depth. */
function descendants(g: FakeGame, root: string): string[] {
    return g.frames().filter((id) => {
        let parent = g.frame(id)?.parent
        for (let depth = 0; parent && depth < 20; depth++) {
            if (parent === root) return true
            parent = g.frame(parent)?.parent
        }
        return false
    })
}

/** Frames with an `OnUpdate` script or hook, as the addon last left them. */
function onUpdateFrames(g: FakeGame): string[] {
    const scripted = new Map<string, boolean>()
    for (const c of g.calls()) {
        if (c.args[0] !== 'OnUpdate') continue
        const set = c.args[1] !== null && typeof c.args[1] === 'object'
        if (c.method === 'SetScript') scripted.set(c.frame, set)
        else if (c.method === 'HookScript' && set) scripted.set(c.frame, true)
    }
    return [...scripted]
        .filter(([id, set]) => set && shownChain(g, id))
        .map(([id]) => id)
}

/** Lets time pass: timers fire, and shown frames get their OnUpdate. */
function wait(g: FakeGame, seconds: number) {
    const scripted = onUpdateFrames(g)
    let left = seconds
    while (left > 1e-9) {
        const dt = Math.min(STEP, left)
        g.advance(dt)
        for (const id of scripted) g.runScript(id, 'OnUpdate', dt)
        left -= dt
    }
}

function bar(g: FakeGame): FrameState {
    const state = g.frame(BAR)
    if (!state) throw new Error(`no ${BAR} frame`)
    return state
}

/** Whether the swing bar is on the card now. */
function barShown(g: FakeGame): boolean {
    return g.frame(BAR) !== undefined && shownWithin(g, BAR, SWING_ROW)
}

/** The share of the bar that is filled, as the StatusBar would draw it. */
function fill(g: FakeGame): number {
    const state = bar(g)
    const range = state.MinMaxValues
    expect(Array.isArray(range)).toBe(true)
    const [min, max] = (range as unknown[]).map(Number) as [number, number]
    const value = Number(state.Value)
    expect(Number.isFinite(value)).toBe(true)
    expect(max).toBeGreaterThan(min)
    return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function expectFill(g: FakeGame, share: number) {
    expect(Math.abs(fill(g) - share)).toBeLessThanOrEqual(CLOSE)
}

/** Whether the bar is drawn grey. */
function grey(g: FakeGame): boolean {
    const state = bar(g)
    if (state.StatusBarDesaturated === true) return true
    const colour = state.StatusBarColor
    if (Array.isArray(colour) && colour.length >= 3) {
        const [r, gr, b] = colour.slice(0, 3).map(Number) as [
            number,
            number,
            number,
        ]
        return Math.max(r, gr, b) - Math.min(r, gr, b) < 0.1
    }
    return false
}

/** The bar's alpha, times its parents' up to the swing row. */
function barAlpha(g: FakeGame): number {
    let alpha = 1
    let current: string | null | undefined = BAR
    for (let depth = 0; current && depth < 20; depth++) {
        const state = g.frame(current)
        if (!state) break
        alpha *= state.alpha === undefined ? 1 : Number(state.alpha)
        if (current === SWING_ROW) break
        current = state.parent as string | null
    }
    return alpha
}

function plainText(text: string): string {
    return text
        .replace(/\|c[0-9a-f]{8}/gi, '')
        .replace(/\|r/g, '')
        .trim()
}

/** The text shown inside a frame now. */
function textsIn(g: FakeGame, root: string): string[] {
    const texts: string[] = []
    for (const id of descendants(g, root)) {
        const state = g.frame(id)!
        if (typeof state.Text !== 'string') continue
        const text = plainText(state.Text)
        if (text !== '' && shownWithin(g, id, root)) texts.push(text)
    }
    return texts
}

function saysOutOfRange(g: FakeGame): boolean {
    return textsIn(g, SWING_ROW).some((t) => /out of range/i.test(t))
}

/** Whether the bar is dimmed and says it's out of range. */
function dimmed(g: FakeGame): boolean {
    return barShown(g) && barAlpha(g) <= 0.7 && saysOutOfRange(g)
}

/** Whether the bar is at full brightness, with no "out of range". */
function bright(g: FakeGame): boolean {
    return barShown(g) && barAlpha(g) >= 0.95 && !saysOutOfRange(g)
}

function widthOf(g: FakeGame, id: string): number {
    const state = g.frame(id)
    if (!state) throw new Error(`no ${id} frame`)
    const width = Number(state.width)
    expect(Number.isFinite(width)).toBe(true)
    expect(width).toBeGreaterThan(0)
    return width
}

/** The share of the bar the safe-window marker covers. */
function safeShare(g: FakeGame): number {
    return widthOf(g, SAFE_WINDOW) / widthOf(g, BAR)
}

/** The safe-window setting: its key and default, from the one defaults table. */
function safeWindowSetting(g: FakeGame): { key: string; value: number } {
    const [keys, values] = g.run(`
        local keys, values = {}, {}
        for k, v in pairs(ns.settings.defaults) do
            if type(k) == "string" and k:lower():find("safe", 1, true) then
                table.insert(keys, k)
                table.insert(values, v)
            end
        end
        return keys, values
    `) as [string[], number[]]
    expect(keys).toHaveLength(1)
    return { key: keys[0]!, value: values[0]! }
}

/** A share of the swing as the setting stores it: 0-1, or percent. */
function asSetting(share: number, stored: number): number {
    return stored > 1 ? share * 100 : share
}

describe('the swing bar follows the per-swing event', () => {
    test('a swing starts the bar from empty, and it fills over the reported duration', () => {
        game = fight(3.4)
        wait(game, STEP)
        expect(fill(game)).toBeLessThanOrEqual(CLOSE + STEP / 3.4)

        wait(game, 1.7 - STEP)
        expectFill(game, 0.5)

        wait(game, 1.7)
        expectFill(game, 1)
    })

    test('every swing restarts the bar from empty, even one that comes early (a parry)', () => {
        game = fight(3.4)
        wait(game, 2)
        expectFill(game, 2 / 3.4)

        swing(game, 3.4)
        wait(game, STEP)

        expect(fill(game)).toBeLessThanOrEqual(CLOSE + STEP / 3.4)
        wait(game, 1.7 - STEP)
        expectFill(game, 0.5)
    })

    test('a late swing (after a stun) restarts the bar, which waits full until then', () => {
        game = fight(3.4)
        wait(game, 5)
        expectFill(game, 1)

        swing(game, 3.4)
        wait(game, STEP)

        expect(fill(game)).toBeLessThanOrEqual(CLOSE + STEP / 3.4)
    })

    test('a new swing duration (a weapon swap or haste) sets how fast the bar fills from then on', () => {
        game = fight(3.4)
        wait(game, 1)

        swing(game, 2)
        wait(game, 1)
        expectFill(game, 0.5)

        swing(game, 4)
        wait(game, 1)
        expectFill(game, 0.25)
    })

    test('off-hand and ranged swings leave the main-hand bar alone', () => {
        game = fight(3.4)
        wait(game, 1.7)
        expectFill(game, 0.5)

        swing(game, 1.5, OFF_HAND)
        swing(game, 2.8, RANGED)
        wait(game, 0.85)

        expectFill(game, 0.75)
    })
})

describe('the safe window', () => {
    test('by default the safe-window marker covers the first 15% of the swing', () => {
        game = fight(3.4)
        wait(game, 0.5)

        expect(shownWithin(game, SAFE_WINDOW, SWING_ROW)).toBe(true)
        expect(Math.abs(safeShare(game) - 0.15)).toBeLessThanOrEqual(0.01)
        const points = game.frame(SAFE_WINDOW)!.points as unknown[][]
        expect(points.some((p) => /LEFT$/.test(String(p[0])))).toBe(true)
    })

    test('the safe window scales with the swing: 15% of a fast swing and of a slow one', () => {
        game = fight(2)
        wait(game, 0.5)
        expect(Math.abs(safeShare(game) - 0.15)).toBeLessThanOrEqual(0.01)

        swing(game, 3.8)
        wait(game, 0.5)
        expect(Math.abs(safeShare(game) - 0.15)).toBeLessThanOrEqual(0.01)
    })

    test('the safe-window size is a setting whose default is 15%, declared with the other defaults', () => {
        game = start()
        login(game)

        const setting = safeWindowSetting(game)

        expect(typeof setting.value).toBe('number')
        const share = setting.value > 1 ? setting.value / 100 : setting.value
        expect(share).toBeCloseTo(0.15, 6)
    })

    test('changing the safe-window size resizes the marker from the next swing, and is saved for the class', () => {
        game = fight(3.4)
        wait(game, 0.5)
        const setting = safeWindowSetting(game)

        game.run(
            'ns.settings.set(...)',
            setting.key,
            asSetting(0.25, setting.value)
        )
        swing(game, 3.4)
        wait(game, 0.5)
        expect(Math.abs(safeShare(game) - 0.25)).toBeLessThanOrEqual(0.01)

        swing(game, 2.2)
        wait(game, 0.5)
        expect(Math.abs(safeShare(game) - 0.25)).toBeLessThanOrEqual(0.01)

        const saved = game.global('TurboDB') as {
            classes: Record<string, Record<string, unknown>>
        }
        expect(saved.classes.SHAMAN![setting.key]).toBe(
            asSetting(0.25, setting.value)
        )
    })
})

describe('hard casts', () => {
    test('a hard cast greys the bar from its start; its stop un-greys it, and the next swing restarts it from empty', () => {
        game = fight(3.4)
        wait(game, 1)
        expect(grey(game)).toBe(false)

        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(true)
        wait(game, 2.5)
        expect(grey(game)).toBe(true)

        castSucceeded(game, BOLT_CAST, LIGHTNING_BOLT)
        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)

        swing(game, 3.4)
        wait(game, STEP)
        expect(grey(game)).toBe(false)
        expect(fill(game)).toBeLessThanOrEqual(CLOSE + STEP / 3.4)
    })

    test('an interrupted event for the cast un-greys the bar when no stop comes', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        wait(game, 1)
        expect(grey(game)).toBe(true)

        castInterrupted(game, BOLT_CAST, LIGHTNING_BOLT)

        expect(grey(game)).toBe(false)
    })

    test('a failed event for the cast un-greys the bar when no stop comes', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        wait(game, 1)
        expect(grey(game)).toBe(true)

        castFailed(game, BOLT_CAST, LIGHTNING_BOLT)

        expect(grey(game)).toBe(false)
    })

    test('a stop, interrupt or failure for another cast ID leaves the bar grey', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)

        castStop(game, WAVE_CAST, HEALING_WAVE)
        castInterrupted(game, WAVE_CAST, HEALING_WAVE)
        castFailed(game, WAVE_CAST, HEALING_WAVE)
        expect(grey(game)).toBe(true)

        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)
    })

    test('failures with client-side cast IDs mid-cast are ignored, even for the same spell', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)

        castFailed(game, CLIENT_BOLT, LIGHTNING_BOLT)
        wait(game, 0.3)
        castFailed(game, CLIENT_WAVE, HEALING_WAVE)
        castFailed(game, CLIENT_BOLT, LIGHTNING_BOLT)
        expect(grey(game)).toBe(true)

        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)
    })

    test("another unit's cast never greys the bar", () => {
        game = fight(3.4)
        wait(game, 1)

        castStart(game, BOLT_CAST, LIGHTNING_BOLT, 'target')
        wait(game, 1)

        expect(grey(game)).toBe(false)
    })

    test('a second hard cast greys the bar again and un-greys on its own stop', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        swing(game, 3.4)
        wait(game, 1)
        expect(grey(game)).toBe(false)

        castStart(game, WAVE_CAST, HEALING_WAVE)
        expect(grey(game)).toBe(true)
        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(true)

        castStop(game, WAVE_CAST, HEALING_WAVE)
        expect(grey(game)).toBe(false)
    })
})

describe('move-cancelled and kicked hard casts', () => {
    test('a move-cancelled hard cast whose interrupt comes before its stop un-greys the bar and stays un-greyed', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        wait(game, 0.8)

        castInterrupted(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)
        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)

        swing(game, 3.4)
        wait(game, STEP)
        expect(grey(game)).toBe(false)
        expect(fill(game)).toBeLessThanOrEqual(CLOSE + STEP / 3.4)
    })

    test('a move-cancelled hard cast whose stop comes before its interrupt un-greys the bar and stays un-greyed', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        wait(game, 0.8)

        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)
        castInterrupted(game, BOLT_CAST, LIGHTNING_BOLT)
        expect(grey(game)).toBe(false)
        wait(game, 0.5)
        expect(grey(game)).toBe(false)
    })

    test('a kicked hard cast with only a failure for its cast ID un-greys the bar', () => {
        game = fight(3.4)
        wait(game, 1)
        castStart(game, WAVE_CAST, HEALING_WAVE)
        wait(game, 1.2)

        castFailed(game, WAVE_CAST, HEALING_WAVE)
        castInterrupted(game, WAVE_CAST, HEALING_WAVE)

        expect(grey(game)).toBe(false)
    })
})

describe('out of melee', () => {
    test('in melee the bar is bright, with no "out of range"', () => {
        game = fight(3.4)
        wait(game, 1)

        expect(bright(game)).toBe(true)
    })

    test('when the range band leaves Melee the bar dims and says "out of range", and keeps timing', () => {
        game = fight(3.4)
        wait(game, POLL / 2)
        expect(bright(game)).toBe(true)

        setChecks(game, AT_SHOCK)
        wait(game, POLL * 2)

        expect(dimmed(game)).toBe(true)
        const before = fill(game)
        wait(game, 1)
        expect(Math.abs(fill(game) - (before + 1 / 3.4))).toBeLessThanOrEqual(
            CLOSE
        )
        expect(dimmed(game)).toBe(true)
    })

    test("the dim uses the range finder's melee check: one missed check keeps the bar bright, a second dims it", () => {
        game = fight(3.4)
        wait(game, POLL / 2)

        setChecks(game, AT_SHOCK)
        wait(game, POLL)
        expect(bright(game)).toBe(true)

        wait(game, POLL)
        expect(dimmed(game)).toBe(true)
    })

    test('stepping back into melee brightens the bar again', () => {
        game = fight(3.4)
        wait(game, POLL / 2)
        setChecks(game, AT_SHOCK)
        wait(game, POLL * 2)
        expect(dimmed(game)).toBe(true)

        setChecks(game, IN_MELEE)
        wait(game, POLL)

        expect(bright(game)).toBe(true)
    })
})

describe('only while auto-attacking', () => {
    test('in combat with an enemy targeted, there is no swing bar until the player auto-attacks', () => {
        game = start()
        login(game)
        enterCombat(game)
        targetEnemy(game, IN_MELEE)
        wait(game, 1)

        expect(barShown(game)).toBe(false)

        startAttack(game)
        swing(game, 3.4)
        wait(game, 0.5)
        expect(barShown(game)).toBe(true)
    })

    test('stopping auto-attack hides the bar mid-fight, and starting again brings it back', () => {
        game = fight(3.4)
        wait(game, 1)
        expect(barShown(game)).toBe(true)

        stopAttack(game)
        wait(game, 1)
        expect(barShown(game)).toBe(false)

        startAttack(game)
        swing(game, 3.4)
        wait(game, 0.5)
        expect(barShown(game)).toBe(true)
    })

    test('turning the swing timer off hides the bar while auto-attacking', () => {
        game = fight(3.4)
        wait(game, 1)
        expect(barShown(game)).toBe(true)

        game.run('ns.modules.disable("swingTimer")')
        swing(game, 3.4)
        wait(game, 1)

        expect(barShown(game)).toBe(false)
    })
})

describe('instant spells', () => {
    test('an instant spell mid-swing neither greys the bar nor warns of a clip, and the swing keeps timing', () => {
        game = fight(3.4)
        wait(game, 1)

        castSucceeded(game, SHOCK_CAST, EARTH_SHOCK)
        wait(game, 0.7)

        expect(grey(game)).toBe(false)
        expectFill(game, 1.7 / 3.4)
        const texts = textsIn(game, CARD)
        expect(texts.filter((t) => /clip/i.test(t))).toEqual([])
        const clipFrames = game
            .frames()
            .filter((id) => /clip/i.test(id) && shownChain(game!, id))
        expect(clipFrames).toEqual([])
    })
})

describe("Blizzard's swing bar", () => {
    test("Turbo never names, changes or hides Blizzard's swing bar, and every frame it makes while swinging is its own", () => {
        const luaFiles = readdirSync(TURBO_DIR, {
            recursive: true,
            encoding: 'utf8',
        }).filter((f) => f.endsWith('.lua'))
        for (const file of luaFiles) {
            const source = readFileSync(join(TURBO_DIR, file), 'utf8')
            expect(source).not.toMatch(
                /\bBlizzard_SwingTimer\b|\bPlayerSwing\w*(Frame|Bar)\b|\bSwingTimer(Frame|Bar|Mixin)\b/
            )
            expect(source).not.toMatch(
                /\b(SetCVar|SetCVarBitfield|ResetCVar)\b|C_CVar\s*\.\s*(Set|Reset)/
            )
        }

        game = fight(3.4)
        wait(game, 1)
        castStart(game, BOLT_CAST, LIGHTNING_BOLT)
        castStop(game, BOLT_CAST, LIGHTNING_BOLT)
        swing(game, 3.4)
        stopAttack(game)
        wait(game, 1)

        const named = game
            .calls({ method: 'CreateFrame' })
            .map((c) => c.args[1])
            .filter((name): name is string => typeof name === 'string')
        expect(named).toContain(BAR)
        for (const name of named) expect(name.startsWith('Turbo')).toBe(true)
    })
})
