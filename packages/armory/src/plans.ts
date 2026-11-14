/**
 * Which plan the page shows (spec sections 9 and 10): the default plan the
 * page opens on, and the plan closest to the role sliders. The page only
 * picks between plans the sim already made; nothing is re-simmed here.
 */
import type { ResultsFile } from './results-file'

export type Plan = ResultsFile['plans'][number]
export type Mix = Plan['mix']
export type Role = keyof Mix

/** The roles in the order the sliders show them. */
export const ROLES: readonly Role[] = [
    'damage',
    'survival',
    'healing',
    'utility',
]

/** The plan with the highest damage mix, the first in file order on a tie. */
export function defaultPlan(plans: Plan[]): Plan | null {
    let best: Plan | null = null
    for (const plan of plans)
        if (best === null || plan.mix.damage > best.mix.damage) best = plan
    return best
}

/** A role is live when at least one plan has a mix above 0 for it. */
export function isLive(plans: Plan[], role: Role): boolean {
    return plans.some((plan) => plan.mix[role] > 0)
}

/**
 * The plan nearest the sliders in straight-line distance over the live
 * roles, the first in file order on a tie.
 */
export function closestPlan(plans: Plan[], mix: Mix): Plan | null {
    const live = ROLES.filter((role) => isLive(plans, role))
    let best: Plan | null = null
    let bestDistance = Infinity
    for (const plan of plans) {
        const distance = Math.hypot(
            ...live.map((role) => mix[role] - plan.mix[role])
        )
        if (distance < bestDistance) {
            best = plan
            bestDistance = distance
        }
    }
    return best
}
