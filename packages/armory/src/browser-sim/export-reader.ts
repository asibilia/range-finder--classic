/**
 * The export reader: a `TurboCharExport.lua` (the export addon's
 * SavedVariables file) into the character `simCharacter` sims, or a stop.
 * The order: the format check, the known-class check, the class and spec
 * check, buff classification, the unknown main hand check (none of them
 * runs a sim), then calibration (at most one sheet run, using read-only
 * `calibrations.json` for cross-checks or unknown-buff clean fallback).
 */
import {
    BONUS_STAT_COUNT,
    PSEUDO_STAT,
    STAT,
    type LevelProfile,
    type SimPool,
} from '@goturbo/sim'

import type { ResultsFile, Slot } from '../results-file'
import {
    classifyBuff,
    readBuff,
    statsFromNumbers,
    unknownBuffs,
    type BuffNumbers,
    type ClassifiedBuff,
    type FilteredBuff,
    type KnownBuffs,
} from './buff-filter'
import type {
    BagItem,
    Character,
    GameStats,
    Gear,
    Profession,
    GearPiece,
    SheetBuffs,
    SimStop,
    UnknownPiece,
} from './character'
import { gameStats } from './game-stats'
import { loadItemDb, type DbItem } from './gear'
import { buildRequest } from './request'
import { DEFAULT_FIGHT } from './scenarios'
import { FIGHT_ITERATIONS, FIGHT_SEED } from './session'
import { SUPPORTED, supportedSpec } from './sim-character'
import { talentTrees, type TalentTree } from './talents'
import { parseSavedVariables, type SavedValue } from './saved-variables'

/** The export formats this reader takes. */
export const EXPORT_FORMATS: readonly number[] = [7, 8, 9, 10]

/**
 * The game's classes. An export's class is checked against them before it
 * names any data file.
 */
export const KNOWN_CLASSES: readonly string[] = [
    'Warrior',
    'Paladin',
    'Hunter',
    'Rogue',
    'Priest',
    'Shaman',
    'Mage',
    'Warlock',
    'Druid',
]

/** The SavedVariables table the export addon writes. */
export const EXPORT_VARIABLE = 'TurboCharExportDB'

/** The calls `calibrate` makes: one sheet run. */
export const CALIBRATION_CALLS = 1

/** The worn slots, by the game's inventory slot and the export's name. */
export const EXPORT_SLOTS: readonly {
    slot: Slot
    inventory: number
    name: string
}[] = [
    { slot: 'head', inventory: 1, name: 'head' },
    { slot: 'neck', inventory: 2, name: 'neck' },
    { slot: 'shoulder', inventory: 3, name: 'shoulder' },
    { slot: 'chest', inventory: 5, name: 'chest' },
    { slot: 'waist', inventory: 6, name: 'waist' },
    { slot: 'legs', inventory: 7, name: 'legs' },
    { slot: 'feet', inventory: 8, name: 'feet' },
    { slot: 'wrist', inventory: 9, name: 'wrist' },
    { slot: 'hands', inventory: 10, name: 'hands' },
    { slot: 'finger_1', inventory: 11, name: 'finger1' },
    { slot: 'finger_2', inventory: 12, name: 'finger2' },
    { slot: 'trinket_1', inventory: 13, name: 'trinket1' },
    { slot: 'trinket_2', inventory: 14, name: 'trinket2' },
    { slot: 'back', inventory: 15, name: 'back' },
    { slot: 'main_hand', inventory: 16, name: 'mainHand' },
    { slot: 'off_hand', inventory: 17, name: 'offHand' },
    { slot: 'relic', inventory: 18, name: 'ranged' },
]

/** Weapon imbues by the game's enchant id, as the sim names them. */
export const IMBUES: Readonly<Record<number, string>> = {
    // Rockbiter Weapon, ranks 1 to 7.
    29: 'RockbiterWeapon',
    6: 'RockbiterWeapon',
    1: 'RockbiterWeapon',
    503: 'RockbiterWeapon',
    1663: 'RockbiterWeapon',
    683: 'RockbiterWeapon',
    1664: 'RockbiterWeapon',
    // Flametongue Weapon, ranks 1 to 6.
    5: 'FlametongueWeapon',
    4: 'FlametongueWeapon',
    3: 'FlametongueWeapon',
    523: 'FlametongueWeapon',
    1665: 'FlametongueWeapon',
    1666: 'FlametongueWeapon',
    // Frostbrand Weapon, ranks 1 to 5.
    2: 'FrostbrandWeapon',
    12: 'FrostbrandWeapon',
    524: 'FrostbrandWeapon',
    1667: 'FrostbrandWeapon',
    1668: 'FrostbrandWeapon',
    // Windfury Weapon, ranks 1 to 4.
    283: 'WindfuryWeapon',
    284: 'WindfuryWeapon',
    525: 'WindfuryWeapon',
    1669: 'WindfuryWeapon',
}

/** Rates the export doesn't carry: the class's base crit and dodge. */
export const BASE_RATES: Readonly<
    Record<
        string,
        Pick<
            LevelProfile,
            'baseMeleeCrit' | 'baseSpellCrit' | 'baseDodgePercent'
        >
    >
> = {
    Shaman: { baseMeleeCrit: 1.7, baseSpellCrit: 2.3, baseDodgePercent: 1.7 },
}

/**
 * The runner's 10 melee weapon skills by the game's name, as the sim's
 * `WeaponSkill` names them. Unarmed has no sim skill, so it's never sent.
 */
export const WEAPON_SKILLS: Readonly<Record<string, string>> = {
    Axes: 'WeaponSkillAxes',
    'Two-Handed Axes': 'WeaponSkillTwoHandedAxes',
    Maces: 'WeaponSkillMaces',
    'Two-Handed Maces': 'WeaponSkillTwoHandedMaces',
    Swords: 'WeaponSkillSwords',
    'Two-Handed Swords': 'WeaponSkillTwoHandedSwords',
    Polearms: 'WeaponSkillPolearms',
    Staves: 'WeaponSkillStaves',
    Daggers: 'WeaponSkillDaggers',
    'Fist Weapons': 'WeaponSkillFistWeapons',
}

/** The imbues a main-hand tooltip line names, e.g. `Rockbiter 7 (29 min)`. */
const TOOLTIP_IMBUE = /\b(Windfury|Flametongue|Rockbiter|Frostbrand)\b/

/** The attributes and rates an export must carry, as the profile names them. */
const REQUIRED_STATS = [
    'strength',
    'agility',
    'stamina',
    'intellect',
    'spirit',
    'critPerAgility',
] as const

const CROSS_CHECK_TOLERANCE = 1e-6

type Table = { [key: string]: SavedValue }

const table = (value: SavedValue | undefined): Table =>
    value !== null && typeof value === 'object' ? value : {}
const num = (value: SavedValue | undefined): number =>
    typeof value === 'number' ? value : 0
const str = (value: SavedValue | undefined): string =>
    typeof value === 'string' ? value : ''
/** A Lua array's values in their numbering; holes are skipped. */
const list = (value: SavedValue | undefined): SavedValue[] =>
    Object.entries(table(value))
        .filter(([key]) => /^\d+$/.test(key))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, v]) => v)
const hundredths = (value: number) => Math.round(value * 100) / 100

/** `SHAMAN` (the game's class token) as `Shaman`. */
function className(token: string): string {
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

/** The game's race as the sim's `Race` enum names it. */
function raceEnum(race: string): string {
    const name = race === 'Scourge' ? 'Undead' : race
    return `Race${name.replace(/[^A-Za-z]/g, '')}`
}

/**
 * The talent string the sim takes, from an export's talent rows (its
 * `talents.list`, or its traits when the list is empty): each tree's ranks
 * in the trees' order, trailing zeros and empty trees dropped. A row is
 * matched by its name (in lower case), then by its spell id.
 */
export function talentString(rows: SavedValue[], trees: TalentTree[]): string {
    const ranks = trees.map((tree) => tree.talents.map(() => 0))
    const find = (match: (t: TalentTree['talents'][number]) => boolean) => {
        for (const [i, tree] of trees.entries()) {
            const j = tree.talents.findIndex(match)
            if (j >= 0) return [i, j] as const
        }
        return null
    }
    for (const raw of rows) {
        const row = table(raw)
        const rank = num(row.rank)
        if (rank <= 0) continue
        const name = str(row.name).toLowerCase()
        const spell = num(row.spellID)
        const at =
            (name ? find((t) => t.fancyName.toLowerCase() === name) : null) ??
            (spell > 0 ? find((t) => t.spellId === spell) : null)
        if (!at) continue
        const [i, j] = at
        ranks[i]![j] = Math.min(rank, trees[i]!.talents[j]!.maxPoints)
    }
    return ranks
        .map((tree) => tree.join('').replace(/0+$/, ''))
        .join('-')
        .replace(/-+$/, '')
}

/**
 * The character's gender from the export's `identity.sex`, as the game
 * numbers it (`UnitSex`: 1 unknown, 2 male, 3 female): spread into the
 * character, so anything but 2 or 3 leaves it out.
 */
export function genderOf(sex: SavedValue | undefined): {
    gender?: 'male' | 'female'
} {
    if (sex === 2) return { gender: 'male' }
    if (sex === 3) return { gender: 'female' }
    return {}
}

/**
 * The addon's character key, or undefined when there's none or it's
 * unusable: 32 hex digits with more than 4 distinct, as the addon's
 * `goodKey` rule. An all-zero key or a WoW player GUID is never a key.
 */
export function usableKey(key: SavedValue | undefined): string | undefined {
    if (typeof key !== 'string' || /[^0-9a-f-]/.test(key)) return undefined
    const hex = key.replace(/-/g, '')
    return hex.length === 32 && new Set(hex).size > 4 ? key : undefined
}

/** One worn item from the export: its id, enchant and random suffix. */
function gearPiece(
    entry: Table,
    known?: ReadonlyMap<number, DbItem>
): GearPiece | null {
    const linkStr = str(entry.link)
    const link = /\|Hitem:(-?\d+):(-?\d*):(?:-?\d*:){4}(-?\d*)/.exec(linkStr)
    const id = num(entry.id) || Number(link?.[1] ?? 0)
    if (!id) return null
    const piece: GearPiece = { id }
    const enchant = Number(link?.[2] || 0)
    let suffix = Number(link?.[3] || 0)
    if (suffix === 0 && known) {
        const suffixOptions = known.get(id)?.randomSuffixOptions
        if (suffixOptions && suffixOptions.length > 0) {
            const parts = /\|Hitem:([^|]+)/.exec(linkStr)?.[1]?.split(':') ?? []
            const bonusCount = Number(parts[12] || 0)
            for (let i = 0; i < bonusCount; i++) {
                const bonusId = Number(parts[13 + i] || 0)
                if (bonusId !== 0 && suffixOptions.includes(bonusId)) {
                    suffix = bonusId
                    break
                }
            }
        }
    }
    if (enchant > 0) piece.enchant = enchant
    if (suffix !== 0) piece.randomSuffix = suffix
    return piece
}

/** An item's game stats from the export: its numeric `ITEM_MOD_*` fields. */
function readGameStats(value: SavedValue | undefined): GameStats {
    const stats: GameStats = {}
    for (const [key, amount] of Object.entries(table(value)))
        if (typeof amount === 'number') stats[key] = amount
    return stats
}

/**
 * The worn gear the sim knows (`known`), and the items it lacks by slot,
 * with the game stats they add as bonus stats (the runner's
 * `characterFromExport`).
 */
function readGear(gear: Table, known: ReadonlyMap<number, DbItem>) {
    const worn: Gear = {}
    const unknown: Partial<Record<Slot, UnknownPiece>> = {}
    const bonus = new Array<number>(BONUS_STAT_COUNT).fill(0)
    for (const [key, raw] of Object.entries(gear)) {
        const entry = table(raw)
        const name = str(entry.slot)
        const slot = EXPORT_SLOTS.find((s) =>
            name ? s.name === name : String(s.inventory) === key
        )
        if (!slot) continue
        const piece = gearPiece(entry, known)
        if (!piece) continue
        if (known.has(piece.id)) {
            worn[slot.slot] = piece
            continue
        }
        const stats = readGameStats(entry.stats)
        unknown[slot.slot] = { id: piece.id, name: str(entry.name), stats }
        gameStats(stats).forEach((amount, i) => {
            bonus[i] = (bonus[i] ?? 0) + amount
        })
    }
    return { worn, unknown, bonus }
}

/** The bag items, as the export has them. */
function readBags(bags: SavedValue | undefined): BagItem[] {
    return list(bags)
        .map(table)
        .filter((item) => num(item.id) > 0)
        .map((item) => ({
            id: num(item.id),
            name: str(item.name),
            quality: num(item.quality),
            item_level: num(item.itemLevel),
            required_level: num(item.reqLevel),
            equip_loc: str(item.equipLoc),
            stats: readGameStats(item.stats),
        }))
}

/**
 * The main hand's imbue: the main hand's tooltip line first (`Windfury 1
 * (29 min)`), then its enchant id, then the meter (any Windfury damage
 * means Windfury Weapon), else none.
 */
function readImbue(db: Table): string | null {
    const tooltip = list(table(table(db.gear)['16']).tooltip)
        .map(str)
        .join('\n')
    const named = TOOLTIP_IMBUE.exec(tooltip)?.[1]
    if (named) return `${named}Weapon`
    for (const raw of list(table(db.weaponEnchants).mainHand)) {
        const enchant = table(raw)
        if (enchant.hasEnchant !== true) continue
        const imbue = IMBUES[num(enchant.enchantID)]
        if (imbue) return imbue
    }
    const windfury = list(table(db.meter).sessions).some((session) =>
        list(table(session).spells).some(
            (spell) =>
                /^Windfury/.test(str(table(spell).name)) &&
                num(table(spell).damage) > 0
        )
    )
    return windfury ? 'WindfuryWeapon' : null
}

/** A skill row's value: its rank plus its modifier. */
const skillValue = (row: Table) => num(row.rank) + num(row.modifier)

function readWeaponSkills(skills: SavedValue[]) {
    const out: { skill: string; value: number }[] = []
    for (const raw of skills) {
        const skill = WEAPON_SKILLS[str(table(raw).name)]
        if (skill && !out.some((s) => s.skill === skill))
            out.push({ skill, value: skillValue(table(raw)) })
    }
    return out
}

const PROFESSION_NAMES = [
    'Alchemy',
    'Blacksmithing',
    'Enchanting',
    'Engineering',
    'Herbalism',
    'Jewelcrafting',
    'Leatherworking',
    'Mining',
    'Skinning',
    'Tailoring',
    'First Aid',
    'Cooking',
    'Fishing',
] as const

/** Professions from skill rows, in the contract's primary/secondary order. */
export function readProfessions(skills: SavedValue | undefined): Profession[] {
    const best = new Map<string, Profession>()
    for (const raw of list(skills)) {
        if (raw === null || typeof raw !== 'object') continue
        const row: Table = raw
        const name = row.name
        if (
            typeof name !== 'string' ||
            !PROFESSION_NAMES.includes(
                name as (typeof PROFESSION_NAMES)[number]
            )
        )
            continue
        const { rank, maxRank, modifier } = row
        const integer = (value: SavedValue | undefined): value is number =>
            typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value)
        if (
            !integer(rank) ||
            !integer(maxRank) ||
            !integer(modifier) ||
            rank < 0 ||
            maxRank < 0
        )
            continue
        const skill = rank + modifier
        if (skill < 0) continue
        const previous = best.get(name)
        if (!previous || skill > previous.skill)
            best.set(name, { name, skill, max: maxRank })
    }
    return PROFESSION_NAMES.flatMap((name) => {
        const profession = best.get(name)
        return profession ? [profession] : []
    })
}

/** The main hand's gear entry and the skill row its weapon type names. */
function mainHandSkill(db: Table, gear: Table) {
    const mainHand = Object.values(gear)
        .map(table)
        .find((entry) => str(entry.slot) === 'mainHand')
    const kind = str(mainHand?.subclass).replace(/^One-Handed /, '')
    const skill = kind
        ? list(db.skills)
              .map(table)
              .find((s) => str(s.name) === kind)
        : undefined
    return { mainHand, skill }
}

/**
 * The level's weapon-skill cap less the main hand's weapon skill; 0 when
 * no skill row matches, negative above the cap.
 */
function weaponSkillDeficit(db: Table, gear: Table, level: number): number {
    const { skill } = mainHandSkill(db, gear)
    return skill ? 5 * level - skillValue(skill) : 0
}

/** The main hand's weapon skill as the sheet shows it, when exported. */
function sheetWeaponSkill(
    db: Table,
    gear: Table
): ResultsFile['sheet']['weapon_skill'] {
    const { mainHand, skill } = mainHandSkill(db, gear)
    if (!skill || num(skill.maxRank) < 1) return null
    return {
        weapon_type: str(mainHand?.subclass),
        current: num(skill.rank),
        max: num(skill.maxRank),
    }
}

/** The game's sheet at export, as a results file keeps it. */
function readSheet(sheet: Table): ResultsFile['sheet'] {
    const stat = table(sheet.stat)
    const total = (name: string) => num(table(stat[name]).total)
    const ap = table(sheet.attackPower)
    const spellCrit = sheet.spellCrit
    const spellCrits =
        typeof spellCrit === 'number'
            ? [spellCrit]
            : Object.values(table(spellCrit)).filter(
                  (v): v is number => typeof v === 'number'
              )
    return {
        strength: total('strength'),
        agility: total('agility'),
        stamina: total('stamina'),
        intellect: total('intellect'),
        spirit: total('spirit'),
        attack_power: num(ap.base) + num(ap.pos) + num(ap.neg),
        armor: num(table(sheet.armor).effective),
        health: num(sheet.health),
        mana: num(sheet.mana),
        melee_crit_pct: hundredths(num(sheet.meleeCrit)),
        spell_crit_pct: hundredths(Math.max(0, ...spellCrits)),
        dodge_pct: hundredths(num(sheet.dodge)),
        melee_hit_pct: hundredths(num(sheet.meleeHit)),
    }
}

/**
 * The level profile from the export's sheet, before calibration. It
 * throws when the export lacks an attribute or crit per Agility.
 */
function readProfile(
    db: Table,
    level: number,
    cls: string,
    knownSpells: number[]
): LevelProfile {
    const sheet = table(db.sheet)
    const stat = table(sheet.stat)
    const conversion = table(sheet.conversion)
    const critPer100 = table(conversion.critPer100)
    // The naked attribute: the total less what gear and buffs add; NaN
    // when the export has no total.
    const naked = (name: string) => {
        const s = table(stat[name])
        return typeof s.total === 'number'
            ? s.total - num(s.pos) - num(s.neg)
            : NaN
    }
    const agility = num(table(stat.agility).total)
    const critPerAgility =
        typeof critPer100.agility === 'number' ? critPer100.agility : NaN
    const dodgeFromAgility = num(conversion.dodgeFromAgility)
    const rates = BASE_RATES[cls] ?? BASE_RATES[SUPPORTED.class]!
    // Base dodge: 0.04% per point Defense is off the level's cap.
    const defense = list(db.skills)
        .map(table)
        .find((s) => str(s.name) === 'Defense')
    const profile: LevelProfile = {
        level,
        race: raceEnum(str(table(db.identity).race)),
        class: `Class${cls}`,
        strength: naked('strength'),
        agility: naked('agility'),
        stamina: naked('stamina'),
        intellect: naked('intellect'),
        spirit: naked('spirit'),
        baseHealth: 0,
        baseMana: 0,
        // The shaman's flat attack power: 2 per level less 20.
        baseAttackPower: 2 * level - 20,
        critPerAgility,
        dodgePerAgility:
            agility > 0 && dodgeFromAgility > 0
                ? (dodgeFromAgility * 100) / agility
                : critPerAgility,
        spellCritPerInt: num(critPer100.intellect),
        ...rates,
        baseDodgePercent:
            1.7 + (defense ? 0.04 * (skillValue(defense) - 5 * level) : 0),
        knownSpells,
    }
    for (const name of REQUIRED_STATS)
        if (!Number.isFinite(profile[name]))
            throw new Error(`the export lacks ${name}`)
    return profile
}

type CalibrationRow = {
    level: number
    race: string
    class: string
    base_health: number
    base_mana: number
    spell_crit_per_int: number
}

function cleanCalibration(
    rows: unknown,
    profile: LevelProfile
): CalibrationRow | undefined {
    if (!Array.isArray(rows)) return undefined
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i] as Partial<CalibrationRow> | null | undefined
        if (
            row &&
            typeof row === 'object' &&
            row.level === profile.level &&
            row.race === profile.race &&
            row.class === profile.class &&
            typeof row.base_health === 'number' &&
            Number.isFinite(row.base_health) &&
            typeof row.base_mana === 'number' &&
            Number.isFinite(row.base_mana) &&
            typeof row.spell_crit_per_int === 'number' &&
            Number.isFinite(row.spell_crit_per_int)
        )
            return row as CalibrationRow
    }
    return undefined
}

function sheetStatDiff(
    key: keyof BuffNumbers,
    game: ResultsFile['sheet'],
    stat: (i: number) => number
): number | undefined {
    switch (key) {
        case 'strength':
            return game.strength - stat(STAT.strength)
        case 'agility':
            return game.agility - stat(STAT.agility)
        case 'stamina':
            return game.stamina - stat(STAT.stamina)
        case 'intellect':
            return game.intellect - stat(STAT.intellect)
        case 'spirit':
            return game.spirit - stat(STAT.spirit)
        case 'attack_power':
            return game.attack_power - stat(STAT.attackPower)
        case 'armor':
            return game.armor - stat(STAT.armor)
        case 'health':
            return game.health - stat(STAT.health)
        case 'mana':
            return game.mana - stat(STAT.mana)
        default:
            return undefined
    }
}

function withCleanCalibration(
    character: Character,
    clean: CalibrationRow,
    askCrit: boolean
): Character {
    const useCleanCrit = askCrit && clean.spell_crit_per_int > 0
    return {
        ...character,
        profile: {
            ...character.profile,
            baseHealth: clean.base_health,
            baseMana: clean.base_mana,
            ...(useCleanCrit
                ? { spellCritPerInt: clean.spell_crit_per_int }
                : {}),
            source: 'The last clean calibration on record (unknown buff up).',
        },
        calibration_mode: 'last_clean_calibration',
        ...(askCrit ? { calibrated_spell_crit: true } : {}),
    }
}

async function solveFromSheet(
    character: Character,
    pool: SimPool,
    mode: 'solved_clean' | 'solved_from_buffed_sheet'
): Promise<Character> {
    const game = character.sheet
    const askCrit = character.profile.spellCritPerInt <= 0
    const trial: LevelProfile = {
        ...character.profile,
        baseHealth: Math.max(1, game.health - 10 * game.stamina),
        baseMana: Math.max(1, game.mana - 15 * game.intellect),
        spellCritPerInt: askCrit ? 0 : character.profile.spellCritPerInt,
    }
    // With the buffs the game's sheet had, so they don't land in the bases.
    const simmed = await pool.sheet(
        buildRequest({ ...character, profile: trial }, DEFAULT_FIGHT, {
            seed: FIGHT_SEED,
            iterations: FIGHT_ITERATIONS,
            sheetBuffs: character.sheet_buffs,
        }),
        trial
    )
    const final = (simmed.player.finalStats ?? {}) as {
        stats?: number[]
        pseudoStats?: number[]
    }
    const stat = (i: number) => final.stats?.[i] ?? 0
    const pseudo = (i: number) => final.pseudoStats?.[i] ?? 0
    const intellect = stat(STAT.intellect)
    const critGap = game.spell_crit_pct - pseudo(PSEUDO_STAT.spellCritPercent)
    const profile: LevelProfile = {
        ...trial,
        baseHealth: trial.baseHealth + game.health - stat(STAT.health),
        baseMana: trial.baseMana + game.mana - stat(STAT.mana),
        spellCritPerInt:
            askCrit && intellect > 0
                ? critGap / intellect
                : trial.spellCritPerInt,
        source: askCrit
            ? 'The export, with base health, base mana and spell crit per Intellect calibrated.'
            : 'The export, with base health and base mana calibrated.',
    }
    return {
        ...character,
        profile,
        calibration_mode: mode,
        ...(askCrit ? { calibrated_spell_crit: true } : {}),
    }
}

/**
 * Calibration: at most `CALIBRATION_CALLS` sheet calls.
 * - Cross-check: if a missing-description fixed-number allow-list candidate
 *   is the only unresolved buff and `calibrations.json` has a clean row,
 *   runs 1 sheet call at the clean base and upgrades if every sheet stat
 *   matches within `< 1e-6` unrounded; otherwise preserves clean calibration.
 * - Unknown buff: uses `calibrations.json` clean base in 0 calls when
 *   present, or falls back to solving from the buffed sheet in 1 call.
 * - Clean / resolved buffs: solves base health, base mana, and (when 0)
 *   spell crit per Intellect in 1 call.
 */
export async function calibrate(
    character: Character,
    pool: SimPool
): Promise<Character> {
    const { buff_cross_checks: crossChecks, ...baseCharacter } = character
    const askCrit = baseCharacter.profile.spellCritPerInt <= 0
    const hasUnknown = unknownBuffs(baseCharacter.filtered_buffs)
    const needsClean = (crossChecks?.length ?? 0) > 0 || hasUnknown
    const clean = needsClean
        ? cleanCalibration(
              await pool.data('calibrations.json'),
              baseCharacter.profile
          )
        : undefined

    const crossCheck = crossChecks?.length === 1 ? crossChecks[0] : undefined
    const otherUnknown =
        baseCharacter.filtered_buffs?.some(
            (buff, index) =>
                index !== crossCheck?.index && buff.how === 'unknown'
        ) ?? false

    if (crossCheck && clean && !otherUnknown) {
        const game = baseCharacter.sheet
        const trial: LevelProfile = {
            ...baseCharacter.profile,
            baseHealth: clean.base_health,
            baseMana: clean.base_mana,
            spellCritPerInt: askCrit
                ? 0
                : baseCharacter.profile.spellCritPerInt,
        }
        const simmed = await pool.sheet(
            buildRequest({ ...baseCharacter, profile: trial }, DEFAULT_FIGHT, {
                seed: FIGHT_SEED,
                iterations: FIGHT_ITERATIONS,
                sheetBuffs: baseCharacter.sheet_buffs,
            }),
            trial
        )
        const final = (simmed.player.finalStats ?? {}) as {
            stats?: number[]
            pseudoStats?: number[]
        }
        const stat = (i: number) => final.stats?.[i] ?? 0
        const pseudo = (i: number) => final.pseudoStats?.[i] ?? 0

        let checkedSheetStat = false
        let matched = true
        for (const [key, expected] of Object.entries(crossCheck.numbers)) {
            if (typeof expected !== 'number') continue
            const diff = sheetStatDiff(key as keyof BuffNumbers, game, stat)
            if (diff === undefined) continue
            checkedSheetStat = true
            if (!(Math.abs(diff - expected) < CROSS_CHECK_TOLERANCE)) {
                matched = false
                break
            }
        }
        if (checkedSheetStat && matched) {
            const updatedFiltered = (baseCharacter.filtered_buffs ?? []).map(
                (buff, index) =>
                    index === crossCheck.index
                        ? {
                              ...buff,
                              how: 'game_numbers' as const,
                              how_detail: 'list + sheet cross-check',
                              numbers: { ...crossCheck.numbers },
                          }
                        : buff
            )
            const added = statsFromNumbers(crossCheck.numbers)
            const mergedStats = (
                baseCharacter.sheet_buffs?.stats ??
                new Array<number>(BONUS_STAT_COUNT).fill(0)
            ).map((value, i) => value + (added[i] ?? 0))
            const sheetBuffs: SheetBuffs | undefined =
                baseCharacter.sheet_buffs?.kings ||
                mergedStats.some((value) => value !== 0)
                    ? {
                          stats: mergedStats,
                          kings: baseCharacter.sheet_buffs?.kings ?? false,
                      }
                    : undefined
            const intellect = stat(STAT.intellect)
            const critGap =
                game.spell_crit_pct - pseudo(PSEUDO_STAT.spellCritPercent)
            const profile: LevelProfile = {
                ...trial,
                spellCritPerInt:
                    askCrit && intellect > 0
                        ? critGap / intellect
                        : trial.spellCritPerInt,
                source: askCrit
                    ? 'The export, with base health, base mana and spell crit per Intellect calibrated.'
                    : 'The export, with base health and base mana calibrated.',
            }
            return {
                ...baseCharacter,
                profile,
                ...(sheetBuffs ? { sheet_buffs: sheetBuffs } : {}),
                filtered_buffs: updatedFiltered,
                calibration_mode: 'solved_clean',
                ...(askCrit ? { calibrated_spell_crit: true } : {}),
            }
        }
        return withCleanCalibration(baseCharacter, clean, askCrit)
    }

    if (hasUnknown) {
        if (clean) return withCleanCalibration(baseCharacter, clean, askCrit)
        return solveFromSheet(baseCharacter, pool, 'solved_from_buffed_sheet')
    }

    return solveFromSheet(baseCharacter, pool, 'solved_clean')
}

function aggregateSheetBuffs(
    classified: ClassifiedBuff[]
): SheetBuffs | undefined {
    const stats = new Array<number>(BONUS_STAT_COUNT).fill(0)
    let kings = false
    for (const entry of classified) {
        if (entry.kings) kings = true
        if (entry.simStats) {
            entry.simStats.forEach((amount, i) => {
                stats[i] = (stats[i] ?? 0) + amount
            })
        }
        if (entry.filtered.how === 'game_numbers' && entry.filtered.numbers) {
            statsFromNumbers(entry.filtered.numbers).forEach((amount, i) => {
                stats[i] = (stats[i] ?? 0) + amount
            })
        }
    }
    return kings || stats.some((amount) => amount !== 0)
        ? { stats, kings }
        : undefined
}

export type ExportRead = { kind: 'character'; character: Character } | SimStop

/**
 * Reads a `TurboCharExport.lua` into its character before calibration, or
 * a stop: the format, class and spec, and buff stops. It runs no sim, so
 * a run can plan its sims once it has the character.
 */
export async function exportCharacter(
    text: string,
    pool: SimPool
): Promise<ExportRead> {
    const db = parseSavedVariables(text)[EXPORT_VARIABLE]
    if (db === null || typeof db !== 'object')
        throw new Error(`This file has no ${EXPORT_VARIABLE}.`)

    const format = num(db.formatVersion)
    if (!EXPORT_FORMATS.includes(format))
        return { kind: 'format', format, accepted: [...EXPORT_FORMATS] }

    const identity = table(db.identity)
    const given = str(identity.class)
    const cls = className(given)
    if (!KNOWN_CLASSES.includes(cls))
        return { kind: 'unsupported', class: given, spec: '' }
    const trees = await talentTrees(pool, cls)
    const talentRows = list(table(db.talents).list).filter(
        (row) => num(table(row).rank) > 0
    )
    const talents = talentString(
        talentRows.length > 0 ? talentRows : list(table(db.talents).traits),
        trees
    )
    const { stop } = supportedSpec(cls, talents, trees)
    if (stop) return stop

    const rawBuffs = list(db.buffs)
    let filteredBuffs: FilteredBuff[] | undefined
    let modelled: SheetBuffs | undefined
    let crossChecks: { index: number; numbers: BuffNumbers }[] | undefined
    if (rawBuffs.length > 0) {
        const known = (await pool.data('buffs.json')) as KnownBuffs
        const classified = rawBuffs.map((raw) =>
            classifyBuff(readBuff(raw, format), known)
        )
        filteredBuffs = classified.map((c) => c.filtered)
        const pending = classified
            .map((c, index) =>
                c.crossCheck ? { index, numbers: c.crossCheck } : null
            )
            .filter(
                (entry): entry is NonNullable<typeof entry> => entry !== null
            )
        const noOtherUnknown = classified.every(
            (c) => c.crossCheck !== undefined || c.filtered.how !== 'unknown'
        )
        if (pending.length === 1 && noOtherUnknown) crossChecks = pending
        modelled = aggregateSheetBuffs(classified)
    }

    // Worn items the sim lacks become bonus stats; a main hand it lacks
    // can't be simmed.
    const gear = table(db.gear)
    const { items } = await loadItemDb(pool)
    const worn = readGear(gear, items)
    const unknownMain = worn.unknown.main_hand
    if (unknownMain)
        return { kind: 'unknown_main_hand', item_id: unknownMain.id }

    const level = num(identity.level)
    if (!level) throw new Error('the export has no level')
    const knownSpells = list(db.spells)
        .map((spell) => num(table(spell).spellID))
        .filter((id) => id > 0)
    const profile = readProfile(db, level, cls, knownSpells)
    const key =
        usableKey(identity.characterKey) ??
        usableKey(table(db.settings).characterKey)
    const sheet = readSheet(table(db.sheet))
    const weaponSkill = sheetWeaponSkill(db, gear)
    const savedAt = num(db.savedAt)
    const character: Character = {
        name: str(identity.name),
        ...(key ? { character_key: key } : {}),
        level,
        race: identity.race === 'Scourge' ? 'Undead' : str(identity.race),
        class: cls,
        ...genderOf(identity.sex),
        talents,
        gear: worn.worn,
        ...(Object.keys(worn.unknown).length > 0
            ? { unknown_gear: worn.unknown }
            : {}),
        bonus_stats: worn.bonus,
        bags: readBags(db.bags),
        imbue: readImbue(db),
        known_spells: knownSpells,
        weapon_skills: readWeaponSkills(list(db.skills)),
        professions: readProfessions(db.skills),
        weapon_skill_deficit: weaponSkillDeficit(db, gear, level),
        ooc_mana_regen: num(
            table(table(db.sheet).manaRegen).outsideFiveSecondRule
        ),
        profile,
        sheet: weaponSkill ? { ...sheet, weapon_skill: weaponSkill } : sheet,
        ...(filteredBuffs ? { filtered_buffs: filteredBuffs } : {}),
        ...(modelled ? { sheet_buffs: modelled } : {}),
        ...(crossChecks ? { buff_cross_checks: crossChecks } : {}),
        export_saved_at: new Date(savedAt * 1000).toISOString(),
        game_build: str(identity.gameBuild),
    }
    return { kind: 'character', character }
}

/**
 * Reads a `TurboCharExport.lua` into a calibrated character, or a stop.
 * The format, class and spec, and unknown main hand stops come before any sim runs.
 */
export async function readExport(
    text: string,
    pool: SimPool
): Promise<ExportRead> {
    const read = await exportCharacter(text, pool)
    if (read.kind !== 'character') return read
    return {
        kind: 'character',
        character: await calibrate(read.character, pool),
    }
}
