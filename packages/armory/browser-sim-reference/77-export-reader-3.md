Export reader files, part 3 of 3 (their tests), from `0476f3e`. Whole files, verbatim.

#### `local/sim/buffs.test.ts`

```ts
/**
 * Buffs up at export: each is modelled from the sim's spell data, on the reviewed allow-list and
 * confirmed by its description (or, with no description, by the sheet cross-check), known not to
 * touch the sheet, or unknown. Calibration must never absorb a buff again (Warchief's Blessing once
 * inflated base health by 300), and an unknown buff makes the lines it could touch "not checked"
 * (non-blocking) instead of failing the run.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { classifyBuffs, describeBuffs, readDescription } from './buffs'
import { calibrate, sheetCheck, sheetFor } from './checks'
import { buffsFromExport } from './export'
import { ROOT, type Character } from './lib'

const WB = { name: "Warchief's Blessing", spellID: 16609, source: 'none', points: { '1': 300, '2': 15, '3': 10 }, description: 'Increases hitpoints by 300. 15% haste to melee attacks. 10 mana regen every 5 seconds.' }
const WB_BARE = { name: "Warchief's Blessing", spellID: 16609 } // format 7: no numbers
// As Forever exported them on 2026-11-16 (level 33): Warchief's Blessing with no description (spell
// data not loaded on his client) and empty points; Blessing of Wisdom with empty points.
const WB_L33 = { name: "Warchief's Blessing", spellID: 16609, source: 'none', points: {}, description: null }
const BOW_L33 = { name: 'Blessing of Wisdom', spellID: 19850, source: 'other', points: {}, description: 'Places a Blessing on the friendly target, restoring 18 mana every 5 seconds for 1 |4hour:hrs;.  Players may only have one Blessing on them per Paladin at any one time.' }
const THORNS_L33 = { name: 'Thorns', spellID: 782, source: 'other', points: { '1': 6 }, description: 'Thorns sprout from the friendly target causing 6 Nature damage to attackers when hit.  Lasts 10 min.' }
const KINGS = { name: 'Blessing of Kings', spellID: 20217, source: 'other' }
const MOTW = { name: 'Mark of the Wild', spellID: 6756, source: 'other' }
const FORT = { name: 'Power Word: Fortitude', spellID: 1245, source: 'other' } // Rank 3: +26 Stamina in the sim's spell data
const MYSTERY = { name: 'Mystery Aura', spellID: 999999, source: 'other' }
const NOT_LISTED = { name: 'Fortitude Test', spellID: 999001, source: 'other', points: { '1': 20 }, description: 'Increases Stamina by 20 for 30 min.' }

describe('the strict read of a description', () => {
  test("Warchief's Blessing: +300 health, 15% haste, 10 mp5", () => {
    expect(readDescription(WB.description)).toEqual({ health: 300, haste_pct: 15, mp5: 10 })
  })
  test('Blessing of Wisdom (plural markup): 18 mp5; Thorns: a 6 damage shield (the "Lasts" sentence skipped)', () => {
    expect(readDescription(BOW_L33.description)).toEqual({ mp5: 18 })
    expect(readDescription(THORNS_L33.description)).toEqual({ damage_shield: 6 })
  })
  test('a sentence with a number it cannot read: null', () => {
    expect(readDescription('Increases your chance to dodge by 5%.')).toBeNull()
  })
  test('no description: null', () => {
    expect(readDescription(null)).toBeNull()
  })
})

describe('the allow-list rule', () => {
  const one = async (b: any) => (await classifyBuffs([b])).list[0]
  test("Warchief's Blessing with its description and points: game_numbers via the list", async () => {
    expect(await one(WB)).toMatchObject({ class: 'game_numbers', path: 'list', numbers: { health: 300, haste_pct: 15, mp5: 10 } })
  })
  test('a description number that differs from the list: unknown', async () => {
    expect(await one({ ...WB, points: {}, description: WB.description.replace('300', '250') })).toMatchObject({ class: 'unknown', path: 'unknown' })
  })
  test('a point that is not a number read from the description: unknown', async () => {
    expect(await one({ ...WB, points: { '1': 250 } })).toMatchObject({ class: 'unknown' })
  })
  test('empty points are no longer a refusal: the description alone confirms it', async () => {
    expect(await one({ ...WB, points: {} })).toMatchObject({ class: 'game_numbers', path: 'list' })
  })
  test('a description that states something the list does not, or misses one of its numbers: unknown', async () => {
    expect(await one({ ...THORNS_L33, description: `${THORNS_L33.description} Increases Stamina by 5.` })).toMatchObject({ class: 'unknown' })
    expect(await one({ ...WB, points: {}, description: 'Increases hitpoints by 300.' })).toMatchObject({ class: 'unknown' })
  })
  test('a numbered sentence the strict read cannot read: unknown', async () => {
    expect(await one({ ...THORNS_L33, description: `${THORNS_L33.description} Reflects 3 spells.` })).toMatchObject({ class: 'unknown' })
  })
  test('a fully readable buff with matching points but NOT on the list: unknown', async () => {
    expect(await one(NOT_LISTED)).toMatchObject({ class: 'unknown', path: 'unknown' })
  })
  test('Blessing of Wisdom and Thorns: no sheet stats via the list, what they do kept as a note', async () => {
    expect(await one(BOW_L33)).toMatchObject({ class: 'no_stats', path: 'list', numbers: { mp5: 18 } })
    expect(await one(THORNS_L33)).toMatchObject({ class: 'no_stats', path: 'list', numbers: { damage_shield: 6 } })
  })
  test('no description and no sheet cross-check: unknown', async () => {
    expect(await one(WB_L33)).toMatchObject({ class: 'unknown' })
    expect(await one(WB_BARE)).toMatchObject({ class: 'unknown' })
  })
  test('no description: the sheet cross-check decides; it cannot confirm a buff with no sheet stats, nor overrule a refused description', async () => {
    const yes = async () => true
    expect((await classifyBuffs([WB_L33], { sheetCrossCheck: yes })).list[0]).toMatchObject({ class: 'game_numbers', path: 'list + sheet cross-check' })
    expect((await classifyBuffs([WB_L33], { sheetCrossCheck: async () => false })).list[0]).toMatchObject({ class: 'unknown' })
    expect((await classifyBuffs([{ ...BOW_L33, description: null }], { sheetCrossCheck: yes })).list[0]).toMatchObject({ class: 'unknown' })
    expect((await classifyBuffs([{ ...WB, description: 'Increases hitpoints by 250.' }], { sheetCrossCheck: yes })).list[0]).toMatchObject({ class: 'unknown' })
  })
})

describe('classifying the buffs at export', () => {
  test('modelled, game numbers, no stats, unknown, each with its path; self or other kept, no names', async () => {
    const c = await classifyBuffs([KINGS, MOTW, WB, { name: 'Lightning Shield', spellID: 324, source: 'self' }, THORNS_L33, MYSTERY])
    expect(c.list.map((b) => [b.name, b.class, b.path, b.source])).toEqual([
      ['Blessing of Kings', 'modelled', 'modelled', 'other'],
      ['Mark of the Wild', 'modelled', 'modelled', 'other'],
      ["Warchief's Blessing", 'game_numbers', 'list', 'none'],
      ['Lightning Shield', 'no_stats', 'no_stats (name rule)', 'self'],
      ['Thorns', 'no_stats', 'list', 'other'],
      ['Mystery Aura', 'unknown', 'unknown', 'other'],
    ])
    expect(c.unknown).toEqual(['Mystery Aura'])
    expect(c.bonus[29]).toBe(300) // Warchief's Blessing's health goes into the sheet sim
    const d = describeBuffs(c.list)
    expect(d).toContain("Warchief's Blessing: removed using the game's own numbers (health 300, mp5 10, haste_pct 15) (path: list) [none]")
    expect(d).toContain("Thorns: doesn't touch the sheet (damage_shield 6, kept as a note) (path: list) [other]")
    expect(d).toContain("Lightning Shield: doesn't touch the sheet (path: no_stats (name rule)) [self]")
    expect(d).toContain('unknown: Mystery Aura (path: unknown) [other]')
  })
})

const base = JSON.parse(await Bun.file(`${ROOT}/local/fixtures/placeholder-testchar.json`).text()) as Character
/**
 * A character whose exported sheet is the sim's with `truth` up (by default Kings and Mark of the
 * Wild), plus `sheetDelta`, and whose export lists `buffs`.
 */
const withBuffs = (buffs: any[], sheetDelta: Record<string, number> = {}, opts: { truth?: any[]; level?: number } = { truth: [KINGS, MOTW] }) => async () => {
  const ch = structuredClone(base) as any
  if (opts.level) ch.level = opts.level
  ch.profile.baseHealth = 400
  ch.profile.baseMana = 600
  ch.buffsAtExport = opts.truth ?? [KINGS, MOTW]
  const s = await sheetFor(ch, 'buffs-test-truth') // the game's sheet with the truth buffs up
  ch.sheet = { ...s, meleeCrit: s.meleeCrit, spellCrit: s.spellCrit }
  for (const [k, v] of Object.entries(sheetDelta)) ch.sheet[k] += v
  ch.buffsAtExport = buffs
  return ch
}
/** A temporary clean-calibrations file with one clean calibration at the character's level, race and class. */
const cleanAt = async (ch: any) => {
  const path = `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json`
  await Bun.write(path, JSON.stringify([{ level: ch.level, race: ch.race, class: ch.class, baseHealth: 400, baseMana: 600, at: '2026-11-01T00:00:00Z' }]))
  return path
}

describe('the sheet sim and calibration with buffs up', () => {
  test('Kings applies after a flat buff (the order matters): +26 Stamina reads +28.6 with Kings', async () => {
    const ch = structuredClone(base) as any
    ch.profile.baseHealth = 400
    ch.profile.baseMana = 600
    ch.buffsAtExport = [KINGS]
    const a = await sheetFor(ch, 'buffs-test-a')
    ch.buffsAtExport = [KINGS, FORT]
    const b = await sheetFor(ch, 'buffs-test-b')
    expect(Math.abs(b.stamina - a.stamina - 28.6)).toBeLessThanOrEqual(0.6)
    expect(Math.abs(b.health - a.health - 286)).toBeLessThanOrEqual(10)
  })

  test("Kings + Mark of the Wild + Warchief's Blessing (with its numbers): base health is not inflated", async () => {
    const ch = await withBuffs([KINGS, MOTW, WB], { health: 300 })()
    await calibrate(ch, { historyPath: `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json` })
    expect(ch.profile.baseHealth).toBe(400)
    expect(ch.profile.baseMana).toBe(600)
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true)
    expect(rows.find((r) => r.name === 'buffs')!.detail).toContain("Warchief's Blessing: removed using the game's own numbers (health 300, mp5 10, haste_pct 15) (path: list)")
  })

  test('an unknown buff: lines it moved are "not checked" (non-blocking), health is not re-solved from a buffed sheet', async () => {
    const hist = `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json`
    // A clean calibration at this level first.
    const clean = await withBuffs([KINGS, MOTW])()
    await calibrate(clean, { historyPath: hist })
    // Then an export with Warchief's Blessing and no numbers, and 250 more health on the sheet
    // (not the list's 300, so the sheet cross-check refuses it too).
    const ch = await withBuffs([KINGS, MOTW, WB_BARE], { health: 250 })()
    const notes = await calibrate(ch, { historyPath: hist })
    expect(ch.profile.baseHealth).toBe(400) // the last clean calibration, not 650
    expect(notes.join('\n')).toContain('last clean calibration')
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true) // non-blocking: the run goes on, marked
    const buffs = rows.find((r) => r.name === 'buffs')!
    expect(buffs.ok).toBe(false)
    expect(buffs.blocking).toBe(false)
    expect(buffs.detail).toContain("unknown: Warchief's Blessing (path: unknown)")
    expect(rows.find((r) => r.name === 'health')!.detail).toContain('not checked')
  })

  test('an unknown buff and no clean calibration at this level: solved, but marked as from a buffed sheet', async () => {
    const ch = await withBuffs([KINGS, MOTW, WB_BARE], { health: 300 })()
    const notes = await calibrate(ch, { historyPath: `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json` })
    expect(ch.profile.baseHealth).toBe(700)
    expect((ch as any).calibratedFromBuffedSheet).toEqual(["Warchief's Blessing"])
    expect(notes.join('\n')).toContain('from a buffed sheet')
  })
})

describe('the 2026-11-16 level 33 export, under the allow-list rule', () => {
  // The export's buffs table as readExport gives it (Lua list: keys '1', '2', ...).
  const RAW = {
    '1': { stacks: 0, name: "Warchief's Blessing", source: 'none', points: {}, duration: 3600, spellID: 16609 },
    '2': { stacks: 0, description: BOW_L33.description, name: 'Blessing of Wisdom', duration: 3600, points: {}, source: 'none', spellID: 19850 },
    '3': { stacks: 0, description: THORNS_L33.description, name: 'Thorns', duration: 600, points: { '1': 6 }, source: 'none', spellID: 782 },
  }
  test('the reader keeps each buff\'s source, points and description (format 8)', () => {
    expect(buffsFromExport(RAW)).toEqual([
      { name: "Warchief's Blessing", spellID: 16609, source: 'none', points: {}, description: null },
      { name: 'Blessing of Wisdom', spellID: 19850, source: 'none', points: {}, description: BOW_L33.description },
      { name: 'Thorns', spellID: 782, source: 'none', points: { '1': 6 }, description: THORNS_L33.description },
    ])
    // A row it can't read keeps only the name and spell id (it can then only be modelled or unknown).
    expect(buffsFromExport({ '1': { name: 'X', spellID: 5, points: 'bad' } })).toEqual([{ name: 'X', spellID: 5 }])
  })
  test("Thorns and Blessing of Wisdom via the list; Warchief's Blessing unknown (no description, no clean level 33 calibration): only health and mana not checked; nothing recorded", async () => {
    const ch = await withBuffs(buffsFromExport(RAW), { health: 300 }, { truth: [], level: 33 })()
    const hist = `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json`
    const notes = await calibrate(ch, { historyPath: hist })
    expect(notes.join('\n')).toContain('from a buffed sheet')
    expect(existsSync(hist)).toBe(false) // an unknown buff: no clean calibration recorded
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true)
    const buffs = rows.find((r) => r.name === 'buffs')!
    expect(buffs.detail).toContain("unknown: Warchief's Blessing (path: unknown) [none]")
    expect(buffs.detail).toContain("Blessing of Wisdom: doesn't touch the sheet (mp5 18, kept as a note) (path: list) [none]")
    expect(buffs.detail).toContain("Thorns: doesn't touch the sheet (damage_shield 6, kept as a note) (path: list) [none]")
    expect(rows.filter((r) => r.name !== 'buffs' && !r.ok).map((r) => r.name)).toEqual(['health', 'mana'])
    expect(rows.filter((r) => r.name === 'health' || r.name === 'mana').every((r) => r.blocking === false && r.detail.startsWith('not checked'))).toBe(true)
  })
})

describe("Warchief's Blessing with no description, confirmed by the sheet cross-check", () => {
  test('a clean calibration at this level and the sheet exactly +300 health: list + sheet cross-check, base not inflated, nothing added', async () => {
    const ch = await withBuffs([KINGS, MOTW, WB_L33], { health: 300 })()
    const hist = await cleanAt(ch)
    const before = await Bun.file(hist).text()
    const notes = await calibrate(ch, { historyPath: hist })
    expect(ch.profile.baseHealth).toBe(400)
    expect(ch.profile.baseMana).toBe(600)
    expect(notes.join('\n')).toContain('calibrated from the exported totals')
    expect(await Bun.file(hist).text()).toBe(before)
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true)
    expect(rows.every((r) => r.ok)).toBe(true)
    expect(rows.find((r) => r.name === 'buffs')!.detail).toContain("Warchief's Blessing: removed using the reviewed list's numbers, confirmed by the sheet (health 300, mp5 10, haste_pct 15) (path: list + sheet cross-check)")
  })
  test('the sheet 250 over the clean base, not 300: unknown', async () => {
    const ch = await withBuffs([KINGS, MOTW, WB_L33], { health: 250 })()
    await calibrate(ch, { historyPath: await cleanAt(ch) })
    const { rows } = await sheetCheck(ch)
    expect(rows.find((r) => r.name === 'buffs')!.detail).toContain("unknown: Warchief's Blessing")
    expect(rows.find((r) => r.name === 'health')!.detail).toContain('not checked')
  })
  test('another buff unknown: the gap cannot be put on one buff, so unknown', async () => {
    const ch = await withBuffs([KINGS, MOTW, WB_L33, MYSTERY], { health: 300 })()
    await calibrate(ch, { historyPath: await cleanAt(ch) })
    const { rows } = await sheetCheck(ch)
    expect(rows.find((r) => r.name === 'buffs')!.detail).toContain("unknown: Warchief's Blessing")
  })
})

describe("Forever's plural markup in descriptions", () => {
  test('"|4singular:plural;" reads by the number before it; text without it is unchanged', async () => {
    const { expandPlural } = await import('./buffs')
    expect(expandPlural('restoring 18 mana every 5 seconds for 1 |4hour:hrs;.')).toBe('restoring 18 mana every 5 seconds for 1 hour.')
    expect(expandPlural('for 2 |4hour:hrs;.')).toBe('for 2 hrs.')
    expect(expandPlural('Lasts 10 min.')).toBe('Lasts 10 min.')
  })
})

describe('who cast a buff, format 10', () => {
  test('"other player" and "not a player" are kept as given; "unknown" reads as no source; format 8 values still read', async () => {
    const { classifyBuffs } = await import('./buffs')
    const c = await classifyBuffs([
      { name: 'Thorns', spellID: 782, source: 'other player' },
      { name: "Warchief's Blessing", spellID: 16609, source: 'not a player' },
      { name: 'Mystery', spellID: 99999, source: 'unknown' },
      { name: 'Lightning Shield', spellID: 324, source: 'self' },
      { name: 'Old', spellID: 99998, source: 'none' },
    ])
    expect(c.list.map((b) => b.source)).toEqual(['other player', 'not a player', null, 'self', 'none'])
  })
})
```

#### `local/sim/buff-allow-list.test.ts`

```ts
/**
 * Each allow-list entry's numbers against the source its review note cites: the sim's spell data
 * (sim/core/spelldata/spells_auto_gen.go and local/data/spell-index.json) where it has the spell,
 * else the pinned Classic values.
 */
import { describe, expect, test } from 'bun:test'

import { ALLOW_LIST, AllowListSchema, allowedNumbers } from './buff-allow-list'
import { ROOT } from './lib'

const src = await Bun.file(`${ROOT}/sim/core/spelldata/spells_auto_gen.go`).text()
const index = JSON.parse(await Bun.file(`${ROOT}/local/data/spell-index.json`).text()) as Record<string, { name: string; rank: string | null }>
/** The spell's row (header and effects) in the sim's auto-generated spell data, or '' if absent. */
const row = (id: number) => new RegExp(`^\\t\\{ID: ${id}, [\\s\\S]*?(?=\\n\\t\\{ID: )`, 'm').exec(src)?.[0] ?? ''

describe('the buff allow-list', () => {
  test('parses with its schema; only the three reviewed entries', () => {
    expect(AllowListSchema.safeParse(ALLOW_LIST).success).toBe(true)
    expect(Object.keys(ALLOW_LIST).sort()).toEqual(['16609', '19850', '782'])
  })

  test("16609 Warchief's Blessing: not in the sim's data; pinned Classic values (Wowhead Classic spell=16609)", () => {
    // If the sim's data gains the spell, switch the source to it.
    expect(row(16609)).toBe('')
    expect(index['16609']).toBeUndefined()
    // Wowhead Classic spell=16609: Increase Max Health - Flat 300; Mod Melee Attack Speed - % 15;
    // Power Regen (Mana) 10.
    const e = ALLOW_LIST['16609']
    expect(e.name).toBe("Warchief's Blessing")
    expect(e.rank).toBeNull()
    expect(allowedNumbers(e)).toEqual({ health: 300, haste_pct: 15, mp5: 10 })
    expect('no_sheet_stats' in e).toBe(false)
  })

  test('19850 Blessing of Wisdom: Rank 2, 18 mana every 5 s (A_PERIODIC_ENERGIZE), no sheet stats', () => {
    const r = row(19850)
    expect(r).toContain('Name: "Blessing of Wisdom", Rank: "Rank 2"')
    expect(index['19850']).toMatchObject({ name: 'Blessing of Wisdom', rank: 'Rank 2' })
    const m = /Aura: dbcenums\.A_PERIODIC_ENERGIZE, BasePoints: (\d+)[^}]*PeriodMs: (\d+)/.exec(r)!
    const mp5 = (Number(m[1]) * 5000) / Number(m[2])
    const e = ALLOW_LIST['19850']
    expect([e.name, e.rank]).toEqual([index['19850'].name, index['19850'].rank])
    expect(e).toMatchObject({ no_sheet_stats: true })
    expect(allowedNumbers(e)).toEqual({ mp5 })
    expect(mp5).toBe(18)
  })

  test('782 Thorns: Rank 2, 6 Nature damage shield (A_DAMAGE_SHIELD, School 8), no sheet stats', () => {
    const r = row(782)
    expect(r).toContain('Name: "Thorns", Rank: "Rank 2", School: 8,')
    const m = /Aura: dbcenums\.A_DAMAGE_SHIELD, BasePoints: (\d+)/.exec(r)!
    const e = ALLOW_LIST['782']
    expect([e.name, e.rank]).toEqual([index['782'].name, index['782'].rank])
    expect(e).toMatchObject({ no_sheet_stats: true })
    expect(allowedNumbers(e)).toEqual({ damage_shield: Number(m[1]) })
    expect(Number(m[1])).toBe(6)
  })
})
```
