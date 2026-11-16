/**
 * A precomputed stat weights file: one per class, spec and level band,
 * written by `bun run sim:weights` to `packages/sim/weights/` and read by the
 * pool's `weights()`. Every object is strict.
 */
import { z } from 'zod'

/**
 * The weighed stats, by the results file's names. The sim keeps its own
 * copy: the armory depends on the sim, not the other way round.
 */
export const WEIGHT_STATS = [
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

/** The fights a weights file holds, in order: the three single fights. */
export const WEIGHT_FIGHTS = [
    'solo-hit-short',
    'dungeon-short',
    'dungeon-long',
] as const

export const WEIGHTS_SCHEMA_VERSION = 1

const level = z.int().min(1).max(60)

export const weightsFileSchema = z
    .strictObject({
        schema_version: z.literal(WEIGHTS_SCHEMA_VERSION),
        class: z.string().min(1),
        spec: z.string().min(1),
        level_min: level,
        level_max: level,
        sim: z.strictObject({
            upstream_commit: z.string().regex(/^[0-9a-f]{40}$/),
            patch_id: z.string().regex(/^[0-9a-f]{12}$/),
        }),
        made_at: z.iso.datetime({ offset: true }),
        reference: z.string().min(1),
        fights: z.array(
            z.strictObject({
                fight_id: z.enum(WEIGHT_FIGHTS),
                weights: z.array(
                    z.strictObject({
                        stat: z.enum(WEIGHT_STATS),
                        ep: z.number(),
                        half: z.number().min(0),
                    })
                ),
            })
        ),
    })
    .superRefine((file, ctx) => {
        if (file.level_min > file.level_max)
            ctx.addIssue({
                code: 'custom',
                path: ['level_min'],
                message: 'level_min must be at most level_max.',
            })
        const ids = file.fights.map((f) => f.fight_id)
        if (
            ids.length !== WEIGHT_FIGHTS.length ||
            WEIGHT_FIGHTS.some((id) => !ids.includes(id))
        )
            ctx.addIssue({
                code: 'custom',
                path: ['fights'],
                message: `fights must hold exactly ${WEIGHT_FIGHTS.join(', ')}.`,
            })
        file.fights.forEach((fight, i) => {
            const stats = fight.weights.map((w) => w.stat)
            if (new Set(stats).size !== stats.length)
                ctx.addIssue({
                    code: 'custom',
                    path: ['fights', i, 'weights'],
                    message: 'Each stat must appear at most once.',
                })
        })
    })

export type WeightsFile = z.infer<typeof weightsFileSchema>
export type WeightStat = (typeof WEIGHT_STATS)[number]

export type WeightsOutcome =
    { ok: true; file: WeightsFile } | { ok: false; problems: string[] }

/** Reads a parsed JSON value as a weights file. */
export function readWeightsFile(input: unknown): WeightsOutcome {
    const parsed = weightsFileSchema.safeParse(input)
    if (parsed.success) return { ok: true, file: parsed.data }
    return {
        ok: false,
        problems: parsed.error.issues.map(
            (issue) =>
                `${issue.path.map(String).join('.') || '(file)'}: ${issue.message}`
        ),
    }
}

/** A weights file's name: `<class>-<spec>-<min>-<max>.json`, lower case. */
export function weightsFileName(
    className: string,
    spec: string,
    levelMin: number,
    levelMax: number
): string {
    return `${[className, spec, levelMin, levelMax].join('-').toLowerCase()}.json`
}
