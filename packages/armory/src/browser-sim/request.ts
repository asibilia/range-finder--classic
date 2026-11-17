/**
 * The sim request for one fight: the character with its gear, talents,
 * imbue and rotation, against one mob at the fight's level. The same
 * character, fight and options always give the same request.
 */
import { STAT, type RaidSimRequest } from '@goturbo/sim'

import { SLOTS } from '../results-file'
import type { Character, Gear, SheetBuffs } from './character'
import { gameStats } from './game-stats'
import { rotationFor } from './rotation'
import { allScenarios, mobArmor, type Scenario } from './scenarios'

/** Where Stormstrike sits in a Shaman's talent string: tree, then talent. */
const STORMSTRIKE_TALENT = { tree: 1, index: 11 }

/** The sim's stats arrays run to health, the last a mob needs. */
const MOB_STATS = STAT.health + 1

export type RequestOptions = {
    seed: number
    iterations: number
    /** Gear in place of the character's own. */
    gear?: Gear
    /** The share of max mana the fight starts with; absent: full. */
    startingManaPct?: number
    /** Stats added on top, as the sim's `UnitStats`. */
    bonusStats?: { stats?: number[]; pseudoStats?: number[] }
    /** The buffs up at export, for a sheet compared with the game's. */
    sheetBuffs?: SheetBuffs
    /** Records damage and mana per bucket of this many ms. */
    timelineBucketMs?: number
}

/** True when the talent string takes Stormstrike. */
export function hasStormstrike(character: Character): boolean {
    const tree = character.talents.split('-')[STORMSTRIKE_TALENT.tree] ?? ''
    return Number(tree[STORMSTRIKE_TALENT.index] ?? 0) > 0
}

function scenarioOf(character: Character, fight: string | Scenario) {
    if (typeof fight !== 'string') return fight
    const found = allScenarios(character.level).find(
        (s) => s.fight_id === fight
    )
    if (!found) throw new Error(`No fight ${fight}.`)
    return found
}

/** The sim's equipment: never an item the sim's data lacks. */
function equipment(character: Character, gear: Gear) {
    return {
        items: SLOTS.map((slot) => {
            const piece = gear[slot]
            const unknown = character.unknown_gear?.[slot]
            return piece && piece.id !== unknown?.id ? { ...piece } : {}
        }),
    }
}

/**
 * The character's bonus stats (worn items the sim lacks) in `gear`, by the
 * `Gear` rule: a slot whose unknown item `gear` empties (null) or replaces
 * takes its stats off, as the runner's `wearing()`, and a slot `gear`
 * leaves out keeps them. Undefined when no stat is left.
 */
function gearBonus(
    character: Character,
    gear: Gear | undefined
): number[] | undefined {
    const bonus = [...character.bonus_stats]
    for (const slot of SLOTS) {
        const unknown = character.unknown_gear?.[slot]
        const piece = gear?.[slot]
        if (!unknown || piece === undefined || piece?.id === unknown.id)
            continue
        gameStats(unknown.stats).forEach((amount, i) => {
            bonus[i] = (bonus[i] ?? 0) - amount
        })
    }
    return bonus.some((amount) => amount !== 0) ? bonus : undefined
}

/** Two stats arrays added, as the runner's `mergeStats`. */
function mergeStats(a: number[] | undefined, b: number[] | undefined) {
    if (!a) return b
    if (!b) return a
    return Array.from(
        { length: Math.max(a.length, b.length) },
        (_, i) => (a[i] ?? 0) + (b[i] ?? 0)
    )
}

/** The request for one pull of `fight` (a fight id or a scenario). */
export function buildRequest(
    character: Character,
    fight: string | Scenario,
    options: RequestOptions
): RaidSimRequest {
    const scenario = scenarioOf(character, fight)
    const player: Record<string, unknown> = {
        name: character.name,
        race: character.profile.race,
        class: character.profile.class,
        equipment: equipment(character, options.gear ?? character.gear),
        talentsString: character.talents,
        enhancementShaman: {
            options: {
                classOptions: character.imbue
                    ? { imbueMh: character.imbue }
                    : {},
            },
        },
        consumables: {},
        buffs: {},
        // The sim has no Unarmed skill, and an unknown enum is an error.
        weaponSkills: (character.weapon_skills ?? []).filter(
            (skill) => skill.skill !== 'WeaponSkillUnarmed'
        ),
        rotation: rotationFor(character, {
            totems: scenario.totems,
            stormstrike: hasStormstrike(character),
        }),
        distanceFromTarget: 5,
        inFrontOfTarget: scenario.in_front ?? scenario.being_hit,
        reactionTimeMs: 100,
    }
    if (options.startingManaPct !== undefined)
        player.startingManaPercent = options.startingManaPct
    // Worn items the sim lacks, the per-sim bonus and the export's buffs.
    const bonus = mergeStats(
        mergeStats(
            gearBonus(character, options.gear),
            options.bonusStats?.stats
        ),
        options.sheetBuffs?.stats
    )
    if (options.bonusStats || bonus)
        player.bonusStats = {
            ...options.bonusStats,
            ...(bonus ? { stats: bonus } : {}),
        }
    if (options.sheetBuffs?.kings)
        player.buffs = { greaterBlessingOfKings: true }

    const stats = new Array<number>(MOB_STATS).fill(0)
    stats[STAT.armor] = mobArmor(scenario.target_level)
    stats[STAT.health] = 10_000_000
    const level = scenario.target_level

    const simOptions: Record<string, unknown> = {
        iterations: options.iterations,
        randomSeed: options.seed,
    }
    if (options.timelineBucketMs)
        simOptions.timelineBucketMs = options.timelineBucketMs

    return {
        raid: {
            parties: [{ players: [player] }],
            tanks: scenario.being_hit ? [{ type: 'Player', index: 0 }] : [],
            buffs: {},
        },
        encounter: {
            duration: scenario.duration_s,
            durationVariation: scenario.variation_s,
            targets: [
                {
                    name: `Level ${level} mob`,
                    level,
                    mobType: 'MobTypeHumanoid',
                    stats,
                    minBaseDamage: scenario.being_hit ? 1.5 * level : 0,
                    damageSpread: 0.3,
                    swingSpeed: 2,
                    tankIndex: 0,
                },
            ],
        },
        simOptions,
    }
}
