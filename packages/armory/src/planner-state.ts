/**
 * What the page shows for a loaded results file, as plain state and pure
 * actions: which fight the card is on, where the role sliders sit (and so
 * which plan is shown), and whether the gear shows what you wear or the
 * plan. Components only render this state and dispatch actions, so anything
 * outside them (a test, a script, an agent) can drive the page the same way:
 * `applyPlannerAction(file, state, { type: 'pick-fight', fight_id: ... })`.
 *
 * Nothing here re-sims anything: the sliders only pick between the plans
 * the file already has (spec section 10).
 */
import { z } from 'zod'

import { closestPlan, defaultPlan, isLive, type Mix, type Plan } from './plans'
import type { Result, ResultsFile } from './results-file'

/** `worn` shows what you wear; `plan` shows the plan the sliders picked. */
export type View = 'worn' | 'plan'

/** The page's state for one loaded file. */
export type PlannerState = {
    /** The fight the card shows. */
    fightId: string
    /** Where the role sliders sit; null when the file has no plans. */
    mix: Mix | null
    view: View
    /** True after a slider move switched the view to the plan. */
    switched: boolean
    /**
     * The bag upgrade put on with Wear them (its item_id), or null. What you
     * wear then shows that item in its slot and the bag upgrade's results.
     */
    bagWorn: number | null
}

const SLIDER_VALUE = z.number().int().min(0).max(100)

/**
 * An action, as anything outside the page would send it (snake_case keys,
 * like the results file). Unknown actions and values out of range are
 * refused by `applyPlannerAction`.
 */
export const plannerActionSchema = z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('set-sliders'),
        mix: z.strictObject({
            damage: SLIDER_VALUE.optional(),
            survival: SLIDER_VALUE.optional(),
            healing: SLIDER_VALUE.optional(),
            utility: SLIDER_VALUE.optional(),
        }),
    }),
    z.strictObject({ type: z.literal('pick-plan'), plan_id: z.string() }),
    z.strictObject({ type: z.literal('pick-fight'), fight_id: z.string() }),
    z.strictObject({ type: z.literal('show-plan') }),
    z.strictObject({ type: z.literal('show-worn') }),
    z.strictObject({ type: z.literal('wear-bag-item'), item_id: z.int() }),
    z.strictObject({ type: z.literal('undo-bag-item') }),
])

/** One of the actions `plannerActionSchema` accepts. */
export type PlannerAction = z.infer<typeof plannerActionSchema>

/**
 * The state a freshly loaded file opens on: the file's default fight, the
 * sliders at the default plan's mix, and what you wear.
 *
 * @param file - The loaded results file.
 * @returns The opening state.
 */
export function initialPlannerState(file: ResultsFile): PlannerState {
    return {
        fightId: file.default_fight_id,
        mix: defaultPlan(file.plans)?.mix ?? null,
        view: 'worn',
        switched: false,
        bagWorn: null,
    }
}

/**
 * Moves the role sliders. Roles no plan has (not live) stay at 0; the
 * others keep the values set, but no further than the reach of the plan
 * the sliders pick now (`plans[].reach`, when the file has it), as the
 * mockup's sliders stop at "Can reach N with this mix". On the worn view
 * this switches to the plan and says so (`switched`).
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param mix - The roles to move and their new values, 0 to 100.
 * @returns The new state, or `state` when the file has no plans.
 *
 * @example
 * setSliders(file, state, { survival: 80 }) // picks Damage and survival
 */
export function setSliders(
    file: ResultsFile,
    state: PlannerState,
    mix: Partial<Mix>
): PlannerState {
    if (state.mix === null) return state
    const next: Mix = { ...state.mix }
    const reach = closestPlan(file.plans, state.mix)?.reach ?? null
    for (const [role, value] of Object.entries(mix) as [keyof Mix, number][])
        if (isLive(file.plans, role))
            next[role] = reach ? Math.min(value, reach[role]) : value
    return {
        ...state,
        mix: next,
        view: 'plan',
        switched: state.view === 'worn' ? true : state.switched,
    }
}

/**
 * Shows one of the file's plans: the sliders jump to its mix and the gear
 * shows it.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param planId - A `plan_id` from the file.
 * @returns The new state, or `state` for a plan the file doesn't have.
 */
export function pickPlan(
    file: ResultsFile,
    state: PlannerState,
    planId: string
): PlannerState {
    const plan = file.plans.find((candidate) => candidate.plan_id === planId)
    if (!plan) return state
    return { ...state, mix: { ...plan.mix }, view: 'plan', switched: false }
}

/**
 * Puts the card on another fight.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param fightId - A `fight_id` from the file.
 * @returns The new state, or `state` for a fight the file doesn't have.
 */
export function pickFight(
    file: ResultsFile,
    state: PlannerState,
    fightId: string
): PlannerState {
    if (!file.fights.some((fight) => fight.fight_id === fightId)) return state
    return { ...state, fightId }
}

/**
 * Switches the gear between what you wear and the plan. Back to what you
 * wear also drops the "switched" line.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param view - The view to show.
 * @returns The new state; a file with no plans stays on what you wear.
 */
export function showView(
    file: ResultsFile,
    state: PlannerState,
    view: View
): PlannerState {
    if (view === 'plan' && file.plans.length === 0) return state
    return {
        ...state,
        view,
        switched: view === 'worn' ? false : state.switched,
    }
}

/**
 * Puts a bag upgrade on (Wear them), or takes it off again (Undo). Only a
 * bag upgrade with results can be worn: the page has no numbers for it
 * otherwise.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param itemId - The bag upgrade's item_id, or null to take it off.
 * @returns The new state, or `state` for an item that can't be worn.
 */
export function wearBagItem(
    file: ResultsFile,
    state: PlannerState,
    itemId: number | null
): PlannerState {
    if (itemId === null) return { ...state, bagWorn: null }
    const upgrade = file.bag_upgrades.find(
        (candidate) => candidate.item.item_id === itemId
    )
    if (!upgrade?.results) return state
    return { ...state, bagWorn: itemId }
}

/**
 * Applies one action. The reducer the page runs on.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param action - The action.
 * @returns The new state.
 */
export function plannerReducer(
    file: ResultsFile,
    state: PlannerState,
    action: PlannerAction
): PlannerState {
    switch (action.type) {
        case 'set-sliders':
            return setSliders(file, state, action.mix)
        case 'pick-plan':
            return pickPlan(file, state, action.plan_id)
        case 'pick-fight':
            return pickFight(file, state, action.fight_id)
        case 'show-plan':
            return showView(file, state, 'plan')
        case 'show-worn':
            return showView(file, state, 'worn')
        case 'wear-bag-item':
            return wearBagItem(file, state, action.item_id)
        case 'undo-bag-item':
            return wearBagItem(file, state, null)
    }
}

/**
 * Checks an action from outside the page, then applies it.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @param input - The action, unchecked.
 * @returns The new state, or the reasons the action was refused.
 *
 * @example
 * applyPlannerAction(file, state, { type: 'pick-fight', fight_id: 'dungeon-long' })
 * // { ok: true, state: { fightId: 'dungeon-long', ... } }
 */
export function applyPlannerAction(
    file: ResultsFile,
    state: PlannerState,
    input: unknown
): { ok: true; state: PlannerState } | { ok: false; problems: string[] } {
    const parsed = plannerActionSchema.safeParse(input)
    if (!parsed.success)
        return {
            ok: false,
            problems: parsed.error.issues.map(
                (issue) =>
                    `${issue.path.join('.') || '(action)'}: ${issue.message}`
            ),
        }
    return { ok: true, state: plannerReducer(file, state, parsed.data) }
}

/**
 * The plan the sliders pick (the closest one), whichever view is shown.
 *
 * @param file - The loaded results file.
 * @param state - The current state.
 * @returns The plan, or null when the file has none.
 */
export function pickedPlan(
    file: ResultsFile,
    state: PlannerState
): Plan | null {
    return state.mix ? closestPlan(file.plans, state.mix) : null
}

/**
 * What you wear's result on a fight, with the worn bag upgrade (if any) put
 * on: the bag upgrade's result for that fight, else worn's. With a bag item
 * on and no result for the fight, null (not simmed).
 *
 * @param file - The loaded results file.
 * @param state - The current state (its `bagWorn`).
 * @param fightId - The fight.
 * @returns The result, shaped like `results` (gear `worn`), or null.
 */
export function wornResult(
    file: ResultsFile,
    state: Pick<PlannerState, 'bagWorn'>,
    fightId: string
): Result | null {
    if (state.bagWorn !== null) {
        const upgrade = file.bag_upgrades.find(
            (candidate) => candidate.item.item_id === state.bagWorn
        )
        const found = upgrade?.results?.find(
            (result) => result.fight_id === fightId
        )
        return found ? { gear: 'worn', ...found } : null
    }
    return (
        file.results.find(
            (result) => result.gear === 'worn' && result.fight_id === fightId
        ) ?? null
    )
}
