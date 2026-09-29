/**
 * The key cooldowns module under the fake game: one shock icon for the shared
 * shock cooldown, and a Stormstrike icon once it's learned. Each icon is
 * bright when ready, dim with a swirl while cooling down, and blue when there
 * isn't enough mana to cast it. The global cooldown is ignored.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - Every spell reading takes just the spell ID. Stormstrike is 17364; the
 *   shock readings are scripted for any other ID, so whichever shock Turbo
 *   asks about shares the one cooldown.
 * - `spellKnown(id)`: whether the player knows the spell (plain boolean).
 *   Learning a spell fires `SPELLS_CHANGED`.
 * - `spellTexture(id)`: the spell's icon. The icon's texture is the one in
 *   the small-icons row (`TurboCardIcons`) that was given this icon.
 * - `spellCooldown(id)`: the game's cooldown info table. `isActive` and
 *   `isOnGCD` are plain; `startTime`, `duration` and `modRate` are secret.
 *   Changes fire `SPELL_UPDATE_COOLDOWN`.
 * - `spellCooldownDuration(id)`: the cooldown's duration object, a secret
 *   that goes straight into the icon's Cooldown frame for the swirl.
 * - `spellUsable(id)`: `isUsable, insufficientPower` (plain booleans).
 *   Changes fire `SPELL_UPDATE_USABLE`.
 *
 * An icon is bright when its texture, and the frames between it and the row,
 * are at full alpha and full colour; dim when they're darkened (alpha or
 * vertex colour) or desaturated; blue when the vertex colour leans blue.
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
} from './fake-game/fake-game'
import { scriptShamanOnForever } from './fake-game/idle-shaman.test'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const ICONS_ROW = 'TurboCardIcons'
const STORMSTRIKE = 17364
const SHOCK_ICON = 136026
const STORMSTRIKE_ICON = 132314

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

/** Saved changes that turn off every v1 module but the given ones. */
function onlyModules(ids: string[]): Record<string, unknown> {
    return {
        schemaVersion: 1,
        classes: {
            SHAMAN: {
                modules: Object.fromEntries(
                    V1_MODULES.filter((m) => !ids.includes(m)).map((m) => [
                        m,
                        false,
                    ])
                ),
            },
        },
    }
}

type CooldownState = 'ready' | 'cooling' | 'gcd'

/**
 * Scripts one spell's cooldown: the info table (plain flags, secret numbers)
 * and its duration object, labelled `durationLabel`.
 */
function setCooldown(
    g: FakeGame,
    spell: 'shock' | 'stormstrike',
    state: CooldownState,
    durationLabel: string
) {
    const info = {
        startTime: g.secret(`${durationLabel}-start`),
        duration: g.secret(`${durationLabel}-length`),
        modRate: g.secret(`${durationLabel}-rate`),
        isEnabled: true,
        isActive: state !== 'ready',
        isOnGCD: state === 'gcd',
    }
    const duration = g.secret(durationLabel, 'userdata')
    if (spell === 'shock') {
        g.setReading('spellCooldown', info)
        g.setReading('spellCooldownDuration', duration)
    } else {
        g.setReadingFor('spellCooldown', [STORMSTRIKE], info)
        g.setReadingFor('spellCooldownDuration', [STORMSTRIKE], duration)
    }
}

function setUsable(
    g: FakeGame,
    spell: 'shock' | 'stormstrike',
    isUsable: boolean,
    insufficientPower: boolean
) {
    if (spell === 'shock') {
        g.setReading('spellUsable', isUsable, insufficientPower)
    } else {
        g.setReadingFor(
            'spellUsable',
            [STORMSTRIKE],
            isUsable,
            insufficientPower
        )
    }
}

/**
 * Loads Turbo as a Shaman on Forever with only the key cooldowns module on
 * (or the given modules): every shock ready and castable, Stormstrike not yet
 * learned.
 */
function start(
    options: {
        knowsStormstrike?: boolean
        inCombat?: boolean
        modules?: string[]
    } = {}
): FakeGame {
    const g = loadTurbo({
        savedVariables: {
            TurboDB: onlyModules(options.modules ?? ['keyCooldowns']),
        },
    })
    scriptShamanOnForever(g, { inCombat: [options.inCombat ?? false] })

    g.setReading('spellKnown', true)
    g.setReadingFor(
        'spellKnown',
        [STORMSTRIKE],
        options.knowsStormstrike ?? false
    )
    g.setReading('spellTexture', SHOCK_ICON)
    g.setReadingFor('spellTexture', [STORMSTRIKE], STORMSTRIKE_ICON)
    setCooldown(g, 'shock', 'ready', 'shock-idle')
    setCooldown(g, 'stormstrike', 'ready', 'stormstrike-idle')
    setUsable(g, 'shock', true, false)
    setUsable(g, 'stormstrike', true, false)
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

/** Every frame under a root, optionally of one type. */
function under(g: FakeGame, root: string, type?: string): string[] {
    return g
        .frames()
        .filter(
            (id) =>
                ancestors(g, id).includes(root) &&
                (!type || g.frame(id)?.type === type)
        )
}

/** The frames between a frame and the icons row, the frame included. */
function pathToRow(g: FakeGame, id: string): string[] {
    const up = ancestors(g, id)
    const row = up.indexOf(ICONS_ROW)
    if (row < 0) throw new Error(`${id} is not in the small-icons row`)
    return [id, ...up.slice(0, row)]
}

function isIcon(value: unknown, icon: number): boolean {
    return value === icon || (Array.isArray(value) && value[0] === icon)
}

/** The textures in the small-icons row showing a spell's icon. */
function iconTextures(g: FakeGame, icon: number): string[] {
    return under(g, ICONS_ROW, 'Texture').filter((id) =>
        isIcon(g.frame(id)?.Texture, icon)
    )
}

function visible(g: FakeGame, id: string): boolean {
    return pathToRow(g, id).every((f) => g.frame(f)?.shown !== false)
}

/** The one visible texture showing a spell's icon. */
function iconTexture(g: FakeGame, icon: number): string {
    const shown = iconTextures(g, icon).filter((id) => visible(g, id))
    expect(shown).toHaveLength(1)
    return shown[0]!
}

function iconShown(g: FakeGame, icon: number): boolean {
    return iconTextures(g, icon).some((id) => visible(g, id))
}

type Look = { brightness: number; desaturated: boolean; blue: boolean }

/** How an icon looks: its brightness, desaturation and blue tint. */
function look(g: FakeGame, icon: number): Look {
    const texture = iconTexture(g, icon)
    let brightness = 1
    for (const id of pathToRow(g, texture)) {
        const alpha = g.frame(id)?.alpha
        brightness *= typeof alpha === 'number' ? alpha : 1
    }
    const state = g.frame(texture)!
    let blue = false
    if (Array.isArray(state.VertexColor)) {
        const [r, gr, b, a] = (state.VertexColor as unknown[]).map((v) =>
            typeof v === 'number' ? v : 1
        )
        brightness *= Math.max(r ?? 1, gr ?? 1, b ?? 1) * (a ?? 1)
        blue = (b ?? 1) - Math.max(r ?? 1, gr ?? 1) >= 0.2
    }
    return {
        brightness,
        desaturated: state.Desaturated === true,
        blue,
    }
}

function bright(g: FakeGame, icon: number): boolean {
    const l = look(g, icon)
    return l.brightness >= 0.9 && !l.desaturated
}

function dim(g: FakeGame, icon: number): boolean {
    const l = look(g, icon)
    return l.brightness <= 0.75 || l.desaturated
}

/** Whether an icon's Cooldown frame was handed a secret duration object. */
function swirlGot(g: FakeGame, icon: number, label: string): boolean {
    const holder = parentOf(g, iconTexture(g, icon))
    if (!holder) return false
    const cooldowns = [holder, ...under(g, holder)].filter(
        (id) => g.frame(id)?.type === 'Cooldown'
    )
    return g
        .calls()
        .some(
            (c) =>
                cooldowns.includes(c.frame) &&
                c.args.some(
                    (a) =>
                        typeof a === 'object' &&
                        a !== null &&
                        (a as { $secret?: string }).$secret === label
                )
        )
}

describe('the shock icon', () => {
    test('one shock icon for the shared shock cooldown sits in the small-icons row, bright when ready', () => {
        game = start()
        login(game)

        expect(iconTextures(game, SHOCK_ICON)).toHaveLength(1)
        expect(iconShown(game, SHOCK_ICON)).toBe(true)
        expect(bright(game, SHOCK_ICON)).toBe(true)
        expect(look(game, SHOCK_ICON).blue).toBe(false)
    })

    test('a shock going on cooldown dims the icon and hands its cooldown duration object to the swirl', () => {
        game = start({ inCombat: true })
        login(game)

        setCooldown(game, 'shock', 'cooling', 'shock-cd')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(iconShown(game, SHOCK_ICON)).toBe(true)
        expect(dim(game, SHOCK_ICON)).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'shock-cd')).toBe(true)
    })

    test('when the shock cooldown ends the icon is bright again', () => {
        game = start({ inCombat: true })
        login(game)
        setCooldown(game, 'shock', 'cooling', 'shock-cd')
        game.fire('SPELL_UPDATE_COOLDOWN')
        expect(dim(game, SHOCK_ICON)).toBe(true)

        setCooldown(game, 'shock', 'ready', 'shock-done')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(bright(game, SHOCK_ICON)).toBe(true)
    })

    test('ready or not comes from the is-active flag alone: the secret start and duration are never read', () => {
        game = start({ inCombat: true })
        login(game)

        // Every number in the cooldown info is a secret stand-in; reading
        // any of them fails the test.
        setCooldown(game, 'shock', 'cooling', 'shock-cd')
        game.fire('SPELL_UPDATE_COOLDOWN')
        expect(dim(game, SHOCK_ICON)).toBe(true)

        setCooldown(game, 'shock', 'ready', 'shock-after')
        game.fire('SPELL_UPDATE_COOLDOWN')
        expect(bright(game, SHOCK_ICON)).toBe(true)
    })
})

describe('the global cooldown', () => {
    test('the global cooldown alone leaves the shock icon bright, with no swirl', () => {
        game = start({ inCombat: true })
        login(game)

        setCooldown(game, 'shock', 'gcd', 'gcd-duration')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(bright(game, SHOCK_ICON)).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'gcd-duration')).toBe(false)
    })

    test('a real shock cooldown after the global cooldown still dims the icon and swirls', () => {
        game = start({ inCombat: true })
        login(game)
        setCooldown(game, 'shock', 'gcd', 'gcd-duration')
        game.fire('SPELL_UPDATE_COOLDOWN')
        expect(bright(game, SHOCK_ICON)).toBe(true)

        setCooldown(game, 'shock', 'cooling', 'shock-cd')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(dim(game, SHOCK_ICON)).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'shock-cd')).toBe(true)
    })
})

describe('the Stormstrike icon', () => {
    test("Stormstrike's icon stays hidden before it's learned", () => {
        game = start({ knowsStormstrike: false })
        login(game)

        expect(iconShown(game, STORMSTRIKE_ICON)).toBe(false)
        expect(iconShown(game, SHOCK_ICON)).toBe(true)
    })

    test("Stormstrike's icon appears on its own once it's learned", () => {
        game = start({ knowsStormstrike: false })
        login(game)
        expect(iconShown(game, STORMSTRIKE_ICON)).toBe(false)

        game.setReadingFor('spellKnown', [STORMSTRIKE], true)
        game.fire('SPELLS_CHANGED')

        expect(iconShown(game, STORMSTRIKE_ICON)).toBe(true)
        expect(bright(game, STORMSTRIKE_ICON)).toBe(true)
    })

    test('a Shaman who already knows Stormstrike sees its icon at login', () => {
        game = start({ knowsStormstrike: true })
        login(game)

        expect(iconShown(game, STORMSTRIKE_ICON)).toBe(true)
        expect(bright(game, STORMSTRIKE_ICON)).toBe(true)
    })

    test('Stormstrike cooling down dims its own icon with its own swirl, and leaves the shock icon bright', () => {
        game = start({ knowsStormstrike: true, inCombat: true })
        login(game)

        setCooldown(game, 'stormstrike', 'cooling', 'stormstrike-cd')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(dim(game, STORMSTRIKE_ICON)).toBe(true)
        expect(swirlGot(game, STORMSTRIKE_ICON, 'stormstrike-cd')).toBe(true)
        expect(bright(game, SHOCK_ICON)).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'stormstrike-cd')).toBe(false)
    })

    test('the global cooldown alone leaves the Stormstrike icon bright, with no swirl', () => {
        game = start({ knowsStormstrike: true, inCombat: true })
        login(game)

        setCooldown(game, 'stormstrike', 'gcd', 'stormstrike-gcd')
        game.fire('SPELL_UPDATE_COOLDOWN')

        expect(bright(game, STORMSTRIKE_ICON)).toBe(true)
        expect(swirlGot(game, STORMSTRIKE_ICON, 'stormstrike-gcd')).toBe(false)
    })
})

describe('not enough mana', () => {
    test("the shock icon turns blue when there isn't enough mana to cast it, and back when there is", () => {
        game = start({ inCombat: true })
        login(game)
        expect(look(game, SHOCK_ICON).blue).toBe(false)

        setUsable(game, 'shock', false, true)
        game.fire('SPELL_UPDATE_USABLE')
        expect(look(game, SHOCK_ICON).blue).toBe(true)

        setUsable(game, 'shock', true, false)
        game.fire('SPELL_UPDATE_USABLE')
        expect(look(game, SHOCK_ICON).blue).toBe(false)
    })

    test("the Stormstrike icon turns blue when there isn't enough mana, and the shock icon doesn't", () => {
        game = start({ knowsStormstrike: true, inCombat: true })
        login(game)

        setUsable(game, 'stormstrike', false, true)
        game.fire('SPELL_UPDATE_USABLE')

        expect(look(game, STORMSTRIKE_ICON).blue).toBe(true)
        expect(look(game, SHOCK_ICON).blue).toBe(false)
    })

    test('a spell that is unusable for a reason other than mana is not tinted blue', () => {
        game = start({ inCombat: true })
        login(game)

        setUsable(game, 'shock', false, false)
        game.fire('SPELL_UPDATE_USABLE')

        expect(look(game, SHOCK_ICON).blue).toBe(false)
    })
})

describe("the beta client's combat rules", () => {
    test('a fight where every number is secret: the key cooldowns and the mana bar all work together and never read a secret', () => {
        // What the in-game checklist checks in the beta, as far as the fake
        // game can: in combat, every number the game hides is a secret
        // stand-in that fails the test if Turbo reads it.
        game = start({
            knowsStormstrike: true,
            inCombat: true,
            modules: ['keyCooldowns', 'manaBar'],
        })
        game.setReading('targetAttackable', true)
        game.setReading('manaMax', 4200)
        game.setReading('mana', game.secret('mana'))
        game.setReading(
            'manaColor',
            game.secret('color-r'),
            game.secret('color-g'),
            game.secret('color-b')
        )
        login(game)
        expect(bright(game, SHOCK_ICON)).toBe(true)
        expect(bright(game, STORMSTRIKE_ICON)).toBe(true)

        // Stormstrike, then an Earth Shock: each costs mana and sets off
        // the global cooldown, then its own cooldown.
        setCooldown(game, 'stormstrike', 'cooling', 'stormstrike-cd')
        setCooldown(game, 'shock', 'gcd', 'gcd-duration')
        game.setReading('mana', game.secret('mana-after-stormstrike'))
        game.fire('SPELL_UPDATE_COOLDOWN')
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')
        game.advance(1.5)

        setCooldown(game, 'shock', 'cooling', 'shock-cd')
        setUsable(game, 'stormstrike', false, true)
        game.setReading('mana', game.secret('mana-after-shock'))
        game.fire('SPELL_UPDATE_COOLDOWN')
        game.fire('SPELL_UPDATE_USABLE')
        game.fire('UNIT_POWER_FREQUENT', 'player', 'MANA')

        expect(dim(game, SHOCK_ICON)).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'shock-cd')).toBe(true)
        expect(swirlGot(game, SHOCK_ICON, 'gcd-duration')).toBe(false)
        expect(dim(game, STORMSTRIKE_ICON)).toBe(true)
        expect(swirlGot(game, STORMSTRIKE_ICON, 'stormstrike-cd')).toBe(true)
        expect(look(game, STORMSTRIKE_ICON).blue).toBe(true)

        const bars = under(game, 'TurboCardMana', 'StatusBar')
        expect(bars).toHaveLength(1)
        const values = game.calls({ frame: bars[0]!, method: 'SetValue' })
        expect(values[values.length - 1]!.args[0]).toEqual({
            $secret: 'mana-after-shock',
        })
    })
})

describe('the real safe layer', () => {
    test('offers every reading the key cooldowns use', () => {
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
                for _, name in ipairs({ "spellKnown", "spellTexture", "spellCooldown", "spellCooldownDuration", "spellUsable" }) do
                    local ok, err = pcall(ns.safe.read, name, ${STORMSTRIKE})
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
