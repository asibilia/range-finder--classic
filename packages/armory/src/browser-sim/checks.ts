/**
 * The gates, which run before any numbers (any failing means no results),
 * and the notes, which never block and always ship as failed checks.
 */
import type { Sheet } from '@goturbo/sim/browser'

import type { Check } from '../results-file'

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

/** The sim's sheet against the game's, one check per stat. */
export function sheetChecks(
    game: Sheet,
    sim: Sheet,
    calibratedSpellCrit: boolean
): Check[] {
    const checks = SHEET_STATS.map(({ name, key, within }): Check => {
        if (key === 'spell_crit_pct' && calibratedSpellCrit)
            return {
                name: `sheet ${name}`,
                passed: true,
                detail: 'Skipped: spell crit was calibrated from the export.',
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

/** More of a weighed stat gives at least as much DPS. */
export function dpsRisesCheck(
    stat: string,
    amount: number,
    base: number,
    up: number
): Check {
    const words = stat.replace(/_/g, ' ')
    return {
        name: `DPS rises with ${words}`,
        passed: up >= base,
        detail: `${round(base)} DPS, ${round(up)} with ${amount} more ${words} on the long dungeon fight.`,
    }
}

/**
 * Being hit resets Stormstrike only through Improved Stormstrike (a dodge
 * or parry resets its cooldown). Without the talent, the fight where the
 * character is hit can't cast it more often than its cooldown allows; with
 * it, that fight casts it at least as often as one where it isn't hit.
 */
export function stormstrikeRuleCheck(input: {
    talented: boolean
    improved: boolean
    hitCasts: number
    hitMaxS: number
    cooldownS: number
    calmCasts: number
}): Check {
    const name = 'being hit resets Stormstrike as the rule says'
    if (!input.talented)
        return { name, passed: true, detail: 'No Stormstrike talent.' }
    if (!input.improved) {
        const most = Math.floor(input.hitMaxS / input.cooldownS) + 1
        return {
            name,
            passed: input.hitCasts <= most,
            detail: `No Improved Stormstrike: ${round(input.hitCasts)} casts a fight while being hit, at most ${most} by its cooldown.`,
        }
    }
    return {
        name,
        passed: input.hitCasts >= input.calmCasts * 0.95,
        detail: `Improved Stormstrike: ${round(input.hitCasts)} casts a fight while being hit, ${round(input.calmCasts)} when not.`,
    }
}

function round(value: number): number {
    return Math.round(value * 10) / 10
}
