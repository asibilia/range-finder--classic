/**
 * The sim request for one fight: the character with its gear, talents,
 * imbue and rotation, against one mob at the fight's level. The same
 * character, fight and options always give the same request.
 */
import { BONUS_STAT_COUNT, STAT, type RaidSimRequest } from '@goturbo/sim'

import { SLOTS } from '../results-file'
import {
    wornGear,
    type Character,
    type Gear,
    type SheetBuffs,
    type UnknownPiece,
} from './character'
import { gameStats } from './game-stats'
import { rotationFor } from './rotation'
import { allScenarios, mobArmor, type Scenario } from './scenarios'
import { hasStormstrike } from './talents'

/** The sim's stats arrays run to health, the last a mob needs. */
const MOB_STATS = STAT.health + 1

export type RequestOptions = {
    seed: number
    iterations: number
    /**
     * Gear in place of everything the character wears (`wornGear`), by
     * `Gear`'s rule.
     */
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

function scenarioOf(character: Character, fight: string | Scenario) {
    if (typeof fight !== 'string') return fight
    const found = allScenarios(character.level).find(
        (s) => s.fight_id === fight
    )
    if (!found) throw new Error(`No fight ${fight}.`)
    return found
}

/** The worn items the sim lacks, by id. */
function unknownById(character: Character): Map<number, UnknownPiece> {
    return new Map(
        Object.values(character.unknown_gear ?? {}).map((piece) => [
            piece.id,
            piece,
        ])
    )
}

/** The sim's equipment: never an item the sim's data lacks. */
function equipment(gear: Gear, lacked: ReadonlyMap<number, UnknownPiece>) {
    return {
        items: SLOTS.map((slot) => {
            const piece = gear[slot]
            return piece && !lacked.has(piece.id) ? { ...piece } : {}
        }),
    }
}

/**
 * The game stats of the items in `gear` the sim lacks, once for each slot
 * that holds one, as the runner's `wearing()` keeps an unknown item's
 * stats only while it's worn. Undefined when there are none.
 */
function gearBonus(
    gear: Gear,
    lacked: ReadonlyMap<number, UnknownPiece>
): number[] | undefined {
    const bonus = new Array<number>(BONUS_STAT_COUNT).fill(0)
    for (const slot of SLOTS) {
        const piece = lacked.get(gear[slot]?.id ?? -1)
        if (!piece) continue
        gameStats(piece.stats).forEach((amount, i) => {
            bonus[i] = (bonus[i] ?? 0) + amount
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
    const gear = options.gear ?? wornGear(character)
    const lacked = unknownById(character)
    const player: Record<string, unknown> = {
        name: character.name,
        race: character.profile.race,
        class: character.profile.class,
        equipment: equipment(gear, lacked),
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
            stormstrike: hasStormstrike(character.talents),
        }),
        distanceFromTarget: 5,
        inFrontOfTarget: scenario.in_front ?? scenario.being_hit,
        reactionTimeMs: 100,
    }
    // A pull's own share (a chain's later pulls), else the fight's.
    const startingManaPct =
        options.startingManaPct ?? scenario.starting_mana_pct
    if (startingManaPct !== undefined)
        player.startingManaPercent = startingManaPct
    // Worn items the sim lacks, the per-sim bonus and the export's buffs.
    const bonus = mergeStats(
        mergeStats(gearBonus(gear, lacked), options.bonusStats?.stats),
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
