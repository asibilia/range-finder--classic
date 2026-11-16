/**
 * A made-up `TurboCharExport.lua` (format 7) for a character, as the export
 * addon would write it: `exportFromCharacter(character, sheet)` puts the
 * character's gear, talents, imbue, known spells and weapon skills in it,
 * and the sheet (from `pool.sheet`, so the sheet gate passes) with the
 * splits the reader turns back into the character's level profile. Tests
 * use Testchar's (`testcharCharacter(pool)`) until #83.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { LevelProfile, Sheet } from '@goturbo/sim'

import {
    EXPORT_SLOTS,
    EXPORT_VARIABLE,
    IMBUES,
    WEAPON_SKILLS,
    type Gear,
} from '../../src/browser-sim'
import type { TalentTree } from '../../src/browser-sim/talents'

const TREES = join(
    import.meta.dir,
    '../../../sim/upstream/ui/sim/talents/trees'
)
const ATTRIBUTES = [
    'strength',
    'agility',
    'stamina',
    'intellect',
    'spirit',
] as const
/** What the export addon writes when it has no character key. */
const NO_KEY = '00000000-00000000-00000000-00000000'
/** Attack power per 100 Strength, as the game answers it for a Shaman. */
const AP_PER_100_STRENGTH = 200

/** The character fields an export carries. */
export type ExportedCharacter = {
    name: string
    character_key?: string
    level: number
    race: string
    class: string
    talents: string
    gear: Gear
    bags?: number[]
    imbue: string | null
    known_spells: number[]
    weapon_skills?: { skill: string; value: number }[]
    profile: LevelProfile
    export_saved_at: string
    game_build: string
}

type Lua = string | number | boolean | null | Lua[] | { [key: string]: Lua }

/** A Lua string literal. */
function quote(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** A value as the game writes it: one field per line, `nil` for a hole. */
function lua(value: Lua): string {
    if (value === null) return 'nil'
    if (typeof value === 'string') return quote(value)
    if (typeof value !== 'object') return String(value)
    const fields = Array.isArray(value)
        ? value.map((item) => `${lua(item)},`)
        : Object.entries(value).map(
              ([key, item]) =>
                  `${/^\d+$/.test(key) ? `[${key}]` : `[${quote(key)}]`} = ${lua(item)},`
          )
    return fields.length > 0 ? `{\n${fields.join('\n')}\n}` : '{\n}'
}

function traits(character: ExportedCharacter): Lua[] {
    const file = join(TREES, `${character.class.toLowerCase()}.json`)
    const trees = JSON.parse(readFileSync(file, 'utf8')) as TalentTree[]
    const parts = character.talents.split('-')
    const out: Lua[] = []
    trees.forEach((tree, i) => {
        tree.talents.forEach((talent, j) => {
            const rank = Number(parts[i]?.[j] ?? 0)
            if (rank > 0)
                out.push({
                    name: talent.fancyName,
                    definitionID: talent.definitionId ?? 0,
                    spellID: talent.spellId,
                    rank,
                    maxRank: talent.maxPoints,
                })
        })
    })
    return out
}

function gear(character: ExportedCharacter): Lua {
    const out: Record<string, Lua> = {}
    for (const { slot, inventory, name } of EXPORT_SLOTS) {
        const piece = character.gear[slot]
        if (!piece) continue
        const enchant = piece.enchant ?? ''
        const suffix = piece.randomSuffix ?? ''
        out[String(inventory)] = {
            id: piece.id,
            name: `Item ${piece.id}`,
            link: `|cnIQ2:|Hitem:${piece.id}:${enchant}:::::${suffix}::${character.level}:::::::::|h[Item ${piece.id}]|h|r`,
            slot: name,
        }
    }
    return out
}

function imbue(character: ExportedCharacter): Lua[] {
    const id = Object.entries(IMBUES).find(
        ([, name]) => name === character.imbue
    )?.[0]
    return id ? [{ enchantID: Number(id), hasEnchant: true }] : []
}

function skills(character: ExportedCharacter): Lua[] {
    return (character.weapon_skills ?? []).flatMap(({ skill, value }) => {
        const name = Object.entries(WEAPON_SKILLS).find(
            ([, sim]) => sim === skill
        )?.[0]
        return name ? [{ name, rank: value, maxRank: character.level * 5 }] : []
    })
}

function sheetTable(profile: LevelProfile, sheet: Sheet): Lua {
    const stat: Record<string, Lua> = {}
    for (const name of ATTRIBUTES)
        stat[name] = {
            base: sheet[name],
            total: sheet[name],
            pos: sheet[name] - profile[name],
            neg: 0,
        }
    const apBase =
        profile.baseAttackPower + (sheet.strength * AP_PER_100_STRENGTH) / 100
    const spellCrit = sheet.spell_crit_pct
    return {
        stat,
        attackPower: {
            base: apBase,
            pos: sheet.attack_power - apBase,
            neg: 0,
        },
        conversion: {
            apPer100: {
                strength: AP_PER_100_STRENGTH,
                agility: 0,
                stamina: 0,
                intellect: 0,
                spirit: 0,
            },
            critPer100: {
                strength: 0,
                agility: profile.critPerAgility,
                stamina: 0,
                intellect: profile.spellCritPerInt,
                spirit: 0,
            },
            dodgeFromAgility: (profile.dodgePerAgility * sheet.agility) / 100,
        },
        armor: { effective: sheet.armor },
        health: sheet.health,
        mana: sheet.mana,
        meleeCrit: sheet.melee_crit_pct,
        // By school: physical has none.
        spellCrit: [null, ...new Array<number>(6).fill(spellCrit)],
        dodge: sheet.dodge_pct,
        meleeHit: sheet.melee_hit_pct,
    }
}

/** A format-7 `TurboCharExport.lua` for `character` with `sheet`. */
export function exportFromCharacter(
    character: ExportedCharacter,
    sheet: Sheet
): string {
    const key = character.character_key ?? NO_KEY
    const db: Lua = {
        formatVersion: 7,
        savedAt: Math.floor(Date.parse(character.export_saved_at) / 1000),
        identity: {
            name: character.name,
            characterKey: key,
            class: character.class.toUpperCase(),
            race: character.race,
            level: character.level,
            gameBuild: character.game_build,
        },
        settings: { characterKey: key },
        talents: { traits: traits(character) },
        gear: gear(character),
        bags: (character.bags ?? []).map((id) => ({ id })),
        weaponEnchants: { mainHand: imbue(character), offHand: [] },
        spells: character.known_spells.map((id) => ({ spellID: id })),
        skills: skills(character),
        sheet: sheetTable(character.profile, sheet),
        buffs: [],
    }
    return `\n${EXPORT_VARIABLE} = ${lua(db)}\n`
}
