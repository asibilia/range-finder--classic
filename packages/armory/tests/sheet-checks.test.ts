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

import type { Sheet } from '@goturbo/sim'

import { sheetChecks } from '../src/browser-sim'

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
