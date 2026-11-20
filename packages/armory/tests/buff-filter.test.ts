/**
 * Unit tests for `#85` buff reading, classification, calibration lookup,
 * and extra-field ignoring (`buff-filter.ts` + `export-reader.ts`).
 */
import { describe, expect, test } from 'bun:test'

import type { SimPool, SimSheet } from '@goturbo/sim'

import {
    buffCheckDetail,
    classifyBuff,
    readBuff,
    type KnownBuffs,
    type SavedValue,
} from '../src/browser-sim'
import { calibrate, exportCharacter } from '../src/browser-sim/export-reader'

const KNOWN: KnownBuffs = {
    '1461': { stats: Array.from({ length: 40 }, (_, i) => (i === 3 ? 15 : 0)) },
    '5234': {
        stats: Array.from({ length: 40 }, (_, i) =>
            i <= 3 || i === 13 ? 8 : i === 27 ? 203 : 0
        ),
    },
    '1248406': {
        stats: Array.from({ length: 40 }, (_, i) => (i === 2 ? 1 : 0)),
    },
}

describe('readBuff source vocabularies and malformed row handling', () => {
    test('format 7 clears source, points, and description; formats 8–10 map source vocabularies', () => {
        const f7 = readBuff(
            {
                name: "Warchief's Blessing",
                spellID: 16609,
                source: 'other',
                points: { '1': 300 },
                description: 'Increases health by 300.',
            },
            7
        )
        expect(f7).toEqual({
            name: "Warchief's Blessing",
            spellID: 16609,
            source: null,
            points: {},
            description: null,
            malformed: false,
        })

        expect(
            readBuff({ name: 'X', spellID: 1, source: 'none' }, 8).source
        ).toBe('none')
        expect(
            readBuff({ name: 'X', spellID: 1, source: 'none' }, 9).source
        ).toBe('none')
        expect(
            readBuff({ name: 'X', spellID: 1, source: 'other player' }, 10)
                .source
        ).toBe('other player')
        expect(
            readBuff({ name: 'X', spellID: 1, source: 'not a player' }, 10)
                .source
        ).toBe('not a player')
        expect(
            readBuff({ name: 'X', spellID: 1, source: 'unknown' }, 10).source
        ).toBeNull()
        expect(
            readBuff({ name: 'X', spellID: 1, source: 'alien' }, 10).source
        ).toBeNull()
    })

    test('descriptionMissing === "not loaded" clears description even when a string is present', () => {
        const buff = readBuff(
            {
                name: "Warchief's Blessing",
                spellID: 16609,
                source: 'not a player',
                points: {},
                description: 'Increases hitpoints by 300.',
                descriptionMissing: 'not loaded',
            },
            10
        )
        expect(buff.malformed).toBe(false)
        expect(buff.description).toBeNull()
        const classified = classifyBuff(buff, KNOWN)
        expect(classified.filtered.how).toBe('unknown')
        expect(classified.crossCheck).toEqual({
            health: 300,
            mp5: 10,
            haste_pct: 15,
        })
    })

    test('secretValues and pointsSeen allow classification when required numbers are visible, and unknown when missing', () => {
        const visible = readBuff(
            {
                name: 'Well Fed',
                spellID: 1248406,
                source: 'self',
                points: { '1': 5 },
                pointsSeen: 1,
                secretValues: 1,
                description:
                    'A nutritious meal has made you Well Fed, increasing your Stamina.',
            },
            10
        )
        expect(classifyBuff(visible, KNOWN).filtered).toMatchObject({
            how: 'game_numbers',
            how_detail: "list (numbers from the game's points)",
            numbers: { stamina: 5 },
        })

        const missing = readBuff(
            {
                name: 'Well Fed',
                spellID: 1248406,
                source: 'self',
                points: {},
                pointsSeen: 0,
                secretValues: 1,
                description:
                    'A nutritious meal has made you Well Fed, increasing your Stamina.',
            },
            10
        )
        expect(classifyBuff(missing, KNOWN).filtered.how).toBe('unknown')
    })

    test('malformed optional fields wipe metadata, coerce spellID to int, and never let 1248406 fall back to modelled', () => {
        const badRows: SavedValue[] = [
            { name: 'Well Fed', spellID: 1248406, points: 'bad' },
            {
                name: 'Well Fed',
                spellID: 1248406,
                points: [5] as unknown as SavedValue,
            },
            { name: 'Well Fed', spellID: 1248406, points: { x: 1 } },
            { name: 'Well Fed', spellID: 1248406, pointsSeen: -1 },
            { name: 'Well Fed', spellID: 1248406, pointsSeen: 1.5 },
            { name: 'Well Fed', spellID: 1248406, secretValues: null },
            { name: 'Well Fed', spellID: 1248406, description: 123 },
            { name: 'Well Fed', spellID: 1248406, source: 42 },
            { name: 'Well Fed', spellID: 1248406, descriptionMissing: 99 },
        ]
        for (const raw of badRows) {
            const buff = readBuff(raw, 10)
            expect(buff.malformed).toBe(true)
            expect(buff.source).toBeNull()
            expect(buff.points).toEqual({})
            expect(buff.description).toBeNull()
            expect(classifyBuff(buff, KNOWN).filtered.how).toBe('unknown')
        }

        // Malformed modelled spell (1461) and no-stats name rule (Ghost Wolf) still apply cleanly.
        const malformedIntellect = readBuff(
            { name: 'Arcane Intellect', spellID: 1461, points: 'bad' },
            10
        )
        expect(classifyBuff(malformedIntellect, KNOWN).filtered.how).toBe(
            'modelled'
        )
        const malformedWolf = readBuff(
            { name: 'Ghost Wolf', spellID: 2645, secretValues: -1 },
            10
        )
        expect(classifyBuff(malformedWolf, KNOWN).filtered).toMatchObject({
            how: 'no_stats',
            how_detail: 'no_stats (name rule)',
        })

        // Float spellID coerces to 0 so z.int() never receives a non-integer.
        expect(readBuff({ name: 'Bad', spellID: 1461.5 }, 10).spellID).toBe(0)
        expect(
            readBuff(['not', 'a', 'table'] as unknown as SavedValue, 10).name
        ).toBe('')
    })
})

describe('ALLOW_LIST, description parsing, and no-effect rules', () => {
    test('16609 emits canonical key order { health: 300, mp5: 10, haste_pct: 15 } and rejects contradicting points', () => {
        const buff = readBuff(
            {
                name: "Warchief's Blessing",
                spellID: 16609,
                source: 'not a player',
                points: { '1': 300, '2': 15, '3': 10 },
                description:
                    'Increases hitpoints by 300. Increases melee haste by 15%. Regenerates 10 mana every 5 seconds.',
            },
            10
        )
        const classified = classifyBuff(buff, KNOWN)
        expect(classified.filtered.how).toBe('game_numbers')
        expect(Object.entries(classified.filtered.numbers ?? {})).toEqual([
            ['health', 300],
            ['mp5', 10],
            ['haste_pct', 15],
        ])
        expect(buffCheckDetail([classified.filtered])).toContain(
            '(health 300, mp5 10, haste_pct 15)'
        )

        // Missing description with contradicting non-empty point must not become crossCheck.
        const contradicted = readBuff(
            {
                name: "Warchief's Blessing",
                spellID: 16609,
                source: 'none',
                points: { '1': 999 },
            },
            8
        )
        expect(classifyBuff(contradicted, KNOWN).crossCheck).toBeUndefined()
    })

    test('19850 expands |4singular:plural; and avoids misparsing restore/regen text as max mana; 782 matches damage_shield', () => {
        const wisdom = readBuff(
            {
                name: 'Blessing of Wisdom',
                spellID: 19850,
                source: 'none',
                points: { '1': 18 },
                description:
                    'Places a Blessing on the friendly target, increasing mana regeneration by 18 mana every 5 seconds.  Lasts 1|4hour:hrs;.',
            },
            8
        )
        expect(classifyBuff(wisdom, KNOWN).filtered).toMatchObject({
            how: 'no_stats',
            how_detail: 'list',
            numbers: { mp5: 18 },
        })

        // Sentence with "Restores 18 mana" (without "every 5 seconds") must NOT match max mana.
        const restoreNoSec = readBuff(
            {
                name: 'Blessing of Wisdom',
                spellID: 19850,
                source: 'none',
                points: { '1': 18 },
                description: 'Restores 18 mana.',
            },
            8
        )
        expect(classifyBuff(restoreNoSec, KNOWN).filtered.how).toBe('unknown')

        const thorns = readBuff(
            {
                name: 'Thorns',
                spellID: 782,
                source: 'none',
                points: { '1': 6 },
                description:
                    'Thorns sprout from the friendly target causing 6 Nature damage to attackers when hit.  Lasts 10 min.',
            },
            8
        )
        expect(classifyBuff(thorns, KNOWN).filtered).toMatchObject({
            how: 'no_stats',
            how_detail: 'list',
            numbers: { damage_shield: 6 },
        })
    })

    test('1248406 requires whole-word stat, positive point, and rejects unindexed extra numbers', () => {
        const wrongText = readBuff(
            {
                name: 'Well Fed',
                spellID: 1248406,
                source: 'self',
                points: { '1': 5 },
                description:
                    'A nutritious meal has made you Well Fed, increasing your Stamina and Spirit by 5.',
            },
            10
        )
        expect(classifyBuff(wrongText, KNOWN).filtered.how).toBe('unknown')
    })

    test('no-effect rules include Aquatic Form, Flight Form, Swift Flight Form, and Classic mounts', () => {
        for (const name of [
            'Aquatic Form',
            'Flight Form',
            'Swift Flight Form',
            'Black War Kodo',
            'Skeletal Horse',
            'Swift Mistsaber',
        ]) {
            const buff = readBuff({ name, spellID: 999999, source: 'self' }, 10)
            expect(classifyBuff(buff, KNOWN).filtered).toMatchObject({
                how: 'no_stats',
                how_detail: 'no_stats (name rule)',
            })
        }
    })
})

describe('exportCharacter extra fields and calibrate last-matching-row lookup', () => {
    function stubPool(calibrations: unknown[]): SimPool {
        const sheetAnswer: SimSheet = {
            level: 33,
            unreached_ranks: [],
            player: {
                finalStats: {
                    stats: Array.from({ length: 40 }, () => 0),
                    pseudoStats: Array.from({ length: 37 }, () => 0),
                },
            },
        }
        return {
            size: 1,
            sim: () => Promise.reject(new Error('unexpected sim')),
            sheet: () => Promise.resolve(sheetAnswer),
            data: (name) => {
                if (name === 'buffs.json') return Promise.resolve(KNOWN)
                if (name === 'calibrations.json')
                    return Promise.resolve(calibrations)
                if (name === 'talents/shaman.json')
                    return Promise.resolve([
                        {
                            name: 'Enhancement',
                            talents: [
                                {
                                    fancyName: 'Flurry',
                                    spellId: 16256,
                                    maxPoints: 5,
                                },
                            ],
                        },
                    ])
                if (name === 'db.json' || name === 'leftover_db.json')
                    return Promise.resolve({ items: [] })
                if (name === 'item_first_seen.json') return Promise.resolve([])
                return Promise.resolve({})
            },
            stats: () => ({ calls: 0, iterations: 0, ms: 0 }),
            batch: () => {},
            onProgress: () => () => {},
            cancel: () => {},
            weights: () => Promise.resolve(null),
            version: () =>
                Promise.resolve({
                    upstream_commit: 'test',
                    patch_id: 'test',
                    go_version: 'test',
                }),
            close: () => {},
        }
    }

    test('exportCharacter ignores xp, mobs, autoExport/autoLog, logging, state, and unavailable', async () => {
        const lua = `
TurboCharExportDB = {
  ["formatVersion"] = 10,
  ["savedAt"] = 1763400000,
  ["identity"] = {
    ["name"] = "Testshaman",
    ["class"] = "SHAMAN",
    ["race"] = "Orc",
    ["level"] = 33,
    ["gameBuild"] = "1.15.8",
  },
  ["talents"] = {
    ["list"] = { { ["name"] = "Flurry", ["spellID"] = 16256, ["rank"] = 1 } },
  },
  ["gear"] = {
    ["16"] = { ["slot"] = "mainHand", ["id"] = 280604, ["name"] = "Axe", ["stats"] = {} },
  },
  ["sheet"] = {
    ["stat"] = {
      ["strength"] = { ["total"] = 50, ["pos"] = 0, ["neg"] = 0 },
      ["agility"] = { ["total"] = 50, ["pos"] = 0, ["neg"] = 0 },
      ["stamina"] = { ["total"] = 50, ["pos"] = 0, ["neg"] = 0 },
      ["intellect"] = { ["total"] = 50, ["pos"] = 0, ["neg"] = 0 },
      ["spirit"] = { ["total"] = 50, ["pos"] = 0, ["neg"] = 0 },
    },
    ["conversion"] = { ["critPer100"] = { ["agility"] = 0.05, ["intellect"] = 0 } },
    ["health"] = 1000,
    ["mana"] = 1000,
    ["armor"] = { ["effective"] = 100 },
    ["attackPower"] = { ["base"] = 100, ["pos"] = 0, ["neg"] = 0 },
    ["meleeCrit"] = 5,
    ["spellCrit"] = 5,
    ["dodge"] = 5,
    ["meleeHit"] = 0,
  },
  ["xp"] = { ["current"] = 1234, ["max"] = 5000 },
  ["mobs"] = { ["lastFought"] = { ["name"] = "Wolf", ["secondsAgo"] = 12, ["levelUnknown"] = true } },
  ["settings"] = { ["autoExport"] = true, ["autoLog"] = true },
  ["logging"] = { ["enabled"] = true },
  ["state"] = { ["inCombat"] = false },
  ["unavailable"] = { ["reason"] = "secret" },
}`
        const pool = stubPool([])
        // Fake item 280604 present in db.json
        const withItem: SimPool = {
            ...pool,
            data: (name) =>
                name === 'db.json'
                    ? Promise.resolve({ items: [{ id: 280604, name: 'Axe' }] })
                    : pool.data(name),
        }
        const read = await exportCharacter(lua, withItem)
        expect(read.kind).toBe('character')
        if (read.kind !== 'character') return
        expect(read.character.filtered_buffs).toBeUndefined()
        expect(JSON.stringify(read.character)).not.toContain('lastFought')
        expect(JSON.stringify(read.character)).not.toContain('autoExport')
    })

    test('calibrate picks the LAST matching (level, race, class) row from calibrations.json', async () => {
        const pool = stubPool([
            {
                level: 33,
                race: 'RaceOrc',
                class: 'ClassShaman',
                base_health: 111,
                base_mana: 222,
                spell_crit_per_int: 0.01,
            },
            {
                level: 33,
                race: 'RaceTauren',
                class: 'ClassShaman',
                base_health: 999,
                base_mana: 999,
                spell_crit_per_int: 0.09,
            },
            {
                level: 33,
                race: 'RaceOrc',
                class: 'ClassShaman',
                base_health: 394,
                base_mana: 767,
                spell_crit_per_int: 0.0321,
            },
        ])
        const character = await calibrate(
            {
                name: 'T',
                level: 33,
                race: 'Orc',
                class: 'Shaman',
                talents: '-1',
                gear: {},
                bonus_stats: Array.from({ length: 40 }, () => 0),
                imbue: null,
                known_spells: [],
                weapon_skill_deficit: 0,
                ooc_mana_regen: 0,
                profile: {
                    level: 33,
                    race: 'RaceOrc',
                    class: 'ClassShaman',
                    strength: 50,
                    agility: 50,
                    stamina: 50,
                    intellect: 50,
                    spirit: 50,
                    baseHealth: 0,
                    baseMana: 0,
                    baseAttackPower: 46,
                    critPerAgility: 0.05,
                    dodgePerAgility: 0.05,
                    spellCritPerInt: 0,
                    baseMeleeCrit: 1.7,
                    baseSpellCrit: 2.3,
                    baseDodgePercent: 1.7,
                    knownSpells: [],
                },
                sheet: {
                    strength: 50,
                    agility: 50,
                    stamina: 50,
                    intellect: 50,
                    spirit: 50,
                    attack_power: 100,
                    armor: 100,
                    health: 1500,
                    mana: 1800,
                    melee_crit_pct: 5,
                    spell_crit_pct: 5,
                    dodge_pct: 5,
                    melee_hit_pct: 0,
                },
                filtered_buffs: [
                    {
                        name: 'Mystery',
                        spell_id: 999,
                        source: 'self',
                        how: 'unknown',
                        how_detail: 'unknown',
                    },
                ],
                export_saved_at: '2026-11-18T00:00:00.000Z',
                game_build: '1.15.8',
            },
            pool
        )
        expect(character.calibration_mode).toBe('last_clean_calibration')
        expect(character.profile.baseHealth).toBe(394)
        expect(character.profile.baseMana).toBe(767)
        expect(character.profile.spellCritPerInt).toBe(0.0321)
    })
})
