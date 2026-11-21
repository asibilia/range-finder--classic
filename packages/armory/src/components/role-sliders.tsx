/**
 * Stat Priority (spec section 10; spec #109 renamed it), as the mockup's sliders show it:
 * damage, survival, healing and utility (shadcn's Slider on Base UI) that
 * pick the closest plan the sim already made. Nothing is re-simmed here.
 * When the picked plan has a reach (`plans[].reach`) each slider says how
 * far it can go (`Can reach 35 with this mix`, `No limit with this mix`)
 * and the track past it is hatched. A role no plan has is disabled and
 * reads `Not simmed yet`. `RoleControl` shares the picked-plan, gear-switch
 * and nothing-re-simmed lines with the Shape view.
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
    reach,
    onChange,
}: {
    label: string
    value: number
    live: boolean
    reach: number | null
    onChange: (value: number) => void
}) {
    const labelId = useId()
    const capId = useId()
    const valueText = live
        ? reach === null
            ? String(value)
            : `${value}, can reach up to ${reach}`
        : NOT_SIMMED_YET
    return (
        <div>
            <div className="flex justify-between gap-2 text-sm">
                <span id={labelId}>{label}</span>
                <span className="tabular-nums">
                    {live ? value : NOT_SIMMED_YET}
                </span>
            </div>
            <Slider
                className="mt-2 px-2.25 py-1.25"
                value={[live ? value : 0]}
                min={0}
                max={100}
                step={1}
                disabled={!live}
                reach={reach ?? undefined}
                onValueChange={(next) => {
                    const [first] = Array.isArray(next) ? next : [next]
                    if (typeof first === 'number') onChange(first)
                }}
                thumbProps={{
                    'aria-labelledby': labelId,
                    'aria-describedby': reach === null ? undefined : capId,
                    getAriaValueText: () => valueText,
                }}
            />
            {reach !== null && (
                <p id={capId} className="mt-px text-xs text-muted-foreground">
                    {reach >= 100 ? (
                        'No limit with this mix'
                    ) : (
                        <>
                            Can reach{' '}
                            <b className="font-normal text-foreground">
                                {reach}
                            </b>{' '}
                            with this mix
                        </>
                    )}
                </p>
            )}
        </div>
    )
}

/** The slider view of the planner's role mix. */
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
    const reach = plan?.reach ?? null
    return (
        <div>
            {reach && (
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                    Raising one role lowers how far the others can go. The
                    hatched part is out of reach with this mix.
                </p>
            )}
            <div className="mt-2 flex flex-col gap-3.5">
                {ROLES.map((role) => (
                    <RoleSlider
                        key={role}
                        label={ROLE_LABELS[role]}
                        value={mix[role]}
                        live={isLive(plans, role)}
                        reach={reach ? reach[role] : null}
                        onChange={(value) => onChange(role, value)}
                    />
                ))}
            </div>
        </div>
    )
}
