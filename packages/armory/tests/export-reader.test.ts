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

import {
    createSimPool,
    sheetFromSim,
    type RaidSimRequest,
    type SimPool,
} from '@goturbo/sim'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')
const EXPORT_HELPER = './helpers/export-from-character'

/** Buffs the sim can model: one from `buffs.json`, and Kings (the sim's own). */
const MARK_OF_THE_WILD = { name: 'Mark of the Wild', spellID: 5232 }
const BLESSING_OF_KINGS = { name: 'Blessing of Kings', spellID: 20217 }

type Json = Record<string, unknown>
type Read = Json & { kind: string; character?: Json }
type Buff = { name: string; spellID: number }
type SimExportRun = Json & {
    kind: string
    file?: Json & { sheet_buffed?: boolean; checks: Json[] }
}

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
    simExport: (
        text: string,
        pool: SimPool,
        onProgress: (done: number, planned: number) => void
    ) => Promise<SimExportRun>
    buildRequest: (
        character: unknown,
        fight: string,
        options: {
            seed: number
            iterations: number
            sheetBuffs?: { stats: number[]; kings: boolean }
        }
    ) => RaidSimRequest
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

async function exportOf(
    character: Json,
    sheet: unknown = character.sheet
): Promise<string> {
    const helper = (await import(EXPORT_HELPER)) as unknown as {
        exportFromCharacter: (character: unknown, sheet: unknown) => string
    }
    return helper.exportFromCharacter(character, sheet)
}

/**
 * The export with `buffs` up, listed as the export addon writes them (as in
 * `fixtures/truncha-export-buffed.lua`): `exportFromCharacter` writes none.
 */
function withBuffs(text: string, buffs: Buff[]): string {
    const none = '["buffs"] = {\n}'
    expect(text.split(none)).toHaveLength(2)
    const entries = buffs.map(
        (buff) =>
            `{\n["name"] = "${buff.name}",\n["spellID"] = ${buff.spellID},\n},`
    )
    return text.replace(none, `["buffs"] = {\n${entries.join('\n')}\n}`)
}

type CallLog = {
    sims: RaidSimRequest[]
    sheets: RaidSimRequest[]
    batches: number[]
}

/** A pool that keeps every sim and sheet request, and every batch planned. */
function logging(real: SimPool, log: CallLog): SimPool {
    return {
        ...real,
        size: real.size,
        sim: (request, profile) => {
            log.sims.push(request)
            return real.sim(request, profile)
        },
        sheet: (request, profile) => {
            log.sheets.push(request)
            return real.sheet(request, profile)
        },
        batch: (planned) => {
            log.batches.push(planned)
            real.batch(planned)
        },
    }
}

/** The one player a request sims. */
function playerOf(request: RaidSimRequest): Json {
    const raid = (request as unknown as Json).raid as {
        parties: { players: Json[] }[]
    }
    return raid.parties[0]!.players[0]!
}

let buffedMemo:
    | Promise<{
          on: SimPool
          character: Json
          markStats: number[]
          sheet: { strength: number }
          plain: string
          buffed: string
      }>
    | undefined
/**
 * Testchar's export with no buffs, and the same export saved with Mark of
 * the Wild and Blessing of Kings up: its sheet is the sim's sheet with those
 * buffs (`pool.sheet` with `sheetBuffs`), as the game would show it.
 */
function buffedExports() {
    buffedMemo ??= (async () => {
        const on = pool()
        const { buildRequest } = await browserSim()
        const character = await testchar(on)
        const known = (await on.data('buffs.json')) as Record<
            string,
            { stats: number[] }
        >
        const markStats = known[String(MARK_OF_THE_WILD.spellID)]!.stats
        const sheet = sheetFromSim(
            await on.sheet(
                buildRequest(character, 'dungeon-long', {
                    seed: 23,
                    iterations: 4000,
                    sheetBuffs: { stats: markStats, kings: true },
                }),
                character.profile as never
            )
        )
        return {
            on,
            character,
            markStats,
            sheet,
            plain: await exportOf(character),
            buffed: withBuffs(await exportOf(character, sheet), [
                MARK_OF_THE_WILD,
                BLESSING_OF_KINGS,
            ]),
        }
    })()
    return buffedMemo
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

describe('an export saved with buffs the sim can model', () => {
    test("an export saved with Mark of the Wild and Blessing of Kings up reads into a character whose sheet_buffs hold Mark of the Wild's stats and Kings, with the same base health and mana as the export with no buffs", async () => {
        const { on, character, markStats, sheet, plain, buffed } =
            await buffedExports()
        // The buffs changed the sheet the export carries.
        expect(sheet.strength).toBeGreaterThan(
            (character.sheet as { strength: number }).strength
        )

        const withThem = await read(buffed, on)
        const without = await read(plain, on)
        expect(withThem.kind).toBe('character')
        expect(without.kind).toBe('character')
        expect(without.character).not.toHaveProperty('sheet_buffs')
        const buffs = withThem.character!.sheet_buffs as {
            stats: number[]
            kings: boolean
        }
        expect(buffs.kings).toBe(true)
        expect(buffs.stats.slice(0, markStats.length)).toEqual(markStats)
        expect(buffs.stats.slice(markStats.length).every((v) => v === 0)).toBe(
            true
        )

        // Calibration ran with the buffs, so they didn't land in the bases
        // (each sheet is rounded to whole points, hence within 1).
        const got = withThem.character!.profile as Json
        const want = without.character!.profile as Json
        for (const field of ['baseHealth', 'baseMana']) {
            const gap = Math.abs(
                (got[field] as number) - (want[field] as number)
            )
            expect([field, gap <= 1]).toEqual([field, true])
        }
    }, 600_000)

    test('with the real WASM, that export passes every sheet gate, gives a file with sheet_buffed true, plans the extra unbuffed sheet in pool.batch, and sends the same fight requests as the export with no buffs', async () => {
        const { simExport } = await browserSim()
        const { on, markStats, plain, buffed } = await buffedExports()
        const plainLog: CallLog = { sims: [], sheets: [], batches: [] }
        const buffedLog: CallLog = { sims: [], sheets: [], batches: [] }
        const plainRun = await simExport(plain, logging(on, plainLog), () => {})
        const buffedRun = await simExport(
            buffed,
            logging(on, buffedLog),
            () => {}
        )
        expect(plainRun.kind).toBe('file')
        expect(buffedRun.kind).toBe('file')

        const file = buffedRun.file!
        expect(file.sheet_buffed).toBe(true)
        expect(plainRun.file!.sheet_buffed).toBe(false)
        const sheetGates = file.checks.filter((check) =>
            String(check.name).startsWith('sheet ')
        )
        expect(sheetGates.map((check) => check.name)).toContain(
            'sheet strength'
        )
        expect(sheetGates.filter((check) => check.passed !== true)).toEqual([])

        // The buffed sheets went to the sim with Kings and Mark of the
        // Wild's stats, and the strict parse took them.
        const kingsSheets = buffedLog.sheets.filter(
            (request) =>
                (playerOf(request).buffs as Json | undefined)
                    ?.greaterBlessingOfKings === true
        )
        expect(kingsSheets.length).toBeGreaterThan(0)
        for (const request of kingsSheets) {
            const bonus = playerOf(request).bonusStats as { stats: number[] }
            expect(bonus.stats.slice(0, markStats.length)).toEqual(markStats)
        }

        // The gates' extra sheet (with no buffs) is planned and run.
        expect(plainLog.batches).toHaveLength(2)
        expect(buffedLog.batches).toEqual([
            plainLog.batches[0],
            plainLog.batches[1]! + 1,
        ])
        expect(buffedLog.sheets).toHaveLength(plainLog.sheets.length + 1)

        // The fights sim the character with no buffs: the same requests.
        const sorted = (requests: RaidSimRequest[]) =>
            requests.map((request) => JSON.stringify(request)).sort()
        expect(buffedLog.sims.length).toBeGreaterThan(1)
        expect(sorted(buffedLog.sims)).toEqual(sorted(plainLog.sims))
    }, 600_000)
})
