/**
 * The export reader, ported to the browser (`src/browser-sim/`): a
 * SavedVariables parser with no Lua VM, and `readExport(text, pool)`, which
 * turns a `TurboCharExport.lua` into the character `simCharacter` sims
 * (calibrated through `pool.sheet`) or a stop. Driven from outside under Bun
 * with the real WASM. Exports are written by `exportFromCharacter` from
 * Testchar (`testcharCharacter(pool)`) until #83.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { parseSavedVariables } from '../src/browser-sim'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')

/** Text with CRLF line endings, as the game writes SavedVariables. */
function crlf(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

const MADE_UP = String.raw`-- Saved by a made-up addon
MadeUpVars = {
	["name"] = "Line one\nSays \"hi\" and \\ back \065BC",
	["count"] = -12,
	["ratio"] = 1.5e3,
	["tiny"] = -2.5E-2,
	["whole"] = 7,
	["flag"] = true,
	["off"] = false,
	["gone"] = nil,
	["big"] = inf,
	["odd"] = nan,
	["list"] = {
		"first", -- [1]
		"second", -- [2]
	},
	["holes"] = {
		[1] = "a",
		[3] = "c",
	},
	["gaps"] = {
		"x", -- [1]
		nil, -- [2]
		"z", -- [3]
	},
	["nested"] = {
		["deep"] = {
			[1] = {
				["id"] = 252504,
				["enchant"] = -1,
			},
		},
	},
	bare = "plain key", -- a comment after a value
}
-- a comment between variables
OtherVars = 42
EmptyVars = {
}
`

const MADE_UP_OBJECTS = {
    MadeUpVars: {
        name: 'Line one\nSays "hi" and \\ back ABC',
        count: -12,
        ratio: 1500,
        tiny: -0.025,
        whole: 7,
        flag: true,
        off: false,
        big: null,
        odd: null,
        list: { '1': 'first', '2': 'second' },
        holes: { '1': 'a', '3': 'c' },
        gaps: { '1': 'x', '3': 'z' },
        nested: { deep: { '1': { id: 252504, enchant: -1 } } },
        bare: 'plain key',
    },
    OtherVars: 42,
    EmptyVars: {},
}

describe('parseSavedVariables', () => {
    test('reads a made-up SavedVariables file into the objects spelled out by hand: nil left out, inf and nan as null, arrays keep their numbering', () => {
        expect(parseSavedVariables(MADE_UP)).toEqual(MADE_UP_OBJECTS)
    })

    test('reads the made-up file with CRLF line endings, and a backslash-CRLF escape, into the same objects', () => {
        expect(parseSavedVariables(crlf(MADE_UP))).toEqual(MADE_UP_OBJECTS)
        const wrapped = 'Wrapped = "one\\\r\ntwo"\r\n'
        expect(parseSavedVariables(wrapped)).toEqual({ Wrapped: 'one\ntwo' })
    })

    test('reads fixtures/truncha-export-buffed.lua without error', async () => {
        const text = await Bun.file(BUFFED).text()
        const vars = parseSavedVariables(text)
        expect(Object.keys(vars).length).toBeGreaterThan(0)
        for (const value of Object.values(vars))
            expect(typeof value).toBe('object')
        expect(parseSavedVariables(crlf(text))).toEqual(vars)
    })

    test('a ["__proto__"] key sets no prototype: ({}).polluted stays undefined and the parsed table has no polluted property through its prototype', () => {
        const vars = parseSavedVariables(
            'TurboCharExportDB = { ["__proto__"] = { ["polluted"] = true } }'
        )
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
        expect((Object.prototype as Record<string, unknown>).polluted).toBe(
            undefined
        )
        const db = vars.TurboCharExportDB as Record<string, unknown>
        expect(typeof db).toBe('object')
        const proto = Object.getPrototypeOf(db) as object | null
        expect(proto === null || proto === Object.prototype).toBe(true)
        expect(db.polluted).toBeUndefined()
        expect('polluted' in db).toBe(false)
    })

    test('["constructor"] and ["prototype"] keys, next to a ["__proto__"] key, parse without throwing and change neither Object.prototype nor the parsed table\'s prototype', () => {
        const before = Object.getOwnPropertyNames(Object.prototype).sort()
        const ctor = Object.prototype.constructor
        const text =
            'TurboCharExportDB = { ["constructor"] = 1, ["prototype"] = 2, ["__proto__"] = { ["x"] = 1 } }\nPlain = {}'
        let vars: Record<string, unknown> = {}
        expect(() => {
            vars = parseSavedVariables(text)
        }).not.toThrow()
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(
            before
        )
        expect(Object.prototype.constructor).toBe(ctor)
        const db = vars.TurboCharExportDB as object
        const proto = Object.getPrototypeOf(db) as object | null
        expect(proto === null || proto === Object.prototype).toBe(true)
        expect(proto).toBe(Object.getPrototypeOf(vars.Plain as object))
    })
})
