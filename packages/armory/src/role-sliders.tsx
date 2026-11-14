/**
 * The role sliders (spec section 10): damage, survival, healing and utility
 * pick the closest plan the sim already made. Nothing is re-simmed here.
 */
import { useId } from 'react'

import { isLive, type Mix, type Plan, type Role, ROLES } from './plans'

const ROLE_LABELS: Record<Role, string> = {
    damage: 'Damage',
    survival: 'Survival',
    healing: 'Healing',
    utility: 'Utility',
}

const NOT_SIMMED_YET = 'Not simmed yet'

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
            {ROLES.map((role) => (
                <RoleSlider
                    key={role}
                    label={ROLE_LABELS[role]}
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
