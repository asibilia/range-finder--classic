/**
 * The mana bar module under the fake game: a bar with the mana number in the
 * card's mana row, red below 20%.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - `manaMax`: the player's max mana, a plain number. Changes fire
 *   `UNIT_MAXPOWER` ("player", "MANA").
 * - `mana`: the player's current mana, a secret. Changes fire
 *   `UNIT_POWER_FREQUENT` ("player", "MANA").
 * - `manaColor(curve)`: the game's power-percent query evaluated through a
 *   colour curve. Turbo describes the curve as plain data,
 *   `{ type = "Step", points = { { x = 0, r = 1, g = 0, b = 0 }, ... } }`,
 *   with `x` on the 0–1 percent scale; the safe layer builds the game's curve
 *   from it. The reading returns `r, g, b`, all secret.
 *
 * The bar is the StatusBar in the mana row (`TurboCardMana`), and the number
 * a FontString in the same row. Every secret goes straight into them.
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
    type WidgetCall,
} from './fake-game/fake-game'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const MANA_ROW = 'TurboCardMana'
const MAX_MANA = 4200

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

/** Saved changes that turn off every v1 module but one. */
function onlyModule(id: string): Record<string, unknown> {
    return {
        schemaVersion: 1,
        classes: {
            SHAMAN: {
                modules: Object.fromEntries(
                    V1_MODULES.filter((m) => m !== id).map((m) => [m, false])
                ),
            },
        },
    }
}

/** Scripts the curve's colour as three secrets named `<label>-r/g/b`. */
function setColor(g: FakeGame, label: string) {
    g.setReading(
        'manaColor',
        g.secret(`${label}-r`),
        g.secret(`${label}-g`),
        g.secret(`${label}-b`)
    )
}

/**
 * Loads Turbo as a Shaman on Forever, in combat, with only the mana bar
 * module on: mana is the secret `mana`, its max plain.
 */
function start(): FakeGame {
    const g = loadTurbo({ savedVariables: { TurboDB: onlyModule('manaBar') } })
    g.setReading('interface', 16001)
    g.setReading('flavor', 'forever')
    g.setReading('playerClass', 'Shaman', 'SHAMAN', 7)
    g.setReading('inCombat', true)
    g.setReading('targetAttackable', true)

    g.setReading('manaMax', MAX_MANA)
    g.setReading('mana', g.secret('mana'))
    setColor(g, 'color')
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

function parentOf(g: FakeGame, id: string): string | null {
    const parent = g.frame(id)?.parent
    return typeof parent === 'string' ? parent : null
}

/** A frame's ancestors, nearest first. */
function ancestors(g: FakeGame, id: string): string[] {
    const out: string[] = []
    let current = parentOf(g, id)
    while (current && out.length < 20) {
        out.push(current)
        current = parentOf(g, current)
    }
    return out
}

/** Every frame under the mana row, optionally of one type. */
function inManaRow(g: FakeGame, type?: string): string[] {
    return g
        .frames()
        .filter(
            (id) =>
                ancestors(g, id).includes(MANA_ROW) &&
                (!type || g.frame(id)?.type === type)
        )
}

function visible(g: FakeGame, id: string): boolean {
    const up = ancestors(g, id)
    const between = [id, ...up.slice(0, up.indexOf(MANA_ROW))]
    return between.every((f) => g.frame(f)?.shown !== false)
}

/** The one visible mana bar. */
function manaBar(g: FakeGame): string {
    const bars = inManaRow(g, 'StatusBar').filter((id) => visible(g, id))
    expect(bars).toHaveLength(1)
    return bars[0]!
}

function isSecret(value: unknown, label: string): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { $secret?: string }).$secret === label
    )
}

function callsOn(g: FakeGame, frames: string[], methods: string[]) {
    return g
        .calls()
        .filter((c) => frames.includes(c.frame) && methods.includes(c.method))
}

/** Whether a call passed a secret, as is, among its arguments. */
function passes(call: WidgetCall, label: string): boolean {
    return call.args.some((a) => isSecret(a, label))
}

/** Whether a secret went straight into the bar's value. */
function barGot(g: FakeGame, label: string): boolean {
    return callsOn(g, [manaBar(g)], ['SetValue']).some((c) =>
        isSecret(c.args[0], label)
    )
}

/** Whether a secret went straight into a text widget in the mana row. */
function numberGot(g: FakeGame, label: string): boolean {
    const texts = inManaRow(g, 'FontString').filter((id) => visible(g, id))
    return callsOn(g, texts, ['SetText', 'SetFormattedText']).some((c) =>
        passes(c, label)
    )
}

/** Whether the colour secrets `<label>-r/g/b` went, in order, into the bar. */
function colored(g: FakeGame, label: string): boolean {
    const frames = [manaBar(g), ...inManaRow(g)]
    return g
        .calls()
        .some(
            (c) =>
                frames.includes(c.frame) &&
                isSecret(c.args[0], `${label}-r`) &&
                isSecret(c.args[1], `${label}-g`) &&
                isSecret(c.args[2], `${label}-b`)
        )
}

type Point = { x: number; r: number; g: number; b: number }

/** Reads a curve point written as `{ x = ..., r = ..., ... }` or a list. */
function point(raw: unknown): Point {
    if (Array.isArray(raw)) {
        const [x, r, g, b] = raw.map(Number)
        return { x: x!, r: r!, g: g!, b: b! }
    }
    const p = raw as Record<string, unknown>
    return { x: Number(p.x), r: Number(p.r), g: Number(p.g), b: Number(p.b) }
}

/** A Step curve's colour at a percent: the last point at or before it. */
function stepAt(points: Point[], percent: number): Point {
    const sorted = [...points].sort((a, b) => a.x - b.x)
    let current = sorted[0]!
    for (const p of sorted) if (p.x <= percent + 1e-9) current = p
    return current
}

function isRed(c: Point): boolean {
    return c.r >= 0.7 && c.g <= 0.35 && c.b <= 0.35
}

describe('the mana bar', () => {
    test('the bar in the mana row gets the plain max and the secret current mana, straight', () => {
        game = start()
        login(game)

        const bar = manaBar(game)
        const ranges = callsOn(game, [bar], ['SetMinMaxValues'])
        expect(ranges.length).toBeGreaterThan(0)
        expect(ranges[ranges.length - 1]!.args.slice(0, 2)).toEqual([
            0,
            MAX_MANA,
        ])
        expect(barGot(game, 'mana')).toBe(true)
    })

    test('the mana number is the secret current mana passed straight into a text widget', () => {
        game = start()
        login(game)

        expect(numberGot(game, 'mana')).toBe(true)
    })

    test('a mana change passes the new secret straight to the bar and the number', () => {
        game = start()
        login(game)

        game.setReading('mana', game.secret('mana-after-cast'))
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')

        expect(barGot(game, 'mana-after-cast')).toBe(true)
        expect(numberGot(game, 'mana-after-cast')).toBe(true)
    })

    test('a max mana change sets the new plain max on the bar', () => {
        game = start()
        login(game)

        game.setReading('manaMax', 4500)
        game.fire('UNIT_MAXPOWER', 'player', 'MANA')

        const ranges = callsOn(game, [manaBar(game)], ['SetMinMaxValues'])
        expect(ranges[ranges.length - 1]!.args.slice(0, 2)).toEqual([0, 4500])
    })

    test("another unit's mana changing leaves the bar alone", () => {
        game = start()
        login(game)

        game.setReading('mana', game.secret('target-mana'))
        game.fire('UNIT_POWER_FREQUENT', 'target', 'MANA')

        expect(barGot(game, 'target-mana')).toBe(false)
        expect(numberGot(game, 'target-mana')).toBe(false)
    })
})

describe('low mana', () => {
    test('the colour comes from a Step curve on the 0–1 percent scale: red below 20%, not red from 20% up', () => {
        game = start()
        login(game)

        const reads = game.reads().filter((r) => r.name === 'manaColor')
        expect(reads.length).toBeGreaterThan(0)
        const curve = reads[reads.length - 1]!.args[0] as {
            type?: unknown
            points?: unknown[]
        }
        expect(String(curve.type).toLowerCase()).toBe('step')
        expect(Array.isArray(curve.points)).toBe(true)
        const points = curve.points!.map(point)
        expect(points.length).toBeGreaterThanOrEqual(2)
        for (const p of points) {
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(1)
        }

        for (const percent of [0, 0.05, 0.1, 0.19]) {
            expect(isRed(stepAt(points, percent))).toBe(true)
        }
        for (const percent of [0.2, 0.21, 0.5, 1]) {
            expect(isRed(stepAt(points, percent))).toBe(false)
        }
    })

    test("the curve's colour goes straight into the bar, and a mana change evaluates it again", () => {
        game = start()
        login(game)
        expect(colored(game, 'color')).toBe(true)

        setColor(game, 'color-low')
        game.setReading('mana', game.secret('mana-low'))
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')

        expect(colored(game, 'color-low')).toBe(true)
    })
})

describe('the real safe layer', () => {
    test('offers every reading the mana bar uses', () => {
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
                local curve = { type = "Step", points = { { x = 0, r = 1, g = 0, b = 0 }, { x = 0.2, r = 0, g = 0, b = 1 } } }
                for _, name in ipairs({ "mana", "manaMax", "manaColor" }) do
                    local ok, err = pcall(ns.safe.read, name, curve)
                    if not ok and tostring(err):find("no reading named", 1, true) then
                        table.insert(missing, '"' .. name .. '"')
                    end
                end
                return "[" .. table.concat(missing, ",") .. "]"
            `) ?? '[]'
        ) as string[]
        vm.close()

        expect(missing).toEqual([])
    })
})
