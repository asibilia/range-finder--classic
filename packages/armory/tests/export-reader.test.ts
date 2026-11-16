/**
 * The export reader, ported to the browser (`src/browser-sim/`): a
 * SavedVariables parser with no Lua VM, and `readExport(text, pool)`, which
 * turns a `TurboCharExport.lua` into the character `simCharacter` sims
 * (calibrated through `pool.sheet`) or a stop. Driven from outside under Bun
 * with the real WASM. Exports are written by `exportFromCharacter` from
 * Testchar (`testcharCharacter(pool)`) until #83.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSimPool, type SimPool } from '@goturbo/sim'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')
const EXPORT_HELPER = './helpers/export-from-character'

type Json = Record<string, unknown>
type Read = Json & { kind: string; character?: Json }

const pools: SimPool[] = []
function pool(): SimPool {
    const made = createSimPool({ base: BASE })
    pools.push(made)
    return made
}

afterAll(() => {
    for (const made of pools.splice(0)) made.close()
})

async function parse(text: string): Promise<Json> {
    const browserSim = (await import('../src/browser-sim')) as unknown as {
        parseSavedVariables: (text: string) => Json
    }
    return browserSim.parseSavedVariables(text)
}

async function read(text: string, on: SimPool): Promise<Read> {
    const { readExport } = (await import('../src/browser-sim')) as unknown as {
        readExport: (text: string, pool: SimPool) => Promise<Read>
    }
    return readExport(text, on)
}

async function testchar(on: SimPool): Promise<Json> {
    const { testcharCharacter } =
        await import('../../sim/tests/helpers/testchar')
    return (await testcharCharacter(on)) as unknown as Json
}

async function exportOf(character: Json): Promise<string> {
    const helper = (await import(EXPORT_HELPER)) as unknown as {
        exportFromCharacter: (character: unknown, sheet: unknown) => string
    }
    return helper.exportFromCharacter(character, character.sheet)
}

/** A pool that records every sim and sheet call it passes on. */
function counting(real: SimPool, calls: string[]): SimPool {
    return {
        ...real,
        size: real.size,
        sim: (...args) => {
            calls.push('sim')
            return real.sim(...args)
        },
        sheet: (...args) => {
            calls.push('sheet')
            return real.sheet(...args)
        },
        batch: (planned) => real.batch(planned),
    }
}

/** Gear without its empty slots. */
function worn(gear: unknown): Json {
    return Object.fromEntries(
        Object.entries((gear ?? {}) as Json).filter(([, item]) => item != null)
    )
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

describe('parseSavedVariables', () => {
    test('reads a made-up SavedVariables file into the objects spelled out by hand: nil left out, inf and nan as null, arrays keep their numbering', async () => {
        expect(await parse(MADE_UP)).toEqual({
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
        })
    })

    test('reads fixtures/truncha-export-buffed.lua without error', async () => {
        const text = await Bun.file(BUFFED).text()
        const vars = await parse(text)
        expect(Object.keys(vars).length).toBeGreaterThan(0)
        for (const value of Object.values(vars))
            expect(typeof value).toBe('object')
    })
})

describe('readExport', () => {
    test("exportFromCharacter(Testchar, its sheet) read back gives Testchar's character: same level, gear, known spells and profile after calibration", async () => {
        const on = pool()
        const character = await testchar(on)
        const outcome = await read(await exportOf(character), on)
        expect(outcome.kind).toBe('character')
        const back = outcome.character!
        expect(back.level).toBe(character.level)
        expect(worn(back.gear)).toEqual(worn(character.gear))
        expect(back.known_spells).toEqual(character.known_spells)

        const expected = character.profile as Json
        const got = back.profile as Json
        const fields = Object.keys(expected).filter((key) => key !== 'source')
        for (const key of fields) {
            const want = expected[key]
            if (typeof want === 'number')
                expect([key, got[key]]).toEqual([key, expect.closeTo(want, 6)])
            else expect([key, got[key]]).toEqual([key, want])
        }
    }, 600_000)

    test("fixtures/truncha-export-buffed.lua returns a buffed stop naming Warchief's Blessing, and no sim or sheet runs", async () => {
        const calls: string[] = []
        const outcome = await read(
            await Bun.file(BUFFED).text(),
            counting(pool(), calls)
        )
        expect(outcome).toEqual({
            kind: 'buffed',
            buffs: ["Warchief's Blessing"],
        })
        expect(calls).toEqual([])
    }, 600_000)

    test('an export of format 99 returns a format stop naming 99 and the formats the reader takes, before any sim or sheet call', async () => {
        const real = pool()
        const text = await exportOf(await testchar(real))
        const formatField = /((?:\b\w*format\w*|\["\w*format\w*"\])\s*=\s*)7\b/i
        expect(text).toMatch(formatField)
        const calls: string[] = []
        const outcome = await read(
            text.replace(formatField, '$199'),
            counting(real, calls)
        )
        expect(outcome.kind).toBe('format')
        expect(outcome.format).toBe(99)
        expect(outcome.accepted).toContain(7)
        expect(outcome.accepted).not.toContain(99)
        expect(calls).toEqual([])
    }, 600_000)

    test('an all-zero characterKey gives a character with no character_key, while a real key is kept', async () => {
        const on = pool()
        const character = await testchar(on)
        const zero = await read(
            await exportOf({
                ...character,
                character_key: '00000000000000000000000000000000',
            }),
            on
        )
        expect(zero.kind).toBe('character')
        expect(zero.character).not.toHaveProperty('character_key')

        const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
        const real = await read(
            await exportOf({ ...character, character_key: key }),
            on
        )
        expect(real.kind).toBe('character')
        expect(real.character!.character_key).toBe(key)
    }, 600_000)
})
