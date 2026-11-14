/**
 * The results file: one JSON file per character per sim run, made offline by
 * the gear sim's runner. This Zod schema is the contract's source of truth;
 * `results-file.schema.json` beside it is generated from it for the runner.
 */
import { z } from 'zod'

export const SLOTS = [
    'head',
    'neck',
    'shoulder',
    'back',
    'chest',
    'wrist',
    'hands',
    'waist',
    'legs',
    'feet',
    'finger_1',
    'finger_2',
    'trinket_1',
    'trinket_2',
    'main_hand',
    'off_hand',
    'relic',
] as const

export const STATS = [
    'strength',
    'agility',
    'stamina',
    'intellect',
    'spirit',
    'attack_power',
    'hit_rating',
    'crit_rating',
    'spell_damage',
    'mana_per_5',
    'weapon_dps',
] as const

export const SCHEMA_VERSION = 1

const slot = z.enum(SLOTS)
const stat = z.enum(STATS)
const datetime = z.iso.datetime({ offset: true })

const item = z.strictObject({
    item_id: z.int().positive(),
    name: z.string().min(1),
    quality: z.enum([
        'poor',
        'common',
        'uncommon',
        'rare',
        'epic',
        'legendary',
    ]),
    item_level: z.int().nullable(),
    required_level: z.int().min(1),
    source: z.strictObject({
        kind: z.enum([
            'drop',
            'crafted',
            'quest',
            'vendor',
            'reputation',
            'pvp',
            'unknown',
        ]),
        text: z.string(),
    }),
    data: z.enum(['forever', 'classic']),
})

const fight = z.strictObject({
    fight_id: z.string(),
    label: z.string(),
    kind: z.enum(['single', 'chain']),
    target_level: z.int(),
    duration_s: z.int(),
    setup: z
        .strictObject({
            starting_mana_pct: z.number(),
            being_hit: z.boolean(),
            pulls: z.int(),
            gap_s: z.number(),
            drinks: z.boolean(),
            target_armor: z.int(),
        })
        .optional(),
})

const roleValue = z.int().min(0).max(100)

const plan = z.strictObject({
    plan_id: z.string(),
    label: z.string(),
    mix: z.strictObject({
        damage: roleValue,
        survival: roleValue,
        healing: roleValue,
        utility: roleValue,
    }),
    gear: z.record(slot, z.int().nullable()),
})

const result = z.strictObject({
    gear: z.string(),
    fight_id: z.string(),
    dps: z.number(),
    health: z.int(),
    armor: z.int(),
    out_of_mana_s: z.number().nullable(),
    time_to_die_s: z.number().nullable(),
    timeline: z
        .array(
            z.strictObject({
                t_s: z.number(),
                dps: z.number(),
                mana: z.int(),
            })
        )
        .nullable(),
    pulls: z
        .array(
            z.strictObject({
                pull: z.int(),
                dps: z.number(),
                mana_start: z.int(),
                mana_end: z.int(),
            })
        )
        .nullable(),
    damage_split: z.array(
        z.strictObject({ name: z.string(), share_pct: z.number() })
    ),
})

const talent = z.strictObject({
    talent_id: z.int(),
    name: z.string(),
    tier: z.int(),
    column: z.int(),
    rank: z.int(),
    max_rank: z.int(),
})

const baseSchema = z.strictObject({
    schema_version: z.literal(SCHEMA_VERSION),
    made_at: datetime,
    export_saved_at: datetime,
    game_build: z.string(),
    sample: z.boolean(),
    provisional: z.boolean(),
    checks: z.array(
        z.strictObject({
            name: z.string(),
            passed: z.boolean(),
            detail: z.string(),
        })
    ),
    character: z.strictObject({
        name: z.string(),
        character_key: z.string().optional(),
        level: z.int(),
        race: z.string(),
        class: z.string(),
        spec: z.string(),
    }),
    sheet_buffed: z.boolean(),
    sheet: z.strictObject({
        strength: z.int(),
        agility: z.int(),
        stamina: z.int(),
        intellect: z.int(),
        spirit: z.int(),
        attack_power: z.int(),
        armor: z.int(),
        health: z.int(),
        mana: z.int(),
        melee_crit_pct: z.number(),
        spell_crit_pct: z.number(),
        dodge_pct: z.number(),
        melee_hit_pct: z.number(),
    }),
    fights: z.array(fight).min(1),
    default_fight_id: z.string(),
    slots: z.array(
        z.strictObject({
            slot,
            worn: item.nullable(),
            alternatives: z.array(
                z.strictObject({
                    item,
                    gain_ep: z.number().nullable(),
                    gain_dps: z.number().nullable(),
                })
            ),
        })
    ),
    bag_upgrades: z.array(z.strictObject({ slot, item, gain_ep: z.number() })),
    plans: z.array(plan),
    results: z.array(result),
    stat_weights: z.array(
        z.strictObject({
            fight_id: z.string(),
            weights: z.array(z.strictObject({ stat, ep: z.number() })),
        })
    ),
    talents: z.strictObject({
        tree: z.string(),
        points: z.int(),
        yours: z.array(talent),
        best: z
            .strictObject({
                ranks: z.array(
                    z.strictObject({ talent_id: z.int(), rank: z.int() })
                ),
                dps_gain: z.number(),
                fight_id: z.string(),
            })
            .nullable(),
    }),
    pawn: z.array(z.strictObject({ label: z.string(), text: z.string() })),
})

type Base = z.infer<typeof baseSchema>

const NO_FIGHT = 'This names no fight in this file.'

/** The rules that tie one part of the file to another. */
function checkCrossFields(file: Base, ctx: z.RefinementCtx): void {
    const problem = (path: PropertyKey[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message })

    const fights = new Map(file.fights.map((f) => [f.fight_id, f]))
    const planIds = new Set(file.plans.map((p) => p.plan_id))

    if (!fights.has(file.default_fight_id))
        problem(
            ['default_fight_id'],
            'default_fight_id names no fight in this file.'
        )

    file.fights.forEach((f, i) => {
        if (f.kind === 'chain' && f.setup === undefined)
            problem(['fights', i], 'A chain fight needs a setup.')
    })

    const seenSlots = new Set(file.slots.map((s) => s.slot))
    if (file.slots.length !== SLOTS.length || seenSlots.size !== SLOTS.length)
        problem(['slots'], 'Each slot must appear exactly once.')

    if (planIds.size !== file.plans.length)
        problem(['plans'], 'Each plan_id must be unique.')

    file.plans.forEach((p, i) => {
        for (const s of SLOTS) {
            const id = p.gear[s]
            if (id === null || id === undefined) continue
            const entry = file.slots.find((x) => x.slot === s)
            const allowed =
                entry !== undefined &&
                (entry.worn?.item_id === id ||
                    entry.alternatives.some((a) => a.item.item_id === id))
            if (!allowed)
                problem(
                    ['plans', i, 'gear', s],
                    'This item is neither worn in this slot nor one of its alternatives.'
                )
        }
    })

    const pairs = new Set<string>()
    let repeated = false
    file.results.forEach((r, i) => {
        const f = fights.get(r.fight_id)
        if (f === undefined) problem(['results', i, 'fight_id'], NO_FIGHT)
        if (r.gear !== 'worn' && !planIds.has(r.gear))
            problem(['results', i, 'gear'], 'This names no plan in this file.')
        if (f?.kind === 'chain' && r.timeline !== null)
            problem(
                ['results', i, 'timeline'],
                'Only a single fight has a timeline.'
            )
        if (f?.kind === 'single' && r.pulls !== null)
            problem(['results', i, 'pulls'], 'Only a chain fight has pulls.')
        const pair = JSON.stringify([r.gear, r.fight_id])
        if (pairs.has(pair)) repeated = true
        pairs.add(pair)
    })
    if (repeated)
        problem(
            ['results'],
            'Each gear and fight pair needs at most one result.'
        )
    const wornOnEvery = file.fights.every((f) =>
        file.results.some((r) => r.gear === 'worn' && r.fight_id === f.fight_id)
    )
    if (!wornOnEvery)
        problem(['results'], 'Every fight needs a result for worn gear.')

    file.stat_weights.forEach((w, i) => {
        if (!fights.has(w.fight_id))
            problem(['stat_weights', i, 'fight_id'], NO_FIGHT)
    })

    const best = file.talents.best
    if (best !== null) {
        if (!fights.has(best.fight_id))
            problem(['talents', 'best', 'fight_id'], NO_FIGHT)
        const yours = file.talents.yours.map((t) => t.talent_id)
        const ranked = best.ranks.map((r) => r.talent_id)
        const listsEachOnce =
            ranked.length === yours.length &&
            new Set(ranked).size === ranked.length &&
            yours.every((id) => ranked.includes(id))
        if (!listsEachOnce)
            problem(
                ['talents', 'best', 'ranks'],
                'best.ranks must list every talent in yours exactly once.'
            )
    }
}

export const resultsFileSchema = baseSchema.superRefine(checkCrossFields)

export type ResultsFile = z.infer<typeof resultsFileSchema>
export type Slot = (typeof SLOTS)[number]
export type Stat = (typeof STATS)[number]

export type ReadOutcome =
    | { ok: true; file: ResultsFile }
    | { ok: false; reason: 'version'; version: number }
    | { ok: false; reason: 'invalid'; problems: string[] }

/** Reads a parsed JSON value as a results file. */
export function readResultsFile(input: unknown): ReadOutcome {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
        const version = (input as Record<string, unknown>).schema_version
        if (typeof version === 'number' && version !== SCHEMA_VERSION)
            return { ok: false, reason: 'version', version }
    }
    const parsed = resultsFileSchema.safeParse(input)
    if (parsed.success) return { ok: true, file: parsed.data }
    return {
        ok: false,
        reason: 'invalid',
        problems: parsed.error.issues.map(
            (issue) =>
                `${issue.path.map(String).join('.') || '(file)'}: ${issue.message}`
        ),
    }
}

/** The JSON Schema text the runner validates against. */
export function resultsFileJsonSchema(): string {
    return JSON.stringify(z.toJSONSchema(resultsFileSchema), null, 2) + '\n'
}
