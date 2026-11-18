/**
 * The fight settings (`src/fight-settings.ts`): which of the file's
 * pre-made fights the controls pick, what they offer, and the miss
 * sentence. Nothing is re-simmed.
 */
import { describe, expect, test } from 'bun:test'

import {
    fightFor,
    fightOverride,
    missWords,
    settingsChoices,
    settingsOf,
} from '../src/fight-settings'
import { readResultsFile, type ResultsFile } from '../src/results-file'
import firstRunJson from '../src/sample-truncha-first-run.json'
import sampleJson from '../src/sample-truncha.json'

function read(input: unknown): ResultsFile {
    const outcome = readResultsFile(input)
    if (!outcome.ok) throw new Error('the sample no longer reads')
    return outcome.file
}

const sample = read(sampleJson)
const firstRun = read(firstRunJson)
const fight = (id: string) => {
    const found = sample.fights.find((entry) => entry.fight_id === id)
    if (!found) throw new Error(`no fight ${id}`)
    return found
}

describe('the settings pick a pre-made fight', () => {
    test("each of the sample's fights is picked by its own settings", () => {
        for (const entry of sample.fights)
            expect(fightFor(sample, settingsOf(sample, entry))?.fight_id).toBe(
                entry.fight_id
            )
    })

    test("the 2-minute fight's settings are the mockup's: 33, 2 minutes, PvE, 1660 mana, 10 s", () => {
        expect(settingsOf(sample, fight('dungeon-long'))).toEqual({
            level: 33,
            length_s: 120,
            kind: 'pve',
            mana: 1660,
            gap_s: 10,
        })
    })

    test('a combination the file has no fight for picks nothing', () => {
        const long = settingsOf(sample, fight('dungeon-long'))
        expect(fightFor(sample, { ...long, level: 32 })).toBeNull()
        expect(fightFor(sample, { ...long, length_s: 60 })).toBeNull()
        expect(fightFor(sample, { ...long, mana: 1200 })).toBeNull()
        expect(fightFor(sample, { ...long, kind: 'pvp' })).toBeNull()
    })

    test('the gap between pulls only picks a chain fight', () => {
        const long = settingsOf(sample, fight('dungeon-long'))
        expect(fightFor(sample, { ...long, gap_s: 40 })?.fight_id).toBe(
            'dungeon-long'
        )
        const chain = settingsOf(sample, fight('chain-4'))
        expect(fightFor(sample, { ...chain, gap_s: 10 })).toBeNull()
    })
})

describe('what the controls offer', () => {
    test("the mockup's levels, lengths and ranges", () => {
        expect(settingsChoices(sample)).toEqual({
            levels: [31, 32, 33],
            lengths_s: [30, 60, 120, 180, 300],
            mana: { min: 600, max: 2400, step: 20 },
            gap: { min: 0, max: 60, step: 5 },
        })
    })
})

describe('the miss sentence', () => {
    test('reads the miss chance for the level and the sheet hit', () => {
        expect(missWords(sample, 33)).toBe(
            'With 0 hit, you miss 8.0% of melee swings at level 33.'
        )
        expect(missWords(sample, 32)).toBe(
            'With 0 hit, you miss 6.0% of melee swings at level 32.'
        )
        expect(missWords(sample, 31)).toBe(
            'With 0 hit, you miss 5.5% of melee swings at level 31.'
        )
    })

    test('is left out when the file has no miss chance for the level', () => {
        expect(missWords(firstRun, 33)).toBeNull()
        expect(missWords(sample, 40)).toBeNull()
    })
})

describe('fightOverride (Run Simulator)', () => {
    test('the level and length as they are, the starting mana as a share of the sheet, the gap only on a chain fight', () => {
        const mana = sample.sheet.mana
        expect(
            fightOverride(sample, {
                level: 36,
                length_s: 60,
                kind: 'pve',
                mana: mana / 2,
                gap_s: 0,
            })
        ).toEqual({ target_level: 36, duration_s: 60, starting_mana_pct: 50 })
        const gapped = {
            level: 33,
            length_s: 120,
            kind: 'pve' as const,
            mana,
            gap_s: 20,
        }
        expect(fightOverride(sample, gapped, true)).toEqual({
            target_level: 33,
            duration_s: 120,
            gap_s: 20,
        })
        expect(fightOverride(sample, gapped)).toEqual({
            target_level: 33,
            duration_s: 120,
        })
    })

    test('starting mana above the sheet is full mana (no share)', () => {
        expect(
            fightOverride(sample, {
                level: 33,
                length_s: 120,
                kind: 'pve',
                mana: sample.sheet.mana + 500,
                gap_s: 0,
            })
        ).toEqual({ target_level: 33, duration_s: 120 })
    })

    test("the file's own long fight's settings give its own fight back: its level, length and mana share (to the mana's rounding), no gap on a single fight", () => {
        const long = fight('dungeon-long')
        const set = fightOverride(sample, settingsOf(sample, long))
        expect(set.target_level).toBe(long.target_level)
        expect(set.duration_s).toBe(long.duration_s)
        expect(set.gap_s).toBeUndefined()
        const pct = long.setup?.starting_mana_pct ?? 100
        if (pct >= 100) expect(set.starting_mana_pct).toBeUndefined()
        else
            expect(Math.abs((set.starting_mana_pct ?? 100) - pct)).toBeLessThan(
                100 / sample.sheet.mana
            )
    })
})
