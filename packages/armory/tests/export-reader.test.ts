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

const BROWSER_SIM = '../src/browser-sim'
const TESTCHAR_HELPER = '../../sim/tests/helpers/testchar'

type BrowserSim = {
    parseSavedVariables: (text: string) => Json
    readExport: (text: string, pool: SimPool) => Promise<Read>
}

async function browserSim(): Promise<BrowserSim> {
    return (await import(BROWSER_SIM)) as BrowserSim
}

async function parse(text: string): Promise<Json> {
    return (await browserSim()).parseSavedVariables(text)
}

async function read(text: string, on: SimPool): Promise<Read> {
    return (await browserSim()).readExport(text, on)
}

type TestcharHelper = { testcharCharacter: (pool: SimPool) => Promise<Json> }

async function testchar(on: SimPool): Promise<Json> {
    const helper = (await import(TESTCHAR_HELPER)) as TestcharHelper
    return helper.testcharCharacter(on)
}

/** Text with CRLF line endings, as the game writes SavedVariables. */
function crlf(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
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
    test('reads a made-up SavedVariables file into the objects spelled out by hand: nil left out, inf and nan as null, arrays keep their numbering', async () => {
        expect(await parse(MADE_UP)).toEqual(MADE_UP_OBJECTS)
    })

    test('reads the made-up file with CRLF line endings, and a backslash-CRLF escape, into the same objects', async () => {
        expect(await parse(crlf(MADE_UP))).toEqual(MADE_UP_OBJECTS)
        const wrapped = 'Wrapped = "one\\\r\ntwo"\r\n'
        expect(await parse(wrapped)).toEqual({ Wrapped: 'one\ntwo' })
    })

    test('reads fixtures/truncha-export-buffed.lua without error', async () => {
        const text = await Bun.file(BUFFED).text()
        const vars = await parse(text)
        expect(Object.keys(vars).length).toBeGreaterThan(0)
        for (const value of Object.values(vars))
            expect(typeof value).toBe('object')
        expect(await parse(crlf(text))).toEqual(vars)
    })
})

describe('readExport', () => {
    test("exportFromCharacter(Testchar, its sheet) read back gives Testchar's character: same level, gear, known spells and profile after calibration", async () => {
        const on = pool()
        const plain = await testchar(on)
        // Testchar knows no spells; give it a few active ones (Lightning
        // Bolt, Earth Shock, Stormstrike), so the sheet stays the same.
        const spells = [403, 8042, 17364]
        const character: Json = {
            ...plain,
            known_spells: spells,
            profile: { ...(plain.profile as Json), knownSpells: spells },
        }
        const outcome = await read(await exportOf(character), on)
        expect(outcome.kind).toBe('character')
        const back = outcome.character!
        expect(back.level).toBe(character.level)
        expect(worn(back.gear)).toEqual(worn(character.gear))
        expect(back.known_spells).toEqual(spells)
        expect((back.profile as Json).knownSpells).toEqual(spells)

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

    test("the owner's real format-7 export with its buff taken out calibrates as the runner did: base health 670, base mana 733, spell crit per Intellect 0.0333, and no character_key for its all-zero key", async () => {
        const text = await Bun.file(BUFFED).text()
        const buffs = /\["buffs"\] = \{\s*\{[^{}]*\},\s*\},/
        expect(text).toMatch(buffs)
        const outcome = await read(
            text.replace(buffs, '["buffs"] = {\n},'),
            pool()
        )
        expect(outcome.kind).toBe('character')
        const character = outcome.character!
        expect(character.level).toBe(32)
        expect(character).not.toHaveProperty('character_key')
        expect(character.calibrated_spell_crit).toBe(true)
        const profile = character.profile as Json
        expect(profile.baseHealth).toBeCloseTo(670, 0)
        expect(profile.baseMana).toBeCloseTo(733, 0)
        expect(profile.spellCritPerInt).toBeCloseTo(0.0333, 3)
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
