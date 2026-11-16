Export reader files, part 2 of 3 (the buff rules and calibration), from `0476f3e`. Whole files, verbatim.

#### `local/sim/buffs.ts`

```ts
/**
 * The buffs up at export, sorted four ways so none can quietly poison the sheet check or the
 * calibration again (Warchief's Blessing once inflated base health by 300):
 * - modelled: the sim's spell data has the buff's row (or it's Kings): the sheet sim adds it;
 * - game_numbers: the buff is on the REVIEWED allow-list (buff-allow-list.ts) and its numbers are
 *   confirmed (below): the sheet sim adds what's on the sheet (health, mana, attack power, armor,
 *   attributes); haste and mana per 5 aren't on the sheet and are kept as notes;
 * - no_stats: known not to touch the sheet: on the allow-list as `no_sheet_stats` (confirmed the
 *   same way; what it does instead, e.g. mp5 or a damage shield, kept as a note), or by name
 *   (shields, rest, travel forms, mounts);
 * - unknown: anything else. The checks then mark the lines it could touch "not checked".
 *
 * The allow-list rule. A buff is game_numbers (or no_stats via the list) only if:
 *  (a) its spell id is on the allow-list; AND
 *  (b) every numbered sentence of its description (other than a "Lasts ..." duration) is read by the
 *      strict patterns below, and the numbers read equal the list's numbers exactly (same stats,
 *      same values); OR, only when the description is MISSING, the sheet cross-check passes
 *      (checks.ts: a clean calibration at the same level, race and class, and the gap between the
 *      exported sheet and the sheet sim at that clean base without this buff equals each of the
 *      list's sheet stats exactly); AND
 *  (c) if the aura's `points` are non-empty, every point equals a number read from the description
 *      (Forever rarely fills `points`; an empty one is no longer a refusal).
 * Otherwise it is unknown: never a guess. Each buff records the path that classified it ('list',
 * 'list + sheet cross-check', 'modelled', 'no_stats (name rule)', 'unknown') and who cast it (self,
 * other or none), never a name. The sim's fights don't use any of these: they choose their own buffs.
 */
import { ALLOW_LIST, allowedNumbers, type AllowEntry, type AllowList } from './buff-allow-list'
import { exportBuffs } from './lib'

export type BuffIn = { name: string; spellID: number; source?: string | null; points?: Record<string, number> | null; description?: string | null }
export type BuffNumbers = Partial<Record<'health' | 'mana' | 'attack_power' | 'armor' | 'strength' | 'agility' | 'stamina' | 'intellect' | 'spirit' | 'mp5' | 'haste_pct' | 'run_speed_pct' | 'damage_shield', number>>
/** Which rule classified a buff. */
export type BuffPath = 'list' | 'list + sheet cross-check' | 'modelled' | 'no_stats (name rule)' | 'unknown'
export type Classified = { name: string; spellID: number; source: 'self' | 'other' | 'none' | 'other player' | 'not a player' | null; class: 'modelled' | 'game_numbers' | 'no_stats' | 'unknown'; path: BuffPath; numbers: BuffNumbers | null }
/** Asked only for a listed buff whose description is missing: does the exported sheet confirm the list's numbers? */
export type SheetCrossCheck = (b: BuffIn, entry: AllowEntry) => Promise<boolean>

const NO_STATS = /^(Lightning Shield|Water Shield|Well-Rested|Ghost Wolf|Resting)$|Mount|Riding|Horse|Wolf$|Raptor|Kodo/
/** Stat index in the sim's stats array for each sheet stat a buff can carry. */
export const STAT_INDEX: Partial<Record<keyof BuffNumbers, number>> = { strength: 0, agility: 1, stamina: 2, intellect: 3, spirit: 13, attack_power: 14, armor: 27, health: 29, mana: 30 }

/** Each sentence with a number must match one of these, or the buff is unknown. */
const PATTERNS: [RegExp, keyof BuffNumbers][] = [
  [/(?:hit ?points|maximum health|health) by (\d+)(?!%)/i, 'health'],
  [/maximum mana by (\d+)(?!%)/i, 'mana'],
  [/attack power by (\d+)(?!%)/i, 'attack_power'],
  [/armor by (\d+)(?!%)/i, 'armor'],
  [/strength by (\d+)(?!%)/i, 'strength'],
  [/agility by (\d+)(?!%)/i, 'agility'],
  [/stamina by (\d+)(?!%)/i, 'stamina'],
  [/intellect by (\d+)(?!%)/i, 'intellect'],
  [/spirit by (\d+)(?!%)/i, 'spirit'],
  [/(\d+) mana (?:regen|regeneration|every 5|per 5)/i, 'mp5'],
  [/(\d+)% haste|attack speed by (\d+)%|(\d+)% (?:melee )?attack speed/i, 'haste_pct'],
  [/(?:movement|run(?:ning)?) speed by (\d+)%|speed by (\d+)%/i, 'run_speed_pct'],
  [/causing (\d+) \w+ damage to attackers/i, 'damage_shield'],
]

/**
 * Forever's plural markup, "<n> |4singular:plural;", as plain text: the singular after a 1, else the
 * plural (Blessing of Wisdom: "for 1 |4hour:hrs;" reads "for 1 hour").
 */
export const expandPlural = (text: string) => text.replace(/(\d+(?:\.\d+)?)(\s*)\|4([^:;|]*):([^;|]*);/g, (_, n, sp, one, many) => `${n}${sp}${Number(n) === 1 ? one : many}`)

/**
 * The strict read of a spell description: every sentence with a number (other than a "Lasts ..."
 * duration) must match one of the patterns, each giving one stat's number.
 *
 * @param description - the spell's description as the export carries it (plural markup allowed)
 * @returns the numbers read, or null when there is no description, no number, or a numbered
 *   sentence can't be read
 * @example
 * readDescription('Thorns sprout from the friendly target causing 6 Nature damage to attackers when hit.  Lasts 10 min.')
 * // { damage_shield: 6 }
 */
export function readDescription(description: string | null | undefined): BuffNumbers | null {
  if (!description) return null
  const out: BuffNumbers = {}
  for (const sentence of expandPlural(description).split(/\.(?:\s|$)/).map((x) => x.trim()).filter(Boolean)) {
    if (!/\d/.test(sentence) || /^lasts\b/i.test(sentence)) continue // no number, or only a duration
    const hit = PATTERNS.find(([re]) => re.test(sentence))
    if (!hit) return null
    const m = hit[0].exec(sentence)!
    const v = Number(m.slice(1).find((x) => x !== undefined))
    out[hit[1]] = (out[hit[1]] ?? 0) + v
  }
  return Object.keys(out).length ? out : null
}

/**
 * Rule (b) by description, and rule (c), for one listed buff.
 *
 * @param b - the buff as exported
 * @param entry - its allow-list entry
 * @returns 'confirmed' when the description reads exactly the list's numbers and every point (if
 *   any) is among them; 'missing' when there is no description (only the sheet cross-check can
 *   confirm it then); 'refused' otherwise
 * @example confirmByDescription(thorns, ALLOW_LIST['782']) // 'confirmed'
 */
export function confirmByDescription(b: BuffIn, entry: AllowEntry): 'confirmed' | 'missing' | 'refused' {
  if (!b.description || !b.description.trim()) return 'missing'
  const read = readDescription(b.description)
  if (!read || !Bun.deepEquals(read, allowedNumbers(entry))) return 'refused'
  const values = new Set(Object.values(read))
  return Object.values(b.points ?? {}).every((p) => values.has(Math.abs(p))) ? 'confirmed' : 'refused'
}

/**
 * Who cast it. Format 10: self, other player, not a player (an NPC or the world), unknown (null).
 * Format 8 and 9 said self, other or none, where "none" only meant the caster held no unit slot.
 */
const sourceOf = (s: unknown): Classified['source'] =>
  s === 'self' || s === 'other' || s === 'none' || s === 'other player' || s === 'not a player' ? s : null

/**
 * Sorts the buffs, and gives the sheet sim what to add (bonus stats and the sim's own buffs).
 *
 * @param buffs - the buffs up at export
 * @param opts.allowList - the reviewed allow-list (default ALLOW_LIST)
 * @param opts.sheetCrossCheck - asked for a listed buff with no description; without it such a buff is unknown
 * @returns each buff classified with its path, the bonus stats and individual buffs for the sheet
 *   sim, and the unknown buffs' names
 * @example const { list, unknown } = await classifyBuffs(ch.buffsAtExport)
 */
export async function classifyBuffs(buffs: BuffIn[], opts: { allowList?: AllowList; sheetCrossCheck?: SheetCrossCheck } = {}) {
  const allowList = opts.allowList ?? ALLOW_LIST
  const list: Classified[] = []
  const bonus = Array(40).fill(0)
  const individual: Record<string, boolean> = {}
  for (const b of buffs) {
    const base = { name: b.name, spellID: b.spellID, source: sourceOf(b.source) }
    const one = await exportBuffs([b])
    const modelled = one.unknown.length === 0 && (Object.keys(one.individual).length > 0 || one.bonus.some((v) => v !== 0))
    if (modelled) {
      Object.assign(individual, one.individual)
      one.bonus.forEach((v, i) => (bonus[i] += v))
      list.push({ ...base, class: 'modelled', path: 'modelled', numbers: null })
      continue
    }
    const entry = allowList[String(b.spellID)]
    if (entry) {
      const byDescription = confirmByDescription(b, entry)
      // The sheet can only confirm a buff that moves the sheet.
      const movesSheet = 'stats' in entry && Object.keys(entry.stats).some((k) => STAT_INDEX[k as keyof BuffNumbers] !== undefined)
      const path: BuffPath | null =
        byDescription === 'confirmed' ? 'list'
        : byDescription === 'missing' && movesSheet && opts.sheetCrossCheck && (await opts.sheetCrossCheck(b, entry)) ? 'list + sheet cross-check'
        : null
      if (path) {
        const numbers = allowedNumbers(entry) as BuffNumbers
        if ('stats' in entry) {
          for (const [k, v] of Object.entries(numbers)) if (STAT_INDEX[k as keyof BuffNumbers] !== undefined) bonus[STAT_INDEX[k as keyof BuffNumbers]!] += v!
          list.push({ ...base, class: 'game_numbers', path, numbers })
        } else list.push({ ...base, class: 'no_stats', path, numbers })
        continue
      }
    }
    const byName = NO_STATS.test(b.name) || one.unknown.length === 0
    list.push({ ...base, class: byName ? 'no_stats' : 'unknown', path: byName ? 'no_stats (name rule)' : 'unknown', numbers: null })
  }
  return { list, bonus, individual, unknown: list.filter((b) => b.class === 'unknown').map((b) => b.name) }
}

const listed = (n: BuffNumbers | null) => Object.entries(n ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')

/** One line for the checks: each buff, what was done with it, and the path that classified it. */
export function describeBuffs(list: Classified[]) {
  const said = (b: Classified) =>
    b.class === 'modelled' ? `${b.name}: modelled from the sim's spell data`
    : b.class === 'game_numbers' && b.path === 'list' ? `${b.name}: removed using the game's own numbers (${listed(b.numbers)})`
    : b.class === 'game_numbers' ? `${b.name}: removed using the reviewed list's numbers, confirmed by the sheet (${listed(b.numbers)})`
    : b.class === 'no_stats' && b.numbers ? `${b.name}: doesn't touch the sheet (${listed(b.numbers)}, kept as a note)`
    : b.class === 'no_stats' ? `${b.name}: doesn't touch the sheet`
    : `unknown: ${b.name}`
  return list.map((b) => `${said(b)} (path: ${b.path})${b.source ? ` [${b.source}]` : ''}`).join('; ')
}
```

#### `local/sim/buff-allow-list.ts`

```ts
/**
 * The REVIEWED allow-list of buffs the sheet check may take out using numbers (buffs.ts, rule
 * "game_numbers"). A buff not listed here is never read from its description or points: it stays
 * unknown (or modelled / no_stats by the existing rules). Each entry is reviewed by hand against a
 * cited source, and buff-allow-list.test.ts checks each entry's numbers against that source.
 *
 * Each entry gives the spell's name and rank, and EITHER
 *  - `stats`: every effect it has, in `BuffNumbers` keys (those the sheet shows go into the sheet
 *    sim; haste and mp5 are kept as notes), OR
 *  - `no_sheet_stats: true` with `instead`: what it does instead (mp5, a damage shield), also in
 *    `BuffNumbers` keys, none of them a sheet stat.
 * The description's numbers must equal these exactly, or the buff stays unknown.
 *
 * REVIEW NOTES (2026-11-16):
 * - 16609 Warchief's Blessing (no rank): NOT in the sim's spell data (no row in
 *   sim/core/spelldata/spells_auto_gen.go, so not in local/data/spell-index.json). Numbers are the
 *   Classic values, the last resort: Wowhead Classic spell=16609, effects "Increase Max Health -
 *   Flat 300", "Mod Melee Attack Speed - % 15", "Power Regen (Mana) 10" (description "Increases
 *   hitpoints by 300. 15% haste to melee attacks. 10 mana regen every 5 seconds."). Forever's
 *   client may differ; the description check (or the sheet cross-check) still has to agree.
 * - 19850 Blessing of Wisdom, Rank 2: the sim's spell data, spells_auto_gen.go row ID 19850
 *   (Rank "Rank 2", SpellLevel 24; sim/paladin/spell_data_auto_gen.go ranks 19742, 19850, ...):
 *   A_PERIODIC_ENERGIZE BasePoints 18, PeriodMs 5000, so 18 mana per 5 seconds. No sheet stat.
 * - 782 Thorns, Rank 2: the sim's spell data, spells_auto_gen.go row ID 782 (Rank "Rank 2",
 *   SpellLevel 14, School 8 = Nature; sim/druid/spell_data_auto_gen.go ranks 467, 782, ...):
 *   A_DAMAGE_SHIELD BasePoints 6, so 6 Nature damage to attackers. No sheet stat.
 */
import { z } from 'zod'

/** The effect numbers, in the same keys as `BuffNumbers` in buffs.ts. */
export const AllowNumbersSchema = z
  .object({
    health: z.number(), mana: z.number(), attack_power: z.number(), armor: z.number(),
    strength: z.number(), agility: z.number(), stamina: z.number(), intellect: z.number(), spirit: z.number(),
    mp5: z.number(), haste_pct: z.number(), run_speed_pct: z.number(), damage_shield: z.number(),
  })
  .partial()
  .strict()
  .refine((n) => Object.keys(n).length > 0, 'at least one number')

const Base = { name: z.string().min(1), rank: z.string().nullable(), source: z.string().min(1) }
/** One reviewed entry: either the stats it moves, or no sheet stats and what it does instead. */
export const AllowEntrySchema = z.union([
  z.object({ ...Base, stats: AllowNumbersSchema }).strict(),
  z.object({ ...Base, no_sheet_stats: z.literal(true), instead: AllowNumbersSchema }).strict(),
])
export type AllowEntry = z.infer<typeof AllowEntrySchema>
export const AllowListSchema = z.record(z.string().regex(/^\d+$/), AllowEntrySchema)
export type AllowList = z.infer<typeof AllowListSchema>

const RAW = {
  '16609': {
    name: "Warchief's Blessing",
    rank: null,
    stats: { health: 300, haste_pct: 15, mp5: 10 },
    source: 'Classic values (last resort; not in the sim spell data): Wowhead Classic spell=16609 effects 300 max health, 15% melee attack speed, 10 mana regen',
  },
  '19850': {
    name: 'Blessing of Wisdom',
    rank: 'Rank 2',
    no_sheet_stats: true,
    instead: { mp5: 18 },
    source: 'sim spell data: spells_auto_gen.go ID 19850 A_PERIODIC_ENERGIZE BasePoints 18 PeriodMs 5000',
  },
  '782': {
    name: 'Thorns',
    rank: 'Rank 2',
    no_sheet_stats: true,
    instead: { damage_shield: 6 },
    source: 'sim spell data: spells_auto_gen.go ID 782 A_DAMAGE_SHIELD BasePoints 6, School 8 (Nature)',
  },
}

const parsed = AllowListSchema.safeParse(RAW)
if (!parsed.success) throw new Error(`buff allow-list is malformed: ${parsed.error.message}`)

/** The reviewed allow-list, by spell id. */
export const ALLOW_LIST: AllowList = parsed.data

/**
 * The numbers an entry says the description must state: `stats`, or `instead` for a buff with no
 * sheet stats.
 *
 * @param e - an allow-list entry
 * @returns the entry's effect numbers (BuffNumbers keys)
 * @example allowedNumbers(ALLOW_LIST['782']) // { damage_shield: 6 }
 */
export const allowedNumbers = (e: AllowEntry): Record<string, number> => ('stats' in e ? e.stats : e.instead) as Record<string, number>
```

#### `local/sim/checks.ts`

```ts
/**
 * The proofs that gate any numbers going to the owner:
 *  - calibrate(): fills base health, base mana (and spell crit per Intellect when the game gave no
 *    rate) so the sim's totals equal the export's. These are calibrated, so not checks.
 *  - sheetCheck(): the sim's character sheet against the exported sheet, within tolerances.
 *  - sanityChecks(): level-30 DPS below level 60, no spell above the level cast, DPS rising with
 *    each stat, and "being hit" changing Stormstrike casts the way Improved Stormstrike's reset says.
 */
import { buildRequest, buildRotation, casts, exportBuffs, loadLadders, loadSpellIndex, ROOT, runSim, SCENARIOS, simSheet, type Character, type Scenario } from './lib'
import { PRIVATE } from '../lib/local-config'
import { classifyBuffs, describeBuffs, STAT_INDEX, type BuffIn, type BuffNumbers } from './buffs'
import type { AllowEntry } from './buff-allow-list'

/** blocking false: a line that couldn't be checked (an unknown buff), recorded but not stopping the run. */
export type CheckRow = { name: string; ok: boolean; detail: string; blocking?: boolean }

export async function writeProfile(ch: Character, tag = 'profile') {
  const path = `${ROOT}/local/runs/${tag}.json`
  await Bun.write(path, JSON.stringify(ch.profile))
  return path
}

// The sheet is built with the buffs the game showed at export, so it compares like with like.
/** The sim's sheet with the buffs that were up at export (modelled ones, and ones with the game's numbers). */
export async function sheetFor(ch: Character, tag: string) {
  const sc = SCENARIOS[1]
  const { rotation } = buildRotation(ch, sc, await loadLadders(), await loadSpellIndex())
  const c = await classifyFor(ch)
  return simSheet(buildRequest(ch, sc, rotation, { iterations: 1, seed: 1, buffs: { raid: {}, individual: c.individual }, bonusStats: c.bonus }), await writeProfile(ch, `profile-${tag}`), tag)
}

/** Clean calibrations by level (base health and mana depend on level, race and class only). */
const CLEAN_CALIBRATIONS = `${PRIVATE}/data/clean-calibrations.json`

/** The sheet field for each sheet stat a listed buff can move. */
const SHEET_FIELD: Partial<Record<keyof BuffNumbers, string>> = { strength: 'strength', agility: 'agility', stamina: 'stamina', intellect: 'intellect', spirit: 'spirit', attack_power: 'attackPower', armor: 'armor', health: 'health', mana: 'mana' }

/**
 * The clean calibrations at the character's level, race and class (oldest first). The file is the
 * one calibrate() last used for this character (its `historyPath` option), else the private one.
 */
async function cleanCalibrations(ch: Character): Promise<any[]> {
  const path = (ch as any).cleanCalibrationsPath ?? CLEAN_CALIBRATIONS
  const history: any[] = (await Bun.file(path).exists()) ? JSON.parse(await Bun.file(path).text()) : []
  return history.filter((h) => h.level === ch.level && h.race === ch.race && h.class === ch.class)
}

/**
 * The sheet cross-check for an allow-listed buff whose description is missing (buffs.ts rule 3):
 * true only when there is a clean calibration at the same level, race and class, every other buff
 * is classified (none unknown), and the exported sheet less the sheet sim at that clean base with
 * the other buffs (not this one) equals each of the list's sheet stats EXACTLY.
 *
 * @param ch - the character with its exported sheet and buffs
 * @param b - the buff to confirm
 * @param entry - its allow-list entry (must have `stats`)
 * @returns whether the sheet confirms the list's numbers
 * @example await sheetCrossCheck(ch, wb, ALLOW_LIST['16609']) // true when sheet health is 300 over the clean base
 */
export async function sheetCrossCheck(ch: Character, b: BuffIn, entry: AllowEntry): Promise<boolean> {
  if (!ch.sheet || !('stats' in entry)) return false
  const same = await cleanCalibrations(ch)
  if (!same.length) return false
  const last = same[same.length - 1]
  const others = ((ch as any).buffsAtExport ?? []).filter((x: BuffIn) => x !== b)
  if ((await classifyBuffs(others)).unknown.length) return false // a gap could be another buff's
  const sim = await sheetFor({ ...ch, profile: { ...ch.profile, baseHealth: last.baseHealth, baseMana: last.baseMana }, buffsAtExport: others } as any, 'buff-cross-check')
  const stats = Object.entries(entry.stats).filter(([k]) => STAT_INDEX[k as keyof BuffNumbers] !== undefined)
  return stats.length > 0 && stats.every(([k, v]) => {
    const f = SHEET_FIELD[k as keyof BuffNumbers]!
    return Math.abs(Number(ch.sheet![f]) - Number((sim as any)[f]) - v!) < 1e-6
  })
}

/**
 * The character's buffs classified (buffs.ts), with the sheet cross-check available for a listed
 * buff whose description is missing.
 *
 * @param ch - the character (its `buffsAtExport`)
 * @returns what classifyBuffs returns
 * @example const { list, unknown } = await classifyFor(ch)
 */
export async function classifyFor(ch: Character) {
  return classifyBuffs((ch as any).buffsAtExport ?? [], { sheetCrossCheck: (b, entry) => sheetCrossCheck(ch, b, entry) })
}

/** Solves base health, base mana and (if flagged) spell crit per Intellect from the exported totals. */
/**
 * The rule with an unknown buff up (it could be in the health or mana totals): base health and mana
 * are NOT re-solved from that sheet when a clean calibration exists for the same level, race and
 * class; that one is used. Without one, they're solved and the character is marked
 * `calibratedFromBuffedSheet` (the checks then say "not checked", and the history row is unclean).
 * A clean export's calibration is recorded for later.
 */
export async function calibrate(ch: Character, opts: { historyPath?: string } = {}): Promise<string[]> {
  if (!ch.sheet) return ['no exported sheet: nothing calibrated (placeholder)']
  const p = ch.profile as Record<string, number>
  const needSpellCrit = Boolean((ch as any).calibrate?.spellCritPerInt)
  const historyPath = opts.historyPath ?? CLEAN_CALIBRATIONS
  ;(ch as any).cleanCalibrationsPath = historyPath
  const { unknown } = await classifyFor(ch)
  const history: any[] = (await Bun.file(historyPath).exists()) ? JSON.parse(await Bun.file(historyPath).text()) : []
  const same = history.filter((h) => h.level === ch.level && h.race === ch.race && h.class === ch.class)
  p.baseHealth = 0
  p.baseMana = 0
  if (needSpellCrit) p.spellCritPerInt = 0
  const zero = await sheetFor(ch, 'calibrate')
  const notes: string[] = []
  if (unknown.length && same.length) {
    const last = same[same.length - 1]
    p.baseHealth = last.baseHealth
    p.baseMana = last.baseMana
    notes.push(`unknown buff up (${unknown.join(', ')}): base health ${p.baseHealth} and base mana ${p.baseMana} from the last clean calibration at level ${ch.level}, not re-solved from this sheet`)
  } else {
    p.baseHealth = ch.sheet.health - zero.health
    p.baseMana = ch.sheet.mana - zero.mana
    if (unknown.length) {
      ;(ch as any).calibratedFromBuffedSheet = unknown
      notes.push(`base health ${p.baseHealth} and base mana ${p.baseMana} solved from a buffed sheet (unknown buff: ${unknown.join(', ')}; no clean calibration at level ${ch.level} yet): not checked`)
    } else {
      notes.push(`base health ${p.baseHealth} and base mana ${p.baseMana} calibrated from the exported totals`)
      if (!same.some((h) => h.baseHealth === p.baseHealth && h.baseMana === p.baseMana)) {
        history.push({ level: ch.level, race: ch.race, class: ch.class, baseHealth: p.baseHealth, baseMana: p.baseMana, at: new Date().toISOString() })
        await Bun.write(historyPath, JSON.stringify(history, null, 2))
      }
    }
  }
  if (needSpellCrit && zero.intellect > 0) {
    p.spellCritPerInt = (ch.sheet.spellCrit - zero.spellCrit) / zero.intellect
    notes.push(`spell crit per Intellect ${p.spellCritPerInt.toFixed(4)}% calibrated (the game's rate answered 0)`)
  }
  return notes
}

const TOLERANCE: Record<string, number> = {
  strength: 1, agility: 1, stamina: 1, intellect: 1, spirit: 1, attackPower: 2, dodge: 0.06, meleeHit: 0.05, armor: 5,
}

/**
 * The optional base crit cross-check. Each run records, per level, the solved base crit with the
 * Agility and crit it came from. When an earlier export at the same level had a different Agility,
 * the two must be explained by one base crit (within 0.06%): that tests the base crit and the crit
 * per Agility together, which one export cannot.
 */
async function crossCheckBaseCrit(ch: Character): Promise<string> {
  const path = `${PRIVATE}/data/calibration-history.json`
  const file = Bun.file(path)
  const history: any[] = (await file.exists()) ? JSON.parse(await file.text()) : []
  const p = ch.profile as Record<string, number>
  const entry = { level: ch.level, agility: ch.sheet!.agility, meleeCrit: ch.sheet!.meleeCrit, critPerAgility: p.critPerAgility, baseMeleeCrit: p.baseMeleeCrit, source: (ch.profile as any).source }
  const earlier = history.filter((h) => h.level === ch.level && Math.abs(h.agility - entry.agility) >= 5)
  if (!history.some((h) => h.source === entry.source)) history.push(entry)
  await Bun.write(path, JSON.stringify(history, null, 2))
  if (earlier.length === 0) return `optional base crit cross-check: waiting for a level ${ch.level} export with at least 5 different Agility (different gear) to confirm ${p.baseMeleeCrit}% independently`
  const prev = earlier[earlier.length - 1]
  const diff = Math.abs(prev.baseMeleeCrit - entry.baseMeleeCrit)
  return `optional base crit cross-check: ${diff <= 0.06 ? 'CONFIRMED' : 'NOT CONFIRMED'}: Agility ${prev.agility} gave base ${prev.baseMeleeCrit}%, Agility ${entry.agility} gives ${entry.baseMeleeCrit}% (differ by ${diff.toFixed(3)}, limit 0.06)`
}

/** The sim's sheet against the export's. Health, mana and (when calibrated) spell crit are shown, not checked. */
export async function sheetCheck(ch: Character): Promise<{ rows: CheckRow[]; ok: boolean }> {
  if (!ch.sheet) return { rows: [{ name: 'sheet', ok: false, detail: 'no export yet: the sheet check cannot run' }], ok: false }
  const sim = await sheetFor(ch, 'sheet-check')
  const rows: CheckRow[] = []
  const buffs = await classifyFor(ch)
  const unknown = buffs.unknown
  // With an unknown buff up, a line that doesn't match may be the buff: "not checked", non-blocking.
  // A line that matches is still a pass (an unknown buff didn't move it by more than the tolerance).
  const line = (name: string, ok: boolean, detail: string): CheckRow =>
    ok || !unknown.length ? { name, ok, detail } : { name, ok: false, blocking: false, detail: `not checked: unknown buff ${unknown.join(', ')} (${detail})` }
  for (const [k, tol] of Object.entries(TOLERANCE)) {
    const want = ch.sheet[k]
    const got = (sim as any)[k] as number
    if (!Number.isFinite(want)) { rows.push({ name: k, ok: true, detail: `not in the export, skipped` }); continue }
    rows.push(line(k, Math.abs(got - want) <= tol, `sim ${got.toFixed(2)} vs game ${want.toFixed(2)} (±${tol})`))
  }
  // The sheet's crit is less 0.04% per point of weapon skill under the level's maximum; the sim
  // applies that in its attack table, not its sheet, so the check adds it here.
  const deficit = Number((ch as any).weaponSkillDeficit ?? 0)
  const simCrit = sim.meleeCrit - 0.04 * deficit
  rows.push(line('meleeCrit', Math.abs(simCrit - ch.sheet.meleeCrit) <= 0.06, `sim ${simCrit.toFixed(2)} (base 1.7% less 0.04% x ${deficit} weapon skill under the cap) vs game ${ch.sheet.meleeCrit.toFixed(2)} (±0.06)`))
  const calibrated = (ch as any).calibrate?.spellCritPerInt
  rows.push({ name: 'spellCrit', ok: calibrated ? true : Math.abs(sim.spellCrit - ch.sheet.spellCrit) <= 0.06, detail: `sim ${sim.spellCrit.toFixed(2)} vs game ${ch.sheet.spellCrit.toFixed(2)}${calibrated ? ' (calibrated, not a check)' : ' (±0.06)'}` })
  for (const k of ['health', 'mana'] as const) {
    const d = `sim ${sim[k]} vs game ${ch.sheet[k]}`
    rows.push(unknown.length
      ? { name: k, ok: false, blocking: false, detail: `not checked: unknown buff ${unknown.join(', ')} (${d}; ${(ch as any).calibratedFromBuffedSheet ? 'base solved from this buffed sheet' : 'base from the last clean calibration'})` }
      : { name: k, ok: true, detail: `${d} (calibrated, not a check)` })
  }
  if (buffs.list.length) rows.push({ name: 'buffs', ok: unknown.length === 0, blocking: false, detail: describeBuffs(buffs.list) })
  return { rows, ok: rows.every((r) => r.ok || r.blocking === false) }
}

/** Mean and 95% interval of the per-seed differences. */
export function meanCI(xs: number[]) {
  const n = xs.length
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  const t = [12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23][Math.min(n - 2, 9)] ?? 1.96
  return { mean, half: (t * sd) / Math.sqrt(n) }
}

/**
 * Sanity checks. The Stormstrike check runs the character with one point moved into Improved
 * Stormstrike when it has none (a check of the sim's rule, not of the character's build).
 */
export async function sanityChecks(ch: Character, level60Dps: number): Promise<CheckRow[]> {
  const rows: CheckRow[] = []
  const ladders = await loadLadders()
  const index = await loadSpellIndex()
  const profile = await writeProfile(ch, 'profile-sanity')
  const sc = SCENARIOS[1]
  const { rotation, ranks } = buildRotation(ch, sc, ladders, index)

  const base = await runSim(buildRequest(ch, sc, rotation, { iterations: 3000, seed: 11 }), profile, 'sanity-base')
  rows.push({ name: 'below level 60', ok: base.dps.avg < level60Dps / 2, detail: `level ${ch.level} DPS ${base.dps.avg.toFixed(1)} vs level 60 test build ${level60Dps.toFixed(1)}` })

  // Every spell cast is at or below the level, apart from talents (their rows carry no trainable level).
  const talentSpells = new Set([17364])
  const above = base.actions
    .filter((a) => a.id.spellId && a.targets.some((t) => (t.casts ?? 0) > 0))
    .map((a) => a.id.spellId!)
    .filter((id) => !talentSpells.has(id) && (index[id]?.spellLevel ?? 0) > ch.level)
  rows.push({ name: 'no spell above the level', ok: above.length === 0, detail: above.length ? `cast above level ${ch.level}: ${above.join(', ')}` : `ranks cast: ${JSON.stringify(ranks)}` })

  // DPS rises with each stat (same seed, so the difference is not swamped by noise).
  const deltas: [string, number, number][] = [['Strength', 0, 20], ['Agility', 1, 20], ['Intellect', 3, 20], ['Attack Power', 14, 40], ['Hit rating', 17, 20], ['Crit rating', 18, 28]]
  for (const [name, stat, amount] of deltas) {
    const bonus = Array(40).fill(0)
    bonus[stat] = amount
    const diffs: number[] = []
    for (const seed of [21, 22, 23]) {
      const a = await runSim(buildRequest(ch, sc, rotation, { iterations: 3000, seed }), profile, `sanity-${stat}-a`)
      const b = await runSim(buildRequest(ch, sc, rotation, { iterations: 3000, seed, bonusStats: bonus }), profile, `sanity-${stat}-b`)
      diffs.push(b.dps.avg - a.dps.avg)
    }
    const { mean, half } = meanCI(diffs)
    rows.push({ name: `DPS rises with ${name}`, ok: mean - half > 0, detail: `+${amount}: ${mean.toFixed(2)} ± ${half.toFixed(2)} DPS` })
  }

  // Being hit: with Improved Stormstrike, dodges and parries reset Stormstrike, so casts per minute
  // rise when the mob attacks; without it, they do not.
  const enh = (ch.talents.split('-')[1] ?? '').padEnd(18, '0').split('').map(Number)
  const impSS = enh[15]
  const withImp = [...enh]
  if (impSS === 0) {
    const from = withImp[8] > 0 ? 8 : withImp.findIndex((v, i) => v > 0 && i !== 11 && i !== 4)
    withImp[from] -= 1
    withImp[15] = 1
  }
  const treesWith = ch.talents.split('-')
  treesWith[1] = withImp.join('').replace(/0+$/, '')
  const variants: [string, Character][] = [['without Improved Stormstrike', { ...ch, talents: ch.talents.split('-').map((t, i) => (i === 1 ? enh.map((v, j) => (j === 15 ? 0 : v)).join('').replace(/0+$/, '') : t)).join('-') }], [`with Improved Stormstrike ${withImp[15]}/2`, { ...ch, talents: treesWith.join('-') }]]
  const solo = SCENARIOS[0]
  const behind: Scenario = { ...solo, key: 'solo-not-hit', beingHit: false }
  const iters = 4000
  const perMin = (m: { actions: any[] }) => casts(m as any, 17364) / iters / (solo.duration / 60)
  const measured: { hit: number; notHit: number; avoided: number }[] = []
  for (const [, c] of variants) {
    const rot = buildRotation(c, solo, ladders, index).rotation
    const hit = await runSim(buildRequest(c, solo, rot, { iterations: iters, seed: 31 }), profile, 'sanity-hit')
    const notHit = await runSim(buildRequest(c, behind, rot, { iterations: iters, seed: 31 }), profile, 'sanity-nothit')
    measured.push({ hit: perMin(hit), notHit: perMin(notHit), avoided: (hit.avoidedByMe ?? 0) / iters })
  }
  // Being hit also costs casts (Lightning Shield orbs are spent and recast), so the reset's effect
  // is the rise with the talent less the change without it. Each dodge or parry resets at the
  // talent's chance; on average the cooldown has half its 8 s left, so a reset gains half a cast.
  const [without, withIt] = measured
  const rise = withIt.hit - withIt.notHit - (without.hit - without.notHit)
  const chance = 0.5 * withImp[15]
  const expected = withIt.avoided * chance * 0.5 * (60 / solo.duration)
  rows.push({
    name: 'being hit resets Stormstrike as the rule says',
    ok: rise > 0 && Math.abs(rise - expected) <= 0.35 * expected,
    detail: `Stormstrike/min: no talent ${without.notHit.toFixed(2)} → ${without.hit.toFixed(2)} when hit; Improved Stormstrike ${withImp[15]}/2 ${withIt.notHit.toFixed(2)} → ${withIt.hit.toFixed(2)}. Reset effect ${rise.toFixed(2)}/min vs ${expected.toFixed(2)}/min expected from ${withIt.avoided.toFixed(2)} dodges+parries per fight at ${chance * 100}% (±35%)`,
  })
  return rows
}
```
