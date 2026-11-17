/**
 * The fights the browser sims, at the character's level: three single
 * fights and the runner's chain of pulls, `chain-solo`.
 */
import type { ResultsFile } from '../results-file'

export type Scenario = {
    fight_id: string
    label: string
    kind: 'single' | 'chain'
    target_level: number
    /** One pull's length, in seconds. */
    duration_s: number
    /** How much a pull's length varies, in seconds, either way. */
    variation_s: number
    /** The mob hits the character (solo); in a dungeon a tank holds it. */
    being_hit: boolean
    /** The character stands in front of the mob; absent: when it's hit. */
    in_front?: boolean
    /** The fight is long enough to drop totems. */
    totems: boolean
    pulls: number
    gap_s: number
}

export const SINGLE_FIGHTS = [
    'solo-hit-short',
    'dungeon-short',
    'dungeon-long',
] as const
export const CHAIN_FIGHT = 'chain-solo'
export const DEFAULT_FIGHT = 'dungeon-long'

/** The armor of a mob of `level`, as the runner sets it. */
export function mobArmor(level: number): number {
    return Math.max(0, 50 * level - 450)
}

/** The three single fights at `level`. */
export function scenariosFor(level: number): Scenario[] {
    return [
        {
            fight_id: 'solo-hit-short',
            label: `Solo, 30 s vs level ${level}`,
            kind: 'single',
            target_level: level,
            duration_s: 30,
            variation_s: 5,
            being_hit: true,
            totems: false,
            pulls: 1,
            gap_s: 0,
        },
        {
            fight_id: 'dungeon-short',
            label: `Dungeon, 30 s vs level ${level + 1}`,
            kind: 'single',
            target_level: level + 1,
            duration_s: 30,
            variation_s: 5,
            being_hit: false,
            totems: true,
            pulls: 1,
            gap_s: 0,
        },
        {
            fight_id: 'dungeon-long',
            label: `Dungeon, 2 min vs level ${level + 2}`,
            kind: 'single',
            target_level: level + 2,
            duration_s: 120,
            variation_s: 10,
            being_hit: false,
            totems: true,
            pulls: 1,
            gap_s: 0,
        },
    ]
}

/** The level the runner's fixed fights were made for: its character's, 30. */
const RUNNER_LEVEL = 30

/**
 * The sanity gates' fights, the runner's fixed `SCENARIOS`: the solo fight
 * (`SCENARIOS[0]`: a level 31 mob, armor 1100, hitting the character,
 * 30 s) and the short dungeon fight (`SCENARIOS[1]`: level 32, armor 1150,
 * behind a tank, 30 s). Above level 30 the mobs rise with the character,
 * keeping the runner's gap: against a mob far below the character, more
 * hit rating can't raise DPS, and its gate would refuse every such export.
 */
export function sanityFights(level: number): {
    solo: Scenario
    dungeon: Scenario
} {
    const above = Math.max(0, level - RUNNER_LEVEL)
    const solo = RUNNER_LEVEL + 1 + above
    const dungeon = RUNNER_LEVEL + 2 + above
    return {
        solo: {
            fight_id: 'sanity-solo',
            label: `Solo, 30 s vs level ${solo}`,
            kind: 'single',
            target_level: solo,
            duration_s: 30,
            variation_s: 5,
            being_hit: true,
            in_front: true,
            totems: false,
            pulls: 1,
            gap_s: 0,
        },
        dungeon: {
            fight_id: 'sanity-dungeon',
            label: `Dungeon, 30 s vs level ${dungeon}`,
            kind: 'single',
            target_level: dungeon,
            duration_s: 30,
            variation_s: 5,
            being_hit: false,
            in_front: false,
            totems: true,
            pulls: 1,
            gap_s: 0,
        },
    }
}

/** The chain: 10 pulls of 25 s, 12 s apart, being hit, no drinking. */
export function chainFor(level: number): Scenario {
    return {
        fight_id: CHAIN_FIGHT,
        label: `Chain, 10 pulls 12 s apart vs level ${level}`,
        kind: 'chain',
        target_level: level,
        duration_s: 25,
        variation_s: 0,
        being_hit: true,
        totems: false,
        pulls: 10,
        gap_s: 12,
    }
}

/** Every fight at `level`: the single ones, then the chain. */
export function allScenarios(level: number): Scenario[] {
    return [...scenariosFor(level), chainFor(level)]
}

/** A scenario as the results file describes the fight. */
export function fightEntry(scenario: Scenario): ResultsFile['fights'][number] {
    return {
        fight_id: scenario.fight_id,
        label: scenario.label,
        kind: scenario.kind,
        target_level: scenario.target_level,
        duration_s: scenario.duration_s,
        setup: {
            starting_mana_pct: 100,
            being_hit: scenario.being_hit,
            pulls: scenario.pulls,
            gap_s: scenario.gap_s,
            drinks: false,
            target_armor: mobArmor(scenario.target_level),
        },
    }
}
