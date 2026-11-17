/**
 * The character sheet the sim gives: `turboSheet`'s `PlayerStats` read as
 * the game's sheet (attributes, attack power, armor, health, mana and the
 * percentages), the same shape as a results file's `sheet`.
 */
import type { SimSheet } from './sim'

/** The proto `Stat` enum (proto/common.proto), by name. */
export const STAT = {
    strength: 0,
    agility: 1,
    stamina: 2,
    intellect: 3,
    spellDamage: 5,
    natureDamage: 10,
    spirit: 13,
    attackPower: 14,
    hitRating: 17,
    critRating: 18,
    armor: 27,
    bonusArmor: 28,
    health: 29,
    mana: 30,
    mp5: 31,
} as const

/** The proto `PseudoStat` enum (proto/common.proto), the ones read here. */
export const PSEUDO_STAT = {
    mainHandDps: 0,
    dodgePercent: 4,
    meleeHitPercent: 12,
    meleeCritPercent: 14,
    spellCritPercent: 15,
} as const

/** How long a proto `stats` array is: one entry per `Stat`. */
export const BONUS_STAT_COUNT = 40
/** How long a proto `pseudoStats` array is: the sim reads it by index. */
export const PSEUDO_STAT_COUNT = 37

/** The sheet as the game shows it, and as a results file keeps it. */
export type Sheet = {
    strength: number
    agility: number
    stamina: number
    intellect: number
    spirit: number
    attack_power: number
    armor: number
    health: number
    mana: number
    melee_crit_pct: number
    spell_crit_pct: number
    dodge_pct: number
    melee_hit_pct: number
}

type UnitStats = { stats?: number[]; pseudoStats?: number[] }

const hundredths = (value: number) => Math.round(value * 100) / 100

/** The sheet in a `turboSheet` answer: its final stats, rounded as shown. */
export function sheetFromSim(sheet: SimSheet): Sheet {
    const final = (sheet.player.finalStats ?? {}) as UnitStats
    const stat = (index: number) => final.stats?.[index] ?? 0
    const pseudo = (index: number) => final.pseudoStats?.[index] ?? 0
    return {
        strength: Math.round(stat(STAT.strength)),
        agility: Math.round(stat(STAT.agility)),
        stamina: Math.round(stat(STAT.stamina)),
        intellect: Math.round(stat(STAT.intellect)),
        spirit: Math.round(stat(STAT.spirit)),
        attack_power: Math.round(stat(STAT.attackPower)),
        armor: Math.round(stat(STAT.armor) + stat(STAT.bonusArmor)),
        health: Math.round(stat(STAT.health)),
        mana: Math.round(stat(STAT.mana)),
        melee_crit_pct: hundredths(pseudo(PSEUDO_STAT.meleeCritPercent)),
        spell_crit_pct: hundredths(pseudo(PSEUDO_STAT.spellCritPercent)),
        dodge_pct: hundredths(pseudo(PSEUDO_STAT.dodgePercent)),
        melee_hit_pct: hundredths(pseudo(PSEUDO_STAT.meleeHitPercent)),
    }
}
