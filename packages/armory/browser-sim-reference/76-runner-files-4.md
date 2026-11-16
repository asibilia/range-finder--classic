Runner files, part 4 of 4, from `62129e9`. Whole files, verbatim.

#### `local/sim/request.test.ts`

```ts
/**
 * Requests the runner sends keep to names the sim knows: the CLI drops an unknown field or enum
 * name silently, while the browser's WASM raidSimJson refuses the whole request. The runner checks
 * every request strictly (local/bin/strictcheck) and fails loudly.
 */
import { describe, expect, test } from 'bun:test'

import { writeProfile } from './checks'
import { buildRequest, buildRotation, loadLadders, loadSpellIndex, ROOT, runSim, SCENARIOS, simSheet, type Character } from './lib'

const ch = JSON.parse(await Bun.file(`${ROOT}/local/fixtures/placeholder-testchar.json`).text()) as Character
const profile = await writeProfile(ch, 'profile-request-test')
const sc = SCENARIOS[0]
const rotation = buildRotation(ch, sc, await loadLadders(), await loadSpellIndex()).rotation

describe('requests to the sim', () => {
  test('weapon skills the sim has no name for (Unarmed) are not sent', () => {
    const c = { ...ch, weaponSkills: [{ skill: 'WeaponSkillUnarmed', value: 116 }, { skill: 'WeaponSkillTwoHandedMaces', value: 153 }] }
    const req = buildRequest(c, sc, rotation, { iterations: 10, seed: 1 }) as any
    expect(req.raid.parties[0].players[0].weaponSkills).toEqual([{ skill: 'WeaponSkillTwoHandedMaces', value: 153 }])
  })

  test('a request with a name the sim would drop fails loudly instead of running', async () => {
    const req = buildRequest(ch, sc, rotation, { iterations: 10, seed: 1 }) as any
    req.raid.parties[0].players[0].weaponSkills = [{ skill: 'WeaponSkillUnarmed', value: 1 }]
    await expect(runSim(req, profile, 'request-test-enum')).rejects.toThrow(/sim would drop.*WeaponSkillUnarmed/)
    const req2 = buildRequest(ch, sc, rotation, { iterations: 10, seed: 1 }) as any
    req2.raid.parties[0].players[0].notAField = true
    await expect(simSheet(req2, profile, 'request-test-field')).rejects.toThrow(/sim would drop.*notAField/)
  })

  test('a normal request still runs', async () => {
    const m = await runSim(buildRequest(ch, sc, rotation, { iterations: 10, seed: 1 }), profile, 'request-test-ok')
    expect(m.dps.avg).toBeGreaterThan(0)
  })
})
```

#### `local/sim/buffs.test.ts`

```ts
/**
 * Buffs up at export: each is modelled from the sim's spell data, removed using the game's own
 * numbers (format 8: the aura's points and the spell's description), known not to touch the sheet,
 * or unknown. Calibration must never absorb a buff again (Warchief's Blessing once inflated base
 * health by 300), and an unknown buff makes the lines it could touch "not checked" (non-blocking)
 * instead of failing the run.
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { classifyBuffs, parseBuffNumbers } from './buffs'
import { calibrate, sheetCheck, sheetFor } from './checks'
import { ROOT, type Character } from './lib'

const WB = { name: "Warchief's Blessing", spellID: 16609, source: 'none', points: { '1': 300, '2': 15, '3': 10 }, description: 'Increases hitpoints by 300. 15% haste to melee attacks. 10 mana regen every 5 seconds.' }
const WB_BARE = { name: "Warchief's Blessing", spellID: 16609 } // format 7: no numbers
const KINGS = { name: 'Blessing of Kings', spellID: 20217, source: 'other' }
const MOTW = { name: 'Mark of the Wild', spellID: 6756, source: 'other' }
const FORT = { name: 'Fortitude Test', spellID: 999001, source: 'other', points: { '1': 20 }, description: 'Increases Stamina by 20 for 30 min.' }

describe('reading a buff from the game\'s own numbers', () => {
  test("Warchief's Blessing: +300 health (on the sheet), haste and mp5 (not on the sheet)", () => {
    expect(parseBuffNumbers(WB)).toEqual({ health: 300, haste_pct: 15, mp5: 10 })
  })
  test('a number the description says but the points do not is refused (unknown)', () => {
    expect(parseBuffNumbers({ ...WB, points: { '1': 250 } })).toBeNull()
  })
  test('a sentence with a number it cannot read makes the whole buff unknown', () => {
    expect(parseBuffNumbers({ name: 'X', spellID: 1, points: { '1': 5 }, description: 'Increases your chance to dodge by 5%.' })).toBeNull()
  })
  test('no numbers at all (a format 7 export): null', () => {
    expect(parseBuffNumbers(WB_BARE)).toBeNull()
  })
})

describe('classifying the buffs at export', () => {
  test('modelled, game numbers, no stats, unknown; self or other kept, no names', async () => {
    const c = await classifyBuffs([KINGS, MOTW, WB, { name: 'Lightning Shield', spellID: 324, source: 'self' }, { name: 'Mystery Aura', spellID: 999999, source: 'other' }])
    expect(c.list.map((b) => [b.name, b.class, b.source])).toEqual([
      ['Blessing of Kings', 'modelled', 'other'],
      ['Mark of the Wild', 'modelled', 'other'],
      ["Warchief's Blessing", 'game_numbers', 'none'],
      ['Lightning Shield', 'no_stats', 'self'],
      ['Mystery Aura', 'unknown', 'other'],
    ])
    expect(c.unknown).toEqual(['Mystery Aura'])
    expect(c.bonus[29]).toBe(300) // Warchief's Blessing's health goes into the sheet sim
  })
})

const base = JSON.parse(await Bun.file(`${ROOT}/local/fixtures/placeholder-testchar.json`).text()) as Character
const withBuffs = (buffs: any[], sheetDelta: Record<string, number> = {}) => async () => {
  const ch = structuredClone(base) as any
  ch.profile.baseHealth = 400
  ch.profile.baseMana = 600
  ch.buffsAtExport = [KINGS, MOTW]
  const s = await sheetFor(ch, 'buffs-test-truth') // the game's sheet with Kings and Mark up
  ch.sheet = { ...s, meleeCrit: s.meleeCrit, spellCrit: s.spellCrit }
  for (const [k, v] of Object.entries(sheetDelta)) ch.sheet[k] += v
  ch.buffsAtExport = buffs
  return ch
}

describe('the sheet sim and calibration with buffs up', () => {
  test('Kings applies after a flat buff (the order matters): +20 Stamina reads +22 with Kings', async () => {
    const ch = structuredClone(base) as any
    ch.profile.baseHealth = 400
    ch.profile.baseMana = 600
    ch.buffsAtExport = [KINGS]
    const a = await sheetFor(ch, 'buffs-test-a')
    ch.buffsAtExport = [KINGS, FORT]
    const b = await sheetFor(ch, 'buffs-test-b')
    expect(b.stamina - a.stamina).toBeCloseTo(22, 0)
    expect(b.health - a.health).toBeCloseTo(220, -1)
  })

  test("Kings + Mark of the Wild + Warchief's Blessing (with its numbers): base health is not inflated", async () => {
    const ch = await withBuffs([KINGS, MOTW, WB], { health: 300 })()
    await calibrate(ch, { historyPath: `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json` })
    expect(ch.profile.baseHealth).toBe(400)
    expect(ch.profile.baseMana).toBe(600)
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true)
    expect(rows.find((r) => r.name === 'buffs')!.detail).toContain("Warchief's Blessing: removed using the game's own numbers")
  })

  test('an unknown buff: lines it moved are "not checked" (non-blocking), health is not re-solved from a buffed sheet', async () => {
    const hist = `${mkdtempSync(`${tmpdir()}/cal-`)}/h.json`
    // A clean calibration at this level first.
    const clean = await withBuffs([KINGS, MOTW])()
    await calibrate(clean, { historyPath: hist })
    // Then an export with Warchief's Blessing and no numbers, and 300 more health on the sheet.
    const ch = await withBuffs([KINGS, MOTW, WB_BARE], { health: 300 })()
    const notes = await calibrate(ch, { historyPath: hist })
    expect(ch.profile.baseHealth).toBe(400) // the last clean calibration, not 700
    expect(notes.join('\n')).toContain('last clean calibration')
    const { rows, ok } = await sheetCheck(ch)
    expect(ok).toBe(true) // non-blocking: the run goes on, marked
    const buffs = rows.find((r) => r.name === 'buffs')!
    expect(buffs.ok).toBe(false)
    expect(buffs.blocking).toBe(false)
    expect(buffs.detail).toContain("unknown: Warchief's Blessing")
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
```

#### `local/armory/results.test.ts`

```ts
/**
 * The armory results file keeps the pinned contract: every file the runner wrote (local/private/armory/)
 * and a file built here from made-up numbers pass both the pinned JSON Schema (Ajv, draft 2020-12)
 * and the pinned Zod reader, and hold nothing from this machine or account.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'

import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import { readResultsFile, SLOTS } from './contract/results-file'
import { buildResultsFile, imbueFromExport, leaveOutUnconfirmed, outOfMana, resultsFileName, toResult, type EmitInput, type FightRun, type ItemFacts } from './results'
import { CONFIG_PATH, leakTerms, loadLocalConfig, PRIVATE } from '../lib/local-config'

const DIR = import.meta.dir
const schema = JSON.parse(await Bun.file(`${DIR}/contract/results-file.schema.json`).text())
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

function bothAccept(file: unknown) {
  const json = JSON.parse(JSON.stringify(file))
  const ok = validate(json)
  const read = readResultsFile(json)
  return { schema: ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`), zod: read.ok ? [] : read.reason === 'invalid' ? read.problems : [`version ${read.version}`] }
}

// Generic leaks, plus this machine's private words when local/config.local.json exists.
const PRIVATE_WORDS = existsSync(CONFIG_PATH) ? leakTerms(loadLocalConfig()).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : []
const LEAK = new RegExp(['\\/Users\\/', 'Player-\\d', 'Realm \\d', ...PRIVATE_WORDS].join('|'))

const single = (fightId: string, tto: number): FightRun => ({
  fightId, dps: 101.234, health: 1300.4, armor: 745, ttoS: tto, durationS: 30,
  split: [{ name: 'melee', damage: 600, school: 'physical' }, { name: 'Earth Shock', damage: 400, school: 'nature' }],
})
const chain = (dry: boolean): FightRun => ({
  fightId: 'chain-solo', dps: 90, health: 1300, armor: 745, durationS: 25, gapS: 12,
  pulls: [1, 2, 3].map((n) => ({ pull: n, dps: 100 - n, manaStart: 1679 - 500 * (n - 1), manaEnd: dry && n === 3 ? 0 : 1679 - 500 * n, ttoS: dry && n === 3 ? 10 : 99 })),
  split: [{ name: 'melee', damage: 1, school: 'physical' }],
})

function input(): EmitInput {
  const item = (id: number) => ({ item_id: id, name: `Item ${id}`, quality: 'uncommon' as const, item_level: 30, required_level: 28, source: { kind: 'drop' as const, text: 'Drop: a mob' }, data: 'classic' as const })
  return {
    madeAt: new Date('2026-11-15T20:00:00Z'),
    exportSavedAt: new Date('2026-11-14T04:27:49Z'),
    gameBuild: '70938',
    provisional: true,
    checks: [{ name: 'real fights', passed: false, detail: 'not passed' }],
    character: { name: 'Testchar', character_key: '0a1b2c3d-11111111-22222222-33333333', level: 31, race: 'Orc', class: 'Shaman', spec: 'Enhancement' },
    sheetBuffed: false,
    sheet: { strength: 63, agility: 78, stamina: 113, intellect: 84, spirit: 83, attack_power: 270, armor: 745, health: 1297, mana: 1679, melee_crit_pct: 10.39, spell_crit_pct: 7.17, dodge_pct: 10.39, melee_hit_pct: 0, weapon_skill: { weapon_type: 'Two-Handed Axes', current: 155, max: 155 } },
    fights: [
      { fight_id: 'solo-hit-short', label: 'Solo', kind: 'single', target_level: 31, duration_s: 30, melee_miss_pct: 5.6, setup: { starting_mana_pct: 100, being_hit: true, pulls: 1, gap_s: 0, drinks: false, target_armor: 1100 } },
      { fight_id: 'dungeon-long', label: 'Dungeon, 2 min', kind: 'single', target_level: 33, duration_s: 120, melee_miss_pct: null },
      { fight_id: 'chain-solo', label: 'Chain', kind: 'chain', target_level: 31, duration_s: 25, setup: { starting_mana_pct: 100, being_hit: true, pulls: 3, gap_s: 12, drinks: false, target_armor: 1100 } },
    ],
    defaultFightId: 'dungeon-long',
    slots: SLOTS.map((s) => ({
      slot: s,
      worn: s === 'off_hand' || s === 'relic' ? null : item(1000 + SLOTS.indexOf(s)),
      ...(s === 'main_hand' ? { imbue: null } : {}),
      alternatives: s === 'head' ? [{ item: item(2000), gain_ep: 4.5, gain_dps: null }] : s === 'main_hand' ? [{ item: item(3000), gain_ep: null, gain_dps: 6.1 }] : [],
    })),
    bagUpgrades: [{ slot: 'wrist', item: item(4000), gain_ep: 1.2, results: [single('solo-hit-short', 40), single('dungeon-long', 200), chain(false)].map(toResult) }],
    plan: { planId: 'max-damage', label: 'Max damage', mix: { damage: 100, survival: 0, healing: 0, utility: 0 }, gear: { head: 2000, main_hand: 3000 }, runs: [single('solo-hit-short', 20), single('dungeon-long', 200), chain(true)] },
    worn: [single('solo-hit-short', 40), single('dungeon-long', 200), chain(false)],
    statWeights: [{ fight_id: 'solo-hit-short', weights: [{ stat: 'agility', ep: 1.2 }, { stat: 'attack_power', ep: 1 }] }],
    talents: { tree: 'Enhancement', points: 3, yours: [{ talent_id: 17364, name: 'Stormstrike', tier: 5, column: 2, rank: 1, max_rank: 1 }, { talent_id: 16256, name: 'Flurry', tier: 4, column: 2, rank: 2, max_rank: 5 }], best: null },
    pawn: [{ label: 'Enh solo L31 (provisional)', text: '( Pawn: v1: "Enh solo L31 (provisional)": Agility=1.20, Ap=1.00 )' }],
  }
}

describe('armory results file', () => {
  test('a built file passes the pinned JSON Schema and Zod reader', () => {
    const file = buildResultsFile(input())
    expect(bothAccept(file)).toEqual({ schema: [], zod: [] })
    expect(file.default_fight_id).toBe('dungeon-long')
    expect(file.results.filter((r) => r.gear === 'worn')).toHaveLength(3)
    expect(file.plans[0].gear.neck).toBeNull()
    expect(JSON.stringify(file)).not.toMatch(LEAK)
  })

  test('out of mana: a number under the fight length, else "never"; chain counts wall time', () => {
    expect(outOfMana(single('x', 20))).toBe(20)
    expect(outOfMana(single('x', 40))).toBe('never')
    expect(outOfMana(single('x', Infinity))).toBe('never')
    expect(outOfMana(chain(false))).toBe('never')
    expect(outOfMana(chain(true))).toBe(2 * (25 + 12) + 10) // pulls 1 and 2 with their gaps, then 10 s into pull 3
    const file = buildResultsFile(input())
    const plainChain = file.results.find((r) => r.gear === 'max-damage' && r.fight_id === 'chain-solo')!
    expect(plainChain.timeline).toBeNull()
    expect(plainChain.pulls!.at(-1)!.mana_end).toBe(0)
    expect(plainChain.time_to_die_s).toBeNull()
    expect(file.results.find((r) => r.fight_id === 'solo-hit-short' && r.gear === 'worn')!.pulls).toBeNull()
  })

  test('both readers refuse a broken file', () => {
    const file = buildResultsFile(input()) as any
    file.results[0].timeline = undefined
    const r = bothAccept(file)
    expect(r.schema.length).toBeGreaterThan(0)
    expect(r.zod.length).toBeGreaterThan(0)
    const chainTimeline = buildResultsFile(input()) as any
    chainTimeline.results.find((x: any) => x.fight_id === 'chain-solo').timeline = []
    expect(bothAccept(chainTimeline).zod.join()).toContain('Only a single fight has a timeline')
  })

  test('files are named by character key, never by name', () => {
    expect(resultsFileName('0a1b2c3d-11111111-22222222-33333333')).toBe('results-0a1b2c3d-11111111-22222222-33333333.json')
    expect(resultsFileName(undefined)).toBe('results-no-key-yet.json')
  })

  test('every file the runner wrote keeps the contract and holds nothing from this machine', async () => {
    const dir = `${PRIVATE}/armory`
    const files = (() => { try { return readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { return [] } })()
    for (const f of files) {
      expect(f).toMatch(/^results-[0-9a-f-]+\.json$|^results-no-key-yet\.json$/)
      const text = await Bun.file(`${dir}/${f}`).text()
      expect(text).not.toMatch(LEAK)
      expect(new Set((JSON.parse(text).left_out_items ?? []).map((l: any) => l.item_id)).size).toBe((JSON.parse(text).left_out_items ?? []).length)
      expect(JSON.parse(text).checks.some((c: any) => String(c.name).startsWith('left out'))).toBe(false)
      expect({ file: f, ...bothAccept(JSON.parse(text)) }).toEqual({ file: f, schema: [], zod: [] })
    }
  })

  test('damage split names are display names', () => {
    const file = buildResultsFile(input())
    expect(file.results[0].damage_split.map((d) => d.name)).toEqual(['Melee', 'Earth Shock'])
  })

  test('the main hand imbue comes from the export when one is on, else null', () => {
    const tip = (line: string) => ({ gear: { '16': { tooltip: { '1': 'Rage of the Storm', '2': 'Soulbound', '3': line, '4': 'Durability 89 / 100' } } } })
    // His real format 7 export: the imbue is in the SECOND entry, the first is empty.
    const real = { mainHand: { '1': { enchantID: 0, hasEnchant: false }, '2': { enchantID: 283, hasEnchant: true, enchantType: 3 } }, offHand: {} }
    expect(imbueFromExport({ ...tip('Windfury 1 (59 min)'), weaponEnchants: real })).toBe('Windfury Weapon')
    expect(imbueFromExport({ ...tip('Sharpened +3 (30 min)'), weaponEnchants: { mainHand: { '1': { hasEnchant: true } } } })).toBe('Sharpened +3')
    expect(imbueFromExport({ ...tip('Equip: Increases the damage dealt by your Stormstrike ability by 10%.'), weaponEnchants: real })).toBe('Weapon imbue (name not in the tooltip)')
    expect(imbueFromExport({ ...tip('+16 Strength'), weaponEnchants: { mainHand: { '1': { hasEnchant: false }, '2': { hasEnchant: false } } } })).toBeNull()
    expect(imbueFromExport({ weaponEnchants: { mainHand: {} } })).toBeNull()
  })

  test('unconfirmed items: never in alternatives or a plan, owned ones stay, each dropped one in left_out_items, none in checks', () => {
    const x = input()
    const alt = (id: number, gain: number) => ({ item: { ...x.slots[0].alternatives[0].item, item_id: id, name: `Item ${id}` }, gain_ep: gain, gain_dps: null })
    x.slots = x.slots.map((s) => (s.slot === 'neck' ? { ...s, alternatives: [alt(288926, 9), alt(5000, 3)] } : s.slot === 'feet' ? { ...s, alternatives: [alt(279840, 5), alt(6000, 2)] } : s.slot === 'finger_1' ? { ...s, alternatives: [alt(7000, 4)] } : s.slot === 'finger_2' ? { ...s, alternatives: [alt(288926, 1)] } : s))
    const facts: Record<number, { it: ItemFacts; sameName?: ItemFacts }> = {
      288926: { it: { id: 288926, name: 'Choker of the Fire Lord', reqLvl: 1 }, sameName: { id: 18814, name: 'Choker of the Fire Lord', reqLvl: 60 } },
      279840: { it: { id: 279840, name: 'Renewing Footpads', reqLvl: 1 } },
      5000: { it: { id: 5000, name: 'World drop', reqLvl: 28 } }, // no source, but a level requirement: kept
      6000: { it: { id: 6000, name: 'Quest reward', reqLvl: 1, sources: [{ quest: {} }] } }, // a source: kept
      7000: { it: { id: 7000, name: 'Owned ring', reqLvl: 1 } }, // in his bags: kept
    }
    const { slots, leftOut } = leaveOutUnconfirmed(x.slots, (id) => facts[id], new Set([7000]))
    const ids = slots.flatMap((s) => s.alternatives.map((a) => a.item.item_id))
    expect(ids).toEqual(expect.arrayContaining([5000, 6000, 7000]))
    expect(ids).not.toContain(288926)
    expect(ids).not.toContain(279840)
    expect(leftOut).toEqual([
      { item_id: 288926, name: 'Choker of the Fire Lord', reason: 'it has no source and needs level 1, and it copies the name of item 18814, which needs level 60' },
      { item_id: 279840, name: 'Renewing Footpads', reason: 'it has no source and needs level 1 (it may be a real item)' },
    ])
    for (const l of leftOut) expect(l.reason).not.toMatch(/\.$/)
    const file = buildResultsFile({ ...x, slots, leftOutItems: leftOut, plan: { ...x.plan!, gear: { ...x.plan!.gear, neck: 5000, feet: 6000 } } })
    expect(bothAccept(file)).toEqual({ schema: [], zod: [] })
    expect(file.left_out_items).toHaveLength(2)
    expect(file.checks.some((c) => c.name.startsWith('left out'))).toBe(false)
    // A plan that names a left-out item is refused by the reader.
    const bad = buildResultsFile({ ...x, slots, plan: { ...x.plan!, gear: { ...x.plan!.gear, neck: 288926 } } })
    expect(bothAccept(bad).zod.join()).toContain('neither worn in this slot nor one of its alternatives')
    // An item dropped from two slots (288926 was in neck and finger_2) is listed once; a repeat is refused.
    expect(new Set(leftOut.map((l) => l.item_id)).size).toBe(leftOut.length)
    const twice = buildResultsFile({ ...x, slots, leftOutItems: [...leftOut, leftOut[0]] })
    expect(bothAccept(twice).zod.join()).toContain('Each left_out_items item_id must be unique')
    // No rule run: no left_out_items key at all.
    expect('left_out_items' in buildResultsFile(input())).toBe(false)
  })

  test("a single fight's sim timeline goes into the result (t_s, dps, mana as an int); a chain fight's stays null", () => {
    const run = { ...single('solo-hit-short', 40), timeline: [{ tS: 0, dps: 151.26, dpsStdev: 40, mana: 1679.4, manaStdev: 0, iterations: 100 }, { tS: 1, dps: 98.04, dpsStdev: 30, mana: 1601.6, manaStdev: 5, iterations: 100 }] }
    expect(toResult(run).timeline).toEqual([{ t_s: 0, dps: 151.26, mana: 1679 }, { t_s: 1, dps: 98.04, mana: 1602 }])
    expect(toResult(chain(false)).timeline).toBeNull()
    const file = buildResultsFile({ ...input(), worn: [run, single('dungeon-long', 200), chain(false)] })
    expect(bothAccept(file)).toEqual({ schema: [], zod: [] })
  })
})
```
