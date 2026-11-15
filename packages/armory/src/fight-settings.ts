/**
 * The fight settings (spec section 9, as the mockup's controls show them):
 * enemy level, fight length, kind of fight, starting mana and time between
 * pulls. In slice A nothing is re-simmed: the settings pick one of the
 * file's pre-made fights, the one whose target level, length, starting
 * mana and gap between pulls match. A combination the file has no fight
 * for is not simmed. Pure functions, so the page and its tests agree.
 */
import { z } from 'zod'

import type { ResultsFile } from './results-file'

type Fight = ResultsFile['fights'][number]

/** What the settings are set to. PvP isn't simmed, so `kind` is PvE only. */
export const FightSettingsSchema = z.strictObject({
    level: z.int(),
    length_s: z.int().positive(),
    kind: z.enum(['pve', 'pvp']).default('pve'),
    mana: z.int().min(0),
    gap_s: z.number().min(0),
})

/** The settings' values. */
export type FightSettings = z.infer<typeof FightSettingsSchema>

/** The lengths the mockup offers, in seconds; the file's own are added. */
const LENGTHS_S = [30, 60, 120, 180, 300]

/** The mockup's starting mana range and step; widened to the file's own. */
const MANA = { min: 600, max: 2400, step: 20 }

/** The mockup's gap range and step; widened to the file's own. */
const GAP = { min: 0, max: 60, step: 5 }

/**
 * A fight's starting mana in points: its `starting_mana_pct` of the sheet's
 * mana (all of it without a setup).
 *
 * @param file - The loaded results file.
 * @param fight - The fight.
 * @returns The mana, whole.
 */
export function startingMana(file: ResultsFile, fight: Fight): number {
    const pct = fight.setup?.starting_mana_pct ?? 100
    return Math.round((file.sheet.mana * pct) / 100)
}

/** A fight's gap between pulls in seconds (0 without a setup). */
function gapOf(fight: Fight): number {
    return fight.setup?.gap_s ?? 0
}

/**
 * The settings that pick a fight.
 *
 * @param file - The loaded results file.
 * @param fight - The fight.
 * @returns Its settings.
 */
export function settingsOf(file: ResultsFile, fight: Fight): FightSettings {
    return {
        level: fight.target_level,
        length_s: fight.duration_s,
        kind: 'pve',
        mana: startingMana(file, fight),
        gap_s: gapOf(fight),
    }
}

/**
 * The fight the settings pick: the first in file order with the same
 * target level, length and starting mana, and, for a chain fight, the same
 * gap between pulls. PvP is never simmed.
 *
 * @param file - The loaded results file.
 * @param settings - The settings.
 * @returns The fight, or null when the file has none for them.
 */
export function fightFor(
    file: ResultsFile,
    settings: FightSettings
): Fight | null {
    if (settings.kind === 'pvp') return null
    return (
        file.fights.find(
            (fight) =>
                fight.target_level === settings.level &&
                fight.duration_s === settings.length_s &&
                startingMana(file, fight) === settings.mana &&
                (fight.kind !== 'chain' || gapOf(fight) === settings.gap_s)
        ) ?? null
    )
}

/** What each control offers. */
export type SettingsChoices = {
    levels: number[]
    lengths_s: number[]
    mana: { min: number; max: number; step: number }
    gap: { min: number; max: number; step: number }
}

function sortedUnique(values: number[]): number[] {
    return [...new Set(values)].sort((a, b) => a - b)
}

/**
 * What the controls offer: the three levels above the character's (31, 32
 * and 33 at level 30, as the mockup has) and the file's own; the mockup's
 * lengths (30 seconds to 5 minutes) and the file's own; the mockup's mana
 * and gap ranges, widened to take in the file's values.
 *
 * @param file - The loaded results file.
 * @returns The choices.
 */
export function settingsChoices(file: ResultsFile): SettingsChoices {
    const { level } = file.character
    const manas = file.fights.map((fight) => startingMana(file, fight))
    const gaps = file.fights.map(gapOf)
    return {
        levels: sortedUnique([
            level + 1,
            level + 2,
            level + 3,
            ...file.fights.map((fight) => fight.target_level),
        ]),
        lengths_s: sortedUnique([
            ...LENGTHS_S,
            ...file.fights.map((fight) => fight.duration_s),
        ]),
        mana: {
            ...MANA,
            min: Math.min(MANA.min, ...manas),
            max: Math.max(MANA.max, ...manas),
        },
        gap: {
            ...GAP,
            min: Math.min(GAP.min, ...gaps),
            max: Math.max(GAP.max, ...gaps),
        },
    }
}

/**
 * The miss sentence under the enemy level, from the file: `With 0 hit, you
 * miss 8.0% of melee swings at level 33.` It reads `melee_miss_pct` from
 * the first fight at that level that has it, and the sheet's hit.
 *
 * @param file - The loaded results file.
 * @param level - The enemy level picked.
 * @returns The sentence, or null when no fight at that level has a miss
 * chance (not simmed).
 */
export function missWords(file: ResultsFile, level: number): string | null {
    const fight = file.fights.find(
        (candidate) =>
            candidate.target_level === level &&
            typeof candidate.melee_miss_pct === 'number'
    )
    if (typeof fight?.melee_miss_pct !== 'number') return null
    const hit = Number(file.sheet.melee_hit_pct.toFixed(2))
    return `With ${hit} hit, you miss ${fight.melee_miss_pct.toFixed(1)}% of melee swings at level ${level}.`
}
