/**
 * The export reader, ported to the browser (`src/browser-sim/`): a
 * SavedVariables parser with no Lua VM, and `readExport(text, pool)`, which
 * turns a `TurboCharExport.lua` into the character `simCharacter` sims
 * (calibrated through `pool.sheet`) or a stop. Driven from outside under Bun
 * with the real WASM. Exports are written by `exportFromCharacter` from
 * Testchar (`testcharCharacter(pool)`) until #83.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    createSimPool,
    sheetFromSim,
    type RaidSimRequest,
    type Sheet,
    type SimPool,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import {
    testcharCharacter,
    type TestcharCharacter,
} from '../../sim/tests/helpers/testchar'
import {
    buildRequest,
    chainFor,
    parseSavedVariables,
    readExport,
    simExport,
    simSession,
    type Character,
    type ExportRead,
    type SimExportOutcome,
} from '../src/browser-sim'
import { exportCharacter } from '../src/browser-sim/export-reader'
import type { ResultsFile } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')

/** Buffs the sim can model: one from `buffs.json`, and Kings (the sim's own). */
const MARK_OF_THE_WILD = { name: 'Mark of the Wild', spellID: 5232 }
const BLESSING_OF_KINGS = { name: 'Blessing of Kings', spellID: 20217 }

type Json = Record<string, unknown>
type Buff = { name: string; spellID: number }

beforeAll(() => ensureSimBuild(), 600_000)

const pools: SimPool[] = []
function pool(): SimPool {
    const made = createSimPool({ base: BASE })
    pools.push(made)
    return made
}

afterAll(() => {
    for (const made of pools.splice(0)) made.close()
})

/** The character an export read into; a stop fails the test. */
function characterOf(read: ExportRead): Character {
    expect(read.kind).toBe('character')
    if (read.kind !== 'character') throw new Error(`a ${read.kind} stop`)
    return read.character
}

/** The file a run made; a stop fails the test. */
function fileOf(run: SimExportOutcome): ResultsFile {
    expect(run.kind).toBe('file')
    if (run.kind !== 'file') throw new Error(`a ${run.kind} stop`)
    return run.file
}

/** Text with CRLF line endings, as the game writes SavedVariables. */
function crlf(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
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
    const raid = request.raid as { parties: { players: Json[] }[] }
    return raid.parties[0]!.players[0]!
}

/**
 * Testchar's export with no buffs, and the same export saved with Mark of
 * the Wild and Blessing of Kings up: its sheet is the sim's sheet with those
 * buffs (`pool.sheet` with `sheetBuffs`), as the game would show it.
 */
async function makeBuffedExports() {
    const on = pool()
    const character = await testcharCharacter(on)
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
            character.profile
        )
    )
    return {
        on,
        character,
        markStats,
        sheet,
        plain: exportFromCharacter(character, character.sheet),
        buffed: withBuffs(exportFromCharacter(character, sheet), [
            MARK_OF_THE_WILD,
            BLESSING_OF_KINGS,
        ]),
    }
}

let buffedMemo: ReturnType<typeof makeBuffedExports> | undefined
function buffedExports() {
    buffedMemo ??= makeBuffedExports()
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
function worn(gear: object): Json {
    return Object.fromEntries(
        Object.entries(gear).filter(([, item]) => item != null)
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

describe('readExport', () => {
    test("exportFromCharacter(Testchar, its sheet) read back gives Testchar's character: same level, gear, known spells and profile after calibration", async () => {
        const on = pool()
        const plain = await testcharCharacter(on)
        // Testchar knows no spells; give it a few active ones (Lightning
        // Bolt, Earth Shock, Stormstrike), so the sheet stays the same.
        const spells = [403, 8042, 17364]
        const character: TestcharCharacter = {
            ...plain,
            known_spells: spells,
            profile: { ...plain.profile, knownSpells: spells },
        }
        const back = characterOf(
            await readExport(
                exportFromCharacter(character, character.sheet),
                on
            )
        )
        expect(back.level).toBe(character.level)
        expect(worn(back.gear)).toEqual(worn(character.gear))
        expect(back.known_spells).toEqual(spells)
        expect(back.profile.knownSpells).toEqual(spells)

        const expected: Json = character.profile
        const got: Json = back.profile
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
        const character = characterOf(
            await readExport(text.replace(buffs, '["buffs"] = {\n},'), pool())
        )
        expect(character.level).toBe(32)
        expect(character).not.toHaveProperty('character_key')
        expect(character.calibrated_spell_crit).toBe(true)
        expect(character.profile.baseHealth).toBeCloseTo(670, 0)
        expect(character.profile.baseMana).toBeCloseTo(733, 0)
        expect(character.profile.spellCritPerInt).toBeCloseTo(0.0333, 3)
    }, 600_000)

    test("fixtures/truncha-export-buffed.lua returns a buffed stop naming Warchief's Blessing, and no sim or sheet runs", async () => {
        const calls: string[] = []
        const outcome = await readExport(
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
        const character = await testcharCharacter(real)
        const text = exportFromCharacter(character, character.sheet)
        const formatField = /((?:\b\w*format\w*|\["\w*format\w*"\])\s*=\s*)7\b/i
        expect(text).toMatch(formatField)
        const calls: string[] = []
        const outcome = await readExport(
            text.replace(formatField, '$199'),
            counting(real, calls)
        )
        expect(outcome.kind).toBe('format')
        if (outcome.kind !== 'format') throw new Error('not a format stop')
        expect(outcome.format).toBe(99)
        expect(outcome.accepted).toContain(7)
        expect(outcome.accepted).not.toContain(99)
        expect(calls).toEqual([])
    }, 600_000)

    test('an all-zero characterKey gives a character with no character_key, while a real key is kept', async () => {
        const on = pool()
        const character = await testcharCharacter(on)
        const keyed = (key: string) =>
            exportFromCharacter(
                { ...character, character_key: key },
                character.sheet
            )
        const zero = characterOf(
            await readExport(keyed('00000000000000000000000000000000'), on)
        )
        expect(zero).not.toHaveProperty('character_key')

        const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
        const real = characterOf(await readExport(keyed(key), on))
        expect(real.character_key).toBe(key)
    }, 600_000)
})

/** A pool that records every data file asked for, and runs no sim or sheet. */
function dataOnly(real: SimPool, files: string[]): SimPool {
    return {
        ...real,
        size: real.size,
        data: (name) => {
            files.push(name)
            return real.data(name)
        },
        sim: () => Promise.reject(new Error('no sim expected')),
        sheet: () => Promise.reject(new Error('no sheet expected')),
    }
}

/** The owner's real export, with no buffs, and its class set to `cls`. */
async function exportWithClass(cls: string): Promise<string> {
    const text = await Bun.file(BUFFED).text()
    const buffs = /\["buffs"\] = \{\s*\{[^{}]*\},\s*\},/
    const field = '["class"] = "SHAMAN"'
    expect(text).toMatch(buffs)
    expect(text.split(field)).toHaveLength(2)
    return text
        .replace(buffs, '["buffs"] = {\n},')
        .replace(field, `["class"] = "${cls}"`)
}

describe("the export's class", () => {
    test('an export whose class is ../../etc returns an unsupported stop naming ../../etc with no spec, and makes no pool.data call', async () => {
        const files: string[] = []
        const outcome = await exportCharacter(
            await exportWithClass('../../etc'),
            dataOnly(pool(), files)
        )
        expect(outcome).toEqual({
            kind: 'unsupported',
            class: '../../etc',
            spec: '',
        })
        expect(files).toEqual([])
    })

    test('exports whose class is SHAMAN or Shaman read into a Shaman character, while the same export with class ../../etc stops before any pool.data call', async () => {
        for (const cls of ['SHAMAN', 'Shaman']) {
            const read = await exportCharacter(
                await exportWithClass(cls),
                dataOnly(pool(), [])
            )
            expect([cls, read.kind]).toEqual([cls, 'character'])
            if (read.kind !== 'character')
                throw new Error(`a ${read.kind} stop`)
            expect(read.character.class).toBe('Shaman')
            expect(read.character.level).toBe(32)
        }
        const files: string[] = []
        const stopped = await exportCharacter(
            await exportWithClass('../../etc'),
            dataOnly(pool(), files)
        )
        expect(stopped.kind).toBe('unsupported')
        expect(files).toEqual([])
    })
})

type Skill = { name: string; rank: number; modifier: number }
type Talent = { name: string; rank: number; spellID?: number }

type SmallExport = {
    level?: number | null
    characterKey?: string
    /** `identity.sex`, the game's `UnitSex`; absent: no `sex`. */
    sex?: number
    subclass?: string
    tooltip?: string[]
    enchantId?: number
    meter?: { name: string; damage: number }[]
    skills?: Skill[]
    talentList?: Talent[]
    traits?: Talent[]
    without?: string
    /** `sheet.manaRegen.outsideFiveSecondRule`; absent: no `manaRegen`. */
    oocManaRegen?: number
}

/** An Enhancement build as traits: Stormstrike, Thundering Strikes 5 and Mental Dexterity 3. */
const ENHANCEMENT_TRAITS: Talent[] = [
    { name: 'Stormstrike', rank: 1, spellID: 17364 },
    { name: 'Thundering Strikes', rank: 5, spellID: 16255 },
    { name: 'Mental Dexterity', rank: 3, spellID: 415140 },
]

const lua = (value: string | number | boolean): string =>
    typeof value === 'string' ? JSON.stringify(value) : String(value)

function luaList(rows: Record<string, string | number | boolean>[]): string {
    return rows
        .map(
            (row) =>
                `{\n${Object.entries(row)
                    .map(([k, v]) => `["${k}"] = ${lua(v)},`)
                    .join('\n')}\n},`
        )
        .join('\n')
}

/**
 * A small format-7 export, written by hand: a level-32 Orc Shaman with a
 * main hand (`Two-Handed Maces` by default) at gear index 16, no buffs, and
 * only the fields the reader reads. `without` leaves out one attribute.
 */
function smallExport(options: SmallExport = {}): string {
    const level = options.level === undefined ? 32 : options.level
    const attributes = {
        strength: 100,
        agility: 80,
        stamina: 90,
        intellect: 70,
        spirit: 60,
    }
    const stat = Object.entries(attributes)
        .filter(([name]) => name !== options.without)
        .map(
            ([name, total]) =>
                `["${name}"] = { ["total"] = ${total}, ["pos"] = 0, ["neg"] = 0 },`
        )
        .join('\n')
    const tooltip = (options.tooltip ?? ['Rage of the Storm', 'Soulbound'])
        .map((line) => `${lua(line)},`)
        .join('\n')
    const enchants =
        options.enchantId === undefined
            ? ''
            : luaList([
                  {
                      enchantID: options.enchantId,
                      hasEnchant: true,
                      enchantType: 3,
                  },
              ])
    const meter = luaList(
        (options.meter ?? []).map((spell) => ({ ...spell, overkill: 0 }))
    )
    const skills = luaList(
        (options.skills ?? []).map((skill) => ({ ...skill, maxRank: 300 }))
    )
    return `TurboCharExportDB = {
["formatVersion"] = 7,
["savedAt"] = 1763251200,
["identity"] = {
["characterKey"] = ${lua(options.characterKey ?? '')},
["class"] = "SHAMAN",
["race"] = "Orc",
${options.sex === undefined ? '' : `["sex"] = ${options.sex},`}
["name"] = "Smallchar",
["gameBuild"] = "70938",
${level === null ? '' : `["level"] = ${level},`}
},
["talents"] = {
["list"] = {
${luaList(options.talentList ?? [])}
},
["traits"] = {
${luaList(options.traits ?? ENHANCEMENT_TRAITS)}
},
},
["buffs"] = {
},
["spells"] = {
},
["bags"] = {
},
["meter"] = {
["sessions"] = {
{
["durationSeconds"] = 600,
["spells"] = {
${meter}
},
},
},
},
["weaponEnchants"] = {
["mainHand"] = {
${enchants}
},
["offHand"] = {
},
},
["gear"] = {
[16] = {
["equipLoc"] = "INVTYPE_2HWEAPON",
["link"] = "|cnIQ3:|Hitem:280604::::::::32:1489::11:::::::|h[Rage of the Storm]|h|r",
["id"] = 280604,
["name"] = "Rage of the Storm",
["tooltip"] = {
${tooltip}
},
["subclass"] = ${lua(options.subclass ?? 'Two-Handed Maces')},
["class"] = "Weapon",
["slot"] = "mainHand",
},
},
["skills"] = {
${skills}
},
["sheet"] = {
["stat"] = {
${stat}
},
["conversion"] = {
["apPer100"] = { ["strength"] = 200, ["agility"] = 0, ["stamina"] = 0, ["intellect"] = 0, ["spirit"] = 0 },
["critPer100"] = { ["agility"] = 0.0846, ["intellect"] = 0.05, ["strength"] = 0, ["stamina"] = 0, ["spirit"] = 0 },
["dodgeFromAgility"] = 0.0635,
},
["attackPower"] = { ["base"] = 300, ["pos"] = 0, ["neg"] = 0 },
["armor"] = { ["base"] = 48, ["effective"] = 744 },
["health"] = 1000,
["mana"] = 900,
["meleeCrit"] = 9.5,
["spellCrit"] = 7.2,
["dodge"] = 9.9,
["meleeHit"] = 0,
${
    options.oocManaRegen === undefined
        ? ''
        : `["manaRegen"] = { ["outsideFiveSecondRule"] = ${options.oocManaRegen}, ["insideFiveSecondRule"] = 0 },`
}
},
}
`
}

/** The character a small export reads into, with no sim run. */
async function smallCharacter(options: SmallExport = {}): Promise<Character> {
    return characterOf(
        await exportCharacter(smallExport(options), dataOnly(pool(), []))
    )
}

describe("the export reader matches the runner's characterFromExport", () => {
    test('a main-hand tooltip line Rockbiter 7 (29 min) with main-hand enchant id 9999 gives imbue RockbiterWeapon', async () => {
        const character = await smallCharacter({
            tooltip: ['Rage of the Storm', 'Soulbound', 'Rockbiter 7 (29 min)'],
            enchantId: 9999,
        })
        expect(character.imbue).toBe('RockbiterWeapon')
    })

    test('with no imbue in the tooltip and no enchant, a meter spell Windfury Attack with damage 120 gives imbue WindfuryWeapon; with damage 0, no imbue and the request has no Windfury', async () => {
        const windfury = await smallCharacter({
            meter: [
                { name: 'Attack', damage: 5000 },
                { name: 'Windfury Attack', damage: 120 },
            ],
        })
        expect(windfury.imbue).toBe('WindfuryWeapon')

        const character = await smallCharacter({
            meter: [
                { name: 'Attack', damage: 5000 },
                { name: 'Windfury Attack', damage: 0 },
            ],
        })
        expect(character.imbue ?? null).toBeNull()
        const request = buildRequest(character, 'dungeon-long', {
            seed: 1,
            iterations: 1,
        })
        const shaman = playerOf(request).enhancementShaman as {
            options: { classOptions: Json }
        }
        expect(shaman.options.classOptions).not.toHaveProperty('imbueMh')
        expect(JSON.stringify(shaman)).not.toContain('Windfury')
    })

    test("a skill row Axes at rank 145 with modifier 5 gives { skill: 'WeaponSkillAxes', value: 150 } in weapon_skills", async () => {
        const character = await smallCharacter({
            skills: [{ name: 'Axes', rank: 145, modifier: 5 }],
        })
        expect(character.weapon_skills).toContainEqual({
            skill: 'WeaponSkillAxes',
            value: 150,
        })
    })

    test('weapon_skill_deficit: level 32 with a Two-Handed Maces main hand at rank 153, modifier 0 gives 7; level 30 with Two-Handed Axes at rank 150, modifier 5 gives -5', async () => {
        const maces = await smallCharacter({
            level: 32,
            subclass: 'Two-Handed Maces',
            skills: [
                { name: 'Axes', rank: 100, modifier: 0 },
                { name: 'Two-Handed Maces', rank: 153, modifier: 0 },
            ],
        })
        expect(maces.weapon_skill_deficit).toBe(7)
        const axes = await smallCharacter({
            level: 30,
            subclass: 'Two-Handed Axes',
            skills: [{ name: 'Two-Handed Axes', rank: 150, modifier: 5 }],
        })
        expect(axes.weapon_skill_deficit).toBe(-5)
    })

    test("weapon_skill_deficit is 0 when no skill row matches the main hand's weapon skill", async () => {
        const character = await smallCharacter({
            level: 32,
            subclass: 'Two-Handed Maces',
            skills: [{ name: 'Axes', rank: 100, modifier: 0 }],
        })
        expect(character.weapon_skill_deficit).toBe(0)
    })

    test('level 32 with a Defense row at rank 157 gives profile.baseDodgePercent 1.58, and no Defense row gives 1.7', async () => {
        const defended = await smallCharacter({
            level: 32,
            skills: [{ name: 'Defense', rank: 157, modifier: 0 }],
        })
        expect(defended.profile.baseDodgePercent).toBeCloseTo(1.58, 6)
        const none = await smallCharacter({ level: 32, skills: [] })
        expect(none.profile.baseDodgePercent).toBeCloseTo(1.7, 6)
    })

    test('level 32 gives profile.baseAttackPower 44 (2 per level less 20), whatever the sheet says', async () => {
        const character = await smallCharacter({ level: 32 })
        expect(character.profile.baseAttackPower).toBe(44)
    })

    test('talents.list with Thundering Strikes rank 5, Mental Dexterity rank 3 and Stormstrike rank 1, and empty traits, gives the talent string -050030000001', async () => {
        const character = await smallCharacter({
            talentList: [
                { name: 'Thundering Strikes', rank: 5 },
                { name: 'Mental Dexterity', rank: 3 },
                { name: 'Stormstrike', rank: 1 },
            ],
            traits: [],
        })
        expect(character.talents).toBe('-050030000001')
    })

    test('an export with no identity.level rejects with the export has no level', async () => {
        await expect(
            exportCharacter(smallExport({ level: null }), dataOnly(pool(), []))
        ).rejects.toThrow('the export has no level')
    })

    test('an export with no agility rejects with the export lacks agility', async () => {
        await expect(
            exportCharacter(
                smallExport({ without: 'agility' }),
                dataOnly(pool(), [])
            )
        ).rejects.toThrow('the export lacks agility')
    })

    test('character keys: the all-zero key, aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa and Player-1-0000000A give none, while cf765509-937b-4147-8e33-677e3eef7065 is kept', async () => {
        for (const key of [
            '00000000-00000000-00000000-00000000',
            'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            'Player-1-0000000A',
        ]) {
            const character = await smallCharacter({ characterKey: key })
            expect([key, character.character_key]).toEqual([key, undefined])
        }
        const real = 'cf765509-937b-4147-8e33-677e3eef7065'
        const kept = await smallCharacter({ characterKey: real })
        expect(kept.character_key).toBe(real)
    })

    test('identity.sex 2 gives gender male, 3 gives female, and 1 or no sex gives no gender', async () => {
        expect((await smallCharacter({ sex: 2 })).gender).toBe('male')
        expect((await smallCharacter({ sex: 3 })).gender).toBe('female')
        expect(await smallCharacter({ sex: 1 })).not.toHaveProperty('gender')
        expect(await smallCharacter()).not.toHaveProperty('gender')
    })
})

/**
 * The chain fight simmed through a fake pool whose every pull ends at
 * `endMana`: the pulls' results and the requests the pool got.
 */
async function chainEndingAt(
    character: Character,
    endMana: number,
    maxMana: number
) {
    const requests: RaidSimRequest[] = []
    const fake: SimPool = {
        ...dataOnly(pool(), []),
        sim: (request) => {
            requests.push(request)
            const player = {
                name: character.name,
                dps: { avg: 100 },
                timeline: [
                    { tS: 0, mana: maxMana },
                    { tS: 25, mana: endMana },
                ],
            }
            return Promise.resolve({
                raidMetrics: { parties: [{ players: [player] }] },
            } as unknown as Awaited<ReturnType<SimPool['sim']>>)
        },
    }
    const sheet: Sheet = {
        ...character.sheet,
        mana: maxMana,
        spirit: 60,
    } as Sheet
    const result = await simSession(
        fake,
        character,
        chainFor(character.level),
        character.gear,
        sheet,
        () => undefined,
        {}
    )
    const startPct = requests.map(
        (request) => playerOf(request).startingManaPercent
    )
    return { pulls: result.pulls ?? [], startPct }
}

describe("mana between the chain's pulls at the export's out-of-combat rate", () => {
    test('with outsideFiveSecondRule 7.5 and a pull ending at 400 of 1500 mana, the next pull starts at 490', async () => {
        const character = await smallCharacter({ oocManaRegen: 7.5 })
        expect(character.ooc_mana_regen).toBe(7.5)
        const { pulls, startPct } = await chainEndingAt(character, 400, 1500)
        expect(pulls).toHaveLength(10)
        expect(pulls[0]?.mana_end).toBe(400)
        expect(pulls[1]?.mana_start).toBe(490)
        expect(startPct[1]).toBeCloseTo((490 / 1500) * 100, 6)
    })

    test('with outsideFiveSecondRule 100 and a pull ending at 400 of 1500 mana, the next pull starts at 1500, not above max mana', async () => {
        const character = await smallCharacter({ oocManaRegen: 100 })
        const { pulls, startPct } = await chainEndingAt(character, 400, 1500)
        for (const pull of pulls.slice(1)) expect(pull.mana_start).toBe(1500)
        expect(startPct[1]).toBe(100)
    })

    test('with no manaRegen in the export, ooc_mana_regen is 0 and a pull ending at 400 of 1500 mana starts the next at 400', async () => {
        const character = await smallCharacter()
        expect(character.ooc_mana_regen).toBe(0)
        const { pulls, startPct } = await chainEndingAt(character, 400, 1500)
        expect(pulls[1]?.mana_start).toBe(400)
        expect(startPct[1]).toBeCloseTo((400 / 1500) * 100, 6)
    })
})

describe('an export saved with buffs the sim can model', () => {
    test("an export saved with Mark of the Wild and Blessing of Kings up reads into a character whose sheet_buffs hold Mark of the Wild's stats and Kings, with the same base health and mana as the export with no buffs", async () => {
        const { on, character, markStats, sheet, plain, buffed } =
            await buffedExports()
        // The buffs changed the sheet the export carries.
        expect(sheet.strength).toBeGreaterThan(character.sheet.strength)

        const withThem = characterOf(await readExport(buffed, on))
        const without = characterOf(await readExport(plain, on))
        expect(without).not.toHaveProperty('sheet_buffs')
        expect(withThem.sheet_buffs).toBeDefined()
        const buffs = withThem.sheet_buffs!
        expect(buffs.kings).toBe(true)
        expect(buffs.stats.slice(0, markStats.length)).toEqual(markStats)
        expect(buffs.stats.slice(markStats.length).every((v) => v === 0)).toBe(
            true
        )

        // Calibration ran with the buffs, so they didn't land in the bases
        // (each sheet is rounded to whole points, hence within 1).
        for (const field of ['baseHealth', 'baseMana'] as const) {
            const gap = Math.abs(
                withThem.profile[field] - without.profile[field]
            )
            expect([field, gap <= 1]).toEqual([field, true])
        }
    }, 600_000)

    test('with the real WASM, that export passes every sheet gate, gives a file with sheet_buffed true, plans the extra unbuffed sheet in pool.batch, and sends the same fight requests as the export with no buffs', async () => {
        const { on, markStats, plain, buffed } = await buffedExports()
        const plainLog: CallLog = { sims: [], sheets: [], batches: [] }
        const buffedLog: CallLog = { sims: [], sheets: [], batches: [] }
        const plainRun = await simExport(plain, logging(on, plainLog), () => {})
        const buffedRun = await simExport(
            buffed,
            logging(on, buffedLog),
            () => {}
        )
        const plainFile = fileOf(plainRun)
        const file = fileOf(buffedRun)

        expect(file.sheet_buffed).toBe(true)
        expect(plainFile.sheet_buffed).toBe(false)
        const sheetGates = file.checks.filter((check) =>
            check.name.startsWith('sheet ')
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

        // A run plans every call in its one batch: the gates' extra sheet
        // (with no buffs) is planned up front and run.
        expect(plainLog.batches).toHaveLength(1)
        expect(buffedLog.batches).toEqual([plainLog.batches[0]! + 1])
        expect(buffedLog.sheets).toHaveLength(plainLog.sheets.length + 1)

        // The fights sim the character with no buffs: the same requests.
        const sorted = (requests: RaidSimRequest[]) =>
            requests.map((request) => JSON.stringify(request)).sort()
        expect(buffedLog.sims.length).toBeGreaterThan(1)
        expect(sorted(buffedLog.sims)).toEqual(sorted(plainLog.sims))
    }, 600_000)
})
