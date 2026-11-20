/**
 * The gates, which run before any numbers (any failing means no results),
 * and the notes, which never block and always ship as failed checks.
 */
import type { Sheet } from '@goturbo/sim'

import type { Check } from '../results-file'
import { meanCI } from './weights'

/** WASM rounds the last digit differently from native Go. */
export const L60_TOLERANCE = 1e-9

/** The notes: shipped in every file as failed checks, never blocking. */
export const NOTES: readonly Check[] = [
    {
        name: 'real fights',
        passed: false,
        detail: "Not checked: the sim hasn't been compared with a real combat log for this character.",
    },
    {
        name: 'mana model',
        passed: false,
        detail: "Untested: no combat log has been checked against the sim's mana use, so out-of-mana times and the chain fight are estimates.",
    },
    {
        name: 'long-fight weights',
        passed: false,
        detail: "Low confidence: the 2-minute fight's stat weights lean on the mana model, which is untested.",
    },
]

/** Ordinary failures: not-checked rows never block a run. */
export function failedChecks(checks: readonly Check[]): Check[] {
    return checks.filter((check) => !check.passed && !check.not_checked)
}

/** With no profile, upstream's test request gives upstream's DPS. */
export function level60Check(dps: number, expected: number): Check {
    const relative = Math.abs(dps - expected) / Math.abs(expected)
    return {
        name: 'level 60 regression',
        passed: relative <= L60_TOLERANCE,
        detail: `Upstream's level 60 test gives ${dps} DPS against ${expected}, checked within 1e-9 relative, not exactly: WASM rounds the last digit differently from native Go.`,
    }
}

/** The sheet stats the sim must match, with the runner's names. */
const SHEET_STATS: { name: string; key: keyof Sheet; within: number }[] = [
    { name: 'strength', key: 'strength', within: 1 },
    { name: 'agility', key: 'agility', within: 1 },
    { name: 'stamina', key: 'stamina', within: 1 },
    { name: 'intellect', key: 'intellect', within: 1 },
    { name: 'spirit', key: 'spirit', within: 1 },
    { name: 'attackPower', key: 'attack_power', within: 2 },
    { name: 'armor', key: 'armor', within: 5 },
    { name: 'dodge', key: 'dodge_pct', within: 0.06 },
    { name: 'meleeHit', key: 'melee_hit_pct', within: 0.05 },
    { name: 'meleeCrit', key: 'melee_crit_pct', within: 0.06 },
    { name: 'spellCrit', key: 'spell_crit_pct', within: 0.06 },
]

/** Rounding slack, so a tolerance of 0.06 takes a 0.06 gap. */
const SLACK = 1e-9

/** Melee crit lost per point of weapon skill under the level's maximum. */
const CRIT_PER_SKILL_POINT = 0.04

/**
 * The sim's sheet against the game's, one check per stat. The game's melee
 * crit is less 0.04% per point of main-hand weapon skill under the level's
 * maximum; the sim applies that in its attack table, not its sheet, so the
 * check takes it off the sim's crit here.
 */
export function sheetChecks(
    game: Sheet,
    sim: Sheet,
    calibratedSpellCrit: boolean,
    weaponSkillDeficit: number
): Check[] {
    const checks = SHEET_STATS.map(({ name, key, within }): Check => {
        if (key === 'spell_crit_pct' && calibratedSpellCrit)
            return {
                name: `sheet ${name}`,
                passed: true,
                detail: 'Skipped: spell crit was calibrated from the export.',
            }
        if (key === 'melee_crit_pct') {
            const simCrit = sim[key] - CRIT_PER_SKILL_POINT * weaponSkillDeficit
            return {
                name: `sheet ${name}`,
                passed: Math.abs(simCrit - game[key]) <= within + SLACK,
                detail: `The sim says ${round2(simCrit)} (${sim[key]} less 0.04% × ${weaponSkillDeficit} points of weapon skill under the cap), the game ${game[key]} (within ±${within}).`,
            }
        }
        const gap = Math.abs(sim[key] - game[key])
        return {
            name: `sheet ${name}`,
            passed: gap <= within + SLACK,
            detail: `The sim says ${sim[key]}, the game ${game[key]} (within ±${within}).`,
        }
    })
    for (const name of ['health', 'mana'])
        checks.push({
            name: `sheet ${name}`,
            passed: true,
            detail: `Calibrated from the export, so the sim's ${name} matches the game's.`,
        })
    return checks
}

/** The character's DPS is under half the level 60 test build's. */
export function belowLevel60Check(dps: number, level60Dps: number): Check {
    return {
        name: 'below level 60',
        passed: dps < level60Dps / 2,
        detail: `${round(dps)} DPS on the long dungeon fight, under half the level 60 test build's ${round(level60Dps)}.`,
    }
}

/** No spell the rotation casts is taught above the character's level. */
export function noSpellAboveLevelCheck(
    spells: { id: number; level: number }[],
    level: number,
    unreached: number[]
): Check {
    const above = spells.filter(
        (s) => s.level > level || unreached.includes(s.id)
    )
    return {
        name: 'no spell above the level',
        passed: above.length === 0,
        detail:
            above.length === 0
                ? `Every spell the rotation casts is taught at level ${level} or below.`
                : `Taught above level ${level}: ${above.map((s) => s.id).join(', ')}.`,
    }
}

/**
 * More of a stat gives more DPS: `gains` are the DPS it adds on each seed,
 * on the dungeon fight against a mob of `mobLevel`. It passes when the
 * mean gain less its 95% half-width (Student's t) is above 0, as the
 * runner's `sanityChecks`.
 */
export function dpsRisesCheck(
    name: string,
    amount: number,
    gains: number[],
    mobLevel: number
): Check {
    const { mean, half } = meanCI(gains)
    return {
        name: `DPS rises with ${name}`,
        passed: mean - half > 0,
        detail: `+${amount}: ${mean.toFixed(2)} ± ${half.toFixed(2)} DPS on the level ${mobLevel} dungeon fight, over ${gains.length} seeds.`,
    }
}

/** Stormstrike casts per minute on the solo fight, hit and not hit. */
export type StormstrikeRates = { hit: number; notHit: number }

/**
 * Improved Stormstrike's reset, as the runner's `sanityChecks` measures
 * it: a dodge or parry resets Stormstrike at 50% a point, and a reset
 * gains half a cast on average. Being hit also costs casts, so the reset's
 * effect is the rise when hit with the talent less the change without it.
 * It passes when that effect is above 0 and within ±35% of the rate the
 * mob's dodged and parried swings per fight give. The rates come from sims
 * whose mana never runs out (`sanity.ts`): Stormstrike goes out whenever
 * it's ready, as the expected rate assumes.
 */
export function stormstrikeRuleCheck(input: {
    /** Points in Improved Stormstrike in the talented variant. */
    points: number
    /** The build has no Stormstrike: both variants got it for the check. */
    addedStormstrike: boolean
    without: StormstrikeRates
    withIt: StormstrikeRates
    /** Dodges and parries per fight, hit with the talent. */
    avoided: number
    durationS: number
}): Check {
    const { points, without, withIt, avoided, durationS } = input
    const effect = withIt.hit - withIt.notHit - (without.hit - without.notHit)
    const chance = 0.5 * points
    const expected = avoided * chance * 0.5 * (60 / durationS)
    const added = input.addedStormstrike
        ? 'No Stormstrike talent: added for this check only. '
        : ''
    return {
        name: 'being hit resets Stormstrike as the rule says',
        passed: effect > 0 && Math.abs(effect - expected) <= 0.35 * expected,
        detail: `${added}Stormstrike/min, with mana that never runs out: no talent ${without.notHit.toFixed(2)} → ${without.hit.toFixed(2)} when hit; Improved Stormstrike ${points}/2 ${withIt.notHit.toFixed(2)} → ${withIt.hit.toFixed(2)}. Reset effect ${effect.toFixed(2)}/min vs ${expected.toFixed(2)}/min expected from ${avoided.toFixed(2)} dodges and parries per fight at ${chance * 100}% (±35%).`,
    }
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}

function round2(value: number): number {
    return Math.round(value * 100) / 100
}
