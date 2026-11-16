/**
 * `simCharacter`: one character into a results file, or a stop. The order
 * of a run: the class and spec check (before any sim), the gates (the
 * level 60 regression, the sheet, no spell above the level), worn gear on
 * every fight with the sanity gates, then the max damage plan.
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
import type { Character, Gear, SimStop } from './character'
import {
    belowLevel60Check,
    dpsRisesCheck,
    level60Check,
    NOTES,
    noSpellAboveLevelCheck,
    sheetChecks,
    stormstrikeRuleCheck,
} from './checks'
import { loadItemDb } from './gear'
import { pawnStrings } from './pawn'
import {
    planMaxDamage,
    sameGear,
    WEAPON_SIMS,
    weaponsToSim,
    withMainHand,
} from './plan'
import { buildRequest, hasStormstrike } from './request'
import { rotationSpells, STORMSTRIKE } from './rotation'
import {
    chainFor,
    DEFAULT_FIGHT,
    fightEntry,
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
import { castsOf, dpsOf } from './sim-result'
import {
    specOf,
    talentRank,
    talentsSection,
    talentTrees,
    type TalentTree,
} from './talents'
import { bonusFor, epTable, STAT_STEPS, type StatWeights } from './weights'

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

const SUPPORTED = { class: 'Shaman', spec: 'Enhancement' }
/** Stormstrike's cooldown, in seconds. */
const STORMSTRIKE_COOLDOWN_S = 8
/** The sanity gate weighs stats with at least this EP on the long fight. */
const SANITY_MIN_EP = 1
/** It adds this many times the weights method's amount. */
const SANITY_SCALE = 10

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

/** The class and spec, or why the sim can't run this character. */
async function specCheck(
    character: Character,
    pool: SimPool
): Promise<{ spec: string; trees: TalentTree[]; stop?: SimStop }> {
    let trees: TalentTree[] = []
    try {
        trees = await talentTrees(pool, character.class)
    } catch {
        // A class the sim has no talent trees for.
    }
    const spec = specOf(character.talents, trees)
    if (character.class !== SUPPORTED.class || spec !== SUPPORTED.spec)
        return {
            spec,
            trees,
            stop: { kind: 'unsupported', class: character.class, spec },
        }
    return { spec, trees }
}

/** Every fight in `gear`: the three single fights, then the chain. */
async function simAll(
    pool: SimPool,
    character: Character,
    gear: Gear,
    sheet: Sheet,
    names: (id: number) => string | undefined
): Promise<{ singles: SimmedFight[]; chain: FightResult }> {
    const fights = scenariosFor(character.level)
    const [singles, chain] = await Promise.all([
        Promise.all(
            fights.map((fight) =>
                simSingle(pool, character, fight, gear, sheet, names)
            )
        ),
        simSession(
            pool,
            character,
            chainFor(character.level),
            gear,
            sheet,
            names
        ),
    ])
    return { singles, chain }
}

/** The stats the sanity gate weighs: those the long fight's EP counts. */
function sanityStats(weights: StatWeights): Stat[] {
    const long = weights.find((w) => w.fight_id === DEFAULT_FIGHT)
    return (long?.weights ?? [])
        .filter((w) => w.ep >= SANITY_MIN_EP)
        .map((w) => w.stat)
        .filter((stat) => STAT_STEPS.some((step) => step.stat === stat))
}

/**
 * Sims a character's worn gear and its max damage plan on every fight,
 * ranking the plan by `weights` (the results file's `stat_weights`), and
 * makes a results file, or stops. `onProgress` hears `(done, planned)`.
 */
export async function simCharacter(
    character: Character,
    weights: StatWeights,
    pool: SimPool,
    onProgress: (done: number, planned: number) => void
): Promise<SimOutcome> {
    const { spec, trees, stop } = await specCheck(character, pool)
    if (stop) return stop

    const level = character.level
    const fights = scenariosFor(level)
    const chain = chainFor(level)
    const longFight = fights.find((f) => f.fight_id === DEFAULT_FIGHT)!
    const sanity = sanityStats(weights)
    // The gates' sheet and sim, worn and the plan on every pull, the
    // sanity sims, the weapons and the plan's sheet.
    const everyPull = fights.length + chain.pulls
    pool.batch(2 + everyPull * 2 + sanity.length + WEAPON_SIMS + 1)
    const unsubscribe = pool.onProgress(onProgress)
    try {
        return await run()
    } finally {
        unsubscribe()
    }

    async function run(): Promise<SimOutcome> {
        const stormstrike = hasStormstrike(character)
        const improved = talentRank(
            character.talents,
            trees,
            'improvedStormstrike'
        )
        const settings = { seed: FIGHT_SEED, iterations: FIGHT_ITERATIONS }
        const sim = (request: RaidSimRequest) =>
            pool.sim(request, character.profile).then(dpsOf)

        // The gates before any numbers.
        const [l60Request, version, simmedSheet, db] = await Promise.all([
            pool.data('l60-test.in.json') as Promise<RaidSimRequest>,
            pool.data('version.json') as Promise<{ l60_expected_dps: number }>,
            pool.sheet(
                buildRequest(character, DEFAULT_FIGHT, settings),
                character.profile
            ),
            loadItemDb(pool),
        ])
        const l60Dps = await pool.sim(l60Request).then(dpsOf)
        const sheet = sheetFromSim(simmedSheet)
        const gates: Check[] = [
            level60Check(l60Dps, version.l60_expected_dps),
            ...sheetChecks(
                character.sheet,
                sheet,
                character.calibrated_spell_crit ?? false
            ),
            noSpellAboveLevelCheck(
                rotationSpells(character),
                level,
                simmedSheet.unreached_ranks
            ),
        ]
        const failedGates = gates.filter((c) => !c.passed)
        if (failedGates.length > 0)
            return { kind: 'gates', failed: failedGates }

        // Worn gear, the sanity sims and the weapons, all at once.
        const names = (id: number) => db.items.get(id)?.name
        const ep = epTable(weights)
        const weaponIds = weaponsToSim(character, db, ep)
        const [worn, raised, weaponDps] = await Promise.all([
            simAll(pool, character, character.gear, sheet, names),
            Promise.all(
                sanity.map((stat) => {
                    const step = STAT_STEPS.find((s) => s.stat === stat)!
                    const amount = step.amount * SANITY_SCALE
                    return sim(
                        buildRequest(character, longFight, {
                            ...settings,
                            bonusStats: bonusFor(stat, amount),
                        })
                    ).then((dps) => ({ stat, amount, dps }))
                })
            ),
            Promise.all(
                weaponIds.map((id) =>
                    sim(
                        buildRequest(character, longFight, {
                            ...settings,
                            gear: withMainHand(character.gear, db, id),
                        })
                    ).then((dps) => [id, dps] as const)
                )
            ),
        ])

        const single = (id: string) =>
            worn.singles.find((f) => f.result.fight_id === id)!
        const wornLong = single(DEFAULT_FIGHT).player.dps?.avg ?? 0
        const hit = fights.find((f) => f.being_hit)!
        const calm = fights.find((f) => !f.being_hit)!
        const sanityChecks: Check[] = [
            belowLevel60Check(wornLong, l60Dps),
            ...raised.map(({ stat, amount, dps }) =>
                dpsRisesCheck(stat, amount, wornLong, dps)
            ),
            stormstrikeRuleCheck({
                talented: stormstrike,
                improved: improved > 0,
                hitCasts: castsOf(
                    single(hit.fight_id).player,
                    STORMSTRIKE,
                    FIGHT_ITERATIONS
                ),
                hitMaxS: hit.duration_s + hit.variation_s,
                cooldownS: STORMSTRIKE_COOLDOWN_S,
                calmCasts: castsOf(
                    single(calm.fight_id).player,
                    STORMSTRIKE,
                    FIGHT_ITERATIONS
                ),
            }),
        ]
        const failedSanity = sanityChecks.filter((c) => !c.passed)
        if (failedSanity.length > 0)
            return { kind: 'gates', failed: failedSanity }

        // The max damage plan, then its sims (the worn ones when it's the same gear).
        const gains = new Map(
            weaponDps.map(([id, dps]) => [id, dps - wornLong])
        )
        const planned = planMaxDamage(character, db, ep, gains)
        let plan = worn
        if (!sameGear(planned.gear, character.gear)) {
            const planSheet = sheetFromSim(
                await pool.sheet(
                    buildRequest(character, DEFAULT_FIGHT, {
                        ...settings,
                        gear: planned.gear,
                    }),
                    character.profile
                )
            )
            plan = await simAll(pool, character, planned.gear, planSheet, names)
        }

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
            },
            sheet_buffed: false,
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
