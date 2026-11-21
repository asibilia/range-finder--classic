/**
 * The sheet gate's melee-crit rule, ported from the runner's `sheetCheck`
 * (`checks.ts`): the sim's crit, less 0.04% per point of main-hand weapon
 * skill under the level's maximum (the character's `weapon_skill_deficit`),
 * is compared with the game's, within ±0.06.
 *
 * `sheetChecks(game, sim, calibratedSpellCrit, weaponSkillDeficit)` is a
 * pure function, so these tests need no sim.
 */
import { describe, expect, test } from 'bun:test'

import {
    PSEUDO_STAT,
    type Sheet,
    type SimPool,
    type SimSheet,
} from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    buffsCheck,
    calibrationCheck,
    failedChecks,
    runGates,
    sheetChecks,
    type Character,
} from '../src/browser-sim'
import { recordedPool } from './helpers/recorded-pool'

const SIM: Sheet = {
    strength: 80,
    agility: 50,
    stamina: 90,
    intellect: 70,
    spirit: 75,
    attack_power: 200,
    armor: 900,
    health: 1500,
    mana: 1400,
    melee_crit_pct: 5,
    spell_crit_pct: 3,
    dodge_pct: 4,
    melee_hit_pct: 0,
}

/** The game's sheet: the sim's, with melee crit 0.40% lower. */
const GAME: Sheet = { ...SIM, melee_crit_pct: 4.6 }

function meleeCrit(deficit: number) {
    const check = sheetChecks(GAME, SIM, false, deficit).find(
        (c) => c.name === 'sheet meleeCrit'
    )
    expect(check).toBeDefined()
    return check!
}

describe('the sheet meleeCrit check allows for low weapon skill', () => {
    test('with main-hand skill 10 under the maximum, a game crit 0.40% below the sim’s passes', () => {
        expect(meleeCrit(10).passed).toBe(true)
    })

    test('with the skill at the maximum, the same 0.40% gap fails, where 10 under passes', () => {
        expect([meleeCrit(0).passed, meleeCrit(10).passed]).toEqual([
            false,
            true,
        ])
    })

    test('the detail names the deficit in points', () => {
        expect(meleeCrit(10).detail).toMatch(
            /\b10 (weapon[- ]skill )?points?\b/i
        )
    })
})

/** The sim's `turboSheet` answer: melee crit 5%, every other stat 0. */
function simSheetAnswer(): SimSheet {
    const pseudoStats: number[] = []
    pseudoStats[PSEUDO_STAT.meleeCritPercent] = SIM.melee_crit_pct
    return {
        level: 30,
        unreached_ranks: [],
        player: { finalStats: { stats: [], pseudoStats } },
    }
}

/**
 * The fake pool, scripted: every sheet call answers `simSheetAnswer`, and
 * the level 60 sim answers the DPS its stand-in version expects. The
 * gates' melee-crit check then compares the character's game sheet with a
 * sim crit of 5%.
 */
function stubPool(): SimPool {
    return recordedPool({
        sim: () =>
            Promise.resolve({
                raidMetrics: { parties: [{ players: [{ dps: { avg: 1 } }] }] },
            }),
        sheet: () => Promise.resolve(simSheetAnswer()),
        data: (name) =>
            Promise.resolve(
                name === 'version.json' ? { l60_expected_dps: 1 } : {}
            ),
    })
}

/** The gates' `sheet meleeCrit` check for Testchar with this deficit. */
async function gatedMeleeCrit(deficit: number) {
    const pool = stubPool()
    const testchar = await testcharCharacter(pool)
    const character: Character = {
        ...testchar,
        sheet: { ...testchar.sheet, melee_crit_pct: GAME.melee_crit_pct },
        weapon_skill_deficit: deficit,
    }
    const { checks } = await runGates(character, pool)
    const check = checks.find((c) => c.name === 'sheet meleeCrit')
    expect(check).toBeDefined()
    return check!
}

describe('runGates passes the character’s weapon_skill_deficit to the sheet check', () => {
    test('a character 10 under the skill cap passes sheet meleeCrit with a game crit 0.40% below the sim’s; at the cap it fails', async () => {
        const [under, atCap] = await Promise.all([
            gatedMeleeCrit(10),
            gatedMeleeCrit(0),
        ])
        expect([under.passed, atCap.passed]).toEqual([true, false])
    })
})

describe('#85 health, mana, calibration, buffs, and unknown-buff non-blocking checks', () => {
    test('health and mana use exact check names (not sheet health / sheet mana) and pass when no unknown buff is up', () => {
        const checks = sheetChecks(SIM, SIM, false, 0)
        expect(checks.find((c) => c.name === 'health')).toMatchObject({
            name: 'health',
            passed: true,
        })
        expect(checks.find((c) => c.name === 'mana')).toMatchObject({
            name: 'mana',
            passed: true,
        })
        expect(checks.find((c) => c.name === 'sheet health')).toBeUndefined()
        expect(checks.find((c) => c.name === 'sheet mana')).toBeUndefined()
    })

    test('ordinary sheet failure with no unknown buff stays blocking in failedChecks', () => {
        const off = { ...SIM, strength: SIM.strength + 10 }
        const checks = sheetChecks(off, SIM, false, 0)
        const strength = checks.find((c) => c.name === 'sheet strength')!
        expect(strength.passed).toBe(false)
        expect(strength.not_checked).toBeUndefined()
        expect(failedChecks(checks).map((c) => c.name)).toEqual([
            'sheet strength',
        ])
    })

    test('with an unknown buff up, health, mana, and failing sheet lines become not_checked (non-blocking), while matching lines stay passed', () => {
        const game = { ...SIM, stamina: SIM.stamina + 21 }
        const checks = sheetChecks(game, SIM, false, 0, {
            unknownBuffs: ['Camp Benefits'],
            solvedFromBuffedSheet: false,
        })
        expect(checks.find((c) => c.name === 'sheet strength')).toMatchObject({
            passed: true,
        })
        expect(checks.find((c) => c.name === 'sheet stamina')).toMatchObject({
            passed: false,
            not_checked: true,
        })
        expect(checks.find((c) => c.name === 'health')).toMatchObject({
            passed: false,
            not_checked: true,
        })
        expect(checks.find((c) => c.name === 'mana')).toMatchObject({
            passed: false,
            not_checked: true,
        })
        expect(failedChecks(checks)).toEqual([])
    })

    test('calibrationCheck and buffsCheck emit exact names, not_checked flags, and detail strings', () => {
        expect(calibrationCheck('solved_clean')).toMatchObject({
            name: 'calibration',
            passed: true,
        })
        expect(calibrationCheck('last_clean_calibration')).toMatchObject({
            name: 'calibration',
            passed: true,
        })
        expect(calibrationCheck('solved_from_buffed_sheet')).toEqual({
            name: 'calibration',
            passed: false,
            not_checked: true,
            detail: "Solved from a sheet with a buff the sim can't size.",
        })

        expect(buffsCheck([])).toBeNull()
        expect(buffsCheck(undefined)).toBeNull()
        expect(
            buffsCheck([
                {
                    name: 'Ghost Wolf',
                    spell_id: 2645,
                    source: 'self',
                    how: 'no_stats',
                    how_detail: 'no_stats (name rule)',
                },
            ])
        ).toMatchObject({
            name: 'buffs',
            passed: true,
        })
        expect(
            buffsCheck([
                {
                    name: 'Camp Benefits',
                    spell_id: 1229741,
                    source: 'self',
                    how: 'unknown',
                    how_detail: 'unknown',
                },
            ])
        ).toMatchObject({
            name: 'buffs',
            passed: false,
            not_checked: true,
        })
    })
})
