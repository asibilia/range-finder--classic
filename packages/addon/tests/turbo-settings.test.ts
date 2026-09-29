/**
 * Turbo's settings under the fake game: the Turbo page in Options → AddOns,
 * its module checkboxes and declared options, the saved settings behind them,
 * and the /turbo and /tb commands that change them.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - The safe layer builds the page on Blizzard's add-on settings API
 *   (`Settings.RegisterVerticalLayoutCategory`,
 *   `Settings.RegisterAddOnCategory` and friends). The fake game records it:
 *   `settingsPages()` lists the pages registered in Options → AddOns, each
 *   `{ name, controls }`. A control is `{ kind, label, value, min?, max?,
 *   step? }`, with kind `'checkbox'`, `'slider'` or `'text'` (a line of text
 *   on the page), and `value` is what the control shows now.
 * - `changeSetting(page, label, value)` is the player ticking a checkbox or
 *   moving a slider on that page.
 * - A module declares its name and options when it registers:
 *   `ns.modules.register(id, { name, options = { { key, label, kind,
 *   default, min, max, step } }, onEnable, onDisable })`. A declared option's
 *   default is the one in its declaration, and modules read an option's
 *   current value with `ns.settings.get(key)`.
 * - `/turbo toggle <module id>` (any case) flips a module, `/turbo always`
 *   flips "always show", and `/tb` is short for `/turbo`.
 * - `TurboDB = { schemaVersion = 1, classes = { [CLASS_TOKEN] = changes } }`.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLuaVm } from '../scripts/lua-vm'
import {
    SAFE_LAYER_FILE,
    TURBO_DIR,
    TURBO_TOC,
    loadTurbo,
    readToc,
    type FakeGame,
} from './fake-game/fake-game'
import { scriptIdleShaman } from './fake-game/idle-shaman.test'

type SettingsControl = {
    kind: string
    label: string
    value?: unknown
    min?: number
    max?: number
    step?: number
}

type SettingsPage = { name: string; controls: SettingsControl[] }

type WithSettings = FakeGame & {
    settingsPages(): SettingsPage[]
    changeSetting(page: string, label: string, value: unknown): void
}

let game: WithSettings | undefined
let extraGames: FakeGame[] = []

afterEach(() => {
    game?.close()
    game = undefined
    for (const g of extraGames) g.close()
    extraGames = []
})

type ModuleSpec = { id: string; name: string }

const MAGE = ['Mage', 'MAGE', 8]

/**
 * Logging stand-ins for some Shaman kit modules, for the checkbox and slash
 * command mechanics. They declare no options: the declared-options tests use
 * the real modules, so what they check is what the real page shows.
 */
const MODULES: ModuleSpec[] = [
    { id: 'rangeFinder', name: 'Range finder' },
    { id: 'swingTimer', name: 'Swing timer' },
    { id: 'totemTimers', name: 'Totem timers' },
    { id: 'weaponImbue', name: 'Weapon imbue' },
]

type ExpectedOption = {
    label: RegExp
    default: number
    min?: number
    max?: number
    step?: number
}

/**
 * The options the real Shaman kit modules declare, by key: the safe-window
 * size, the totem warning time, and the imbue reminder's thresholds out of
 * combat (5 minutes) and in combat (0: only once it's gone).
 */
const REAL_OPTIONS: Record<string, ExpectedOption> = {
    safeWindow: {
        label: /safe window/i,
        default: 0.15,
        min: 0,
        max: 0.5,
        step: 0.01,
    },
    totemWarningSeconds: {
        label: /totem/i,
        default: 5,
        min: 0,
        max: 15,
        step: 1,
    },
    imbueWarnMinutes: { label: /imbue/i, default: 5 },
    imbueCombatWarnMinutes: { label: /imbue/i, default: 0 },
}

/** Loads Turbo with the game's readings scripted, and the stand-ins in. */
function start(
    options: {
        playerClass?: unknown[]
        savedVariables?: Record<string, unknown>
        modules?: ModuleSpec[]
    } = {}
): WithSettings {
    const g = loadTurbo(
        options.savedVariables ? { savedVariables: options.savedVariables } : {}
    ) as WithSettings
    scriptIdleShaman(
        g,
        options.playerClass ? { playerClass: options.playerClass } : {}
    )
    for (const m of options.modules ?? MODULES) registerModule(g, m)
    return g
}

/** Registers a module that logs its switches into `ns.testLog`. */
function registerModule(g: FakeGame, spec: ModuleSpec) {
    g.run(
        `
        local id, name = ...
        ns.testLog = ns.testLog or {}
        ns.modules.register(id, {
            name = name,
            onEnable = function() table.insert(ns.testLog, "enable " .. id) end,
            onDisable = function() table.insert(ns.testLog, "disable " .. id) end,
        })
        `,
        spec.id,
        spec.name
    )
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

/** Loads and logs in a Shaman, with the stand-in modules. */
function started(savedVariables?: Record<string, unknown>): WithSettings {
    const g = start(savedVariables ? { savedVariables } : {})
    login(g)
    return g
}

/** Loads and logs in a Shaman with the real class kit modules only. */
function realKit(savedVariables?: Record<string, unknown>): WithSettings {
    const g = start({
        modules: [],
        ...(savedVariables ? { savedVariables } : {}),
    })
    login(g)
    return g
}

type DeclaredOption = {
    module: string
    key: string
    label: string
    kind: string
    default?: unknown
    min?: number
    max?: number
    step?: number
}

/** Every option the registered kit modules declare, in registry order. */
function declaredOptions(g: FakeGame): DeclaredOption[] {
    const list = g.run(`
        local out = {}
        for _, entry in ipairs(ns.modules.list()) do
            for _, o in ipairs(entry.options) do
                table.insert(out, {
                    module = entry.id, key = o.key, label = o.label, kind = o.kind,
                    default = o.default, min = o.min, max = o.max, step = o.step,
                })
            end
        end
        return out
    `)[0]
    return Array.isArray(list) ? (list as DeclaredOption[]) : []
}

/** The exact label a real module declared for an option key. */
function optionLabel(g: FakeGame, key: string): RegExp {
    const found = declaredOptions(g).filter((o) => o.key === key)
    expect(found.map((o) => o.key)).toEqual([key])
    return exactly((found[0] as DeclaredOption).label)
}

function isEnabled(g: FakeGame, id: string): unknown {
    return g.run('return ns.modules.isEnabled(...)', id)[0]
}

/** The class kit's modules in the registry, each `{ id, name }`. */
function registeredModules(g: FakeGame): { id: string; name: string }[] {
    const list = g.run(`
        local out = {}
        for _, entry in ipairs(ns.modules.list()) do
            table.insert(out, { id = entry.id, name = entry.name })
        end
        return out
    `)[0]
    return Array.isArray(list) ? (list as { id: string; name: string }[]) : []
}

/** The module ids the Shaman class kit lists. */
function shamanKit(g: FakeGame): string[] {
    const ids = g.run('return ns.classKits.SHAMAN.modules')[0]
    return Array.isArray(ids) ? (ids as string[]) : []
}

/** What the stand-in modules logged, in order. */
function moduleLog(g: FakeGame): string[] {
    const log = g.run('return ns.testLog')[0]
    return Array.isArray(log) ? (log as string[]) : []
}

/** A setting's current value, as a module reads it. */
function setting(g: FakeGame, key: string): unknown {
    return g.run('return ns.settings.get(...)', key)[0]
}

/** Every non-table value in a saved table, keyed by its dotted path. */
function leaves(value: unknown, path = ''): Record<string, unknown> {
    if (value !== null && typeof value === 'object') {
        return Object.assign(
            {},
            ...Object.entries(value).map(([k, v]) =>
                leaves(v, path ? `${path}.${k}` : k)
            )
        )
    }
    return { [path]: value }
}

/** The player's stored changes: every saved value but the schema version. */
function storedChanges(g: FakeGame): Record<string, unknown> {
    const all = leaves(g.global('TurboDB'))
    delete all.schemaVersion
    return all
}

/** Whether the card is on screen now. */
function cardVisible(g: FakeGame): boolean {
    const card = g.frame('TurboCard')
    return card?.shown === true && Number(card.alpha) > 0
}

/** The Turbo page in Options → AddOns. */
function turboPage(g: WithSettings): SettingsPage {
    const pages = g.settingsPages().filter((p) => p.name === 'Turbo')
    expect(pages).toHaveLength(1)
    return pages[0] as SettingsPage
}

/** The one control on the Turbo page whose label matches. */
function control(g: WithSettings, label: RegExp): SettingsControl {
    const found = turboPage(g).controls.filter((c) => label.test(c.label))
    expect(found.map((c) => c.label)).toHaveLength(1)
    return found[0] as SettingsControl
}

/** The player changes a control on the Turbo page. */
function change(g: WithSettings, label: RegExp, value: unknown) {
    g.changeSetting('Turbo', control(g, label).label, value)
}

/** Runs a slash command and returns the lines it printed. */
function slash(g: FakeGame, line: string): string[] {
    const before = g.printed().length
    g.slash(line)
    return g.printed().slice(before)
}

function exactly(label: string): RegExp {
    return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

const ALWAYS_SHOW = /always show/i
const SWING_TIMER = exactly('Swing timer')

describe('the Turbo page in Options → AddOns', () => {
    test('a Shaman gets one page named Turbo in Options → AddOns at login', () => {
        game = started()

        const page = turboPage(game)
        expect(page.controls.length).toBeGreaterThan(0)
    })

    test("the real safe layer registers the page with Blizzard's add-on settings API", () => {
        const source = readFileSync(join(TURBO_DIR, SAFE_LAYER_FILE), 'utf8')
        expect(source).toMatch(/\bSettings\s*\.\s*RegisterAddOnCategory\b/)
    })
})

describe('module checkboxes', () => {
    test('the page has one checkbox per registered module, named by the module and ticked while it is on', () => {
        game = started()

        const checkboxes = turboPage(game).controls.filter(
            (c) => c.kind === 'checkbox'
        )
        for (const m of MODULES) {
            const boxes = checkboxes.filter((c) => c.label === m.name)
            expect(boxes).toHaveLength(1)
            expect(boxes[0]?.value).toBe(true)
        }
        // Real kit modules loaded by the TOC (Maelstrom Weapon, say) are in
        // the registry too, and get their checkboxes the same way.
        const registered = registeredModules(game)
        const kit = shamanKit(game)
        for (const m of MODULES) {
            expect(registered.map((r) => r.id)).toContain(m.id)
        }
        for (const r of registered) {
            expect(kit).toContain(r.id)
            expect(checkboxes.filter((c) => c.label === r.name)).toHaveLength(1)
        }
        // One per module, plus "always show".
        expect(checkboxes).toHaveLength(registered.length + 1)
    })

    test("unticking a module's checkbox turns the module off at once and saves the change under the class", () => {
        game = started()

        change(game, SWING_TIMER, false)

        expect(isEnabled(game, 'swingTimer')).toBe(false)
        expect(moduleLog(game)).toContain('disable swingTimer')
        expect(control(game, SWING_TIMER).value).toBe(false)
        const paths = Object.keys(storedChanges(game))
        expect(paths.length).toBeGreaterThan(0)
        for (const path of paths) {
            expect(path.startsWith('classes.SHAMAN.')).toBe(true)
        }
    })

    test('a module unticked on the page stays off, and shows unticked, after a reload', () => {
        const first = started()
        extraGames.push(first)
        change(first, SWING_TIMER, false)
        const saved = first.global('TurboDB')

        game = started({ TurboDB: saved })

        expect(isEnabled(game, 'swingTimer')).toBe(false)
        expect(moduleLog(game)).not.toContain('enable swingTimer')
        expect(control(game, SWING_TIMER).value).toBe(false)
        expect(control(game, exactly('Range finder')).value).toBe(true)
    })

    test('ticking a module again turns it back on and leaves nothing saved', () => {
        game = started()

        change(game, SWING_TIMER, false)
        change(game, SWING_TIMER, true)

        expect(isEnabled(game, 'swingTimer')).toBe(true)
        expect(moduleLog(game).filter((l) => /swingTimer/.test(l))).toEqual([
            'enable swingTimer',
            'disable swingTimer',
            'enable swingTimer',
        ])
        expect(control(game, SWING_TIMER).value).toBe(true)
        expect(storedChanges(game)).toEqual({})
    })
})

describe('declared options', () => {
    test('with the real Shaman kit modules, the page renders the options they declare: safe-window size, both imbue thresholds and the totem warning time, as sliders with their keys, labels, ranges and defaults', () => {
        game = realKit()

        const declared = declaredOptions(game)
        expect(declared.map((o) => o.key).sort()).toEqual(
            Object.keys(REAL_OPTIONS).sort()
        )
        for (const option of declared) {
            const expected = REAL_OPTIONS[option.key] as ExpectedOption
            expect(option.kind).toBe('slider')
            expect(option.label).toMatch(expected.label)
            expect(option.default).toBe(expected.default)
            expect(typeof option.min).toBe('number')
            expect(typeof option.max).toBe('number')
            expect(typeof option.step).toBe('number')
            expect(option.min as number).toBeLessThanOrEqual(expected.default)
            expect(option.max as number).toBeGreaterThan(expected.default)
            for (const bound of ['min', 'max', 'step'] as const) {
                if (expected[bound] !== undefined) {
                    expect(option[bound]).toBe(expected[bound])
                }
            }

            expect(control(game, exactly(option.label))).toMatchObject({
                kind: 'slider',
                value: expected.default,
                min: option.min,
                max: option.max,
                step: option.step,
            })
            expect(setting(game, option.key)).toBe(expected.default)
        }
    })

    test('with the real Shaman kit modules, the page has one ticked checkbox per kit module, named as the module, plus always show', () => {
        game = realKit()

        const kit = shamanKit(game)
        const registered = registeredModules(game)
        expect(registered.map((r) => r.id).sort()).toEqual([...kit].sort())
        const checkboxes = turboPage(game).controls.filter(
            (c) => c.kind === 'checkbox'
        )
        for (const r of registered) {
            const boxes = checkboxes.filter((c) => c.label === r.name)
            expect(boxes).toHaveLength(1)
            expect(boxes[0]?.value).toBe(true)
        }
        expect(checkboxes).toHaveLength(registered.length + 1)
    })

    test('a declared option nobody changed reads as its declared default', () => {
        game = realKit()

        for (const [key, expected] of Object.entries(REAL_OPTIONS)) {
            expect(setting(game, key)).toBe(expected.default)
        }
        expect(storedChanges(game)).toEqual({})
    })

    test('always show is rendered as a checkbox, unticked by default', () => {
        game = started()

        expect(control(game, ALWAYS_SHOW)).toMatchObject({
            kind: 'checkbox',
            value: false,
        })
    })

    test('moving a slider changes the value modules read and saves it under the class', () => {
        game = realKit()
        const safeWindow = optionLabel(game, 'safeWindow')

        change(game, safeWindow, 0.2)

        expect(setting(game, 'safeWindow')).toBe(0.2)
        expect(control(game, safeWindow).value).toBe(0.2)
        const stored = storedChanges(game)
        expect(Object.values(stored)).toEqual([0.2])
        for (const path of Object.keys(stored)) {
            expect(path.startsWith('classes.SHAMAN.')).toBe(true)
        }
    })

    test('a slider moved on the page shows its new value after a reload', () => {
        const first = realKit()
        extraGames.push(first)
        change(first, optionLabel(first, 'totemWarningSeconds'), 8)
        const saved = first.global('TurboDB')

        game = realKit({ TurboDB: saved })

        expect(
            control(game, optionLabel(game, 'totemWarningSeconds')).value
        ).toBe(8)
        expect(setting(game, 'totemWarningSeconds')).toBe(8)
        expect(control(game, optionLabel(game, 'safeWindow')).value).toBe(0.15)
    })

    test('moving a slider back to its default leaves nothing saved', () => {
        game = realKit()
        const safeWindow = optionLabel(game, 'safeWindow')

        change(game, safeWindow, 0.3)
        change(game, safeWindow, 0.15)

        expect(setting(game, 'safeWindow')).toBe(0.15)
        expect(storedChanges(game)).toEqual({})
    })

    test('ticking always show keeps the card on screen out of combat with no target, and unticking it lets the card fade', () => {
        game = started()
        game.advance(0.5)
        expect(cardVisible(game)).toBe(false)

        change(game, ALWAYS_SHOW, true)
        game.advance(0.5)
        expect(cardVisible(game)).toBe(true)
        expect(control(game, ALWAYS_SHOW).value).toBe(true)

        change(game, ALWAYS_SHOW, false)
        game.advance(0.5)
        expect(cardVisible(game)).toBe(false)
        expect(storedChanges(game)).toEqual({})
    })

    test('always show ticked on the page is saved under the class and stays ticked after a reload', () => {
        const first = started()
        extraGames.push(first)
        change(first, ALWAYS_SHOW, true)
        const saved = first.global('TurboDB')
        expect(leaves(saved)).toEqual({
            'classes.SHAMAN.alwaysShow': true,
            schemaVersion: 1,
        })

        game = started({ TurboDB: saved })
        game.advance(0.5)

        expect(control(game, ALWAYS_SHOW).value).toBe(true)
        expect(cardVisible(game)).toBe(true)
    })
})

describe('saved settings', () => {
    test("the page shows the saved changes of the player's own class only", () => {
        const saved = {
            schemaVersion: 1,
            classes: { MAGE: { alwaysShow: true } },
        }
        game = started({ TurboDB: saved })

        expect(control(game, ALWAYS_SHOW).value).toBe(false)
        expect(leaves(game.global('TurboDB'))).toEqual({
            'classes.MAGE.alwaysShow': true,
            schemaVersion: 1,
        })
    })

    test("a Shaman's saved change shows on the page as it was saved", () => {
        const saved = {
            schemaVersion: 1,
            classes: { SHAMAN: { alwaysShow: true } },
        }
        game = started({ TurboDB: saved })

        expect(control(game, ALWAYS_SHOW).value).toBe(true)
    })

    test('changes made on the page keep schema version 1 and store only what differs from the defaults', () => {
        game = realKit()

        change(game, optionLabel(game, 'safeWindow'), 0.2)
        change(game, SWING_TIMER, false)
        change(game, exactly('Range finder'), true)
        change(game, ALWAYS_SHOW, false)

        const db = game.global('TurboDB') as Record<string, unknown>
        expect(db.schemaVersion).toBe(1)
        const stored = storedChanges(game)
        expect(Object.keys(stored)).toHaveLength(2)
        for (const path of Object.keys(stored)) {
            expect(path.startsWith('classes.SHAMAN.')).toBe(true)
        }
    })
})

describe('slash commands', () => {
    test('/turbo toggle turns a module off and back on, says so each time, and saves it', () => {
        game = started()

        const off = slash(game, '/turbo toggle swingTimer')
        expect(isEnabled(game, 'swingTimer')).toBe(false)
        expect(off.join('\n')).toMatch(/swing ?timer/i)
        expect(off.join('\n')).toMatch(/\boff\b|disabled/i)
        const paths = Object.keys(storedChanges(game))
        expect(paths.length).toBeGreaterThan(0)
        for (const path of paths) {
            expect(path.startsWith('classes.SHAMAN.')).toBe(true)
        }

        const on = slash(game, '/turbo toggle swingTimer')
        expect(isEnabled(game, 'swingTimer')).toBe(true)
        expect(on.join('\n')).toMatch(/swing ?timer/i)
        expect(on.join('\n')).toMatch(/\bon\b|enabled/i)
        expect(storedChanges(game)).toEqual({})
    })

    test('/tb toggle works the same as /turbo toggle, matching the module in any case', () => {
        game = started()

        slash(game, '/tb toggle swingtimer')
        expect(isEnabled(game, 'swingTimer')).toBe(false)

        slash(game, '/TB TOGGLE SWINGTIMER')
        expect(isEnabled(game, 'swingTimer')).toBe(true)
        expect(moduleLog(game).filter((l) => /swingTimer/.test(l))).toEqual([
            'enable swingTimer',
            'disable swingTimer',
            'enable swingTimer',
        ])
    })

    test('a module toggled with /turbo shows its new state on the page', () => {
        game = started()

        slash(game, '/turbo toggle swingTimer')

        expect(control(game, SWING_TIMER).value).toBe(false)
    })

    test('a module turned off with /turbo stays off after a reload', () => {
        const first = started()
        extraGames.push(first)
        slash(first, '/turbo toggle swingTimer')
        const saved = first.global('TurboDB')

        game = started({ TurboDB: saved })

        expect(isEnabled(game, 'swingTimer')).toBe(false)
        expect(isEnabled(game, 'rangeFinder')).toBe(true)
    })

    test('/turbo always turns always show on, and /tb always turns it off again', () => {
        game = started()
        game.advance(0.5)
        expect(cardVisible(game)).toBe(false)

        const on = slash(game, '/turbo always')
        game.advance(0.5)
        expect(cardVisible(game)).toBe(true)
        expect(on.join('\n')).toMatch(/always show/i)
        expect(control(game, ALWAYS_SHOW).value).toBe(true)
        expect(leaves(game.global('TurboDB'))).toEqual({
            'classes.SHAMAN.alwaysShow': true,
            schemaVersion: 1,
        })

        const off = slash(game, '/tb always')
        game.advance(0.5)
        expect(cardVisible(game)).toBe(false)
        expect(off.join('\n')).toMatch(/always show/i)
        expect(control(game, ALWAYS_SHOW).value).toBe(false)
        expect(storedChanges(game)).toEqual({})
    })

    test('/turbo toggle with a module Turbo does not know changes nothing and names it', () => {
        game = started()
        const logBefore = moduleLog(game)

        const said = slash(game, '/turbo toggle nosuchmodule')

        expect(said.join('\n')).toMatch(/nosuchmodule/i)
        expect(moduleLog(game)).toEqual(logBefore)
        for (const m of MODULES) expect(isEnabled(game, m.id)).toBe(true)
        expect(storedChanges(game)).toEqual({})
    })

    test('/turbo help lists the toggle and always commands and the modules that can be toggled', () => {
        game = started()

        const help = slash(game, '/turbo help').join('\n')

        expect(help).toMatch(/\/turbo toggle/)
        expect(help).toMatch(/\/turbo always/)
        expect(help).toMatch(/\/tb/)
        for (const m of MODULES) expect(help).toMatch(new RegExp(m.id, 'i'))
        expect(slash(game, '/tb').join('\n')).toBe(help)
    })
})

describe('unsupported classes', () => {
    test("a Mage's Turbo page shows the not supported yet message and no settings", () => {
        game = start({ playerClass: MAGE })
        login(game)

        const page = turboPage(game)
        expect(
            page.controls.filter((c) =>
                /Turbo doesn['’]t support Mages yet/.test(c.label)
            )
        ).toHaveLength(1)
        expect(
            page.controls.filter(
                (c) => c.kind === 'checkbox' || c.kind === 'slider'
            )
        ).toEqual([])
    })
})

/**
 * A stand-in for the beta client's API, for the dev build's smoke check: the
 * whole addon, real safe layer included, runs against it. Any global it
 * doesn't know answers with a harmless stub, so only what the check needs is
 * scripted. It records what Blizzard's Settings API was asked to register.
 */
const CLIENT_STAND_IN = `
local recorded = { categories = {}, addOn = {}, printed = {} }
local stubMeta = {}
local function stub(path)
    return setmetatable({ __path = path }, stubMeta)
end
stubMeta.__index = function(t, k)
    local child = stub(rawget(t, "__path") .. "." .. tostring(k))
    rawset(t, k, child)
    return child
end
stubMeta.__call = function(t)
    return stub(rawget(t, "__path") .. "()")
end
for _, op in ipairs({ "__add", "__sub", "__mul", "__div", "__mod", "__pow", "__unm", "__len" }) do
    stubMeta[op] = function()
        return 0
    end
end
stubMeta.__concat = function(a, b)
    local function text(v)
        return type(v) == "table" and "" or tostring(v)
    end
    return text(a) .. text(b)
end

local function firstString(...)
    for i = 1, select("#", ...) do
        local v = select(i, ...)
        if type(v) == "string" then
            return v
        end
    end
end

local Settings = setmetatable({}, {
    __index = function(t, k)
        local value
        if k == "RegisterAddOnCategory" then
            value = function(category)
                table.insert(recorded.addOn, type(category) == "table" and rawget(category, "__name") or "?")
            end
        elseif type(k) == "string" and k:match("^Register.*Category$") then
            value = function(...)
                local category = stub("Settings." .. k .. "()")
                rawset(category, "__name", firstString(...) or "?")
                table.insert(recorded.categories, rawget(category, "__name"))
                return category, stub("layout")
            end
        else
            value = stub("Settings." .. tostring(k))
        end
        rawset(t, k, value)
        return value
    end,
})

local frames = {}
local timers = {}
local client = {
    Settings = Settings,
    GetBuildInfo = function()
        return "1.16.1", "60000", "Sep 1 2026", 16001
    end,
    C_GameRules = {
        GetForeverExperiencePreset = function()
            return 1
        end,
    },
    UnitClass = function()
        return __className, __classToken, 7
    end,
    InCombatLockdown = function()
        return false
    end,
    UnitCanAttack = function()
        return false
    end,
    UnitIsDead = function()
        return false
    end,
    GetTime = function()
        return 100
    end,
    C_Timer = {
        After = function(_, callback)
            table.insert(timers, callback)
        end,
        NewTicker = function()
            return { Cancel = function() end }
        end,
    },
    CreateFrame = function(frameType, name)
        local frame = stub("frame:" .. tostring(name or frameType))
        local scripts, events = {}, {}
        rawset(frame, "SetScript", function(_, script, handler)
            scripts[script] = handler
        end)
        rawset(frame, "GetScript", function(_, script)
            return scripts[script]
        end)
        rawset(frame, "RegisterEvent", function(_, event)
            events[event] = true
        end)
        rawset(frame, "UnregisterEvent", function(_, event)
            events[event] = nil
        end)
        table.insert(frames, { frame = frame, scripts = scripts, events = events })
        return frame
    end,
    SlashCmdList = {},
    issecretvalue = function()
        return false
    end,
    print = function(message)
        table.insert(recorded.printed, tostring(message))
    end,
}
-- Saved variables start out missing, as on a first login.
local missing = { TurboDB = true }
__env = setmetatable({}, {
    __index = function(_, k)
        if client[k] ~= nil then
            return client[k]
        end
        if missing[k] then
            return nil
        end
        if _G[k] ~= nil then
            return _G[k]
        end
        return stub(tostring(k))
    end,
})
__ns = {}
__recorded = recorded

function __fire(event, ...)
    for _, f in ipairs(frames) do
        if f.events[event] and f.scripts.OnEvent then
            f.scripts.OnEvent(f.frame, event, ...)
        end
    end
    local due = timers
    timers = {}
    for _, callback in ipairs(due) do
        callback()
    end
end
`

/**
 * Logs a dev build into the stand-in client as one class, and returns the
 * pages it registered in Options → AddOns and what it printed to chat.
 */
function devBuildLogin(
    className: string,
    classToken: string
): { pages: string[]; printed: string[] } {
    const vm = createLuaVm()
    try {
        vm.setString('__className', className)
        vm.setString('__classToken', classToken)
        vm.run(CLIENT_STAND_IN, '=client')
        for (const file of readToc(join(TURBO_DIR, TURBO_TOC)).files) {
            vm.setString('__src', readFileSync(join(TURBO_DIR, file), 'utf8'))
            vm.setString('__file', file)
            vm.run(`
                local chunk = assert(loadstring(__src, "@Turbo/" .. __file))
                setfenv(chunk, __env)
                chunk("Turbo", __ns)
            `)
        }
        vm.run(`
            __fire("ADDON_LOADED", "Turbo")
            __fire("PLAYER_LOGIN")
            __fire("PLAYER_ENTERING_WORLD", true, false)
        `)
        const list = (name: string) => {
            const text = vm.run(
                `return table.concat(__recorded.${name}, "\\n")`
            )
            return text ? text.split('\n') : []
        }
        return { pages: list('addOn'), printed: list('printed') }
    } finally {
        vm.close()
    }
}

describe('a dev build in the beta client', () => {
    test("with the real safe layer, a Shaman's login registers one Turbo page in Options → AddOns through Blizzard's Settings API", () => {
        const { pages, printed } = devBuildLogin('Shaman', 'SHAMAN')

        expect(printed.filter((l) => /Forever|support/.test(l))).toEqual([])
        expect(pages).toEqual(['Turbo'])
    })

    test("with the real safe layer, a Mage's login still registers the Turbo page, to say Mages aren't supported yet", () => {
        const { pages, printed } = devBuildLogin('Mage', 'MAGE')

        expect(
            printed.filter((l) => /Turbo doesn['’]t support Mages yet/.test(l))
        ).toHaveLength(1)
        expect(pages).toEqual(['Turbo'])
    })
})
