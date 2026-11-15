/**
 * The out-of-mana sentences that say in words what the fight and pull
 * charts draw (spec sections 9 and 10, and the three out-of-mana states:
 * a time, `never`, and null for not simmed).
 */
import { minutesSeconds } from './format'
import type { ResultsFile } from './results-file'

type Result = ResultsFile['results'][number]
type OutOfMana = Result['out_of_mana_s']

/**
 * What you wear and mana: `In what you wear you run out of mana at 0:48.`
 *
 * @param outOfMana - The result's `out_of_mana_s`.
 * @param kept - How a fight that never runs dry is said (`keep mana to the
 * end`, `keep mana through every pull`).
 * @param dryPull - On a chain fight, the pull it ran dry in, said in place of
 * the time.
 * @returns The sentence.
 */
export function wornManaWords(
    outOfMana: OutOfMana,
    kept: string,
    dryPull: number | null = null
): string {
    if (outOfMana === null)
        return "In what you wear the sim didn't check when mana runs out."
    if (outOfMana === 'never') return `In what you wear you ${kept}.`
    if (dryPull !== null)
        return `In what you wear you run dry in pull ${dryPull}.`
    return `In what you wear you run out of mana at ${minutesSeconds(outOfMana)}.`
}

/**
 * The sim's plan and mana, in the approved mockup's words: compared with
 * what you wear when both run out at a time (`The sim's plan holds out to
 * 0:57.`, `The sim's plan runs dry sooner, at 0:45.`, `The sim's plan runs
 * dry at the same time.`), else on its own (`The sim's plan runs out at
 * 0:57.`).
 *
 * @param outOfMana - The plan result's `out_of_mana_s`.
 * @param kept - How a fight that never runs dry is said (`keeps mana ...`).
 * @param dryPull - On a chain fight, the pull it ran dry in.
 * @param wornOutOfMana - What you wear's `out_of_mana_s`, to compare with.
 * @returns The sentence.
 */
export function planManaWords(
    outOfMana: OutOfMana,
    kept: string,
    dryPull: number | null = null,
    wornOutOfMana: OutOfMana = null
): string {
    if (outOfMana === null)
        return "The sim's plan wasn't checked for running out of mana."
    if (outOfMana === 'never') return `The sim's plan ${kept}.`
    if (dryPull !== null) return `The sim's plan runs dry in pull ${dryPull}.`
    const at = minutesSeconds(outOfMana)
    if (typeof wornOutOfMana !== 'number')
        return `The sim's plan runs out at ${at}.`
    const later = Math.floor(outOfMana) - Math.floor(wornOutOfMana)
    if (later > 0) return `The sim's plan holds out to ${at}.`
    if (later < 0) return `The sim's plan runs dry sooner, at ${at}.`
    return "The sim's plan runs dry at the same time."
}

/** What `dryPull` needs of a chain fight: its pull length and its setup. */
type ChainTiming = {
    duration_s: number
    setup?: { pulls: number; gap_s: number }
}

/**
 * The pull a chain fight runs dry in, from the result's `out_of_mana_s`
 * (wall time from the start of pull 1, gaps included). Pull k runs from
 * `(k - 1) * (duration_s + gap_s)` to that plus `duration_s`, both ends
 * included. A time in the gap after a pull is the next pull: you start it
 * with no mana. Its `mana_end` isn't read: after running dry the sim can
 * regain a little, so a dry pull can end at 28 mana, not 0.
 *
 * @param outOfMana - The result's `out_of_mana_s`.
 * @param fight - The chain fight: its `duration_s` and `setup`.
 * @returns The pull's number, or null when it never runs dry, isn't
 * simmed, the fight has no setup, or the time is past the last pull (the
 * sentences then say the time).
 *
 * @example
 * ```typescript
 * // Four 30 s pulls, 20 s apart: pull 3 is 100 to 130 s.
 * dryPull(118, { duration_s: 30, setup: { pulls: 4, gap_s: 20 } }) // 3
 * dryPull(40, { duration_s: 30, setup: { pulls: 4, gap_s: 20 } }) // 2
 * ```
 */
export function dryPull(
    outOfMana: OutOfMana,
    fight: ChainTiming
): number | null {
    if (typeof outOfMana !== 'number' || !fight.setup) return null
    const { pulls, gap_s } = fight.setup
    const period = fight.duration_s + gap_s
    if (period <= 0) return null
    const at = Math.max(0, outOfMana)
    const before = Math.floor(at / period)
    const pull =
        at - before * period <= fight.duration_s ? before + 1 : before + 2
    return pull <= pulls ? pull : null
}
