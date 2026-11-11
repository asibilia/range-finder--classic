/**
 * The fake game's own tests: it must behave like the safe-layer contract says,
 * so every Turbo test built on it can trust it.
 *
 * They load `tests/fixtures/sample-addon`, a tiny addon that is not Turbo, and
 * poke the fake through its public API only.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { loadAddon, type FakeGame } from './fake-game'

const SAMPLE = {
    addonDir: join(import.meta.dir, '../fixtures/sample-addon'),
    toc: 'Sample.toc',
}

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

/** Loads the sample addon with its mana reading scripted as a secret. */
function sample() {
    game = loadAddon(SAMPLE)
    game.setReading('mana', game.secret('mana'))
    return game
}

describe('loading', () => {
    test('loads the TOC files in order, replacing the safe layer with the fake', () => {
        const g = sample()
        expect(g.loadedFiles()).toEqual(['sample.lua'])
    })
})

describe('events', () => {
    test('a fired event reaches its handlers with its payload', () => {
        const g = sample()
        g.fire('PLAYER_SWING', 3.4, 0)
        expect(g.run('return ns.swings, ns.lastSwing')).toEqual([1, 6.8])
    })

    test('handlers run in the order they subscribed, and off removes one', () => {
        const g = sample()
        g.run(`
            ns.order = {}
            local function first() table.insert(ns.order, "first") end
            ns.safe.on("TEST_EVENT", first)
            ns.safe.on("TEST_EVENT", function() table.insert(ns.order, "second") end)
            ns.first = first
        `)
        g.fire('TEST_EVENT')
        g.run('ns.safe.off("TEST_EVENT", ns.first)')
        g.fire('TEST_EVENT')
        expect(g.run('return ns.order')).toEqual([
            ['first', 'second', 'second'],
        ])
    })

    test('an event nobody listens to is fine', () => {
        expect(() => sample().fire('UNIT_AURA', 'player')).not.toThrow()
    })
})

describe('readings', () => {
    test('a scripted reading returns its values, and every read is logged', () => {
        const g = sample()
        g.setReading('target', true, 'enemy')
        expect(g.run('return ns.safe.read("target")')).toEqual([true, 'enemy'])
        expect(g.reads()).toContainEqual({ name: 'target', args: [] })
    })

    test('a reading can depend on its arguments', () => {
        const g = sample()
        g.setReading('inRange', false)
        g.setReadingFor('inRange', [8042], true)
        expect(
            g.run(
                'return ns.safe.read("inRange", 8042), ns.safe.read("inRange", 403)'
            )
        ).toEqual([true, false])
    })

    test('a scripted sequence is consumed one read at a time, then fails loudly', () => {
        const g = sample()
        g.scriptReadings('melee', [[true], [false], [false]])
        const read = () => g.run('return ns.safe.read("melee")')
        expect([read(), read(), read()]).toEqual([[true], [false], [false]])
        expect(read).toThrow(/reading 'melee' ran out/)
    })

    test('an unscripted reading fails loudly', () => {
        const g = sample()
        expect(() => g.run('return ns.safe.read("health")')).toThrow(
            /no scripted reading 'health'/
        )
    })
})

describe('chat and slash commands', () => {
    test('chat output is captured', () => {
        const g = sample()
        g.run('ns.safe.print("Turbo doesn\'t support Mages yet")')
        expect(g.printed()).toEqual(["Turbo doesn't support Mages yet"])
    })

    test('a typed slash command reaches its handler with the text after it, under any of its names and any case', () => {
        const g = sample()
        g.slash('/sample hello there')
        g.slash('/SA hi')
        expect(g.printed()).toEqual([
            "Sample heard 'hello there'",
            "Sample heard 'hi'",
        ])
    })

    test('a command nobody registered fails loudly', () => {
        const g = sample()
        expect(() => g.slash('/nope')).toThrow(/no slash command '\/nope'/)
    })
})

describe('secret stand-ins fail loudly', () => {
    const misuse = (code: string) => () => {
        const g = sample()
        g.run(code, g.secret('health'))
    }

    test.each([
        [
            'read',
            'local s = ...; return s.value',
            /secret value 'health' was read/,
        ],
        // Lua 5.1 never calls a metamethod to order a userdata against a
        // number, so this one fails with Lua's own message. Still loud.
        [
            'ordered against a number',
            'local s = ...; return s < 10',
            /attempt to compare userdata with number/,
        ],
        [
            'ordered against another secret',
            'local s = ...; return s <= ns.safe.read("mana")',
            /was compared/,
        ],
        [
            'compared with another secret',
            'local s = ...; return s == ns.safe.read("mana")',
            /was compared/,
        ],
        [
            'compared with rawequal',
            'local s = ...; return rawequal(s, 0)',
            /was compared/,
        ],
        ['used in math', 'local s = ...; return s + 1', /was used in math/],
        ['negated', 'local s = ...; return -s', /was used in math/],
        [
            'concatenated',
            'local s = ...; return "hp: " .. s',
            /was concatenated/,
        ],
        [
            'converted with tostring',
            'local s = ...; return tostring(s)',
            /was converted to a string/,
        ],
        [
            'formatted',
            'local s = ...; return string.format("%s", s)',
            /was converted to a string/,
        ],
        [
            'converted with tonumber',
            'local s = ...; return tonumber(s)',
            /was converted to a number/,
        ],
        ['measured', 'local s = ...; return #s', /was measured/],
        ['called', 'local s = ...; return s()', /was called/],
        [
            'kept as a table key',
            'local s = ...; ns.cache = {}; ns.cache[s] = true',
            /was used as a table key/,
        ],
        [
            'used as a key with rawset',
            'local s = ...; rawset({}, s, 1); return 1',
            /was used as a table key/,
        ],
    ])('when %s', (_what, code, message) => {
        expect(misuse(code)).toThrow(message)
    })

    test('a secret kept as a key in addon state is caught after the step', () => {
        const g = sample()
        expect(() =>
            g.run('ns.bySecret = {}; ns.bySecret[ns.safe.read("mana")] = 1')
        ).toThrow(/was used as a table key/)
    })

    test('a secret hidden in a closure as a key is still caught', () => {
        const g = sample()
        g.run(`
            local seen = {}
            ns.safe.on("UNIT_POWER_UPDATE", function() seen[ns.safe.read("mana")] = true end)
        `)
        expect(() => g.fire('UNIT_POWER_UPDATE', 'player')).toThrow(
            /was used as a table key/
        )
    })

    test('a misuse swallowed by pcall still fails the step', () => {
        const g = sample()
        expect(() =>
            g.run(
                'local s = ...; pcall(function() return s + 1 end)',
                g.secret('mana')
            )
        ).toThrow(/secret value 'mana' was used in math/)
    })

    test('the error points at the addon line that misused it', () => {
        const g = sample()
        expect(() =>
            g.run('local s = ...\nlocal x = 1\nreturn s * x', g.secret('mana'))
        ).toThrow(/test:3:/)
    })

    test('passing a secret along and storing it as a value are fine', () => {
        const g = sample()
        const result = g.run(
            `
            local s = ...
            local held = { value = s }
            return type(held.value), held.value
            `,
            g.secret('mana')
        )
        expect(result).toEqual(['number', { $secret: 'mana' }])
        g.fire('UNIT_POWER_UPDATE', 'player')
        expect(g.run('return ns.mana')).toEqual([{ $secret: 'mana' }])
    })
})

describe('the seam', () => {
    test('touching a game global outside the safe layer fails loudly', () => {
        const g = sample()
        expect(() => g.run('return UnitHealth("player")')).toThrow(
            /game global 'UnitHealth' outside the safe layer/
        )
    })

    test("the addon's own globals and WoW's Lua helpers are available", () => {
        const g = sample()
        expect(
            g.run(`
                TurboTestGlobal = 3
                local a, b = strsplit(",", "x,y")
                local t = { 1, 2 }
                wipe(t)
                return TurboTestGlobal, a, b, #t, format("%d", 7), floor(1.5), tinsert ~= nil
            `)
        ).toEqual([3, 'x', 'y', 0, '7', 1, true])
    })
})

describe('macros, action slots and the cursor', () => {
    const BODY = '#showtooltip\n/startattack\n/cast Earth Shock'

    test("macros list the account's first, then the character's, each in name order, with the game's indexes", () => {
        const g = sample()
        g.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })
        g.addMacro({
            name: 'Buffs',
            body: '/cast Lightning Shield',
            perCharacter: false,
        })

        const [index] = g.run(
            'return ns.safe.createMacro("Earth Shock", 134400, ..., true)',
            BODY
        )

        // Character macros start after the 120 account slots.
        expect(index).toBe(121)
        expect(g.macros()).toEqual([
            {
                index: 1,
                name: 'Buffs',
                icon: null,
                body: '/cast Lightning Shield',
                perCharacter: false,
            },
            {
                index: 121,
                name: 'Earth Shock',
                icon: 134400,
                body: BODY,
                perCharacter: true,
            },
            {
                index: 122,
                name: 'Mount',
                icon: null,
                body: '/cast Ghost Wolf',
                perCharacter: true,
            },
        ])
        expect(g.run('return ns.safe.macros()')[0]).toEqual([
            {
                index: 1,
                name: 'Buffs',
                body: '/cast Lightning Shield',
                perCharacter: false,
            },
            { index: 121, name: 'Earth Shock', body: BODY, perCharacter: true },
            {
                index: 122,
                name: 'Mount',
                body: '/cast Ghost Wolf',
                perCharacter: true,
            },
        ])
        expect(g.run('return ns.safe.macroLimits()')).toEqual([120, 30])
    })

    test('a full character macro list refuses another macro, loudly', () => {
        const g = sample()
        for (let i = 1; i <= 30; i++) {
            g.addMacro({ name: `Macro ${i}`, body: '', perCharacter: true })
        }
        expect(() =>
            g.run('return ns.safe.createMacro("Earth Shock", 134400, "", true)')
        ).toThrow(/no room for another character macro/)
        expect(g.macros()).toHaveLength(30)
    })

    test('editing a macro changes only its body, keeps its name, icon and index, and a macro that does not exist fails loudly', () => {
        const g = sample()
        g.addMacro({
            name: 'Earth Shock',
            icon: 134400,
            body: '#showtooltip\n/cast Earth Shock',
            perCharacter: true,
        })
        g.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })

        const [index] = g.run('return ns.safe.editMacro(121, ...)', BODY)

        expect(index).toBe(121)
        expect(g.macros()).toEqual([
            {
                index: 121,
                name: 'Earth Shock',
                icon: 134400,
                body: BODY,
                perCharacter: true,
            },
            {
                index: 122,
                name: 'Mount',
                icon: null,
                body: '/cast Ghost Wolf',
                perCharacter: true,
            },
        ])
        expect(() => g.run('ns.safe.editMacro(123, "")')).toThrow(
            /no macro at index 123/
        )
    })

    test('editing a macro with a name renames it, and its list re-sorts by name', () => {
        const g = sample()
        g.addMacro({ name: 'Alpha', body: '/say a', perCharacter: true })
        g.addMacro({ name: 'Beta', body: '/say b', perCharacter: true })
        g.setAction(1, { type: 'macro', name: 'Alpha' })

        const [index] = g.run('return ns.safe.editMacro(121, "/say z", "Zulu")')

        expect(index).toBe(122)
        expect(g.macros().map((m) => [m.index, m.name, m.body])).toEqual([
            [121, 'Beta', '/say b'],
            [122, 'Zulu', '/say z'],
        ])
        // The bar follows the macro, as in the game.
        expect(g.actions()).toEqual({
            1: { type: 'macro', name: 'Zulu', perCharacter: true },
        })
    })

    test('deleting a macro takes it off its list and the bars; later ones move up, and a missing one fails loudly', () => {
        const g = sample()
        g.addMacro({ name: 'Alpha', body: '/say a', perCharacter: true })
        g.addMacro({ name: 'Beta', body: '/say b', perCharacter: true })
        g.setAction(1, { type: 'macro', name: 'Alpha' })
        g.setAction(2, { type: 'macro', name: 'Beta' })

        g.run('ns.safe.deleteMacro(121)')

        expect(g.macros().map((m) => [m.index, m.name])).toEqual([
            [121, 'Beta'],
        ])
        expect(g.actions()).toEqual({
            2: { type: 'macro', name: 'Beta', perCharacter: true },
        })
        expect(() => g.run('ns.safe.deleteMacro(125)')).toThrow(
            /no macro at index 125/
        )
    })

    test("action text is a macro action's name, and nothing for anything else", () => {
        const g = sample()
        g.addMacro({ name: 'Earth Shock', body: BODY, perCharacter: true })
        g.setAction(1, { type: 'macro', name: 'Earth Shock' })
        g.setAction(2, { type: 'spell', id: 8042 })

        expect(g.run('return ns.safe.actionText(1)')).toEqual(['Earth Shock'])
        expect(g.run('return ns.safe.actionText(2)')).toEqual([])
        expect(g.run('return ns.safe.actionText(3)')).toEqual([])
        expect(() => g.run('return ns.safe.actionText(181)')).toThrow(
            /no action slot 181/
        )
    })

    test('picking up a spell puts it on the cursor, ready to place', () => {
        const g = sample()
        g.addMacro({ name: 'Ghost Wolf', body: BODY, perCharacter: true })
        g.setAction(1, { type: 'macro', name: 'Ghost Wolf' })

        g.run('ns.safe.pickupSpell(2645); ns.safe.placeAction(1)')

        expect(g.actions()).toEqual({ 1: { type: 'spell', id: 2645 } })
        expect(g.cursor()).toEqual({
            type: 'macro',
            name: 'Ghost Wolf',
            perCharacter: true,
        })
        expect(() => g.run('ns.safe.pickupSpell("Ghost Wolf")')).toThrow(
            /needs a spell ID/
        )
    })

    test('action info tells a spell, a macro, anything else and an empty slot apart', () => {
        const g = sample()
        g.addMacro({ name: 'Earth Shock', body: BODY, perCharacter: true })
        g.setAction(1, { type: 'spell', id: 8042 })
        g.setAction(2, { type: 'macro', name: 'Earth Shock' })
        g.setAction(3, { type: 'item', id: 6948 })

        expect(g.run('return ns.safe.actionInfo(1)')).toEqual([
            'spell',
            8042,
            'spell',
        ])
        expect(g.run('return ns.safe.actionInfo(2)')).toEqual([
            'macro',
            121,
            '',
        ])
        expect(g.run('return ns.safe.actionInfo(3)')).toEqual([
            'item',
            6948,
            '',
        ])
        expect(g.run('return ns.safe.actionInfo(4)')).toEqual([])
    })

    test('the action slots run from 1 to 180; any other slot fails loudly', () => {
        const g = sample()
        expect(g.run('return ns.safe.actionInfo(180)')).toEqual([])
        expect(() => g.run('return ns.safe.actionInfo(181)')).toThrow(
            /no action slot 181/
        )
        expect(() => g.run('return ns.safe.actionInfo(0)')).toThrow(
            /no action slot 0/
        )
    })

    test('placing an action puts what the cursor holds in the slot and picks up what was there', () => {
        const g = sample()
        g.addMacro({ name: 'Earth Shock', body: BODY, perCharacter: true })
        g.setAction(7, { type: 'spell', id: 8044 })
        expect(g.run('return ns.safe.cursorInfo()')).toEqual([])

        g.run('ns.safe.pickupMacro(121)')
        expect(g.cursor()).toEqual({
            type: 'macro',
            name: 'Earth Shock',
            perCharacter: true,
        })
        expect(g.run('return ns.safe.cursorInfo()')).toEqual(['macro', 121])

        g.run('ns.safe.placeAction(7)')
        expect(g.actions()).toEqual({
            7: { type: 'macro', name: 'Earth Shock', perCharacter: true },
        })
        expect(g.cursor()).toEqual({ type: 'spell', id: 8044 })

        g.run('ns.safe.clearCursor()')
        expect(g.cursor()).toBeNull()
    })

    test('placing with an empty cursor changes nothing, and picking up a macro that does not exist fails loudly', () => {
        const g = sample()
        g.setAction(1, { type: 'spell', id: 403 })
        g.run('ns.safe.placeAction(1)')
        expect(g.actions()).toEqual({ 1: { type: 'spell', id: 403 } })
        expect(() => g.run('ns.safe.pickupMacro(121)')).toThrow(
            /no macro at index 121/
        )
    })

    test('a macro on a bar stays put when a new macro reorders the list', () => {
        const g = sample()
        g.addMacro({
            name: 'Mount',
            body: '/cast Ghost Wolf',
            perCharacter: true,
        })
        g.setAction(1, { type: 'macro', name: 'Mount' })
        expect(g.run('return ns.safe.actionInfo(1)')).toEqual([
            'macro',
            121,
            '',
        ])

        g.run('ns.safe.createMacro("Earth Shock", 134400, "", true)')

        expect(g.run('return ns.safe.actionInfo(1)')).toEqual([
            'macro',
            122,
            '',
        ])
        expect(g.actions()).toEqual({
            1: { type: 'macro', name: 'Mount', perCharacter: true },
        })
    })

    test('a test can put something on the cursor', () => {
        const g = sample()
        g.setCursor({ type: 'item', id: 6948 })
        expect(g.run('return ns.safe.cursorInfo()')).toEqual(['item', 6948])
        expect(g.cursor()).toEqual({ type: 'item', id: 6948 })
    })
})
