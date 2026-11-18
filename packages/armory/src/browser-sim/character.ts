/**
 * The character the browser sim starts from: the runner's `Character`. The
 * export reader (#77) makes one from an export; tests make Testchar's.
 */
import type { LevelProfile } from '@goturbo/sim'

import { SLOTS, type Check, type ResultsFile, type Slot } from '../results-file'

/** One worn item, as the sim's `ItemSpec` takes it. */
export type GearPiece = { id: number; enchant?: number; randomSuffix?: number }

/**
 * Gear by slot; a slot that's absent or null is empty. A piece may be a
 * worn item the sim lacks (one of `Character.unknown_gear`): a request
 * never sends it to the sim, and adds its game stats instead, once for
 * each slot that holds it (`buildRequest`).
 */
export type Gear = Partial<Record<Slot, GearPiece | null>>

/** Game stats as the export has them: `ITEM_MOD_*` keys to amounts. */
export type GameStats = Record<string, number>

/** A worn item the sim's item data lacks, as the game exported it. */
export type UnknownPiece = { id: number; name: string; stats: GameStats }

/** One item in the bags, as the export has it. */
export type BagItem = {
    id: number
    name: string
    /** The game's quality, 0 (poor) to 5 (legendary). */
    quality: number
    item_level: number
    required_level: number
    /** The game's equip location, e.g. `INVTYPE_HEAD`. */
    equip_loc: string
    stats: GameStats
}

/**
 * What the buffs up at export added to the game's sheet, as the sim
 * models them: their stats (indexed by the proto `Stat` enum, from
 * `buffs.json`) and Blessing of Kings.
 */
export type SheetBuffs = { stats: number[]; kings: boolean }

export type Character = {
    /** For display only. */
    name: string
    /** The export addon's id; all zeros counts as none. */
    character_key?: string
    level: number
    /** The game's name, e.g. `Orc`. */
    race: string
    /** The game's name, e.g. `Shaman`. */
    class: string
    /** From the export's `identity.sex` (2 male, 3 female); absent: unknown. */
    gender?: 'male' | 'female'
    /** Talents in the sim's format: each tree's ranks, trees split by `-`. */
    talents: string
    /** The worn items the sim knows; `wornGear` adds the ones it lacks. */
    gear: Gear
    /** Worn items the sim's item data lacks, by slot: never in `gear`. */
    unknown_gear?: Partial<Record<Slot, UnknownPiece>>
    /**
     * The game stats of worn items the sim lacks, indexed by the proto
     * `Stat` enum (40 entries, all 0 when there's none): a summary of
     * `unknown_gear`. A request adds them from its gear, by `Gear`'s rule.
     */
    bonus_stats: number[]
    /** The items in the bags, as the export has them. */
    bags?: BagItem[]
    /** The main hand's imbue as the sim names it, e.g. `WindfuryWeapon`. */
    imbue: string | null
    /** Spell ids the character has trained; empty means unknown. */
    known_spells: number[]
    /** Weapon skills as the sim's `WeaponSkillValue` takes them. */
    weapon_skills?: { skill: string; value: number }[]
    /**
     * The level's weapon-skill cap (5 per level) less the main hand's
     * weapon skill (rank plus modifier); 0 when the export has no row for
     * it, and negative above the cap.
     */
    weapon_skill_deficit: number
    /**
     * Out-of-combat mana regen in mana per second, from the export's
     * `sheet.manaRegen.outsideFiveSecondRule`: 0 when absent. The chain
     * gets it back between pulls.
     */
    ooc_mana_regen: number
    profile: LevelProfile
    /** The game's sheet at export. */
    sheet: ResultsFile['sheet']
    /**
     * The buffs in `sheet`, when any changed it. The sheet check and
     * calibration sim with them; the fights don't.
     */
    sheet_buffs?: SheetBuffs
    /** True when spell crit came from calibration, not the game's sheet. */
    calibrated_spell_crit?: boolean
    export_saved_at: string
    game_build: string
}

/**
 * Everything the character wears: `gear`, and each worn item the sim
 * lacks in its slot. The worn set a request, the plan or a weapon swap
 * starts from.
 */
export function wornGear(character: Character): Gear {
    const gear: Gear = { ...character.gear }
    for (const slot of SLOTS) {
        const unknown = character.unknown_gear?.[slot]
        if (unknown) gear[slot] = { id: unknown.id }
    }
    return gear
}

/** A run that stops before it makes a file. The page words each one. */
export type SimStop =
    | { kind: 'unsupported'; class: string; spec: string }
    | { kind: 'buffed'; buffs: string[] }
    | { kind: 'format'; format: number; accepted: number[] }
    | { kind: 'gates'; failed: Check[] }
    | { kind: 'unknown_main_hand'; item_id: number }
