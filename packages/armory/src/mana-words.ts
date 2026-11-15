/**
 * The out-of-mana sentences that say in words what the fight and pull
 * charts draw (spec sections 9 and 10, and the three out-of-mana states:
 * a time, `never`, and null for not simmed).
 */
import { minutesSeconds } from './format'
import type { ResultsFile } from './results-file'

type Result = ResultsFile['results'][number]
type OutOfMana = Result['out_of_mana_s']
type Pull = NonNullable<Result['pulls']>[number]

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

/**
 * The first pull whose mana ends at 0.
 *
 * @param pulls - A chain result's pulls.
 * @returns Its number, or null when it never runs dry.
 */
export function dryPull(pulls: Pull[]): number | null {
    return pulls.find((pull) => pull.mana_end === 0)?.pull ?? null
}
