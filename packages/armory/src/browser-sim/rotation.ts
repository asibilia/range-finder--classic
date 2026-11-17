/**
 * The Enhancement Shaman rotation at the character's ranks: each spell at
 * its highest rank taught at or below the character's level (and trained,
 * when the export lists trained spells). A spell with no such rank is left
 * out of the rotation.
 */
import type { Character } from './character'

/** A spell's ranks as `[spell id, level taught]`, lowest first. */
type Ranks = readonly (readonly [number, number])[]

export const RANKS = {
    lightningShield: [
        [324, 8],
        [325, 16],
        [905, 24],
        [945, 32],
        [8134, 40],
        [10431, 48],
        [10432, 56],
    ],
    flameShock: [
        [8050, 10],
        [8052, 18],
        [8053, 28],
        [10447, 40],
        [10448, 52],
        [29228, 60],
    ],
    earthShock: [
        [8042, 4],
        [8044, 8],
        [8045, 14],
        [8046, 24],
        [10412, 36],
        [10413, 48],
        [10414, 60],
    ],
    strengthOfEarthTotem: [
        [8075, 10],
        [8160, 24],
        [8161, 38],
        [10442, 52],
        [25361, 60],
    ],
    searingTotem: [
        [3599, 10],
        [6363, 20],
        [6364, 30],
        [6365, 40],
        [10437, 50],
        [10438, 60],
    ],
} as const satisfies Record<string, Ranks>

/** Stormstrike, a talent: one rank. */
export const STORMSTRIKE = 17364

/** The names of the rotation's spells, every rank, for the damage split. */
const NAMED: [string, Ranks][] = [
    ['Lightning Shield', RANKS.lightningShield],
    ['Flame Shock', RANKS.flameShock],
    ['Earth Shock', RANKS.earthShock],
    ['Searing Totem', RANKS.searingTotem],
    ['Stormstrike', [[STORMSTRIKE, 1]]],
]
export const SPELL_NAMES: ReadonlyMap<number, string> = new Map(
    NAMED.flatMap(([name, ranks]) => ranks.map(([id]) => [id, name] as const))
)

/** The rank the character casts: highest taught (and trained), or none. */
export function rankFor(character: Character, ranks: Ranks): number | null {
    const known = character.known_spells
    let found: number | null = null
    for (const [id, level] of ranks) {
        if (level > character.level) break
        if (known.length > 0 && !known.includes(id)) continue
        found = id
    }
    return found
}

/**
 * Every trained spell the rotation casts, with the level its rank is
 * taught. Stormstrike isn't one: it comes with its talent point.
 */
export function rotationSpells(
    character: Character
): { id: number; level: number }[] {
    const spells: { id: number; level: number }[] = []
    for (const ranks of Object.values(RANKS) as Ranks[]) {
        const id = rankFor(character, ranks)
        const rank = ranks.find(([at]) => at === id)
        if (rank) spells.push({ id: rank[0], level: rank[1] })
    }
    return spells
}

type Action = Record<string, unknown>

const cast = (spellId: number) => ({ castSpell: { spellId: { spellId } } })

const totemDue = (totemType: string) => ({
    cmp: {
        op: 'OpLe',
        lhs: { totemRemainingTime: { totemType } },
        rhs: { const: { val: '2s' } },
    },
})

/**
 * The sim's APL rotation: Lightning Shield kept up, totems when the fight
 * has them (Strength of Earth and Searing), Stormstrike, Flame Shock on one
 * target, then Earth Shock.
 */
export function rotationFor(
    character: Character,
    options: { totems: boolean; stormstrike: boolean }
): Record<string, unknown> {
    const shield = rankFor(character, RANKS.lightningShield)
    const flame = rankFor(character, RANKS.flameShock)
    const earth = rankFor(character, RANKS.earthShock)
    const strength = options.totems
        ? rankFor(character, RANKS.strengthOfEarthTotem)
        : null
    const searing = options.totems
        ? rankFor(character, RANKS.searingTotem)
        : null

    const prepull: { action: Action; doAtValue: Action }[] = []
    const at = (val: string) => ({ const: { val } })
    if (shield !== null)
        prepull.push({ action: cast(shield), doAtValue: at('-3s') })
    if (strength !== null)
        prepull.push({ action: cast(strength), doAtValue: at('-2s') })
    if (searing !== null)
        prepull.push({ action: cast(searing), doAtValue: at('-1s') })

    const priority: Action[] = []
    if (shield !== null)
        priority.push({
            condition: {
                not: {
                    val: {
                        auraIsActive: {
                            auraId: { spellId: shield },
                            includeReactionTime: true,
                        },
                    },
                },
            },
            ...cast(shield),
        })
    if (strength !== null)
        priority.push({ condition: totemDue('Earth'), ...cast(strength) })
    if (searing !== null)
        priority.push({ condition: totemDue('Fire'), ...cast(searing) })
    if (options.stormstrike) priority.push(cast(STORMSTRIKE))
    if (flame !== null)
        priority.push({
            multidot: {
                spellId: { spellId: flame },
                maxDots: 1,
                maxOverlap: { const: { val: '0ms' } },
            },
        })
    if (earth !== null) priority.push(cast(earth))

    return {
        type: 'TypeAPL',
        prepullActions: prepull,
        priorityList: priority.map((action) => ({ action })),
    }
}
