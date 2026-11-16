/**
 * Pawn strings: the stat weights as the Pawn addon imports them, one for
 * solo and one for dungeons.
 */
import type { ResultsFile, Stat } from '../results-file'
import type { StatWeights } from './weights'

/** Pawn's name for each weighed stat. */
const PAWN_STAT: Record<Stat, string | null> = {
    strength: 'Strength',
    agility: 'Agility',
    stamina: 'Stamina',
    intellect: 'Intellect',
    spirit: 'Spirit',
    attack_power: 'Ap',
    hit_rating: 'HitRating',
    crit_rating: 'CritRating',
    spell_damage: 'SpellDamage',
    mana_per_5: 'Mp5',
    weapon_dps: 'MeleeDps',
}

/** One Pawn scale: the stats with EP, two decimals, in the weights' order. */
export function pawnScale(
    name: string,
    weights: { stat: Stat; ep: number }[]
): string {
    const values = weights
        .filter((w) => w.ep !== 0 && PAWN_STAT[w.stat])
        .map((w) => `${PAWN_STAT[w.stat]}=${w.ep.toFixed(2)}`)
    return `( Pawn: v1: "${name}": ${values.join(', ')} )`
}

/** The file's Pawn strings, from the solo and short dungeon weights. */
export function pawnStrings(
    weights: StatWeights,
    level: number
): ResultsFile['pawn'] {
    const scales = [
        { fight: 'solo-hit-short', label: 'Solo', short: 'solo' },
        { fight: 'dungeon-short', label: 'Dungeon', short: 'dungeon' },
    ]
    return scales.flatMap(({ fight, label, short }) => {
        const found = weights.find((w) => w.fight_id === fight)
        if (!found) return []
        return [
            {
                label: `${label}, level ${level}`,
                text: pawnScale(
                    `Enh ${short} L${level} (provisional)`,
                    found.weights
                ),
            },
        ]
    })
}
