/**
 * The character the browser sim starts from: the runner's `Character`. The
 * export reader (#77) makes one from an export; tests make Testchar's.
 */
import type { LevelProfile } from '@goturbo/sim/browser'

import type { Check, ResultsFile, Slot } from '../results-file'

/** One worn item, as the sim's `ItemSpec` takes it. */
export type GearPiece = { id: number; enchant?: number; randomSuffix?: number }

/** Gear by slot; a slot that's absent or null is empty. */
export type Gear = Partial<Record<Slot, GearPiece | null>>

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
    /** Talents in the sim's format: each tree's ranks, trees split by `-`. */
    talents: string
    gear: Gear
    /** Item ids in the bags. */
    bags?: number[]
    /** The main hand's imbue as the sim names it, e.g. `WindfuryWeapon`. */
    imbue: string | null
    /** Spell ids the character has trained; empty means unknown. */
    known_spells: number[]
    /** Weapon skills as the sim's `WeaponSkillValue` takes them. */
    weapon_skills?: { skill: string; value: number }[]
    profile: LevelProfile
    /** The game's sheet at export. */
    sheet: ResultsFile['sheet']
    /** True when spell crit came from calibration, not the game's sheet. */
    calibrated_spell_crit?: boolean
    export_saved_at: string
    game_build: string
}

/** A run that stops before it makes a file. The page words each one. */
export type SimStop =
    | { kind: 'unsupported'; class: string; spec: string }
    | { kind: 'buffed'; buffs: string[] }
    | { kind: 'format'; format: number; accepted: number[] }
    | { kind: 'gates'; failed: Check[] }
