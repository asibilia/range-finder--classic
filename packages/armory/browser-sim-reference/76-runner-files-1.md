Runner files, part 1 of 4, from `62129e9`. Whole files, verbatim.

#### `local/sim/lib.ts`

```ts
/**
 * Shared pieces of the local level-aware runner: the character file, rank picking (the same rule as
 * the patched Ladder.Highest in Go), the Enhancement rotation at the character's level, the fight
 * types, the RaidSimRequest builder and the CLI call.
 */
import { $ } from 'bun'

export const ROOT = `${import.meta.dir}/../..`
export const CLI = `${ROOT}/bin/wowsimcli`
export const STRICTCHECK = `${ROOT}/local/bin/strictcheck` // go build -o local/bin/strictcheck ./local/strictcheck (built on first use)

/** The WeaponSkill names the sim knows (proto/common.proto). Others, such as Unarmed, are not sent. */
const KNOWN_WEAPON_SKILLS = new Set(
  [...(await Bun.file(`${ROOT}/proto/common.proto`).text()).matchAll(/^\s*(WeaponSkill\w+) = \d+;/gm)].map((m) => m[1]).filter((n) => n !== 'WeaponSkillUnknown'),
)

/**
 * Fails loudly when the sim would drop part of a request: the CLI parses with DiscardUnknown, so an
 * unknown field or enum name is silently ignored there, and the browser's WASM refuses the request.
 */
async function strictCheck(inFile: string, tag: string) {
  if (!(await Bun.file(STRICTCHECK).exists())) {
    await $`go build -o ${STRICTCHECK} ./local/strictcheck`.cwd(ROOT).quiet()
  }
  const res = await $`${STRICTCHECK} ${inFile}`.quiet().nothrow()
  if (res.exitCode !== 0) throw new Error(`the sim would drop part of this request (${tag}): ${res.stdout.toString().replace(/^.*?: proto: /, '').trim()}`)
}

/** The character the sim runs: made from an export (or the placeholder). */
export type Character = {
  source: 'export' | 'placeholder'
  name: string
  level: number
  race: string // proto Race name
  class: string // proto Class name
  talents: string // wowhead talent string
  mhImbue: 'WindfuryWeapon' | 'FlametongueWeapon' | 'RockbiterWeapon' | 'FrostbrandWeapon' | 'NoImbue'
  gear: Record<string, { id: number; enchant?: number; randomSuffix?: number }> // proto ItemSlot index
  knownSpells: number[]
  profile: Record<string, unknown> // the Go LevelProfile
  sheet: Record<string, number> | null // the exported character sheet, for the sheet check
  bonusStats?: number[] // stats of equipped items the sim's database lacks, by proto Stat index
  weaponSkills?: { skill: string; value: number }[] // current weapon skills (the sim assumes the maximum otherwise)
}

/**
 * Buffs the game showed at export, as sim settings, for the sheet check. Blessing of Kings is the
 * sim's own (10% to every attribute at any rank); a stat or armor buff of another caster's rank, such
 * as Mark of the Wild, is added as bonus stats read from that exact rank's spell row. Buffs the check
 * cannot model are returned apart.
 */
export async function exportBuffs(buffs: { name: string; spellID: number }[]) {
  const individual: Record<string, boolean> = {}
  const bonus = Array(40).fill(0)
  const unknown: string[] = []
  const src = await Bun.file(`${ROOT}/sim/core/spelldata/spells_auto_gen.go`).text()
  for (const b of buffs) {
    // No stat effect: shields, rest experience, travel form.
    if (/Lightning Shield|Water Shield|Well-Rested|Ghost Wolf|Resting/.test(b.name)) continue
    if (/Blessing of Kings$/.test(b.name)) { individual.greaterBlessingOfKings = true; continue }
    const row = new RegExp(`^\\t\\{ID: ${b.spellID}, [\\s\\S]*?(?=\\n\\t\\{ID: )`, 'm').exec(src)?.[0] ?? ''
    let modelled = false
    for (const m of row.matchAll(/Aura: dbcenums\.(A_MOD_STAT|A_MOD_ARMOR_NO_MODS|A_MOD_RESISTANCE), BasePoints: (-?\d+)[^}]*?Misc: (-?\d+)/g)) {
      const [, aura, pts, misc] = m
      const v = Number(pts)
      if (aura === 'A_MOD_STAT') {
        const statIdx = [0, 1, 2, 3, 13]
        if (Number(misc) === -1) statIdx.forEach((i) => (bonus[i] += v))
        else if (statIdx[Number(misc)] !== undefined) bonus[statIdx[Number(misc)]] += v
        modelled = true
      } else if (Number(misc) & 1) { bonus[27] += v; modelled = true }
    }
    if (!modelled) unknown.push(b.name)
  }
  return { raid: {} as Record<string, boolean>, individual, bonus, unknown }
}

/** The shaman ladders as the sim states them (sim/shaman/spell_data_auto_gen.go). */
export async function loadLadders(): Promise<Record<string, number[]>> {
  const src = await Bun.file(`${ROOT}/sim/shaman/spell_data_auto_gen.go`).text()
  const ladders: Record<string, number[]> = {}
  for (const m of src.matchAll(/^\t(\w+):\s+spelldata\.Ranked\(([\d, ]+)\),$/gm)) {
    ladders[m[1]] = m[2].split(',').map((s) => Number(s.trim()))
  }
  return ladders
}

export type SpellIndex = Record<string, { name: string; rank: string | null; spellLevel: number; mechanic?: number }>

export async function loadSpellIndex(): Promise<SpellIndex> {
  return JSON.parse(await Bun.file(`${ROOT}/local/data/spell-index.json`).text())
}

/**
 * The rank the character has: the highest the export lists as trained, or with no list the highest
 * whose SpellLevel the character has reached. Null when the character has no rank (the Go side then
 * answers the lowest rank and lists it as unreached; the rotation must not cast it).
 */
export function pickRank(ladder: number[], level: number, known: Set<number>, index: SpellIndex): number | null {
  if (known.size > 0) {
    for (let i = ladder.length - 1; i >= 0; i--) if (known.has(ladder[i])) return ladder[i]
    return null
  }
  for (let i = ladder.length - 1; i >= 0; i--) {
    if ((index[ladder[i]]?.spellLevel ?? 0) <= level) return ladder[i]
  }
  return null
}

/** A fight type. */
export type Scenario = {
  key: string
  label: string
  duration: number // seconds
  variation: number // seconds either side
  targetLevel: number
  targetArmor: number
  beingHit: boolean // the mob attacks the shaman (dodges and parries can reset Stormstrike)
  inFront: boolean // the shaman stands in front of the mob (its parries count)
  totems: boolean // drops Strength of Earth and a fire totem
}

/**
 * The fight types. Mob armor at levels 31 to 33 is an estimate (Classic normal mobs of that level);
 * swing damage and speed are for a level 31 normal mob.
 */
/** Mob armor by level: an estimate (Classic normal mobs, 1100 at level 31, 50 per level). */
export function estimateArmor(level: number) {
  return Math.max(0, Math.round(1100 + (level - 31) * 50))
}

/**
 * The runner's standard fights for a character of this level (owner's decision, 2026-11-15): solo
 * vs a mob of his level, dungeon 30 s vs +1, dungeon 2 min vs +2. Same fight ids as before; until
 * runner 1097eb7 they were fixed at levels 31, 32 and 33 (the history row's runner commit says which).
 */
export function scenariosFor(level: number): Scenario[] {
  const lv = (gap: number) => level + gap
  return [
    { key: 'solo-hit-short', label: `Solo vs a level ${lv(0)} mob (your level), mob hitting you, 30 s`, duration: 30, variation: 5, targetLevel: lv(0), targetArmor: estimateArmor(lv(0)), beingHit: true, inFront: true, totems: false },
    { key: 'dungeon-short', label: `Dungeon vs a level ${lv(1)} mob (+1), behind a tank, 30 s`, duration: 30, variation: 5, targetLevel: lv(1), targetArmor: estimateArmor(lv(1)), beingHit: false, inFront: false, totems: true },
    { key: 'dungeon-long', label: `Dungeon vs a level ${lv(2)} mob (+2), behind a tank, 2 min`, duration: 120, variation: 10, targetLevel: lv(2), targetArmor: estimateArmor(lv(2)), beingHit: false, inFront: false, totems: true },
  ]
}

/** Templates at level 31 for tools that set their own mob level (and the fixed fights of runners before 1097eb7). */
export const SCENARIOS: Scenario[] = [
  { key: 'solo-hit-short', label: 'Solo, mob hitting you, 30 s', duration: 30, variation: 5, targetLevel: 31, targetArmor: 1100, beingHit: true, inFront: true, totems: false },
  { key: 'dungeon-short', label: 'Dungeon behind a tank, 30 s', duration: 30, variation: 5, targetLevel: 32, targetArmor: 1150, beingHit: false, inFront: false, totems: true },
  { key: 'dungeon-long', label: 'Dungeon behind a tank, 2 min', duration: 120, variation: 10, targetLevel: 33, targetArmor: 1200, beingHit: false, inFront: false, totems: true },
]

const spell = (id: number) => ({ spellId: id })
const cast = (id: number, condition?: unknown) => ({ action: { ...(condition ? { condition } : {}), castSpell: { spellId: spell(id) } } })
const notActive = (id: number) => ({ not: { val: { auraIsActive: { auraId: spell(id), includeReactionTime: true } } } })
const totemLow = (type: string) => ({ cmp: { op: 'OpLe', lhs: { totemRemainingTime: { totemType: type } }, rhs: { const: { val: '2s' } } } })

/**
 * The Enhancement rotation with the ranks the character has: Lightning Shield up, totems if the
 * fight type drops them, Stormstrike on cooldown, Flame Shock kept on the target, Earth Shock
 * otherwise. Spells the character lacks are left out. Returns the rotation and the ranks it uses.
 */
/** Which parts of the rotation he uses: the full rotation has all of them. */
export type Variant = { label: string; stormstrike: boolean; earthShock: boolean; flameShock: boolean; lightningShield: boolean }
export const FULL: Variant = { label: 'full rotation', stormstrike: true, earthShock: true, flameShock: true, lightningShield: true }
export const VARIANTS: Variant[] = [
  { label: 'auto-attack only', stormstrike: false, earthShock: false, flameShock: false, lightningShield: false },
  { label: 'auto-attack + Lightning Shield', stormstrike: false, earthShock: false, flameShock: false, lightningShield: true },
  { label: 'auto + Stormstrike', stormstrike: true, earthShock: false, flameShock: false, lightningShield: false },
  { label: 'auto + Stormstrike + Lightning Shield', stormstrike: true, earthShock: false, flameShock: false, lightningShield: true },
  { label: 'auto + Stormstrike + Earth Shock', stormstrike: true, earthShock: true, flameShock: false, lightningShield: false },
  { label: 'auto + Stormstrike + Earth Shock + Lightning Shield', stormstrike: true, earthShock: true, flameShock: false, lightningShield: true },
  { label: 'full rotation, no Lightning Shield', stormstrike: true, earthShock: true, flameShock: true, lightningShield: false },
  FULL,
]

export function buildRotation(ch: Character, sc: Scenario, ladders: Record<string, number[]>, index: SpellIndex, variant: Variant = FULL) {
  const known = new Set(ch.knownSpells)
  const r = (name: string) => (ladders[name] ? pickRank(ladders[name], ch.level, known, index) : null)
  const ranks = {
    lightningShield: variant.lightningShield ? r('LightningShield') : null,
    strengthOfEarth: r('StrengthOfEarthTotem'),
    searing: r('SearingTotem'),
    stormstrike: variant.stormstrike && ch.talents.split('-')[1]?.[11] === '1' ? 17364 : null,
    flameShock: variant.flameShock ? r('FlameShock') : null,
    earthShock: variant.earthShock ? r('EarthShock') : null,
  }
  const prepull: unknown[] = []
  const priority: unknown[] = []
  if (ranks.lightningShield) {
    prepull.push({ action: { castSpell: { spellId: spell(ranks.lightningShield) } }, doAtValue: { const: { val: '-3s' } } })
    priority.push(cast(ranks.lightningShield, notActive(ranks.lightningShield)))
  }
  if (sc.totems && ranks.strengthOfEarth) {
    prepull.push({ action: { castSpell: { spellId: spell(ranks.strengthOfEarth) } }, doAtValue: { const: { val: '-2s' } } })
    priority.push(cast(ranks.strengthOfEarth, totemLow('Earth')))
  }
  if (sc.totems && ranks.searing) {
    prepull.push({ action: { castSpell: { spellId: spell(ranks.searing) } }, doAtValue: { const: { val: '-1s' } } })
    priority.push(cast(ranks.searing, totemLow('Fire')))
  }
  if (ranks.stormstrike) priority.push(cast(ranks.stormstrike))
  if (ranks.flameShock) priority.push({ action: { multidot: { spellId: spell(ranks.flameShock), maxDots: 1, maxOverlap: { const: { val: '0ms' } } } } })
  if (ranks.earthShock) priority.push(cast(ranks.earthShock))
  return { rotation: { type: 'TypeAPL', prepullActions: prepull, priorityList: priority }, ranks }
}

/** The RaidSimRequest for one character, fight type and stat offset. */
export function buildRequest(
  ch: Character,
  sc: Scenario,
  rotation: unknown,
  opts: { iterations: number; seed: number; bonusStats?: number[]; buffs?: { raid: Record<string, boolean>; individual: Record<string, boolean> }; timelineBucketMs?: number },
) {
  const items = Array.from({ length: 17 }, (_, slot) => ch.gear[String(slot)] ?? {})
  const targetStats = Array(30).fill(0)
  targetStats[27] = sc.targetArmor
  targetStats[29] = 10_000_000
  const player = {
    name: ch.name,
    race: ch.race,
    class: ch.class,
    equipment: { items },
    talentsString: ch.talents,
    enhancementShaman: { options: { classOptions: { imbueMh: ch.mhImbue } } },
    consumables: {},
    buffs: opts.buffs?.individual ?? {},
    weaponSkills: (ch.weaponSkills ?? []).filter((w) => KNOWN_WEAPON_SKILLS.has(w.skill)),
    rotation,
    bonusStats: mergeStats(ch.bonusStats, opts.bonusStats),
    distanceFromTarget: 5,
    inFrontOfTarget: sc.inFront,
    reactionTimeMs: 100,
  }
  return {
    raid: {
      parties: [{ players: [player] }],
      tanks: sc.beingHit ? [{ type: 'Player', index: 0 }] : [],
      buffs: opts.buffs?.raid ?? {},
    },
    encounter: {
      duration: sc.duration,
      durationVariation: sc.variation,
      targets: [
        {
          name: `Level ${sc.targetLevel} mob`,
          level: sc.targetLevel,
          mobType: 'MobTypeHumanoid',
          stats: targetStats,
          minBaseDamage: sc.beingHit ? 45 : 0,
          damageSpread: 0.3,
          swingSpeed: 2,
          tankIndex: 0,
        },
      ],
    },
    simOptions: { iterations: opts.iterations, randomSeed: opts.seed, ...(opts.timelineBucketMs ? { timelineBucketMs: opts.timelineBucketMs } : {}) },
  }
}

function mergeStats(a?: number[], b?: number[]) {
  if (!a && !b) return undefined
  const out = Array(40).fill(0)
  for (const s of [a, b]) s?.forEach((v, i) => (out[i] += v))
  return { stats: out }
}

/** The sheet the sim builds for a request: final stats, pseudo stats and unreached ranks. */
export async function simSheet(request: unknown, profilePath: string, tag: string) {
  const inFile = `${ROOT}/local/runs/${tag}.sheet.json`
  await Bun.write(inFile, JSON.stringify(request))
  await strictCheck(inFile, tag)
  const res = await $`${CLI} sheet --infile ${inFile}`.env({ ...process.env, WOWSIMS_LEVEL_PROFILE: profilePath }).quiet().nothrow()
  if (res.exitCode !== 0) throw new Error(`sheet failed (${tag}): ${res.stderr.toString()}`)
  const out = JSON.parse(res.stdout.toString())
  const s = out.player.finalStats.stats as number[]
  const p = out.player.finalStats.pseudoStats as number[]
  return {
    level: out.level as number,
    unreachedRanks: out.unreachedRanks as number[],
    strength: s[0], agility: s[1], stamina: s[2], intellect: s[3], spirit: s[13],
    attackPower: s[14], armor: s[27], health: s[29], mana: s[30],
    dodge: p[4], meleeHit: p[12], meleeCrit: p[14], spellCrit: p[15], mainHandDps: p[0],
  }
}

/** Runs one request through the CLI at the character's level and profile; returns the player's metrics. */
export async function runSim(request: unknown, profilePath: string, tag: string) {
  const dir = `${ROOT}/local/runs`
  const inFile = `${dir}/${tag}.in.json`
  const outFile = `${dir}/${tag}.out.json`
  await Bun.write(inFile, JSON.stringify(request))
  await strictCheck(inFile, tag)
  const env = { ...process.env, WOWSIMS_LEVEL_PROFILE: profilePath }
  const res = await $`${CLI} sim --infile ${inFile} --outfile ${outFile}`.env(env).quiet().nothrow()
  if (res.exitCode !== 0) throw new Error(`sim failed (${tag}): ${res.stderr.toString()}`)
  const out = JSON.parse(await Bun.file(outFile).text())
  if (out.error) throw new Error(`sim error (${tag}): ${JSON.stringify(out.error)}`)
  const player = out.raidMetrics.parties[0].players[0] as PlayerMetrics
  const mob = out.encounterMetrics?.targets?.[0]
  // The mob's melee against the shaman: how often the shaman dodged or parried it.
  player.avoidedByMe = (mob?.actions ?? [])
    .filter((a: any) => a.id?.otherId === 'OtherActionAttack')
    .reduce((n: number, a: any) => n + a.targets.reduce((k: number, t: any) => k + (t.dodges ?? 0) + (t.parries ?? 0), 0), 0)
  return player
}

export type PlayerMetrics = {
  dps: { avg: number; stdev: number }
  actions: { id: { spellId?: number; itemId?: number; otherId?: string; tag?: number }; targets: { casts?: number; hits?: number; crits?: number; misses?: number; dodges?: number; parries?: number; glances?: number; damage?: number }[] }[]
  resources: unknown[]
  secondsOomAvg?: number
  tto?: { avg: number } // time to the first out of mana (extrapolated past the fight when it never runs dry)
  /** Per bucket (when the request asked for timelineBucketMs): DPS and mana, averaged over the iterations that reached it. */
  timeline?: { tS: number; dps: number; dpsStdev: number; mana: number; manaStdev: number; iterations: number }[]
  avoidedByMe?: number // the mob's swings the shaman dodged or parried, over all iterations
}

/** Casts of one spell id over all its targets. */
export function casts(m: PlayerMetrics, spellId: number) {
  return m.actions
    .filter((a) => a.id.spellId === spellId)
    .reduce((n, a) => n + a.targets.reduce((k, t) => k + (t.casts ?? 0), 0), 0)
}
```

#### `local/sim/buffs.ts`

```ts
/**
 * The buffs up at export, sorted four ways so none can quietly poison the sheet check or the
 * calibration again (Warchief's Blessing once inflated base health by 300):
 * - modelled: the sim's spell data has the buff's row (or it's Kings): the sheet sim adds it;
 * - game_numbers: the export carries the aura's own numbers (format 8: `points`) and the spell's
 *   description, and every number in the description is read and confirmed by the points: the sheet
 *   sim adds what's on the sheet (health, mana, attack power, armor, attributes); haste and mana per
 *   5 aren't on the sheet and are kept as notes;
 * - no_stats: known not to touch the sheet (shields, rest, travel forms, mounts);
 * - unknown: anything else. The checks then mark the lines it could touch "not checked".
 * Each buff keeps who cast it (self, other or none), never a name. The sim's fights don't use any of
 * these: they choose their own buffs.
 */
import { exportBuffs } from './lib'

export type BuffIn = { name: string; spellID: number; source?: string | null; points?: Record<string, number> | null; description?: string | null }
export type BuffNumbers = Partial<Record<'health' | 'mana' | 'attack_power' | 'armor' | 'strength' | 'agility' | 'stamina' | 'intellect' | 'spirit' | 'mp5' | 'haste_pct' | 'run_speed_pct', number>>
export type Classified = { name: string; spellID: number; source: 'self' | 'other' | 'none' | null; class: 'modelled' | 'game_numbers' | 'no_stats' | 'unknown'; numbers: BuffNumbers | null }

const NO_STATS = /^(Lightning Shield|Water Shield|Well-Rested|Ghost Wolf|Resting)$|Mount|Riding|Horse|Wolf$|Raptor|Kodo/
/** Stat index in the sim's stats array for each sheet stat a buff can carry. */
const STAT_INDEX: Partial<Record<keyof BuffNumbers, number>> = { strength: 0, agility: 1, stamina: 2, intellect: 3, spirit: 13, attack_power: 14, armor: 27, health: 29, mana: 30 }

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
]

/**
 * The buff's effects from its description, each number confirmed by the aura's points. Null when
 * there are no numbers, a numbered sentence can't be read, or a number isn't among the points.
 */
export function parseBuffNumbers(b: BuffIn): BuffNumbers | null {
  if (!b.description || !b.points || !Object.keys(b.points).length) return null
  const points = new Set(Object.values(b.points).map((v) => Math.abs(v)))
  const out: BuffNumbers = {}
  for (const sentence of b.description.split(/\.(?:\s|$)/).map((x) => x.trim()).filter(Boolean)) {
    if (!/\d/.test(sentence) || /^lasts\b/i.test(sentence)) continue // no number, or only a duration
    const hit = PATTERNS.find(([re]) => re.test(sentence))
    if (!hit) return null
    const m = hit[0].exec(sentence)!
    const v = Number(m.slice(1).find((x) => x !== undefined))
    if (!points.has(v)) return null
    out[hit[1]] = (out[hit[1]] ?? 0) + v
  }
  return Object.keys(out).length ? out : null
}

const sourceOf = (s: unknown): Classified['source'] => (s === 'self' || s === 'other' || s === 'none' ? s : null)

/** Sorts the buffs, and gives the sheet sim what to add (bonus stats and the sim's own buffs). */
export async function classifyBuffs(buffs: BuffIn[]) {
  const list: Classified[] = []
  const bonus = Array(40).fill(0)
  const individual: Record<string, boolean> = {}
  for (const b of buffs) {
    const one = await exportBuffs([b])
    const modelled = one.unknown.length === 0 && (Object.keys(one.individual).length > 0 || one.bonus.some((v) => v !== 0))
    if (modelled) {
      Object.assign(individual, one.individual)
      one.bonus.forEach((v, i) => (bonus[i] += v))
      list.push({ name: b.name, spellID: b.spellID, source: sourceOf(b.source), class: 'modelled', numbers: null })
      continue
    }
    const numbers = parseBuffNumbers(b)
    if (numbers) {
      for (const [k, v] of Object.entries(numbers)) if (STAT_INDEX[k as keyof BuffNumbers] !== undefined) bonus[STAT_INDEX[k as keyof BuffNumbers]!] += v!
      list.push({ name: b.name, spellID: b.spellID, source: sourceOf(b.source), class: 'game_numbers', numbers })
      continue
    }
    list.push({ name: b.name, spellID: b.spellID, source: sourceOf(b.source), class: NO_STATS.test(b.name) || one.unknown.length === 0 ? 'no_stats' : 'unknown', numbers: null })
  }
  return { list, bonus, individual, unknown: list.filter((b) => b.class === 'unknown').map((b) => b.name) }
}

/** One line for the checks: each buff and what was done with it. */
export function describeBuffs(list: Classified[]) {
  const said = (b: Classified) =>
    b.class === 'modelled' ? `${b.name}: modelled from the sim's spell data`
    : b.class === 'game_numbers' ? `${b.name}: removed using the game's own numbers (${Object.entries(b.numbers!).map(([k, v]) => `${k} ${v}`).join(', ')})`
    : b.class === 'no_stats' ? `${b.name}: doesn't touch the sheet`
    : `unknown: ${b.name}`
  return list.map((b) => `${said(b)}${b.source ? ` [${b.source}]` : ''}`).join('; ')
}
```

#### `local/sim/session.ts`

```ts
/**
 * A levelling session: N pulls in a row with mana carried over, instead of isolated fights at full
 * mana. Each pull is simmed starting with the mana the last one left, plus what he regains between
 * pulls (out-of-combat regen for the gap, or a full bar if he drinks).
 *
 * Parameters (defaults are guesses until a real log gives them): pulls, fight length, gap between
 * pulls, drinking or not, out-of-combat mana regen per second (from his export's GetManaRegen).
 * Spirit's effect on that regen uses the sim's own rule, 1/8 mana per second per point.
 */
import { buildRequest, buildRotation, runSim, simSheet, type Character, type PlayerMetrics, type Scenario, type SpellIndex, type Variant } from './lib'

export type SessionParams = {
  pulls: number
  gapSeconds: number
  drink: boolean
  regenPerSecond: number // out of combat, at his current Spirit
}

export type SessionPull = { pull: number; dps: number; manaStart: number; manaEnd: number; tto: number; metrics: PlayerMetrics }
export type SessionResult = { dps: number; pullDps: number[]; startPct: number[]; secondsDry: number; pulls: SessionPull[]; maxMana: number }

const netMana = (m: PlayerMetrics & { resources?: any[] }, iterations: number) =>
  (m as any).resources.filter((r: any) => r.type === 'ResourceTypeMana').reduce((n: number, r: any) => n + r.actualGain, 0) / iterations

export async function simSession(
  ch: Character,
  sc: Scenario,
  p: SessionParams,
  ctx: { ladders: Record<string, number[]>; index: SpellIndex; profilePath: string; variant?: Variant },
  opts: { iterations: number; seed: number; bonusStats?: number[]; extraRegen?: number } = { iterations: 2000, seed: 23 },
): Promise<SessionResult> {
  const { rotation } = buildRotation(ch, sc, ctx.ladders, ctx.index, ctx.variant)
  const base = buildRequest(ch, sc, rotation, { iterations: 1, seed: 1, bonusStats: opts.bonusStats })
  const max = (await simSheet(base, ctx.profilePath, 'session-sheet')).mana
  let mana = max
  const pullDps: number[] = []
  const startPct: number[] = []
  let secondsDry = 0
  const pulls: SessionPull[] = []
  for (let i = 0; i < p.pulls; i++) {
    const manaStart = mana
    const pct = Math.max(1, Math.min(100, (100 * mana) / max))
    startPct.push(pct)
    const req = buildRequest(ch, sc, rotation, { iterations: opts.iterations, seed: opts.seed, bonusStats: opts.bonusStats }) as any
    req.raid.parties[0].players[0].startingManaPercent = pct >= 100 ? 0 : pct
    const m = await runSim(req, ctx.profilePath, 'session')
    pullDps.push(m.dps.avg)
    secondsDry += m.secondsOomAvg ?? 0
    mana = Math.max(0, Math.min(max, mana + netMana(m as any, opts.iterations)))
    pulls.push({ pull: i + 1, dps: m.dps.avg, manaStart, manaEnd: mana, tto: (m as any).tto?.avg ?? Infinity, metrics: m })
    mana = p.drink ? max : Math.min(max, mana + (p.regenPerSecond + (opts.extraRegen ?? 0)) * p.gapSeconds)
  }
  return { dps: pullDps.reduce((a, b) => a + b, 0) / pullDps.length, pullDps, startPct, secondsDry, pulls, maxMana: max }
}
```

#### `local/sim/weights.ts`

```ts
/**
 * Stat weights for one character and fight type: each stat is raised by a small amount and simmed
 * against the same seed (so both runs share their random rolls), over several seeds; the weight is
 * the DPS gained per point with a 95% interval across seeds. EP divides by the attack power weight.
 */
import { meanCI } from './checks'
import { buildRequest, buildRotation, runSim, type Character, type Scenario, type SpellIndex, type Variant } from './lib'

/** The stats weighed: proto Stat index (or pseudo stat), the amount added, and Pawn's name for it. */
export const WEIGHED = [
  { key: 'strength', label: 'Strength', stat: 0, amount: 20, pawn: 'Strength' },
  { key: 'agility', label: 'Agility', stat: 1, amount: 20, pawn: 'Agility' },
  { key: 'intellect', label: 'Intellect', stat: 3, amount: 20, pawn: 'Intellect' },
  { key: 'spirit', label: 'Spirit', stat: 13, amount: 20, pawn: 'Spirit' },
  { key: 'attackPower', label: 'Attack Power', stat: 14, amount: 40, pawn: 'Ap' },
  { key: 'hit', label: 'Hit rating (10 = 1%)', stat: 17, amount: 10, pawn: 'HitRating' },
  { key: 'crit', label: 'Crit rating (14 = 1%)', stat: 18, amount: 14, pawn: 'CritRating' },
  { key: 'spellDamage', label: 'Spell damage', stat: 5, amount: 20, pawn: 'SpellDamage' },
  { key: 'mp5', label: 'Mana per 5 s', stat: 31, amount: 5, pawn: 'Mp5' },
  { key: 'weaponDps', label: 'Weapon DPS', stat: -1, amount: 2, pawn: 'MeleeDps' },
] as const

export type Weight = { key: string; label: string; pawn: string; perPoint: number; half: number; ep: number; epHalf: number }

export async function statWeights(
  ch: Character,
  sc: Scenario,
  ctx: { ladders: Record<string, number[]>; index: SpellIndex; profilePath: string; variant?: Variant },
  opts = { seeds: [101, 102, 103, 104, 105], iterations: 8000 },
): Promise<{ baseDps: number; weights: Weight[] }> {
  const { rotation } = buildRotation(ch, sc, ctx.ladders, ctx.index, ctx.variant)
  const baseline: Record<number, number> = {}
  let baseDps = 0
  for (const seed of opts.seeds) {
    const m = await runSim(buildRequest(ch, sc, rotation, { iterations: opts.iterations, seed }), ctx.profilePath, `w-${sc.key}-base`)
    baseline[seed] = m.dps.avg
    baseDps += m.dps.avg / opts.seeds.length
  }
  const raw: { w: (typeof WEIGHED)[number]; diffs: number[] }[] = []
  for (const w of WEIGHED) {
    const diffs: number[] = []
    for (const seed of opts.seeds) {
      const bonus = Array(40).fill(0)
      const pseudo = Array(30).fill(0)
      if (w.stat >= 0) bonus[w.stat] = w.amount
      else pseudo[0] = w.amount // PseudoStatMainHandDps
      const req = buildRequest(ch, sc, rotation, { iterations: opts.iterations, seed, bonusStats: bonus }) as any
      if (w.stat < 0) req.raid.parties[0].players[0].bonusStats = { ...(req.raid.parties[0].players[0].bonusStats ?? { stats: Array(40).fill(0) }), pseudoStats: pseudo }
      const m = await runSim(req, ctx.profilePath, `w-${sc.key}-${w.key}`)
      diffs.push((m.dps.avg - baseline[seed]) / w.amount)
    }
    raw.push({ w, diffs })
  }
  const ap = meanCI(raw.find((r) => r.w.key === 'attackPower')!.diffs)
  const weights = raw.map(({ w, diffs }) => {
    const { mean, half } = meanCI(diffs)
    // EP: the ratio's interval, from both intervals (first-order).
    const ep = mean / ap.mean
    const epHalf = Math.abs(ep) * Math.sqrt((half / (mean || 1e-9)) ** 2 + (ap.half / ap.mean) ** 2)
    return { key: w.key, label: w.label, pawn: w.pawn, perPoint: mean, half, ep, epHalf }
  })
  return { baseDps, weights }
}

/** Pawn's scale import string: ( Pawn: v1: "Name": Stat=value, ... ). Values are EP (Attack Power = 1). */
export function pawnScale(name: string, weights: Weight[]) {
  const parts = weights.filter((w) => w.ep > 0.005).map((w) => `${w.pawn}=${w.ep.toFixed(2)}`)
  return `( Pawn: v1: "${name}": ${parts.join(', ')} )`
}
```

#### `local/sim/meter.ts`

```ts
/**
 * "How he really plays": the built-in Damage Meter's split of his damage (from the export) against
 * the sim's split for each rotation variant, to pick the variant closest to how he plays.
 */
import { lineOf } from '../combatlog/parse'

import { list, type ExportDB } from './export'
import type { PlayerMetrics, SpellIndex } from './lib'

export type Shares = { damage: Record<string, number>; total: number; seconds: number; fights: number; dps: number; fightDps: number[] }

/** The comparison line for a meter or sim spell name. Totems and pets come out as "Totems". */
export function meterLine(name: string | undefined, spellID: number, creature?: string): string {
  if (creature || (name && /Totem/.test(name) && !/^Windfury/.test(name))) return 'Totems'
  if (spellID === 0 || spellID === 6603 || name === 'Auto Attack' || name === 'Melee' || name === 'melee') return 'melee'
  return lineOf(name ?? String(spellID), false)
}

/** His damage by line, summed over the meter's past fights (or Overall when it keeps none). */
export function meterShares(db: ExportDB): Shares | null {
  const sessions = list(db.meter?.sessions)
  const fights = sessions.filter((s) => String(s.label).startsWith('fight ') && Number(s.damage) > 0)
  const use = fights.length ? fights : sessions.filter((s) => s.label === 'overall' && Number(s.damage) > 0)
  if (!use.length) return null
  const damage: Record<string, number> = {}
  let total = 0
  let seconds = 0
  const fightDps: number[] = []
  for (const s of use) {
    for (const sp of list(s.spells)) {
      const k = meterLine(sp.name, Number(sp.spellID), sp.creature)
      damage[k] = (damage[k] ?? 0) + Number(sp.damage ?? 0)
      total += Number(sp.damage ?? 0)
    }
    seconds += Number(s.durationSeconds ?? 0)
    if (Number(s.durationSeconds) > 0) fightDps.push(Number(s.damage) / Number(s.durationSeconds))
  }
  return { damage, total, seconds, fights: fights.length, dps: seconds ? total / seconds : 0, fightDps }
}

/** The sim's damage by the same lines. */
export function simShares(m: PlayerMetrics, index: SpellIndex): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of m.actions) {
    const name = a.id.spellId ? index[a.id.spellId]?.name : a.id.otherId === 'OtherActionAttack' ? 'melee' : undefined
    if (!name) continue
    const dmg = a.targets.reduce((n, t) => n + (t.damage ?? 0), 0)
    if (!dmg) continue
    const k = meterLine(name, a.id.spellId ?? 0)
    out[k] = (out[k] ?? 0) + dmg
  }
  return out
}

/** Sum of absolute differences in share (0 = the same split, 2 = nothing in common). */
export function shareDistance(a: Record<string, number>, b: Record<string, number>) {
  const ta = Object.values(a).reduce((x, y) => x + y, 0) || 1
  const tb = Object.values(b).reduce((x, y) => x + y, 0) || 1
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  let d = 0
  for (const k of keys) d += Math.abs((a[k] ?? 0) / ta - (b[k] ?? 0) / tb)
  return d
}
```

#### `local/combatlog/parse.ts` (excerpt: `lineOf`, used by `meter.ts`)

```ts
export function lineOf(spellName: string, fromTotem: boolean): string {
  if (fromTotem) return 'Searing Totem'
  if (/^Stormstrike$/.test(spellName)) return 'Stormstrike'
  if (/^Windfury/.test(spellName)) return 'Windfury'
  if (/^Earth Shock$/.test(spellName)) return 'Earth Shock'
  if (/^Flame Shock$/.test(spellName)) return 'Flame Shock'
  if (/^Frost Shock$/.test(spellName)) return 'Frost Shock'
  if (/^Lightning Shield$/.test(spellName)) return 'Lightning Shield'
  if (/^Lightning Bolt$/.test(spellName)) return 'Lightning Bolt'
  if (/^Fire Nova$/.test(spellName)) return 'Fire Nova'
  return `other: ${spellName}`
}
```
