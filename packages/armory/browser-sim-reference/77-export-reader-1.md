Export reader files, part 1 of 3 (the export reader and its test), from `0476f3e`. Whole files, verbatim.

#### `local/sim/export.ts`

```ts
/**
 * Reads TurboCharExport's SavedVariables file (the only input about the character) and turns it into
 * the Character the runner sims: level profile, talents, gear, imbue, trained spells and the sheet
 * to check against.
 *
 * Two numbers cannot be read straight from the export and are calibrated instead: base health and
 * base mana (the game reports only totals). The sheet check marks them as calibrated, not checked.
 * Spell crit per Intellect is calibrated too when the game's GetCritChanceFromStat answers 0 for it.
 */
import { z } from 'zod'

import { createLuaVm } from '../lib/lua-vm'
import { ROOT, type Character } from './lib'

import type { BuffIn } from './buffs'

/** The export as saved (format version 2). Loosely typed: every field may be missing. */
export type ExportDB = Record<string, any>

const LUA_JSON = `
local function enc(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" or t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return tostring(v)
  end
  if t == "string" then return '"' .. v:gsub('[%c"\\\\]', function(c) return string.format("\\\\u%04x", c:byte()) end) .. '"' end
  local parts = {}
  for k, val in pairs(v) do parts[#parts+1] = enc(tostring(k)) .. ":" .. enc(val) end
  return "{" .. table.concat(parts, ",") .. "}"
end
return enc(TurboCharExportDB)
`

/** Loads the SavedVariables file in Lua 5.1 and returns TurboCharExportDB as JSON. */
export async function readExport(path: string): Promise<ExportDB> {
  const src = await Bun.file(path).text()
  const vm = createLuaVm()
  try {
    vm.run(src, '@TurboCharExport.lua')
    const db = JSON.parse(vm.run(LUA_JSON, '=json') ?? 'null')
    if (!db) throw new Error(`${path}: no TurboCharExportDB (did /tbexport and /reload run?)`)
    if (db.failed) throw new Error(`${path}: the export failed in game: ${db.failed}`)
    if (![2, 3, 4, 5, 6, 7, 8, 9, 10].includes(Number(db.formatVersion))) throw new Error(`${path}: export format ${db.formatVersion}, this reader wants 2 to 10`)
    return db
  } finally {
    vm.close()
  }
}

/** Lua arrays arrive as objects keyed "1", "2"...: this lists their values in order. */
/** One buff row of the export (format 8 adds source, points and description; format 10 changes the source values and adds pointsSeen, secretValues and descriptionMissing, which the buff rules don't need). */
const BuffRowSchema = z.object({
  name: z.coerce.string(),
  spellID: z.coerce.number(),
  source: z.string().nullable().default(null),
  points: z.record(z.string(), z.number()).nullable().default(null),
  description: z.string().nullable().default(null),
})

/**
 * The buffs up at export, as the buff rules (buffs.ts) read them: name, spell id, who cast it (self,
 * other or none), the aura's points and the spell's description.
 *
 * @param buffs - the export's `buffs` table (a Lua list)
 * @returns one BuffIn per row; a row whose extra fields can't be read keeps only its name and spell
 *   id (so it can only be modelled or unknown, never read from numbers)
 * @example buffsFromExport(db.buffs) // [{ name: 'Thorns', spellID: 782, source: 'none', points: { '1': 6 }, description: '...' }]
 */
export function buffsFromExport(buffs: unknown): BuffIn[] {
  return list(buffs).map((b) => {
    const r = BuffRowSchema.safeParse(b)
    return r.success ? r.data : { name: String(b?.name), spellID: Number(b?.spellID) }
  })
}

export const list = <T = any>(v: unknown): T[] =>
  v && typeof v === 'object'
    ? Object.entries(v as Record<string, T>)
        .filter(([k]) => /^\d+$/.test(k))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, x]) => x)
    : []

const SLOT_INDEX: Record<string, number> = {
  head: 0, neck: 1, shoulder: 2, back: 3, chest: 4, wrist: 5, hands: 6, waist: 7, legs: 8, feet: 9,
  finger1: 10, finger2: 11, trinket1: 12, trinket2: 13, mainHand: 14, offHand: 15, ranged: 16,
}

/** GetItemStats keys to the sim's proto Stat index. */
export const ITEM_MOD_TO_STAT: Record<string, number> = {
  ITEM_MOD_STRENGTH_SHORT: 0, ITEM_MOD_AGILITY_SHORT: 1, ITEM_MOD_STAMINA_SHORT: 2, ITEM_MOD_INTELLECT_SHORT: 3,
  ITEM_MOD_SPIRIT_SHORT: 13, ITEM_MOD_ATTACK_POWER_SHORT: 14, ITEM_MOD_SPELL_DAMAGE_DONE_SHORT: 5,
  ITEM_MOD_SPELL_HEALING_DONE_SHORT: 4, ITEM_MOD_HIT_RATING_SHORT: 17, ITEM_MOD_HIT_MELEE_RATING_SHORT: 17,
  ITEM_MOD_CRIT_RATING_SHORT: 18, ITEM_MOD_CRIT_MELEE_RATING_SHORT: 18, ITEM_MOD_HASTE_RATING_SHORT: 19,
  ITEM_MOD_EXPERTISE_RATING_SHORT: 21, RESISTANCE0_NAME: 27, ITEM_MOD_MANA_REGENERATION_SHORT: 31,
}

/** The item ids the sim's databases know. */
export async function simItemIds(): Promise<Set<number>> {
  const ids = new Set<number>()
  for (const f of ['db.json', 'leftover_db.json']) {
    const db = JSON.parse(await Bun.file(`${ROOT}/assets/database/${f}`).text())
    for (const it of db.items ?? []) ids.add(it.id)
  }
  return ids
}

/** The Enhancement talents of the sim's tree file, by tree, in talent-string order. */
async function talentTrees(): Promise<{ name: string; talents: { fancyName: string; spellId: number; maxPoints: number }[] }[]> {
  return JSON.parse(await Bun.file(`${ROOT}/ui/sim/talents/trees/shaman.json`).text())
}

/** The wowhead talent string from the export's talent list, or its trait tree when the list is empty. */
export async function talentString(db: ExportDB): Promise<{ talents: string; notes: string[] }> {
  const trees = await talentTrees()
  const notes: string[] = []
  const ranks = trees.map((t) => t.talents.map(() => 0))
  const byName = new Map<string, [number, number]>()
  const bySpell = new Map<number, [number, number]>()
  trees.forEach((t, ti) => t.talents.forEach((x, xi) => { byName.set(x.fancyName.toLowerCase(), [ti, xi]); bySpell.set(x.spellId, [ti, xi]) }))
  const fromList = list(db.talents?.list).filter((t) => t.rank > 0)
  const fromTraits = list(db.talents?.traits).filter((t) => t.rank > 0)
  const rows = fromList.length > 0 ? fromList : fromTraits
  if (rows.length === 0) throw new Error('the export has no talents: neither talent API answered (see its unavailable list)')
  for (const row of rows) {
    const at = (row.name && byName.get(String(row.name).toLowerCase())) || (row.spellID && bySpell.get(row.spellID))
    if (!at) { notes.push(`talent not in the sim's tree: ${row.name ?? row.spellID} rank ${row.rank}`); continue }
    ranks[at[0]][at[1]] = row.rank
  }
  const talents = ranks.map((r) => r.join('').replace(/0+$/, '')).join('-').replace(/-+$/, '')
  return { talents, notes }
}

/**
 * The addon's character key, or null when there is none or it is unusable: the first format 7 addon
 * saved "00000000-00000000-00000000-00000000" (the client's math.random answered 0), which would give
 * every player the same key. Same rule as the addon's goodKey: 32 hex digits, more than four distinct.
 */
export function usableKey(k: unknown): string | null {
  if (typeof k !== 'string' || /[^0-9a-f-]/.test(k)) return null
  const hex = k.replace(/-/g, '')
  return hex.length === 32 && new Set(hex).size > 4 ? k : null
}

const naked = (st: any) => Number(st?.total) - Number(st?.pos ?? 0) - Number(st?.neg ?? 0)

/** The export's weapon skill names to the sim's WeaponSkill names. */
const WEAPON_SKILLS: Record<string, string> = {
  Axes: 'WeaponSkillAxes', 'Two-Handed Axes': 'WeaponSkillTwoHandedAxes', Maces: 'WeaponSkillMaces',
  'Two-Handed Maces': 'WeaponSkillTwoHandedMaces', Staves: 'WeaponSkillStaves', Daggers: 'WeaponSkillDaggers',
  Swords: 'WeaponSkillSwords', 'Two-Handed Swords': 'WeaponSkillTwoHandedSwords', Polearms: 'WeaponSkillPolearms',
  'Fist Weapons': 'WeaponSkillFistWeapons', // Unarmed has no WeaponSkill in the sim: not mapped
}

/** Builds the Character from an export. Base health, base mana and spell crit per Intellect are filled by calibrate(). */
export async function characterFromExport(db: ExportDB): Promise<{ character: Character; notes: string[] }> {
  const notes: string[] = []
  const id = db.identity ?? {}
  const sheet = db.sheet ?? {}
  const stat = sheet.stat ?? {}
  const conv = sheet.conversion ?? {}
  const level = Number(id.level)
  if (!level) throw new Error('the export has no level')
  if (id.class !== 'SHAMAN') throw new Error(`the export is a ${id.class}, this runner sims Enhancement Shaman`)

  const { talents, notes: talentNotes } = await talentString(db)
  notes.push(...talentNotes)

  // Gear: item id, enchant and random suffix from the link; items the sim does not know add their
  // game-reported stats as bonus stats instead.
  const known = await simItemIds()
  const gear: Character['gear'] = {}
  const bonus = Array(40).fill(0)
  for (const [slotKey, rec] of Object.entries<any>(db.gear ?? {})) {
    const slot = SLOT_INDEX[rec.slot]
    if (slot === undefined) continue // ammo, shirt, tabard
    const fields = String(rec.link).match(/item:([-\d:]*)/)?.[1].split(':') ?? []
    const itemId = Number(fields[0])
    const enchant = Number(fields[1]) || undefined
    const randomSuffix = Number(fields[6]) || undefined
    if (known.has(itemId)) {
      gear[String(slot)] = { id: itemId, ...(enchant ? { enchant } : {}), ...(randomSuffix ? { randomSuffix } : {}) }
    } else if (slot === 14) {
      throw new Error(`main hand ${itemId} (${rec.name}) is not in the sim's database, so its damage cannot be simmed`)
    } else {
      for (const [k, v] of Object.entries<number>(rec.stats ?? {})) {
        if (ITEM_MOD_TO_STAT[k] !== undefined) bonus[ITEM_MOD_TO_STAT[k]] += v
        else notes.push(`${rec.name}: stat ${k} ${v} not simmed`)
      }
      notes.push(`slot ${slotKey} ${itemId} ${rec.name} is not in the sim's database: its stats are added as bonus stats`)
    }
  }

  // The weapon imbue, from the main hand's tooltip line ("Windfury 1 (29 min)").
  const mhTooltip = list<string>(db.gear?.['16']?.tooltip).join('\n')
  const imbue = (['Windfury', 'Flametongue', 'Rockbiter', 'Frostbrand'] as const).find((n) => new RegExp(`\\b${n}\\b`).test(mhTooltip))
  // No imbue on at export: if the built-in meter shows Windfury damage, he uses Windfury, so sim that.
  const meterWindfury = list(db.meter?.sessions).some((s: any) => list(s.spells).some((sp: any) => /^Windfury/.test(String(sp.name)) && Number(sp.damage) > 0))
  const mhImbue = imbue ? (`${imbue}Weapon` as Character['mhImbue']) : meterWindfury ? 'WindfuryWeapon' : 'NoImbue'
  if (!imbue) notes.push(meterWindfury ? 'no weapon imbue on at export; the meter shows Windfury damage, so simmed with Windfury Weapon' : 'no weapon imbue seen on the main hand: simmed with none (imbue the weapon and export again)')

  // Classic's sheet rule, which both his exports fit: base melee crit and base dodge are 1.7%, less
  // 0.04% per point the main-hand weapon skill (crit) or Defense (dodge) is below the level's maximum.
  const skillRank = (name: string) => {
    const sk = list(db.skills).find((x: any) => x.name === name)
    return sk ? Number(sk.rank) + Number(sk.modifier ?? 0) : null
  }
  const mh = db.gear?.['16']
  const weaponSkillName = mh ? `${mh.equipLoc === 'INVTYPE_2HWEAPON' ? 'Two-Handed ' : ''}${({ Axe: 'Axes', Mace: 'Maces', Sword: 'Swords', Staff: 'Staves', Dagger: 'Daggers', 'Fist Weapon': 'Fist Weapons', Polearm: 'Polearms' } as Record<string, string>)[String(mh.subclass)] ?? String(mh.subclass)}`.replace('Two-Handed Staves', 'Staves').replace('Two-Handed Polearms', 'Polearms') : null
  // The item's subtype is usually the skill's own name ("Two-Handed Axes"); else the mapped name.
  const weaponSkill = (mh && skillRank(String(mh.subclass))) ?? (weaponSkillName ? skillRank(weaponSkillName) : null)
  const defenseSkill = skillRank('Defense')
  const capSkill = 5 * Number(id.level)

  const knownSpells = list(db.spells).map((s) => Number(s.spellID)).filter(Boolean)
  // GetCritChanceFromStat and GetDodgeChanceFromAttribute answer the percent per point on Forever
  // (the value argument does not scale it): his sheet's 11.95% crit is 1.7 + 96 Agility x 0.0868 + 2.
  const critPerAgility = Number(conv.critPer100?.agility)
  const dodgeFromAgility = Number(conv.dodgeFromAgility)
  const spellCritFromInt = Number(conv.critPer100?.intellect)

  const race = `Race${id.race}`
  const profile = {
    level,
    race,
    class: 'ClassShaman',
    // On Forever UnitStat's "base" equals the total, gear included; the naked attribute is the
    // total less the positive and negative modifiers (gear and buffs).
    strength: naked(stat.strength),
    agility: naked(stat.agility),
    stamina: naked(stat.stamina),
    intellect: naked(stat.intellect),
    spirit: naked(stat.spirit),
    baseHealth: 0, // calibrated
    baseMana: 0, // calibrated
    baseAttackPower: 2 * level - 20, // the shaman's flat attack power: 2 per level less 20
    critPerAgility,
    // GetDodgeChanceFromAttribute answers the whole dodge from Agility as a fraction (0.0677 = 6.77%).
    dodgePerAgility: dodgeFromAgility > 0 && Number(stat.agility?.total) > 0 ? (100 * dodgeFromAgility) / Number(stat.agility?.total) : critPerAgility,
    spellCritPerInt: spellCritFromInt > 0 ? spellCritFromInt : 0, // calibrated when 0
    baseMeleeCrit: 1.7,
    baseSpellCrit: 2.3,
    baseDodgePercent: 1.7 + (defenseSkill !== null ? 0.04 * (defenseSkill - capSkill) : 0),
    knownSpells,
    source: `export of ${id.name} at ${new Date(Number(db.savedAt) * 1000).toISOString()}, game build ${id.gameBuild}`,
  }
  for (const k of ['strength', 'agility', 'stamina', 'intellect', 'spirit', 'critPerAgility'] as const) {
    if (!Number.isFinite(profile[k])) throw new Error(`the export lacks ${k} (see its unavailable list)`)
  }

  const character: Character = {
    source: 'export',
    name: String(id.name ?? 'Player'),
    level,
    race,
    class: 'ClassShaman',
    talents,
    mhImbue,
    gear,
    knownSpells,
    profile,
    sheet: {
      strength: Number(stat.strength?.total), agility: Number(stat.agility?.total), stamina: Number(stat.stamina?.total),
      intellect: Number(stat.intellect?.total), spirit: Number(stat.spirit?.total),
      attackPower: Number(sheet.attackPower?.base) + Number(sheet.attackPower?.pos ?? 0) + Number(sheet.attackPower?.neg ?? 0),
      meleeCrit: Number(sheet.meleeCrit), dodge: Number(sheet.dodge), meleeHit: Number(sheet.meleeHit),
      spellCrit: Number(sheet.spellCrit?.['4']), armor: Number(sheet.armor?.effective),
      health: Number(sheet.health), mana: Number(sheet.mana),
      healingPower: Number(sheet.spellHealing ?? 0), // bonus healing, for the heal ceiling
    },
  }
  ;(character as any).bonusStats = bonus.some((v) => v !== 0) ? bonus : undefined
  ;(character as any).calibrate = { spellCritPerInt: !(spellCritFromInt > 0) }
  ;(character as any).skills = list(db.skills).map((s) => String(s.name))
  // The addon's random character key (export format 7); older exports have none.
  ;(character as any).characterKey = usableKey(id.characterKey) ?? usableKey(db.settings?.characterKey)
  ;(character as any).weaponSkillDeficit = weaponSkill !== null ? capSkill - weaponSkill : 0
  // The main hand's skill as the game names it, for the score's "weapon skill is N of M" line.
  const mhSkillRow = mh ? list(db.skills).find((x: any) => x.name === String(mh.subclass) || x.name === weaponSkillName) : undefined
  ;(character as any).mainHandSkill = mhSkillRow && weaponSkill !== null ? { name: String(mhSkillRow.name), current: weaponSkill, max: capSkill } : null
  character.weaponSkills = list(db.skills)
    .filter((s) => WEAPON_SKILLS[s.name])
    .map((s) => ({ skill: WEAPON_SKILLS[s.name], value: Number(s.rank) + Number(s.modifier ?? 0) }))
  ;(character as any).buffsAtExport = buffsFromExport(db.buffs)
  ;(character as any).unavailableAtExport = list(db.unavailable)
  return { character, notes }
}
```

#### `local/lib/lua-vm.ts`

````ts
/**
 * A real Lua 5.1.5 VM (compiled to WebAssembly by `lua-wasm-bindings`), with
 * the small bridge the tests and scripts need.
 *
 * The binding only exposes a slice of the C API (no numbers or C functions
 * across the boundary), so everything crosses as strings: TypeScript sets a
 * string global, Lua runs, and Lua returns one string (usually JSON).
 *
 * @example
 * ```typescript
 * const vm = createLuaVm()
 * vm.setString('greeting', 'hello')
 * vm.run('return greeting .. " world"') // 'hello world'
 * vm.close()
 * ```
 */
import { lauxlib, lua, lualib } from 'lua-wasm-bindings/dist/lua.51'

/** The pseudo-index of the globals table in Lua 5.1. */
const LUA_GLOBALSINDEX = -10002

export type LuaVm = {
    /**
     * Runs a chunk and returns its first result as a string (`null` for nil
     * or a non-string, non-number result).
     *
     * @param code - Lua source
     * @param chunkName - how errors name the chunk; prefix `@` for a file path
     * @throws Error with Lua's message and traceback when the chunk fails
     */
    run(code: string, chunkName?: string): string | null
    /** Sets a global to a string value. */
    setString(name: string, value: string): void
    /** Frees the VM. */
    close(): void
}

/**
 * The runner every chunk goes through: compiles `__vm_src` under
 * `__vm_name`, and calls it with a traceback handler, so a failure reports
 * where it happened.
 */
const RUNNER = `
local f, err = loadstring(__vm_src, __vm_name)
__vm_src = nil
if not f then error(err, 0) end
local ok, result = xpcall(f, function(e)
    return debug.traceback(tostring(e), 2)
end)
if not ok then error(result, 0) end
if type(result) == "number" then return tostring(result) end
return result
`

/**
 * Creates a fresh Lua 5.1 state with the standard libraries open.
 *
 * @returns a VM; call `close()` when done
 */
export function createLuaVm(): LuaVm {
    const L = lauxlib.luaL_newstate()
    lualib.luaL_openlibs(L)

    const setString = (name: string, value: string) => {
        lua.lua_pushstring(L, value)
        lua.lua_setfield(L, LUA_GLOBALSINDEX, name)
    }

    return {
        run(code, chunkName = '=(vm)') {
            setString('__vm_src', code)
            setString('__vm_name', chunkName)
            const status = lauxlib.luaL_dostring(L, RUNNER)
            if (status !== 0) {
                const message = lua.lua_tostring(L, -1)
                lua.lua_settop(L, 0)
                throw new Error(message)
            }
            const result = lua.lua_isstring(L, -1)
                ? lua.lua_tostring(L, -1)
                : null
            lua.lua_settop(L, 0)
            return result
        },
        setString,
        close() {
            lua.lua_close(L)
        },
    }
}
````

#### `local/char-export/reader.test.ts`

```ts
/** The exporter's saved table, written as SavedVariables, read back by the sim's export reader. */
import { describe, expect, test } from 'bun:test'

import { createLuaVm } from '../lib/lua-vm'
import { characterFromExport, readExport } from '../sim/export'

test('the sim reads what the addon saves', async () => {
  const testSrc = await Bun.file(`${import.meta.dir}/export.test.ts`).text()
  const fake = testSrc.slice(testSrc.indexOf('const FAKE_GAME = `') + 19, testSrc.indexOf('`\n\n/** A Lua JSON encoder'))
  const exportSrc = await Bun.file(`${import.meta.dir}/TurboCharExport/export.lua`).text()
  const vm = createLuaVm()
  vm.run(fake.replaceAll('\\\\', '\\'), '=fake')
  // Real talent names, so the talent string can be built.
  vm.run(`C_SpecializationInfo = { GetTalentInfo = function(q)
    local t = { [1] = { "Thundering Strikes", 5 }, [2] = { "Mental Dexterity", 3 }, [3] = { "Stormstrike", 1 } }
    local r = q.specializationIndex == 2 and t[q.talentIndex]
    if r then return { name = r[1], rank = r[2], maxRank = 5, tier = 1, column = 1, spellID = 1 } end
  end }`, '=talents')
  vm.run(exportSrc, '@export.lua')
  vm.run('SlashCmdList.TURBOCHAREXPORT()', '=slash')
  // SavedVariables format: TurboCharExportDB = { ... }
  const lua = vm.run(`
    local function ser(v)
      if type(v) == "string" then return string.format("%q", v) end
      if type(v) ~= "table" then return tostring(v) end
      local parts = {}
      for k, val in pairs(v) do parts[#parts+1] = "[" .. ser(k) .. "] = " .. ser(val) end
      return "{" .. table.concat(parts, ", ") .. "}"
    end
    return "TurboCharExportDB = " .. ser(TurboCharExportDB)`, '=ser')!
  vm.close()
  const path = `${import.meta.dir}/../runs/reader-test.lua`
  await Bun.write(path, lua)
  const db = await readExport(path)
  const { character, notes } = await characterFromExport(db)
  expect(character.level).toBe(30)
  expect(character.race).toBe('RaceOrc')
  expect(character.talents).toBe('-050030000001')
  expect(character.gear['14']).toEqual({ id: 273046 })
  expect(character.gear['0']).toEqual({ id: 252504 })
  expect(character.knownSpells).toEqual([17364, 8045])
  expect((character.profile as any).critPerAgility).toBeCloseTo(0.1)
  expect((character.profile as any).baseAttackPower).toBe(40)
  // GetDodgeChanceFromAttribute is the whole dodge from Agility (a fraction): 4.2 over 80 Agility.
  expect((character.profile as any).dodgePerAgility).toBeCloseTo((100 * 4.2) / 80)
  // No Defense skill in the fake game: base dodge stays 1.7; the weapon skill is at the cap.
  expect((character.profile as any).baseDodgePercent).toBeCloseTo(1.7)
  expect((character as any).weaponSkillDeficit).toBe(0)
  expect(character.sheet).toMatchObject({ attackPower: 320, meleeCrit: 5.5, dodge: 6.5, mana: 900 })
  expect(notes.join('\n')).toContain('no weapon imbue')
})

describe('character key from an export', () => {
  test('an all-zero or degenerate key is no key; a good one is kept', async () => {
    const { usableKey } = await import('../sim/export')
    expect(usableKey('00000000-00000000-00000000-00000000')).toBeNull()
    expect(usableKey('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')).toBeNull()
    expect(usableKey(undefined)).toBeNull()
    expect(usableKey('Player-1111-0A1B2C3D')).toBeNull()
    expect(usableKey('3f2a9c10-7b4e-4d21-9a6f-0c5e8b13d7a2')).toBe('3f2a9c10-7b4e-4d21-9a6f-0c5e8b13d7a2')
  })
})
```
