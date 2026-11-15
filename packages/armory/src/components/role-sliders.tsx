/**
 * What to gear for (spec section 10): damage, survival, healing and utility
 * sliders (shadcn's Slider on Base UI) that pick the closest plan the sim
 * already made. Nothing is re-simmed here. A role no plan has is disabled
 * and reads `Not simmed yet`.
 */
import { useId } from 'react'

import { Slider } from '@/components/ui/slider'

import { isLive, type Mix, type Plan, type Role, ROLES } from '../plans'

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
    const labelId = useId()
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
                <span id={labelId}>{label}</span>
                <span className="text-muted-foreground tabular-nums">
                    {live ? value : NOT_SIMMED_YET}
                </span>
            </div>
            <Slider
                value={[live ? value : 0]}
                min={0}
                max={100}
                step={1}
                disabled={!live}
                onValueChange={(next) => {
                    const [first] = Array.isArray(next) ? next : [next]
                    if (typeof first === 'number') onChange(first)
                }}
                thumbProps={{
                    'aria-labelledby': labelId,
                    getAriaValueText: live ? undefined : () => NOT_SIMMED_YET,
                }}
            />
        </div>
    )
}

/**
 * The sliders.
 *
 * @param plans - The file's plans (at least one).
 * @param mix - Where the sliders sit.
 * @param plan - The plan they pick.
 * @param inWornView - On what you wear, the page says moving a role switches.
 * @param onChange - A role moved to a value.
 */
export function RoleSliders({
    plans,
    mix,
    plan,
    inWornView,
    onChange,
}: {
    plans: Plan[]
    mix: Mix
    plan: Plan | null
    inWornView: boolean
    onChange: (role: Role, value: number) => void
}) {
    return (
        <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">What to gear for</h2>
            {ROLES.map((role) => (
                <RoleSlider
                    key={role}
                    label={ROLE_LABELS[role]}
                    value={mix[role]}
                    live={isLive(plans, role)}
                    onChange={(value) => onChange(role, value)}
                />
            ))}
            <div className="flex flex-col gap-1 text-sm">
                {plan && (
                    <p className="border-l-2 border-chart-1 pl-2.5">{`Closest ready-made plan: ${plan.label}.`}</p>
                )}
                <p className="text-muted-foreground">
                    These pick from plans the sim already made. Nothing is
                    re-simmed here.
                </p>
                {plans.length === 1 && (
                    <p className="text-muted-foreground">
                        This file has one plan.
                    </p>
                )}
                {inWornView && (
                    <p className="text-muted-foreground">
                        Moving a role switches the gear to the sim&apos;s plan.
                    </p>
                )}
            </div>
        </section>
    )
}
