Runner files, part 3 of 4, from `62129e9`. Whole files, verbatim.

#### `local/armory/results.ts`

```ts
/**
 * The armory results file, from what the runner computed: a pure mapping (no sims here), so a test
 * can build and check a file without the sim. `emit.ts` runs the sims and calls `buildResultsFile`.
 *
 * The contract is the armory planner's pinned schema in `contract/` (see `contract/PINNED.json`).
 * Nothing from this machine goes in the file: no paths, no realm, account or GUID. The character
 * name is for display only; files are named by `character_key`.
 *
 * @example
 * ```typescript
 * const file = buildResultsFile(input)
 * const read = readResultsFile(file) // { ok: true, file } when it keeps the contract
 * ```
 */
import { SLOTS, type ResultsFile, type Slot } from './contract/results-file'

/** The contract's slot names by the sim's proto ItemSlot index (0 head ... 16 ranged, a shaman's relic). */
export const SLOT_BY_INDEX: Slot[] = [...SLOTS]

export const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const

export type Item = ResultsFile['slots'][number]['alternatives'][number]['item']
export type Result = ResultsFile['results'][number]
export type Fight = ResultsFile['fights'][number]

/** One simmed fight for one gear set, as the runner measured it. */
export type FightRun = {
  fightId: string
  dps: number
  health: number
  armor: number
  /** Single fights: the sim's average time to the first out of mana (tto). */
  ttoS?: number
  durationS: number
  /** Chain fights: each pull, with mana carried over, and its own tto. */
  pulls?: { pull: number; dps: number; manaStart: number; manaEnd: number; ttoS: number }[]
  gapS?: number
  split: { name: string; damage: number; school: Result['damage_split'][number]['school'] }[]
  /** Single fights: the sim's per-second series (DPS and mana averaged over the iterations). */
  timeline?: { tS: number; dps: number; mana: number }[]
}

/**
 * Seconds to the first out of mana, or "never". A single fight ran dry when tto is under its
 * length. A chain fight counts wall time from the first pull: the earlier pulls and their gaps, then
 * the tto of the first pull that ran dry.
 */
export function outOfMana(run: FightRun): number | 'never' {
  if (!run.pulls) return run.ttoS !== undefined && Number.isFinite(run.ttoS) && run.ttoS < run.durationS ? round(run.ttoS, 1) : 'never'
  let wall = 0
  for (const p of run.pulls) {
    if (Number.isFinite(p.ttoS) && p.ttoS < run.durationS) return round(wall + p.ttoS, 1)
    wall += run.durationS + (run.gapS ?? 0)
  }
  return 'never'
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

/** A damage line's name as the page shows it: "melee" reads "Melee"; spell names stay as they are. */
export const displayName = (line: string) => line.charAt(0).toUpperCase() + line.slice(1)

/**
 * The temporary imbue on the main hand at export (Windfury Weapon, a poison, a sharpening stone), or
 * null when the game showed none. The main hand's own tooltip decides: its timed line names the imbue
 * ("Windfury 1 (59 min)"). GetWeaponEnchantInfo is not used for which entry is the main hand: in the
 * real client the imbue showed in the second entry of what the addon saved as mainHand, not the first.
 * An entry with hasEnchant and no timed line in the tooltip is reported unnamed.
 */
export function imbueFromExport(db: Record<string, any>): string | null {
  const ordered = (o: unknown) => Object.entries((o ?? {}) as Record<string, any>).filter(([k]) => /^\d+$/.test(k)).sort(([a], [b]) => +a - +b).map(([, v]) => v)
  const lines = ordered(db.gear?.['16']?.tooltip).map(String)
  const timed = lines.map((l) => /^(.+?)\s*\(\d+ (?:min|sec|hr)s?\)$/.exec(l)?.[1]).find(Boolean)
  if (timed) {
    const shaman = /^(Windfury|Flametongue|Rockbiter|Frostbrand)\b/.exec(timed)?.[1]
    return shaman ? `${shaman} Weapon` : timed
  }
  return ordered(db.weaponEnchants?.mainHand).some((e: any) => e?.hasEnchant) ? 'Weapon imbue (name not in the tooltip)' : null
}

/** The damage split in percent, biggest first. */
export function damageSplit(split: FightRun['split']): Result['damage_split'] {
  const total = split.reduce((n, s) => n + s.damage, 0) || 1
  return [...split]
    .filter((s) => s.damage > 0)
    .sort((a, b) => b.damage - a.damage)
    .map((s) => ({ name: displayName(s.name), share_pct: round((100 * s.damage) / total), school: s.school }))
}

/** One run as a contract result: tto and timeline per the contract; time to die is not simmed. */
export function toResult(run: FightRun): Omit<Result, 'gear'> {
  return {
    fight_id: run.fightId,
    dps: round(run.dps),
    health: Math.round(run.health),
    armor: Math.round(run.armor),
    out_of_mana_s: outOfMana(run),
    time_to_die_s: null, // not simmed: the sim's mob damage at these levels is unchecked
    // Single fights: the sim's per-second series; a chain fight has its pulls instead.
    timeline: !run.pulls && run.timeline?.length ? run.timeline.map((p) => ({ t_s: p.tS, dps: round(p.dps), mana: Math.round(p.mana) })) : null,
    pulls: run.pulls ? run.pulls.map((p) => ({ pull: p.pull, dps: round(p.dps), mana_start: Math.round(p.manaStart), mana_end: Math.round(p.manaEnd) })) : null,
    damage_split: damageSplit(run.split),
  }
}

export type EmitInput = {
  madeAt: Date
  exportSavedAt: Date
  gameBuild: string
  provisional: boolean
  checks: ResultsFile['checks']
  character: ResultsFile['character']
  sheetBuffed: boolean
  sheet: ResultsFile['sheet']
  fights: Fight[]
  defaultFightId: string
  slots: ResultsFile['slots']
  bagUpgrades: ResultsFile['bag_upgrades']
  plan: { planId: string; label: string; mix: ResultsFile['plans'][number]['mix']; gear: Partial<Record<Slot, number | null>>; runs: FightRun[] } | null
  worn: FightRun[]
  statWeights: ResultsFile['stat_weights']
  talents: ResultsFile['talents']
  pawn: ResultsFile['pawn']
  /** Items the unconfirmed-item rule dropped; omitted when the rule did not run. */
  leftOutItems?: LeftOutItem[]
}

/** Builds the results file from the runner's numbers. */
export function buildResultsFile(x: EmitInput): ResultsFile {
  const results: Result[] = x.worn.map((r) => ({ gear: 'worn', ...toResult(r) }))
  const plans: ResultsFile['plans'] = []
  if (x.plan) {
    const gear = Object.fromEntries(SLOTS.map((s) => [s, x.plan!.gear[s] ?? null])) as Record<Slot, number | null>
    plans.push({ plan_id: x.plan.planId, label: x.plan.label, mix: x.plan.mix, gear })
    results.push(...x.plan.runs.map((r) => ({ gear: x.plan!.planId, ...toResult(r) })))
  }
  return {
    schema_version: 1,
    made_at: x.madeAt.toISOString(),
    export_saved_at: x.exportSavedAt.toISOString(),
    game_build: x.gameBuild,
    sample: false,
    provisional: x.provisional,
    checks: x.checks,
    character: x.character,
    sheet_buffed: x.sheetBuffed,
    sheet: x.sheet,
    fights: x.fights,
    default_fight_id: x.defaultFightId,
    slots: x.slots,
    bag_upgrades: x.bagUpgrades,
    plans,
    results,
    stat_weights: x.statWeights,
    talents: x.talents,
    pawn: x.pawn,
    ...(x.leftOutItems ? { left_out_items: x.leftOutItems } : {}),
  }
}

/** The file name: by character_key, never by name or GUID. */
export const resultsFileName = (characterKey: string | undefined) => `results-${characterKey ?? 'no-key-yet'}.json`

/** What the item data says about an item, for the unconfirmed-item rule. */
export type ItemFacts = { id: number; name: string; reqLvl?: number; sources?: unknown[] }

export type LeftOutItem = NonNullable<ResultsFile['left_out_items']>[number]

/**
 * Why an item is left out of alternatives and plans, phrased to read after "because" (no full stop),
 * or null to keep it. An item is unconfirmed when the item data gives it no source and a required
 * level of 1 or below (a missing reqLvl means 60), unless he owns it (worn or in his bags). Many real
 * world drops have no source, so either fact alone is not enough. `sameName` is another item of the
 * same name with a level requirement, such as the Classic raid item a low-level copy is named after.
 */
export function unconfirmedReason(it: ItemFacts, owned: Set<number>, sameName?: ItemFacts): string | null {
  if (owned.has(it.id)) return null
  if ((it.sources?.length ?? 0) > 0 || (it.reqLvl ?? 60) > 1) return null // the data leaves reqLvl out when it is 60
  const base = `it has no source and needs level ${Math.max(1, it.reqLvl ?? 1)}`
  if (sameName) return `${base}, and it copies the name of item ${sameName.id}, which needs level ${sameName.reqLvl ?? 60}`
  return `${base} (it may be a real item)`
}

/**
 * Drops unconfirmed items from every slot's alternatives and returns each dropped item once, for the
 * file's `left_out_items` (not `checks`: those are the accuracy gates). Run before choosing plan
 * gear, so no plan wears one.
 */
export function leaveOutUnconfirmed(
  slots: ResultsFile['slots'],
  facts: (id: number) => { it: ItemFacts; sameName?: ItemFacts } | undefined,
  owned: Set<number>,
): { slots: ResultsFile['slots']; leftOut: LeftOutItem[] } {
  const dropped = new Map<number, LeftOutItem>()
  const out = slots.map((s) => ({
    ...s,
    alternatives: s.alternatives.filter((a) => {
      const f = facts(a.item.item_id)
      const why = f ? unconfirmedReason(f.it, owned, f.sameName) : null
      if (why && !dropped.has(a.item.item_id)) dropped.set(a.item.item_id, { item_id: a.item.item_id, name: f!.it.name, reason: why })
      return !why
    }),
  }))
  return { slots: out, leftOut: [...dropped.values()] }
}
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
import { classifyBuffs, describeBuffs } from './buffs'

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
  const c = await classifyBuffs((ch as any).buffsAtExport ?? [])
  return simSheet(buildRequest(ch, sc, rotation, { iterations: 1, seed: 1, buffs: { raid: {}, individual: c.individual }, bonusStats: c.bonus }), await writeProfile(ch, `profile-${tag}`), tag)
}

/** Clean calibrations by level (base health and mana depend on level, race and class only). */
const CLEAN_CALIBRATIONS = `${PRIVATE}/data/clean-calibrations.json`

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
  const { unknown } = await classifyBuffs((ch as any).buffsAtExport ?? [])
  const historyPath = opts.historyPath ?? CLEAN_CALIBRATIONS
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
  const buffs = await classifyBuffs((ch as any).buffsAtExport ?? [])
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

#### `local/score/timeline.ts`

```ts
/**
 * The real fight as a per-second series (the chart's "you" line): his damage in each second of the
 * fight (his totems' too; overkill left out, as the meter counts it) and his mana at the end of that
 * second from the log's advanced fields (carried forward; null without advanced logging). Same shape
 * as the sim's timeline in the results file: { t_s, dps, mana }.
 */
import type { Fight } from '../combatlog/parse'

export type Point = { t_s: number; dps: number; mana: number | null }

export function fightTimeline(f: Fight): Point[] {
  const n = Math.max(1, Math.floor(f.end - f.start) + 1)
  const dmg = Array(n).fill(0)
  for (const h of f.hits) dmg[Math.min(n - 1, Math.max(0, Math.floor(h.t - f.start)))] += h.damage
  const mana = [...f.mana].sort((a, b) => a.t - b.t)
  let j = 0
  let last: number | null = mana.length ? mana[0].mana : null
  return dmg.map((d, i) => {
    while (j < mana.length && mana[j].t < f.start + i + 1) last = mana[j++].mana
    return { t_s: i, dps: Math.round(d * 100) / 100, mana: last === null ? null : Math.round(last) }
  })
}
```
