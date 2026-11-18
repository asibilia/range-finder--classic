/**
 * `simCharacter`: one character into a results file, or a stop. The order
 * of a run: the class and spec check (before any sim), the gates (the
 * level 60 regression, the sheet, no spell above the level), worn gear on
 * every fight with the sanity gates, then the max damage plan. The plan's
 * sims start once the weapons (and worn gear at their settings) are in, beside
 * the sanity sims, and the plan is kept only when the sanity gates pass.
 */
import {
    sheetFromSim,
    type RaidSimRequest,
    type Sheet,
    type SimPool,
} from '@goturbo/sim'

import {
    readResultsFile,
    SCHEMA_VERSION,
    type Check,
    type ResultsFile,
    type Stat,
} from '../results-file'
import { wornGear, type Character, type Gear, type SimStop } from './character'
import {
    belowLevel60Check,
    level60Check,
    NOTES,
    noSpellAboveLevelCheck,
    sheetChecks,
} from './checks'
import { loadItemDb, twoHandSkills } from './gear'
import { pawnStrings } from './pawn'
import {
    planMaxDamage,
    sameGear,
    WEAPON_SIMS,
    weaponCandidates,
    withMainHand,
} from './plan'
import { buildRequest } from './request'
import { rotationSpells } from './rotation'
import { SANITY_CALLS, sanitySims } from './sanity'
import {
    chainFor,
    DEFAULT_FIGHT,
    fightEntry,
    type FightOverride,
    scenariosFor,
    type Scenario,
} from './scenarios'
import {
    FIGHT_ITERATIONS,
    FIGHT_SEED,
    simSession,
    simSingle,
    type FightResult,
    type SimmedFight,
} from './session'
import { dpsOf, type SpellNames } from './sim-result'
import { specOf, talentsSection, talentTrees, type TalentTree } from './talents'
import { epTable, type StatWeights } from './weights'

export type SimOutcome =
    | {
          kind: 'file'
          file: ResultsFile
          /** Iterations the run's sims ran. */
          iterations: number
          /** The pool's time per iteration over the run's sims. */
          msPerIteration: number
      }
    | SimStop

/** The one class and spec the sim covers for now. */
export const SUPPORTED = { class: 'Shaman', spec: 'Enhancement' }
/** The weapon sims' settings, the runner's `weaponList`'s. */
const WEAPON_SETTINGS = { seed: 77, iterations: 6000 }

/** The long fight's EP per stat and its weapon DPS EP, apart. */
function longFightEp(weights: StatWeights) {
    const long = weights.find((w) => w.fight_id === DEFAULT_FIGHT)
    const epByStat = new Map<Stat, number>()
    let weaponDpsEp = 0
    for (const { stat, ep } of long?.weights ?? []) {
        if (stat === 'weapon_dps') weaponDpsEp = ep
        else epByStat.set(stat, ep)
    }
    return { epByStat, weaponDpsEp }
}

/** The results file's weights, without anything it doesn't take. */
function cleanWeights(weights: StatWeights, fightIds: string[]): StatWeights {
    return weights
        .filter((w) => fightIds.includes(w.fight_id))
        .map((w) => ({
            fight_id: w.fight_id,
            weights: w.weights.map(({ stat, ep }) => ({ stat, ep })),
        }))
}

/** The sheet's fields a results file takes. */
function fileSheet(sheet: ResultsFile['sheet']): ResultsFile['sheet'] {
    return {
        strength: sheet.strength,
        agility: sheet.agility,
        stamina: sheet.stamina,
        intellect: sheet.intellect,
        spirit: sheet.spirit,
        attack_power: sheet.attack_power,
        armor: sheet.armor,
        health: sheet.health,
        mana: sheet.mana,
        melee_crit_pct: sheet.melee_crit_pct,
        spell_crit_pct: sheet.spell_crit_pct,
        dodge_pct: sheet.dodge_pct,
        melee_hit_pct: sheet.melee_hit_pct,
        ...(sheet.weapon_skill ? { weapon_skill: sheet.weapon_skill } : {}),
    }
}

/**
 * The spec of a build (its tree with the most points, in the class's
 * `trees`), and the stop when the sim doesn't cover the class and spec.
 * The export reader runs it before it builds a character, `simCharacter`
 * before any sim.
 */
export function supportedSpec(
    className: string,
    talents: string,
    trees: TalentTree[]
): { spec: string; stop?: SimStop } {
    const spec = specOf(talents, trees)
    if (className !== SUPPORTED.class || spec !== SUPPORTED.spec)
        return { spec, stop: { kind: 'unsupported', class: className, spec } }
    return { spec }
}

/**
 * Every fight in `gear`: the three single fights, then the chain (`fight`:
 * the page's settings for them).
 */
async function simAll(
    pool: SimPool,
    character: Character,
    gear: Gear,
    sheet: Sheet,
    names: (id: number) => string | undefined,
    spellNames: SpellNames,
    fight?: FightOverride
): Promise<{ singles: SimmedFight[]; chain: FightResult }> {
    const fights = scenariosFor(character.level, fight)
    const [singles, chain] = await Promise.all([
        Promise.all(
            fights.map((fight) =>
                simSingle(
                    pool,
                    character,
                    fight,
                    gear,
                    sheet,
                    names,
                    spellNames
                )
            )
        ),
        simSession(
            pool,
            character,
            chainFor(character.level, fight?.gap_s),
            gear,
            sheet,
            names,
            spellNames
        ),
    ])
    return { singles, chain }
}

/**
 * The calls the gates make: the sheet and the level 60 sim, and the
 * unbuffed sheet when buffs were up at export.
 */
export function gateCalls(character: Character): number {
    return character.sheet_buffs ? 3 : 2
}

/** The gates' checks, and the sims the run goes on with. */
export type GateRun = {
    checks: Check[]
    /** Upstream's level 60 test request's DPS. */
    l60Dps: number
    /** The sim's sheet with no buffs, which the fights use. */
    sheet: Sheet
}

/**
 * The gates, before any numbers: the level 60 regression, the sim's sheet
 * against the game's (with the buffs up at export), and no spell above the
 * level. Any failing means no results.
 */
export async function runGates(
    character: Character,
    pool: SimPool
): Promise<GateRun> {
    const settings = { seed: FIGHT_SEED, iterations: FIGHT_ITERATIONS }
    const buffs = character.sheet_buffs
    const sheetOf = (sheetBuffs?: typeof buffs) =>
        pool.sheet(
            buildRequest(character, DEFAULT_FIGHT, { ...settings, sheetBuffs }),
            character.profile
        )
    const [l60Request, version, simmedSheet, unbuffed] = await Promise.all([
        pool.data('l60-test.in.json') as Promise<RaidSimRequest>,
        pool.data('version.json') as Promise<{ l60_expected_dps: number }>,
        sheetOf(buffs),
        buffs ? sheetOf() : null,
    ])
    const l60Dps = await pool.sim(l60Request).then(dpsOf)
    const checks: Check[] = [
        level60Check(l60Dps, version.l60_expected_dps),
        ...sheetChecks(
            character.sheet,
            sheetFromSim(simmedSheet),
            character.calibrated_spell_crit ?? false,
            character.weapon_skill_deficit
        ),
        noSpellAboveLevelCheck(
            rotationSpells(character),
            character.level,
            simmedSheet.unreached_ranks
        ),
    ]
    return { checks, l60Dps, sheet: sheetFromSim(unbuffed ?? simmedSheet) }
}

/** The calls the max damage plan's sims make: its sheet, every pull. */
function planCalls(level: number): number {
    return 1 + scenariosFor(level).length + chainFor(level).pulls
}

/**
 * The most calls `simCharacter` makes: the gates, worn gear on every pull,
 * the sanity sims, the most weapons it sims and the worn set at their
 * settings, and the plan's sims. It makes fewer when there are fewer
 * weapons to sim, or when the plan is worn gear, and says so as it learns.
 */
export function characterCalls(character: Character): number {
    const level = character.level
    return (
        gateCalls(character) +
        scenariosFor(level).length +
        chainFor(level).pulls +
        SANITY_CALLS +
        WEAPON_SIMS +
        1 +
        planCalls(level)
    )
}

/**
 * Sims a character's worn gear and its max damage plan on every fight,
 * ranking the plan by `weights` (the results file's `stat_weights`), and
 * makes a results file, or stops. `onProgress` hears `(done, planned)`:
 * `planned` starts at `characterCalls` and only comes down, as the run
 * learns it needs fewer calls, so the fraction done never goes back.
 * `fight` (Run Simulator) sims the long dungeon fight and the chain with
 * the page's settings (`scenariosFor`); absent, the fixed fights.
 */
export async function simCharacter(
    character: Character,
    weights: StatWeights,
    pool: SimPool,
    onProgress: (done: number, planned: number) => void,
    fight?: FightOverride
): Promise<SimOutcome> {
    const trees = await talentTrees(pool, character.class)
    const { spec, stop } = supportedSpec(
        character.class,
        character.talents,
        trees
    )
    if (stop) return stop

    const level = character.level
    const fights = scenariosFor(level, fight)
    const chain = chainFor(level, fight?.gap_s)
    const longFight = fights.find((f) => f.fight_id === DEFAULT_FIGHT)!
    let callsPlanned = characterCalls(character)
    let callsDone = 0
    const report = () =>
        onProgress(callsDone, Math.max(callsDone, callsPlanned))
    /** The run needs `fewer` calls than it planned. */
    const plannedLess = (fewer: number) => {
        if (fewer <= 0) return
        callsPlanned -= fewer
        report()
    }
    pool.batch(callsPlanned)
    const unsubscribe = pool.onProgress((count, of) => {
        // A cancel resets the count: pass it on as the pool says it.
        if (count === 0 && of === 0) return onProgress(0, 0)
        callsDone = count
        report()
    })
    report()
    try {
        return await run()
    } finally {
        unsubscribe()
    }

    async function run(): Promise<SimOutcome> {
        const settings = { seed: FIGHT_SEED, iterations: FIGHT_ITERATIONS }
        const sim = (request: RaidSimRequest) =>
            pool.sim(request, character.profile).then(dpsOf)

        // The gates before any numbers. The item data says how many
        // weapons there are to sim.
        const ep = epTable(weights)
        const [
            { checks: gates, l60Dps, sheet },
            { db, weaponIds },
            spellNames,
        ] = await Promise.all([
            runGates(character, pool),
            loadItemDb(pool).then((db) => {
                const { epByStat, weaponDpsEp } = longFightEp(weights)
                const ids = weaponCandidates(
                    character,
                    db.items.values(),
                    epByStat,
                    weaponDpsEp,
                    twoHandSkills(character)
                ).map((item) => item.id)
                // No candidates: no worn sim at their settings either.
                plannedLess(WEAPON_SIMS - ids.length + (ids.length ? 0 : 1))
                return { db, weaponIds: ids }
            }),
            pool.data('spell-names.json') as Promise<SpellNames>,
        ])
        const failedGates = gates.filter((c) => !c.passed)
        if (failedGates.length > 0)
            return { kind: 'gates', failed: failedGates }

        // Worn gear, the weapons, the sanity sims and the plan. The plan
        // needs only the weapons and worn gear at their settings, so those go
        // first and the plan's sims start while worn gear's fights and the
        // sanity sims run: the pool's workers stay busy. The plan's numbers
        // are kept only when every sanity gate passes.
        const names = (id: number) => db.items.get(id)?.name
        const longDps = (singles: SimmedFight[]) =>
            singles.find((f) => f.result.fight_id === DEFAULT_FIGHT)!.player.dps
                ?.avg ?? 0
        // Everything worn, items the sim lacks included (the `Gear` rule).
        const wearing = wornGear(character)
        const wornSingles = Promise.all(
            fights.map((fight) =>
                simSingle(
                    pool,
                    character,
                    fight,
                    wearing,
                    sheet,
                    names,
                    spellNames
                )
            )
        )
        // Each weapon against the worn set, both at the weapon settings.
        const weaponSim = (gear: Gear) =>
            sim(
                buildRequest(character, longFight, { ...WEAPON_SETTINGS, gear })
            )
        const weaponBase =
            weaponIds.length > 0 ? weaponSim(wearing) : Promise.resolve(0)
        const weapons = Promise.all(
            weaponIds.map((id) =>
                weaponSim(withMainHand(wearing, db, id)).then(
                    (dps) => [id, dps] as const
                )
            )
        )
        const wornChain = simSession(
            pool,
            character,
            chain,
            wearing,
            sheet,
            names,
            spellNames
        )
        const raising = sanitySims(character, pool)
        // The max damage plan, then its sims (none when it's worn gear).
        const planning = Promise.all([weaponBase, weapons]).then(
            async ([baseDps, weaponDps]) => {
                const gains = new Map(
                    weaponDps.map(([id, dps]) => [id, dps - baseDps])
                )
                const planned = planMaxDamage(character, db, ep, gains)
                if (sameGear(planned.gear, wearing)) {
                    plannedLess(planCalls(level))
                    return { planned, planSims: undefined }
                }
                const planSheet = sheetFromSim(
                    await pool.sheet(
                        buildRequest(character, DEFAULT_FIGHT, {
                            ...settings,
                            gear: planned.gear,
                        }),
                        character.profile
                    )
                )
                const planSims = await simAll(
                    pool,
                    character,
                    planned.gear,
                    planSheet,
                    names,
                    spellNames,
                    fight
                )
                return { planned, planSims }
            }
        )
        const [singles, wornChainResult, raised, { planned, planSims }] =
            await Promise.all([wornSingles, wornChain, raising, planning])
        const worn = { singles, chain: wornChainResult }

        const sanityChecks: Check[] = [
            belowLevel60Check(longDps(singles), l60Dps),
            ...raised,
        ]
        const failedSanity = sanityChecks.filter((c) => !c.passed)
        if (failedSanity.length > 0)
            return { kind: 'gates', failed: failedSanity }

        // The plan's sims, or the worn ones when it's the same gear.
        const plan = planSims ?? worn

        const results: ResultsFile['results'] = []
        for (const [gear, simmed] of [
            ['worn', worn],
            [planned.plan.plan_id, plan],
        ] as const) {
            for (const f of simmed.singles) results.push({ gear, ...f.result })
            results.push({ gear, ...simmed.chain })
        }

        const scenarios: Scenario[] = [...fights, chain]
        const fightIds = scenarios.map((s) => s.fight_id)
        const fileWeights = cleanWeights(weights, fightIds)
        const key = character.character_key
        const file = {
            schema_version: SCHEMA_VERSION,
            made_at: new Date().toISOString(),
            export_saved_at: character.export_saved_at,
            game_build: character.game_build,
            sample: false,
            provisional: true,
            checks: [...gates, ...sanityChecks, ...NOTES],
            ...(planned.left_out_items.length > 0
                ? { left_out_items: planned.left_out_items }
                : {}),
            character: {
                name: character.name,
                ...(key && /[1-9a-z]/i.test(key) ? { character_key: key } : {}),
                level,
                race: character.race,
                class: character.class,
                spec,
                ...(character.gender ? { gender: character.gender } : {}),
            },
            sheet_buffed: character.sheet_buffs !== undefined,
            sheet: fileSheet(character.sheet),
            fights: scenarios.map(fightEntry),
            default_fight_id: DEFAULT_FIGHT,
            slots: planned.slots,
            bag_upgrades: planned.bag_upgrades,
            plans: [planned.plan],
            results,
            stat_weights: fileWeights,
            talents: talentsSection(character.talents, trees, spec),
            pawn: pawnStrings(fileWeights, level),
        }
        const read = readResultsFile(file)
        if (!read.ok)
            throw new Error(
                `The browser sim made a file the page can't read: ${
                    read.reason === 'invalid'
                        ? read.problems.join('; ')
                        : `version ${read.version}`
                }`
            )
        const stats = pool.stats()
        return {
            kind: 'file',
            file: read.file,
            iterations: stats.iterations,
            msPerIteration:
                stats.iterations > 0 ? stats.ms / stats.iterations : 0,
        }
    }
}
