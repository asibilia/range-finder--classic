/**
 * The export reader: a `TurboCharExport.lua` (the export addon's
 * SavedVariables file) into the character `simCharacter` sims, or a stop.
 * The order: the format check, the class and spec check, the buff check
 * (none of them runs a sim), then one sheet run that calibrates base health
 * and mana, and spell crit per Intellect when the game answered 0.
 */
import {
    BONUS_STAT_COUNT,
    PSEUDO_STAT,
    STAT,
    type LevelProfile,
    type SimPool,
} from '@goturbo/sim'

import type { ResultsFile, Slot } from '../results-file'
import type {
    Character,
    Gear,
    GearPiece,
    SheetBuffs,
    SimStop,
} from './character'
import { buildRequest } from './request'
import { DEFAULT_FIGHT } from './scenarios'
import { FIGHT_ITERATIONS, FIGHT_SEED } from './session'
import { SUPPORTED, supportedSpec } from './sim-character'
import { talentTrees, type TalentTree } from './talents'
import { parseSavedVariables, type SavedValue } from './saved-variables'

/** The export formats this reader takes. */
export const EXPORT_FORMATS: readonly number[] = [7]

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
 * Weapon skills by the game's name, as the sim's `WeaponSkill` names them.
 * Unarmed has no sim skill, so it's never sent.
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
    Bows: 'WeaponSkillBows',
    Crossbows: 'WeaponSkillCrossbows',
    Guns: 'WeaponSkillGuns',
    Thrown: 'WeaponSkillThrown',
    Wands: 'WeaponSkillWands',
}

/** Buffs that change nothing the sheet check reads, by name. */
const NO_EFFECT_BUFFS = [
    'Lightning Shield',
    'Water Shield',
    'Well-Rested',
    'Ghost Wolf',
    'Resting',
]
/** Blessing of Kings and Greater Blessing of Kings: the sim's own. */
const KINGS = [20217, 25898]

const ATTRIBUTES = [
    'strength',
    'agility',
    'stamina',
    'intellect',
    'spirit',
] as const

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
 * The talent string the sim takes, from an export's traits: each tree's
 * ranks in the trees' order, trailing zeros and empty trees dropped.
 */
export function talentString(
    traits: SavedValue[],
    trees: TalentTree[]
): string {
    const ranks = trees.map((tree) => tree.talents.map(() => 0))
    for (const raw of traits) {
        const trait = table(raw)
        const definition = num(trait.definitionID)
        const spell = num(trait.spellID)
        for (const [i, tree] of trees.entries()) {
            const j = tree.talents.findIndex((t) =>
                definition > 0 && t.definitionId
                    ? t.definitionId === definition
                    : t.spellId === spell
            )
            if (j < 0) continue
            ranks[i]![j] = Math.min(num(trait.rank), tree.talents[j]!.maxPoints)
        }
    }
    return ranks
        .map((tree) => tree.join('').replace(/0+$/, ''))
        .join('-')
        .replace(/-+$/, '')
}

/** One worn item from the export: its id, enchant and random suffix. */
function gearPiece(entry: Table): GearPiece | null {
    const link = /\|Hitem:(-?\d+):(-?\d*):(?:-?\d*:){4}(-?\d*)/.exec(
        str(entry.link)
    )
    const id = num(entry.id) || Number(link?.[1] ?? 0)
    if (!id) return null
    const piece: GearPiece = { id }
    const enchant = Number(link?.[2] || 0)
    const suffix = Number(link?.[3] || 0)
    if (enchant > 0) piece.enchant = enchant
    if (suffix !== 0) piece.randomSuffix = suffix
    return piece
}

function readGear(gear: Table): Gear {
    const worn: Gear = {}
    for (const [key, raw] of Object.entries(gear)) {
        const entry = table(raw)
        const name = str(entry.slot)
        const slot = EXPORT_SLOTS.find((s) =>
            name ? s.name === name : String(s.inventory) === key
        )
        if (!slot) continue
        const piece = gearPiece(entry)
        if (piece) worn[slot.slot] = piece
    }
    return worn
}

function readImbue(enchants: Table): string | null {
    for (const raw of list(enchants.mainHand)) {
        const enchant = table(raw)
        if (enchant.hasEnchant !== true) continue
        const imbue = IMBUES[num(enchant.enchantID)]
        if (imbue) return imbue
    }
    return null
}

function readWeaponSkills(skills: SavedValue[]) {
    const out: { skill: string; value: number }[] = []
    for (const raw of skills) {
        const skill = WEAPON_SKILLS[str(table(raw).name)]
        if (skill && !out.some((s) => s.skill === skill))
            out.push({ skill, value: num(table(raw).rank) })
    }
    return out
}

/** The main hand's weapon skill as the sheet shows it, when exported. */
function sheetWeaponSkill(
    db: Table,
    gear: Table
): ResultsFile['sheet']['weapon_skill'] {
    const mainHand = Object.values(gear)
        .map(table)
        .find((entry) => str(entry.slot) === 'mainHand')
    const kind = str(mainHand?.subclass).replace(/^One-Handed /, '')
    if (!kind) return null
    const skill = list(db.skills)
        .map(table)
        .find((s) => str(s.name) === kind)
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

/** The level profile from the export's sheet, before calibration. */
function readProfile(
    db: Table,
    level: number,
    cls: string,
    knownSpells: number[]
): LevelProfile {
    const sheet = table(db.sheet)
    const stat = table(sheet.stat)
    const conversion = table(sheet.conversion)
    const apPer100 = table(conversion.apPer100)
    const critPer100 = table(conversion.critPer100)
    const total = (name: string) => num(table(stat[name]).total)
    // The naked attribute: the total less what gear and buffs add.
    const naked = (name: string) => {
        const s = table(stat[name])
        return num(s.total) - num(s.pos) - num(s.neg)
    }
    const fromStats = ATTRIBUTES.reduce(
        (sum, name) => sum + (total(name) * num(apPer100[name])) / 100,
        0
    )
    const agility = total('agility')
    const critPerAgility = num(critPer100.agility)
    const dodgeFromAgility = num(conversion.dodgeFromAgility)
    const rates = BASE_RATES[cls] ?? BASE_RATES[SUPPORTED.class]!
    return {
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
        baseAttackPower: num(table(sheet.attackPower).base) - fromStats,
        critPerAgility,
        dodgePerAgility:
            agility > 0 && dodgeFromAgility > 0
                ? (dodgeFromAgility * 100) / agility
                : critPerAgility,
        spellCritPerInt: num(critPer100.intellect),
        ...rates,
        knownSpells,
    }
}

/**
 * Calibration: one sheet run with a guess at base health and mana, then
 * each moved by the gap to the game's sheet (both are linear in it). When
 * the game answered 0 for spell crit per Intellect, the run goes without it
 * and the gap to the game's spell crit is spread over the sim's Intellect.
 * It makes `CALIBRATION_CALLS` calls.
 */
export async function calibrate(
    character: Character,
    pool: SimPool
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
        ...(askCrit ? { calibrated_spell_crit: true } : {}),
    }
}

/**
 * True when the sim can model a buff that was up at export: the sheet
 * check and calibration sim with it (`sheetBuffs`), so the game's buffed
 * sheet is compared with a sheet buffed the same way. Any other buff
 * stops the run (spec #73, sections 4 and 6). The native runner instead
 * goes on and marks health and mana `not_checked`
 * (`packages/sim/fixtures/buff-filter-nov15-format7.md`); the browser
 * keeps the stop unless the owner decides otherwise.
 */
function canModel(buff: Table, known: KnownBuffs): boolean {
    const spell = num(buff.spellID)
    return (
        NO_EFFECT_BUFFS.includes(str(buff.name)) ||
        KINGS.includes(spell) ||
        (spell > 0 && String(spell) in known)
    )
}

/** `buffs.json`: the stats each buff gives, by spell id. */
type KnownBuffs = Record<string, { stats: number[] }>

/**
 * What the modelled buffs added to the game's sheet: `buffs.json`'s stats
 * and Kings. None when they changed nothing the sheet check reads.
 */
function sheetBuffs(buffs: Table[], known: KnownBuffs): SheetBuffs | null {
    const stats = new Array<number>(BONUS_STAT_COUNT).fill(0)
    let kings = false
    for (const buff of buffs) {
        const spell = num(buff.spellID)
        if (NO_EFFECT_BUFFS.includes(str(buff.name))) continue
        if (KINGS.includes(spell)) kings = true
        else
            known[String(spell)]?.stats.forEach(
                (amount, i) => (stats[i] = (stats[i] ?? 0) + amount)
            )
    }
    return kings || stats.some((amount) => amount !== 0)
        ? { stats, kings }
        : null
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
    const cls = className(str(identity.class))
    const trees = await talentTrees(pool, cls)
    const talents = talentString(list(table(db.talents).traits), trees)
    const { stop } = supportedSpec(cls, talents, trees)
    if (stop) return stop

    const buffs = list(db.buffs).map(table)
    let modelled: SheetBuffs | null = null
    if (buffs.length > 0) {
        const known = (await pool.data('buffs.json')) as KnownBuffs
        const unmodelled = buffs
            .filter((buff) => !canModel(buff, known))
            .map((buff) => str(buff.name))
        if (unmodelled.length > 0) return { kind: 'buffed', buffs: unmodelled }
        modelled = sheetBuffs(buffs, known)
    }

    const level = num(identity.level)
    const knownSpells = list(db.spells)
        .map((spell) => num(table(spell).spellID))
        .filter((id) => id > 0)
    const gear = table(db.gear)
    const key =
        str(identity.characterKey) || str(table(db.settings).characterKey)
    const sheet = readSheet(table(db.sheet))
    const weaponSkill = sheetWeaponSkill(db, gear)
    const savedAt = num(db.savedAt)
    const character: Character = {
        name: str(identity.name),
        ...(/[1-9a-z]/i.test(key) ? { character_key: key } : {}),
        level,
        race: identity.race === 'Scourge' ? 'Undead' : str(identity.race),
        class: cls,
        talents,
        gear: readGear(gear),
        bags: list(db.bags)
            .map((item) => num(table(item).id))
            .filter((id) => id > 0),
        imbue: readImbue(table(db.weaponEnchants)),
        known_spells: knownSpells,
        weapon_skills: readWeaponSkills(list(db.skills)),
        profile: readProfile(db, level, cls, knownSpells),
        sheet: weaponSkill ? { ...sheet, weapon_skill: weaponSkill } : sheet,
        ...(modelled ? { sheet_buffs: modelled } : {}),
        export_saved_at: new Date(savedAt * 1000).toISOString(),
        game_build: str(identity.gameBuild),
    }
    return { kind: 'character', character }
}

/**
 * Reads a `TurboCharExport.lua` into a calibrated character, or a stop.
 * The format, class and spec, and buff stops come before any sim runs.
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
