Runner files, part 2 of 4, from `62129e9`. Whole files, verbatim.

#### `local/sim/gear.ts`

```ts
/**
 * The gear list: per slot, the best items the character can wear now or within a few levels, from
 * the sim's item databases. Armor, jewelry and trinkets are scored with the character's EP weights;
 * two-handed weapons are each simmed in the character's main-hand slot, since speed, Windfury and
 * Stormstrike make a weapon's value more than its stats. Each item names where it comes from, and
 * whether its data is Forever's own or carried over from Classic.
 */
import { buildRequest, buildRotation, ROOT, runSim, type Character, type Scenario, type SpellIndex } from './lib'
import type { Weight } from './weights'

type DbItem = Record<string, any>

const SLOT_OF_TYPE: Record<number, string> = {
  1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Back', 5: 'Chest', 6: 'Wrist', 7: 'Hands', 8: 'Waist', 9: 'Legs', 10: 'Feet', 11: 'Finger', 12: 'Trinket',
}
const GEAR_SLOT_OF_TYPE: Record<number, number[]> = {
  1: [0], 2: [1], 3: [2], 4: [3], 5: [4], 6: [5], 7: [6], 8: [7], 9: [8], 10: [9], 11: [10, 11], 12: [12, 13],
}
const ARMOR_SLOTS = new Set([1, 3, 5, 6, 7, 8, 9, 10])
const PROFESSIONS: Record<number, string> = { 1: 'Alchemy', 2: 'Blacksmithing', 3: 'Enchanting', 4: 'Engineering', 5: 'Herbalism', 8: 'Leatherworking', 9: 'Mining', 10: 'Skinning', 11: 'Tailoring' }
const FOREVER_EPOCH = Date.UTC(2026, 0, 1) / 1000

export async function loadItemData() {
  const db = JSON.parse(await Bun.file(`${ROOT}/assets/database/db.json`).text())
  const lo = JSON.parse(await Bun.file(`${ROOT}/assets/database/leftover_db.json`).text())
  const firstSeen = new Map<number, number>()
  for (const r of JSON.parse(await Bun.file(`${ROOT}/assets/database/item_first_seen.json`).text())) firstSeen.set(r.id, r.firstSeen)
  const zones = new Map<number, string>((db.zones ?? []).map((z: any) => [z.id, z.name]))
  const npcs = new Map<number, { name: string; zoneId?: number }>((db.npcs ?? []).map((n: any) => [n.id, n]))
  const items = new Map<number, DbItem>()
  for (const it of [...lo.items, ...db.items]) items.set(it.id, it)
  return { items, firstSeen, zones, npcs }
}

type ItemData = Awaited<ReturnType<typeof loadItemData>>

/** Where an item comes from, in words. */
export function sourceText(it: DbItem, data: ItemData) {
  const out: string[] = []
  for (const s of it.sources ?? []) {
    if (s.drop) {
      const npc = s.drop.npcId ? data.npcs.get(s.drop.npcId) : undefined
      const zone = data.zones.get(s.drop.zoneId ?? npc?.zoneId) ?? ''
      out.push(`Drop: ${npc?.name ?? s.drop.otherName ?? 'mobs'}${zone ? `, ${zone}` : ''}`)
    } else if (s.quest) out.push(`Quest: ${s.quest.name}${s.quest.faction === 1 ? ' (Alliance)' : s.quest.faction === 2 ? ' (Horde)' : ''}`)
    else if (s.crafted) out.push(`Crafted: ${PROFESSIONS[s.crafted.profession] ?? 'profession'}`)
    else if (s.soldBy) out.push(`Vendor: ${data.npcs.get(s.soldBy.npcId)?.name ?? s.soldBy.npcName ?? 'vendor'}`)
    else if (s.rep) out.push('Reputation reward')
    else if (s.pvp) out.push('PvP reward')
  }
  return [...new Set(out)].slice(0, 2).join('; ') || 'Source unknown'
}

/** Whether the item's data is Forever's own (first seen in a 2026 build) or from Classic. */
export function dataFlag(it: DbItem, data: ItemData) {
  const seen = data.firstSeen.get(it.id)
  if (it.id >= 200000 || (seen && seen >= FOREVER_EPOCH)) return 'Forever data'
  return 'Classic data (stats and source may predate Forever)'
}

// The database leaves the required level out when it is the default, 60.
const reqOf = (it: DbItem): number => it.reqLvl ?? 60
const ilvlOf = (it: DbItem): number => it.scalingOptions?.['0']?.ilvl ?? 0

const statsOf = (it: DbItem): Record<string, number> => it.scalingOptions?.['0']?.stats ?? {}

/** EP of an item's stats; nature spell damage counts as spell damage (shocks and Lightning Shield are nature or fire). */
export function itemEP(it: DbItem, ep: Record<number, number>) {
  let score = 0
  for (const [k, v] of Object.entries(statsOf(it))) {
    const stat = Number(k) === 10 || Number(k) === 7 ? 5 : Number(k)
    score += (ep[stat] ?? 0) * v
  }
  return score
}

export type GearRow = { slot: string; id: number; name: string; reqLvl: number; score: number; vsEquipped: number; source: string; data: string; notes: string[] }

export function epByStat(weights: Weight[]): Record<number, number> {
  const idx: Record<string, number> = { strength: 0, agility: 1, intellect: 3, spirit: 13, attackPower: 14, hit: 17, crit: 18, spellDamage: 5, mp5: 31 }
  const out: Record<number, number> = {}
  for (const w of weights) if (idx[w.key] !== undefined) out[idx[w.key]] = w.ep
  return out
}

function canWear(it: DbItem, ch: Character, maxLevel: number) {
  if (reqOf(it) > maxLevel || (it.quality ?? 0) < 2) return false
  // An item with no level requirement but an item level far above the character's is almost
  // always a high-level reward whose requirement the database lacks: left out.
  if (reqOf(it) <= 1 && ilvlOf(it) > maxLevel + 8) return false
  if (it.classAllowlist?.length && !it.classAllowlist.includes(7)) return false
  if (it.factionRestriction === 1) return false // Alliance only; an Orc is Horde
  if (ARMOR_SLOTS.has(it.type) && (it.armorType ?? 0) > (ch.level >= 40 ? 3 : 2)) return false
  return true
}

/** The best armor, jewelry and trinkets per slot, scored with EP. */
export function armorList(ch: Character, ep: Record<number, number>, data: ItemData, horizon = 3, perSlot = 5): GearRow[] {
  const rows: GearRow[] = []
  for (const [typeStr, slotName] of Object.entries(SLOT_OF_TYPE)) {
    const type = Number(typeStr)
    const equippedScores = GEAR_SLOT_OF_TYPE[type].map((g) => {
      const e = ch.gear[String(g)]
      const it = e && data.items.get(e.id)
      return it ? itemEP(it, ep) : 0
    })
    const equipped = Math.min(...equippedScores) // a second ring or trinket replaces the weaker one
    const candidates = [...data.items.values()]
      .filter((it) => it.type === type && canWear(it, ch, ch.level + horizon))
      .map((it) => ({ it, score: itemEP(it, ep) }))
      .filter((c) => c.score > 0) // items with no scored stats (most trinkets) are left out
      .sort((a, b) => b.score - a.score)
      .slice(0, perSlot)
    for (const { it, score } of candidates) {
      const notes: string[] = []
      if (it.itemEffects?.length) notes.push('has an equip or use effect the score leaves out')
      if (it.randomSuffixOptions?.length) notes.push('random "of the ..." stats: base stats only')
      if (it.requiredProfession) notes.push(`needs ${PROFESSIONS[it.requiredProfession] ?? 'a profession'}`)
      if (reqOf(it) > ch.level) notes.push(`level ${reqOf(it)}`)
      if (reqOf(it) <= 1 && ilvlOf(it) > ch.level + 10) notes.push(`item level ${ilvlOf(it)} with no level requirement: check in game`)
      rows.push({ slot: slotName, id: it.id, name: it.name, reqLvl: reqOf(it), score, vsEquipped: score - equipped, source: sourceText(it, data), data: dataFlag(it, data), notes })
    }
  }
  return rows
}

/** Two-handed weapons, each simmed in the main hand, ranked by DPS over the current weapon. */
export async function weaponList(
  ch: Character,
  sc: Scenario,
  ep: Record<number, number>,
  weaponDpsEP: number,
  data: ItemData,
  ctx: { ladders: Record<string, number[]>; index: SpellIndex; profilePath: string },
  skills: Set<number>,
  horizon = 3,
  simTop = 12,
): Promise<(GearRow & { dps: number; dpsGain: number })[]> {
  const weaponDps = (it: DbItem) => {
    const o = it.scalingOptions?.['0'] ?? {}
    return o.unroundedDps ?? ((o.weaponDamageMin ?? 0) + (o.weaponDamageMax ?? 0)) / 2 / (it.weaponSpeed || 1)
  }
  const candidates = [...data.items.values()]
    .filter((it) => it.type === 13 && it.handType === 4 && skills.has(it.weaponType) && canWear(it, ch, ch.level + horizon))
    .map((it) => ({ it, pre: itemEP(it, ep) + weaponDps(it) * weaponDpsEP }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, simTop)
  const { rotation } = buildRotation(ch, sc, ctx.ladders, ctx.index)
  const base = await runSim(buildRequest(ch, sc, rotation, { iterations: 6000, seed: 77 }), ctx.profilePath, `gear-${sc.key}-base`)
  const rows = []
  for (const { it } of candidates) {
    const swapped: Character = { ...ch, gear: { ...ch.gear, '14': { id: it.id } } }
    const m = await runSim(buildRequest(swapped, sc, rotation, { iterations: 6000, seed: 77 }), ctx.profilePath, `gear-${sc.key}-w`)
    const notes: string[] = []
    if (it.itemEffects?.length) notes.push('chance-on-hit or use effect: simmed where the sim implements it')
    if (reqOf(it) > ch.level) notes.push(`level ${reqOf(it)}`)
    if (reqOf(it) <= 1 && ilvlOf(it) > ch.level + 10) notes.push(`item level ${ilvlOf(it)} with no level requirement: check in game`)
    notes.push(`${weaponDps(it).toFixed(1)} DPS, ${it.weaponSpeed} speed`)
    const skillName = ({ 1: 'WeaponSkillTwoHandedAxes', 4: 'WeaponSkillTwoHandedMaces', 8: 'WeaponSkillStaves', 9: 'WeaponSkillTwoHandedSwords', 6: 'WeaponSkillPolearms' } as Record<number, string>)[it.weaponType]
    const skill = ch.weaponSkills?.find((w) => w.skill === skillName)
    if (skill && skill.value < ch.level * 5) notes.push(`simmed at your current skill ${skill.value}/${ch.level * 5}: misses more until you train it up`)
    rows.push({ slot: 'Two-hand', id: it.id, name: it.name, reqLvl: reqOf(it), score: 0, vsEquipped: 0, dps: m.dps.avg, dpsGain: m.dps.avg - base.dps.avg, source: sourceText(it, data), data: dataFlag(it, data), notes })
  }
  return rows.sort((a, b) => b.dps - a.dps)
}
```

#### `local/armory/emit.ts`

```ts
/**
 * Writes the armory results file for the character in an export:
 *
 *   bun local/armory/emit.ts                      # the export in the game's SavedVariables
 *   bun local/armory/emit.ts --export <file.lua>  # or a copy of it
 *
 * Runs the same gates as run.ts (level 60 regression, sheet, sanity), then sims: worn gear on each
 * fight (three single fights and one chain of pulls with mana carried over), stat weights for the
 * single fights, the gear alternatives per slot, the bag upgrades, and the "max damage" plan. Writes
 * local/private/armory/results-<character_key>.json ("no-key-yet" before an export of format 7), checked
 * against the pinned contract before it is written. Not simmed, so null in the file: time to die,
 * per-second timelines and the best talent build.
 */
import { $ } from 'bun'

import { classifyBuffs, describeBuffs } from '../sim/buffs'
import { calibrate, sanityChecks, sheetCheck, sheetFor, writeProfile } from '../sim/checks'
import { characterFromExport, ITEM_MOD_TO_STAT, list, readExport, simItemIds } from '../sim/export'
import { armorList, dataFlag, epByStat, itemEP, loadItemData, sourceText, weaponList } from '../sim/gear'
import { buildRequest, buildRotation, CLI, loadLadders, loadSpellIndex, ROOT, runSim, scenariosFor, simSheet, type Character, type PlayerMetrics, type Scenario } from '../sim/lib'
import { simShares } from '../sim/meter'
import { simSession } from '../sim/session'
import { pawnScale, statWeights, type Weight } from '../sim/weights'

import { readResultsFile, SLOTS, type ResultsFile, type Slot } from './contract/results-file'
import { buildResultsFile, imbueFromExport, leaveOutUnconfirmed, QUALITY, resultsFileName, SLOT_BY_INDEX, toResult, type FightRun, type Item } from './results'
import { leakTerms, loadLocalConfig, PRIVATE } from '../lib/local-config'
import { archiveOnRun } from '../history/archive'

const args = process.argv.slice(2)
const exportPath = args.includes('--export')
  ? args[args.indexOf('--export') + 1]
  : loadLocalConfig().export_path
await archiveOnRun() // history: copy the export if it's new (never into the game folder)
const ITER = 4000
const SEED = 23

// The chain fight, from his Nov 14 and 15 logs: pulls of about 25 s, about 12 s apart, ten in a row,
// no drinking, starting at full mana, the mob hitting him.
const CHAIN = { pulls: 10, pullS: 25, gapS: 12, drink: false }
const DEFAULT_FIGHT = 'dungeon-long'

const SCHOOL: Record<string, FightRun['split'][number]['school']> = {
  melee: 'physical', Windfury: 'physical', Stormstrike: 'physical', 'Earth Shock': 'nature', 'Flame Shock': 'fire', 'Lightning Shield': 'nature', Totems: 'fire',
}
const STAT_NAME: Record<string, ResultsFile['stat_weights'][number]['weights'][number]['stat']> = {
  strength: 'strength', agility: 'agility', intellect: 'intellect', spirit: 'spirit', attackPower: 'attack_power', hit: 'hit_rating',
  crit: 'crit_rating', spellDamage: 'spell_damage', mp5: 'mana_per_5', weaponDps: 'weapon_dps',
}
const EXPORT_SLOT: Record<string, number> = {
  head: 0, neck: 1, shoulder: 2, back: 3, chest: 4, wrist: 5, hands: 6, waist: 7, legs: 8, feet: 9,
  finger1: 10, finger2: 11, trinket1: 12, trinket2: 13, mainHand: 14, offHand: 15, ranged: 16,
}
const ARMOR_SLOT: Record<string, Slot[]> = {
  Head: ['head'], Neck: ['neck'], Shoulder: ['shoulder'], Back: ['back'], Chest: ['chest'], Wrist: ['wrist'], Hands: ['hands'], Waist: ['waist'],
  Legs: ['legs'], Feet: ['feet'], Finger: ['finger_1', 'finger_2'], Trinket: ['trinket_1', 'trinket_2'],
}
const INVTYPE_SLOTS: Record<string, Slot[]> = {
  INVTYPE_HEAD: ['head'], INVTYPE_NECK: ['neck'], INVTYPE_SHOULDER: ['shoulder'], INVTYPE_CLOAK: ['back'], INVTYPE_CHEST: ['chest'], INVTYPE_ROBE: ['chest'],
  INVTYPE_WRIST: ['wrist'], INVTYPE_HAND: ['hands'], INVTYPE_WAIST: ['waist'], INVTYPE_LEGS: ['legs'], INVTYPE_FEET: ['feet'],
  INVTYPE_FINGER: ['finger_1', 'finger_2'], INVTYPE_TRINKET: ['trinket_1', 'trinket_2'], INVTYPE_2HWEAPON: ['main_hand'],
}
const idx = (s: Slot) => SLOT_BY_INDEX.indexOf(s)

// 1. The character.
if (!(await Bun.file(exportPath).exists())) {
  console.error('No export found. In game: /tbexport, then /reload. Or pass --export <file>.')
  process.exit(2)
}
const db = await readExport(exportPath)
const { character: ch, notes } = await characterFromExport(db)
notes.push(...(await calibrate(ch)))
const characterKey: string | undefined = (ch as any).characterKey ?? undefined
const profilePath = await writeProfile(ch, 'profile-armory')
const ctx = { ladders: await loadLadders(), index: await loadSpellIndex(), profilePath }
const data = await loadItemData()
const known = await simItemIds()
console.log(`Export: format ${db.formatVersion}, saved ${new Date(Number(db.savedAt) * 1000).toISOString()}, level ${ch.level}, imbue simmed: ${ch.mhImbue}`)
for (const n of notes) console.log(`- ${n}`)

// 2. Gates, as run.ts.
const checks: ResultsFile['checks'] = []
const nonBlocking = new Set<string>()
{
  const out = `${ROOT}/local/runs/gate-l60.json`
  await $`${CLI} sim --infile ${ROOT}/local/data/baseline/l60-test.in.json --outfile ${out}`.env({ ...process.env, WOWSIMS_LEVEL_PROFILE: '', WOWSIMS_LEVEL: '' }).quiet()
  const now = JSON.parse(await Bun.file(out).text()).raidMetrics.parties[0].players[0].dps
  const upstream = JSON.parse(await Bun.file(`${ROOT}/local/data/baseline/l60-upstream.out.json`).text()).raidMetrics.parties[0].players[0].dps
  checks.push({ name: 'level 60 regression', passed: now.avg === upstream.avg && now.stdev === upstream.stdev, detail: `patched ${now.avg} vs upstream ${upstream.avg} (same seed, must be identical)` })
  for (const r of (await sheetCheck(ch)).rows) {
    checks.push({ name: `sheet ${r.name}`, passed: r.ok, detail: r.detail })
    if (r.blocking === false) nonBlocking.add(`sheet ${r.name}`)
  }
  for (const r of await sanityChecks(ch, upstream.avg)) checks.push({ name: r.name, passed: r.ok, detail: r.detail })
}
// Non-blocking rows (lines an unknown buff may have moved) are reported in the file, not a stop.
const failed = checks.filter((c) => !c.passed && !nonBlocking.has(c.name))
if (failed.length) {
  for (const c of failed) console.error(`FAIL ${c.name}: ${c.detail}`)
  console.error('A gate failed: no results file.')
  process.exit(1)
}
checks.push({
  name: 'fight levels',
  passed: true,
  detail: `Mob levels follow his level: solo ${ch.level} (his level), dungeon 30 s ${ch.level + 1} (+1), dungeon 2 min ${ch.level + 2} (+2), chain ${ch.level}. Before runner 1097eb7 they were fixed at 31, 32 and 33: compare rows of the same runner.`,
})
checks.push(
  {
    name: 'real fights',
    passed: false,
    detail:
      'Not passed: no log on this export\'s gear and weapon skill has the 300 landed melee hits the check needs yet. See the history index for each log\'s count.',
  },
  { name: 'mana model', passed: false, detail: 'Untested: no log has been checked against the sim\'s mana use, so out_of_mana_s and the chain fight are estimates.' },
  { name: 'long-fight weights', passed: false, detail: 'Low confidence: the 2-minute fight\'s stat weights lean on the mana model, which is untested.' },
)

// 3. Gear helpers: a gear set as the sim's Character, and the worn items as the contract's items.
const wornRec = (s: Slot) => Object.values<any>(db.gear ?? {}).find((r) => EXPORT_SLOT[r.slot] === idx(s))
const gameStats = (stats: Record<string, number> | undefined) => {
  const out = Array(40).fill(0)
  for (const [k, v] of Object.entries(stats ?? {})) if (ITEM_MOD_TO_STAT[k] !== undefined) out[ITEM_MOD_TO_STAT[k]] += v
  return out
}
/** The character wearing `swaps` (slot to item id, or a bag record whose item the sim lacks). */
function wearing(swaps: Partial<Record<Slot, { id: number; stats?: Record<string, number> }>>): Character {
  const gear = { ...ch.gear }
  const bonus = [...(ch.bonusStats ?? Array(40).fill(0))]
  for (const [s, it] of Object.entries(swaps) as [Slot, { id: number; stats?: Record<string, number> }][]) {
    const i = idx(s)
    const worn = wornRec(s)
    // A worn item the sim lacks was added as bonus stats: take them off.
    if (worn && !known.has(Number(worn.id))) gameStats(worn.stats).forEach((v, k) => (bonus[k] -= v))
    if (known.has(it.id)) gear[String(i)] = { id: it.id }
    else {
      delete gear[String(i)]
      gameStats(it.stats).forEach((v, k) => (bonus[k] += v))
    }
  }
  return { ...ch, gear, bonusStats: bonus.some((v) => v !== 0) ? bonus : undefined }
}
const SOURCE_KIND: [RegExp, Item['source']['kind']][] = [[/^Drop/, 'drop'], [/^Quest/, 'quest'], [/^Crafted/, 'crafted'], [/^Vendor/, 'vendor'], [/^Reputation/, 'reputation'], [/^PvP/, 'pvp']]
function dbItem(id: number): Item {
  const it = data.items.get(id)!
  const text = sourceText(it, data)
  return {
    item_id: id,
    name: it.name,
    quality: QUALITY[Math.max(0, Math.min(5, it.quality ?? 1))],
    item_level: it.scalingOptions?.['0']?.ilvl ?? null,
    required_level: Math.max(1, it.reqLvl ?? 60),
    source: { kind: SOURCE_KIND.find(([re]) => re.test(text))?.[1] ?? 'unknown', text },
    data: dataFlag(it, data) === 'Forever data' ? 'forever' : 'classic',
  }
}
/** An item as the game exported it; the sim's database adds its source when it knows the item. */
function gameItem(r: any): Item {
  if (data.items.has(Number(r.id))) return { ...dbItem(Number(r.id)), name: String(r.name), item_level: Number(r.itemLevel) || null, required_level: Math.max(1, Number(r.reqLevel) || 1) }
  return {
    item_id: Number(r.id),
    name: String(r.name),
    quality: QUALITY[Math.max(0, Math.min(5, Number(r.quality) || 1))],
    item_level: Number(r.itemLevel) || null,
    required_level: Math.max(1, Number(r.reqLevel) || 1),
    source: { kind: 'unknown', text: "Not in the sim's item data: stats as the game showed them" },
    data: 'forever',
  }
}

// 4. Sims.
const scenarios = scenariosFor(ch.level)
// The chain fight: his level (no clean log yet gives a typical gap for chained pulls).
const CHAIN_SC: Scenario = { ...scenarios[0], key: 'chain-solo', label: `${CHAIN.pulls} pulls in a row vs level ${ch.level} mobs (your level), ${CHAIN.pullS} s each, ${CHAIN.gapS} s apart, no drinking`, duration: CHAIN.pullS, variation: 3 }
const totalSplit = (ms: PlayerMetrics[]) => {
  const out: Record<string, number> = {}
  for (const m of ms) for (const [k, v] of Object.entries(simShares(m, ctx.index))) out[k] = (out[k] ?? 0) + v
  return Object.entries(out).map(([name, damage]) => ({ name, damage, school: SCHOOL[name] ?? null }))
}
const meleeMiss = (ms: PlayerMetrics[]) => {
  let miss = 0
  let all = 0
  for (const m of ms) for (const a of m.actions.filter((x) => x.id.otherId === 'OtherActionAttack')) {
    for (const t of a.targets as any[]) {
      miss += t.misses ?? 0
      all += (t.hits ?? 0) + (t.crits ?? 0) + (t.misses ?? 0) + (t.dodges ?? 0) + (t.parries ?? 0) + (t.glances ?? 0) + (t.blocks ?? 0)
    }
  }
  return all ? Math.round((1000 * miss) / all) / 10 : null
}
const regen = Number(db.sheet?.manaRegen?.outsideFiveSecondRule ?? 0)

/** One gear set on every fight. */
async function simGear(c: Character, tag: string): Promise<{ runs: FightRun[]; miss: Record<string, number | null> }> {
  const runs: FightRun[] = []
  const miss: Record<string, number | null> = {}
  const p = await writeProfile(c, `profile-armory-${tag}`)
  for (const sc of scenarios) {
    const { rotation } = buildRotation(c, sc, ctx.ladders, ctx.index)
    const req = buildRequest(c, sc, rotation, { iterations: ITER, seed: SEED, timelineBucketMs: 1000 })
    const m = await runSim(req, p, `armory-${tag}-${sc.key}`)
    const sheet = await simSheet(req, p, `armory-${tag}-${sc.key}`)
    runs.push({ fightId: sc.key, dps: m.dps.avg, health: sheet.health, armor: sheet.armor, ttoS: m.tto?.avg, durationS: sc.duration, split: totalSplit([m]), timeline: m.timeline })
    miss[sc.key] = meleeMiss([m])
  }
  const s = await simSession(c, CHAIN_SC, { pulls: CHAIN.pulls, gapSeconds: CHAIN.gapS, drink: CHAIN.drink, regenPerSecond: regen }, { ...ctx, profilePath: p }, { iterations: 2000, seed: SEED })
  const { rotation } = buildRotation(c, CHAIN_SC, ctx.ladders, ctx.index)
  const sheet = await simSheet(buildRequest(c, CHAIN_SC, rotation, { iterations: 1, seed: 1 }), p, `armory-${tag}-chain`)
  runs.push({
    fightId: CHAIN_SC.key, dps: s.dps, health: sheet.health, armor: sheet.armor, durationS: CHAIN.pullS, gapS: CHAIN.gapS,
    pulls: s.pulls.map((x) => ({ pull: x.pull, dps: x.dps, manaStart: x.manaStart, manaEnd: x.manaEnd, ttoS: x.tto })),
    split: totalSplit(s.pulls.map((x) => x.metrics)),
  })
  miss[CHAIN_SC.key] = meleeMiss(s.pulls.map((x) => x.metrics))
  return { runs, miss }
}

console.log('Simming worn gear...')
const worn = await simGear(ch, 'worn')

console.log('Stat weights...')
const weights: Record<string, Weight[]> = {}
for (const sc of scenarios) weights[sc.key] = (await statWeights(ch, sc, ctx)).weights

// 5. Slots: worn item and alternatives, best first. Armor is scored with the average of the solo and
// short dungeon weights (as run.ts); two-handers are simmed on the default fight.
const ep = (k: string) => epByStat(weights[k])
const blended: Record<number, number> = Object.fromEntries(Object.keys({ ...ep('solo-hit-short'), ...ep('dungeon-short') }).map((k) => [k, ((ep('solo-hit-short')[+k] ?? 0) + (ep('dungeon-short')[+k] ?? 0)) / 2]))
const gameEP = (stats: Record<string, number> | undefined) => gameStats(stats).reduce((n, v, k) => n + v * (blended[k === 7 || k === 10 ? 5 : k] ?? 0), 0)
const wornEP = (s: Slot) => {
  const r = wornRec(s)
  if (!r) return 0
  const it = data.items.get(Number(r.id))
  return it ? itemEP(it, blended) : gameEP(r.stats)
}
const armorRows = armorList(ch, blended, data, 3, 8)
const skillNames: Record<string, number> = { 'Two-Handed Axes': 1, 'Two-Handed Maces': 4, Staves: 8, 'Two-Handed Swords': 9, Polearms: 6 }
const exportSkills = ((ch as any).skills ?? []) as string[]
const skills = new Set(exportSkills.map((s) => skillNames[s]).filter(Boolean))
const defaultSc = scenarios.find((s) => s.key === DEFAULT_FIGHT)!
console.log('Simming two-handers...')
const weaponRows = await weaponList(ch, defaultSc, epByStat(weights[DEFAULT_FIGHT]), weights[DEFAULT_FIGHT].find((w) => w.key === 'weaponDps')!.ep, data, ctx, skills)
const mhImbue = imbueFromExport(db)

const slots: ResultsFile['slots'] = SLOTS.map((s) => {
  const r = wornRec(s)
  const wornId = r ? Number(r.id) : null
  let alternatives: ResultsFile['slots'][number]['alternatives'] = []
  if (s === 'main_hand') {
    alternatives = weaponRows.filter((w) => w.id !== wornId && w.dpsGain > 0).map((w) => ({ item: dbItem(w.id), gain_ep: null, gain_dps: Math.round(w.dpsGain * 100) / 100 }))
  } else {
    const kind = Object.entries(ARMOR_SLOT).find(([, ss]) => ss.includes(s))?.[0]
    const seen = new Set<number>()
    alternatives = armorRows
      .filter((x) => x.slot === kind && x.id !== wornId)
      .map((x) => ({ item: dbItem(x.id), gain_ep: Math.round((x.score - wornEP(s)) * 100) / 100, gain_dps: null }))
      .filter((x) => x.gain_ep > 0 && !seen.has(x.item.item_id) && seen.add(x.item.item_id))
      .sort((a, b) => b.gain_ep! - a.gain_ep!)
  }
  return { slot: s, worn: r ? gameItem(r) : null, ...(s === 'main_hand' ? { imbue: mhImbue } : {}), alternatives }
})

// Unconfirmed items (no source and no level requirement in the item data) never reach alternatives or plans.
const owned = new Set<number>([...Object.values<any>(db.gear ?? {}), ...list(db.bags)].map((r: any) => Number(r.id)))
const byName = new Map<string, any[]>()
for (const it of data.items.values()) byName.set(it.name, [...(byName.get(it.name) ?? []), it])
const left = leaveOutUnconfirmed(slots, (id) => {
  const it = data.items.get(id)
  if (!it) return undefined
  const sameName = (byName.get(it.name) ?? []).find((x) => x.id !== id && ((x.reqLvl ?? 60) > 1))
  return { it, sameName: sameName ? { id: sameName.id, name: sameName.name, reqLvl: sameName.reqLvl ?? 60 } : undefined }
}, owned)
slots.splice(0, slots.length, ...left.slots)

// 6. The max damage plan: per slot the best alternative he can wear now, else what he wears.
const planGear: Partial<Record<Slot, number | null>> = {}
const planSwaps: Partial<Record<Slot, { id: number }>> = {}
for (const s of SLOTS) {
  const entry = slots.find((x) => x.slot === s)!
  const taken = s === 'finger_2' ? planGear.finger_1 : s === 'trinket_2' ? planGear.trinket_1 : undefined
  const best = entry.alternatives.find((a) => a.item.required_level <= ch.level && a.item.item_id !== taken)
  planGear[s] = best ? best.item.item_id : entry.worn?.item_id ?? null
  if (best) planSwaps[s] = { id: best.item.item_id }
}
console.log(`Simming the max damage plan (${Object.keys(planSwaps).length} slots changed)...`)
const plan = await simGear(wearing(planSwaps), 'plan')

// 7. Bag upgrades: bag items that beat what he wears (the game's own stats), each simmed on every fight.
const bagUpgrades: ResultsFile['bag_upgrades'] = []
const wearable = (r: any) => ((r.reqLevel ?? 1) <= ch.level && !/^(Mail|Plate)$/.test(r.subclass ?? '')) || (ch.level >= 40 && r.subclass === 'Mail')
const weaponDpsEP = weights[DEFAULT_FIGHT].find((w) => w.key === 'weaponDps')!.ep
const fullEP = (r: any) => gameEP(r?.stats) + Number(r?.stats?.ITEM_MOD_DAMAGE_PER_SECOND_SHORT ?? 0) * (r?.equipLoc === 'INVTYPE_2HWEAPON' ? weaponDpsEP : 0)
for (const r of list(db.bags)) {
  const cand = INVTYPE_SLOTS[r.equipLoc]
  if (!cand || !wearable(r)) continue
  const slot = cand.reduce((a, b) => (fullEP(wornRec(b)) < fullEP(wornRec(a)) ? b : a)) // the weaker ring or trinket
  const gain = fullEP(r) - fullEP(wornRec(slot))
  if (gain <= 0.5) continue
  console.log(`Simming bag upgrade ${r.name}...`)
  const res = await simGear(wearing({ [slot]: { id: Number(r.id), stats: r.stats } }), `bag-${r.id}`)
  bagUpgrades.push({ slot, item: gameItem(r), gain_ep: Math.round(gain * 100) / 100, results: res.runs.map(toResult) })
}

// 8. Talents: Forever's Enhancement tree (WoWSims' talent data) with his ranks.
const trees = JSON.parse(await Bun.file(`${ROOT}/ui/sim/talents/trees/shaman.json`).text()) as { name: string; talents: { fancyName: string; spellId: number; maxPoints: number; location: { rowIdx: number; colIdx: number } }[] }[]
const enh = trees.find((t) => t.name === 'Enhancement')!
const rows = [...list(db.talents?.list), ...list(db.talents?.traits)].filter((t) => Number(t.rank) > 0)
const rankOf = (t: (typeof enh.talents)[number]) =>
  Math.max(0, ...rows.filter((x) => String(x.name ?? '').toLowerCase() === t.fancyName.toLowerCase() || Number(x.spellID) === t.spellId).map((x) => Number(x.rank)))
const yours = enh.talents.map((t) => ({ talent_id: t.spellId, name: t.fancyName, tier: t.location.rowIdx + 1, column: t.location.colIdx + 1, rank: Math.min(rankOf(t), t.maxPoints), max_rank: t.maxPoints }))

// 9. The sheet as exported.
const sheetIn = ch.sheet!
const mh = db.gear?.['16']
const mhSkill = mh ? list(db.skills).find((x: any) => x.name === String(mh.subclass)) : undefined
// The sheet the file shows is UNBUFFED: the sim's sheet with no buffs, when any buff that touches the
// sheet was up (its own crit less the weapon-skill deficit, as the sheet check does); else the
// game's. The buffs filtered out are named in a check.
const classified = await classifyBuffs((ch as any).buffsAtExport ?? [])
const statBuffs = classified.list.filter((b) => b.class !== 'no_stats')
const sheetBuffed = false
let sheetShown = { ...sheetIn }
if (statBuffs.length) {
  const bare = await sheetFor({ ...ch, buffsAtExport: [] } as any, 'emit-unbuffed')
  sheetShown = { ...sheetIn, strength: bare.strength, agility: bare.agility, stamina: bare.stamina, intellect: bare.intellect, spirit: bare.spirit, attackPower: bare.attackPower, armor: bare.armor, health: bare.health, mana: bare.mana, meleeCrit: bare.meleeCrit - 0.04 * Number((ch as any).weaponSkillDeficit ?? 0), spellCrit: bare.spellCrit, dodge: bare.dodge, meleeHit: bare.meleeHit }
  checks.push({ name: 'sheet shown unbuffed', passed: true, detail: `The sheet here is the sim's, with these buffs filtered out: ${describeBuffs(statBuffs)}.` })
}

const fights: ResultsFile['fights'] = [
  ...scenarios.map((sc) => ({
    fight_id: sc.key, label: sc.label, kind: 'single' as const, target_level: sc.targetLevel, duration_s: sc.duration, melee_miss_pct: worn.miss[sc.key],
    setup: { starting_mana_pct: 100, being_hit: sc.beingHit, pulls: 1, gap_s: 0, drinks: false, target_armor: sc.targetArmor },
  })),
  {
    fight_id: CHAIN_SC.key, label: CHAIN_SC.label, kind: 'chain' as const, target_level: CHAIN_SC.targetLevel, duration_s: CHAIN.pullS, melee_miss_pct: worn.miss[CHAIN_SC.key],
    setup: { starting_mana_pct: 100, being_hit: true, pulls: CHAIN.pulls, gap_s: CHAIN.gapS, drinks: CHAIN.drink, target_armor: CHAIN_SC.targetArmor },
  },
]

const singles = scenarios.map((s) => s.key)
const file = buildResultsFile({
  madeAt: new Date(),
  exportSavedAt: new Date(Number(db.savedAt) * 1000),
  gameBuild: String(db.identity?.gameBuild ?? ''),
  provisional: true,
  checks,
  character: {
    name: ch.name,
    ...(characterKey ? { character_key: characterKey } : {}),
    level: ch.level,
    race: String(db.identity?.race ?? ''),
    class: 'Shaman',
    spec: 'Enhancement',
  },
  sheetBuffed,
  sheet: {
    strength: Math.round(sheetShown.strength), agility: Math.round(sheetShown.agility), stamina: Math.round(sheetShown.stamina), intellect: Math.round(sheetShown.intellect),
    spirit: Math.round(sheetShown.spirit), attack_power: Math.round(sheetShown.attackPower), armor: Math.round(sheetShown.armor), health: Math.round(sheetShown.health),
    mana: Math.round(sheetShown.mana), melee_crit_pct: Math.round(sheetShown.meleeCrit * 100) / 100, spell_crit_pct: Math.round(sheetShown.spellCrit * 100) / 100,
    dodge_pct: Math.round(sheetShown.dodge * 100) / 100, melee_hit_pct: sheetShown.meleeHit,
    weapon_skill: mhSkill ? { weapon_type: String(mh.subclass), current: Number(mhSkill.rank) + Number(mhSkill.modifier ?? 0), max: Number(mhSkill.maxRank) } : null,
  },
  fights,
  defaultFightId: DEFAULT_FIGHT,
  slots,
  bagUpgrades,
  plan: { planId: 'max-damage', label: 'Max damage', mix: { damage: 100, survival: 0, healing: 0, utility: 0 }, gear: planGear, runs: plan.runs },
  worn: worn.runs,
  statWeights: singles.map((k) => ({ fight_id: k, weights: weights[k].map((w) => ({ stat: STAT_NAME[w.key], ep: Math.round(w.ep * 1000) / 1000 })) })),
  talents: { tree: 'Enhancement', points: yours.reduce((n, t) => n + t.rank, 0), yours, best: null },
  leftOutItems: left.leftOut,
  pawn: scenarios.map((sc) => {
    const label = `Enh ${sc.label} L${ch.level} (provisional)`
    return { label, text: pawnScale(label, weights[sc.key]) }
  }),
})

// 10. Check against the pinned contract, and that nothing from this machine is in it.
const read = readResultsFile(JSON.parse(JSON.stringify(file)))
if (!read.ok) {
  console.error('The file breaks the contract:', read.reason === 'invalid' ? read.problems.join('\n') : `version ${read.version}`)
  process.exit(1)
}
const text = JSON.stringify(file, null, 2) + '\n'
const leak = [/\/Users\//, /Player-\d/, /Realm \d/, ...leakTerms(loadLocalConfig()).map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))].map((re) => re.exec(text)).find(Boolean)
if (leak) {
  console.error(`The file holds something from this machine or account: ${leak[0]}`)
  process.exit(1)
}
const outPath = `${PRIVATE}/armory/${resultsFileName(characterKey)}`
await Bun.write(outPath, text)
console.log(`\nWritten: ${outPath}`)
console.log(`Worn: ${worn.runs.map((r) => `${r.fightId} ${r.dps.toFixed(1)} DPS`).join(', ')}`)
console.log(`Max damage plan: ${plan.runs.map((r) => `${r.fightId} ${r.dps.toFixed(1)} DPS`).join(', ')}`)
```
