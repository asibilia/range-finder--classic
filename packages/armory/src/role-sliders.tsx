/**
 * The role sliders (spec section 10): damage, survival, healing and utility
 * pick the closest plan the sim already made. Nothing is re-simmed here.
 */
import { useId } from 'react'

import type { ResultsFile } from './results-file'

export type Plan = ResultsFile['plans'][number]
export type Mix = Plan['mix']
export type Role = keyof Mix

const ROLES: [Role, string][] = [
    ['damage', 'Damage'],
    ['survival', 'Survival'],
    ['healing', 'Healing'],
    ['utility', 'Utility'],
]

const NOT_SIMMED_YET = 'Not simmed yet'

/** A role is live when at least one plan has a mix above 0 for it. */
export function isLive(plans: Plan[], role: Role): boolean {
    return plans.some((plan) => plan.mix[role] > 0)
}

/**
 * The plan nearest the sliders in straight-line distance over the live
 * roles, the first in file order on a tie.
 */
export function closestPlan(plans: Plan[], mix: Mix): Plan | null {
    const live = ROLES.map(([role]) => role).filter((role) =>
        isLive(plans, role)
    )
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

function RoleSlider({
    label,
    value,
    live,
    onChange,
}: {
    label: string
    value: number
    live: boolean
    onChange: (value: number) => void
}) {
    const id = useId()
    return (
        <div className="role-slider">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={live ? value : 0}
                disabled={!live}
                aria-valuetext={live ? undefined : NOT_SIMMED_YET}
                onChange={(event) => onChange(Number(event.target.value))}
            />
            <span className="role-value">{live ? value : NOT_SIMMED_YET}</span>
        </div>
    )
}

export function RoleSliders({
    plans,
    mix,
    plan,
    onChange,
}: {
    plans: Plan[]
    mix: Mix
    plan: Plan | null
    onChange: (role: Role, value: number) => void
}) {
    return (
        <section className="role-sliders">
            <h2>What to gear for</h2>
            {ROLES.map(([role, label]) => (
                <RoleSlider
                    key={role}
                    label={label}
                    value={mix[role]}
                    live={isLive(plans, role)}
                    onChange={(value) => onChange(role, value)}
                />
            ))}
            {plan && <p>{`Closest ready-made plan: ${plan.label}.`}</p>}
            <p>
                These pick from plans the sim already made. Nothing is re-simmed
                here.
            </p>
            {plans.length === 1 && <p>This file has one plan.</p>}
        </section>
    )
}
