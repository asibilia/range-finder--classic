/**
 * What `weights.test.ts` and `weights.slow.test.ts` both use: the three
 * single fights a weights file holds, and a made-up weights file in the
 * spec's format.
 */

export type Json = Record<string, unknown>

/** The single fights every weights file holds, in order. */
export const FIGHTS = ['solo-hit-short', 'dungeon-short', 'dungeon-long']

/**
 * A made-up weights file in the spec's format, for the format tests: a
 * fresh copy each call, so a test can break it.
 *
 * @returns A Shaman Enhancement 30–34 file with three weights per fight.
 *
 * @example
 * ```typescript
 * const bad = validWeights()
 * bad.account = 'x' // readWeightsFile(bad) now names the extra key
 * ```
 */
export function validWeights(): Json {
    const weights = [
        { stat: 'strength', ep: 2, half: 0.1 },
        { stat: 'agility', ep: 0.94, half: 0.12 },
        { stat: 'attack_power', ep: 1, half: 0 },
    ]
    return {
        schema_version: 1,
        class: 'Shaman',
        spec: 'Enhancement',
        level_min: 30,
        level_max: 34,
        sim: {
            upstream_commit: '47205c966132ef52b5d12cef97dac6ebe017190c',
            patch_id: '0123456789ab',
        },
        made_at: '2026-11-16T10:00:00+01:00',
        reference: 'testchar-l30.json',
        fights: FIGHTS.map((fight_id) => ({
            fight_id,
            weights: structuredClone(weights),
        })),
    }
}
