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
    data: z.enum(['forever', 'classic']).meta({
        description:
            "classic: the item's stats and source may predate Forever.",
    }),
})

const fight = z.strictObject({
    fight_id: z.string().meta({
        description:
            'A sim fight type. A real logged fight is an engagement_id, which only the engagement-score file has.',
    }),
    label: z.string(),
    kind: z.enum(['single', 'chain']),
    target_level: z.int(),
    duration_s: z.int().meta({
        description:
            'The fight length in seconds. On a chain fight, the length of one pull.',
    }),
    setup: z
        .strictObject({
            starting_mana_pct: z.number(),
            being_hit: z.boolean(),
            pulls: z.int(),
            gap_s: z.number(),
            drinks: z.boolean(),
            target_armor: z.int(),
        })
        .optional()
        .meta({
            description:
                'Required on a chain fight; may be absent on a single fight.',
        }),
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
    gear: z.record(slot, z.int().nullable()).meta({
        description:
            "An item_id for each of the 17 slots: the slot's worn item or one of its alternatives. Null: the plan puts nothing in that slot.",
    }),
})

const result = z.strictObject({
    gear: z.string().meta({
        description: 'worn, or a plan_id in plans.',
    }),
    fight_id: z.string(),
    dps: z.number(),
    health: z.int(),
    armor: z.int(),
    /*
     * Three values, as null means everywhere in this file:
     * - a number: seconds to the first out of mana (the sim's tto);
     * - "never": simmed, and it never ran dry in this fight;
     * - null: not simmed.
     */
    out_of_mana_s: z.union([z.number(), z.literal('never'), z.null()]).meta({
        description:
            'Seconds to the first out of mana (the sim\'s tto); on a chain fight, wall time from the start of the first pull, gaps included. "never": simmed, and it never runs dry in this fight. Null: not simmed.',
    }),
    time_to_die_s: z.number().nullable().meta({
        description: 'Seconds to die. Null: not simmed.',
    }),
    timeline: z
        .array(
            z.strictObject({
                t_s: z.number(),
                dps: z.number(),
                mana: z.int(),
            })
        )
        .nullable()
        .meta({
            description:
                'DPS and mana over the fight. Single fights only: null on a chain fight. Null on a single fight: no timeline in this file.',
        }),
    pulls: z
        .array(
            z.strictObject({
                pull: z.int(),
                dps: z.number(),
                mana_start: z.int(),
                mana_end: z.int(),
            })
        )
        .nullable()
        .meta({
            description:
                'DPS and mana per pull. Chain fights only: null on a single fight. A pull runs dry when its mana_end is 0. Null on a chain fight: no pull data in this file.',
        }),
    damage_split: z.array(
        z.strictObject({ name: z.string(), share_pct: z.number() })
    ),
})

/*
 * Talent limits. Forever's real trees (WoWSims' talent data, nine class
 * files) have at most 7 tiers, 4 columns and a max rank of 5. These bounds
 * leave room above that (tier 1 to 9, column 1 to 6, max rank 1 to 10) and
 * keep the talents grid, which is tiers by columns, small. A rank runs from 0
 * to its max_rank, which the cross-field rules check.
 */
const MAX_TIER = 9
const MAX_COLUMN = 6
const MAX_RANK = 10

const talent = z.strictObject({
    talent_id: z.int(),
    name: z.string(),
    tier: z.int().min(1).max(MAX_TIER),
    column: z.int().min(1).max(MAX_COLUMN),
    rank: z.int().min(0).max(MAX_RANK).meta({
        description: '0 to max_rank.',
    }),
    max_rank: z.int().min(1).max(MAX_RANK),
})

const baseSchema = z.strictObject({
    schema_version: z.literal(SCHEMA_VERSION),
    made_at: datetime.meta({
        description: 'When the runner wrote this file.',
    }),
    export_saved_at: datetime.meta({
        description: 'When the export this file came from was saved.',
    }),
    game_build: z.string(),
    sample: z.boolean().meta({
        description: 'true: a hand-made file; some numbers in it are made up.',
    }),
    provisional: z.boolean().meta({
        description: "true: the sim isn't matched to real fights yet.",
    }),
    checks: z.array(
        z.strictObject({
            name: z.string(),
            passed: z.boolean(),
            detail: z.string(),
        })
    ),
    character: z.strictObject({
        name: z.string().meta({
            description:
                'For display only: never a key, and never in a file name or path.',
        }),
        character_key: z.string().optional().meta({
            description:
                'A random id the export addon mints once per character (export format 7). It joins this file with the engagement-score file.',
        }),
        level: z.int(),
        race: z.string(),
        class: z.string(),
        spec: z.string(),
    }),
    sheet_buffed: z.boolean().meta({
        description:
            "true: the game's sheet as it showed at export, with the buffs that were up.",
    }),
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
    default_fight_id: z.string().meta({
        description: 'The fight the page opens on: one of fights.',
    }),
    slots: z
        .array(
            z.strictObject({
                slot,
                worn: item.nullable().meta({
                    description: 'Null: nothing equipped in this slot.',
                }),
                alternatives: z
                    .array(
                        z.strictObject({
                            item,
                            gain_ep: z.number().nullable().meta({
                                description: 'EP gained over what is worn.',
                            }),
                            gain_dps: z.number().nullable().meta({
                                description:
                                    'DPS gained over what is worn, for weapons. When not null, the page shows it in place of gain_ep.',
                            }),
                        })
                    )
                    .meta({
                        description:
                            "Best first, which this schema doesn't check: the page shows the first as the slot's best upgrade.",
                    }),
            })
        )
        .meta({
            description: 'One entry per slot, each slot exactly once.',
        }),
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
        yours: z.array(talent).meta({
            description:
                "Every talent in the tree, at rank 0 or more, which this schema doesn't check.",
        }),
        best: z
            .strictObject({
                ranks: z.array(
                    z.strictObject({
                        talent_id: z.int(),
                        rank: z.int().min(0).max(MAX_RANK),
                    })
                ),
                dps_gain: z.number(),
                fight_id: z.string(),
            })
            .nullable()
            .meta({
                description:
                    'The best build the sim found: a rank for every talent in yours, and its DPS gain in the fight fight_id. Null: no best build in this file.',
            }),
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

    const cells = new Set<string>()
    let sharedCell = false
    file.talents.yours.forEach((t, i) => {
        if (t.rank > t.max_rank)
            problem(
                ['talents', 'yours', i, 'rank'],
                "A talent's rank can't be above its max_rank."
            )
        const cell = `${t.tier}:${t.column}`
        if (cells.has(cell)) sharedCell = true
        cells.add(cell)
    })
    if (sharedCell)
        problem(
            ['talents', 'yours'],
            "Two talents can't share a tier and column."
        )

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

/** The note for the runner: the rules the JSON Schema can't carry. */
const FILE_DESCRIPTION = [
    'One file per character per sim run, written by the gear sim and read by the armory planner. Keys are snake_case, and every object is strict.',
    "The page also checks these rules, which this JSON Schema can't express, so a file that passes it can still be refused:",
    '- default_fight_id names a fight in fights.',
    '- Every fight_id in results, stat_weights and talents.best names a fight in fights.',
    '- Every gear in results is worn or a plan_id in plans.',
    "- Every item_id in a plan's gear is that slot's worn item or one of its alternatives.",
    '- slots has each slot exactly once.',
    '- Every fight has a result for worn gear.',
    '- Each plan_id is unique.',
    '- No two results share a gear and fight.',
    '- talents.best.ranks lists every talent in talents.yours exactly once, by talent_id.',
    "- A talent's rank is at most its max_rank.",
    '- No two talents in talents.yours share a tier and column.',
    '- A chain fight has a setup.',
    "- timeline is null on a chain fight's results.",
    "- pulls is null on a single fight's results.",
    'The runner must also keep these, which nothing checks:',
    "- Each slot's alternatives come best first: the page shows the first as the slot's best upgrade.",
    '- talents.yours lists every talent in the tree, at rank 0 or more.',
].join('\n')

export const resultsFileSchema = baseSchema
    .superRefine(checkCrossFields)
    .meta({ title: 'Results file', description: FILE_DESCRIPTION })

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
    // Zod puts the title and description last; a reader meets them first.
    const { $schema, title, description, ...rest } =
        z.toJSONSchema(resultsFileSchema)
    return (
        JSON.stringify({ $schema, title, description, ...rest }, null, 2) + '\n'
    )
}
