/**
 * What to gear for (spec section 10), as the mockup's sliders show it:
 * damage, survival, healing and utility (shadcn's Slider on Base UI) that
 * pick the closest plan the sim already made. Nothing is re-simmed here.
 * When the picked plan has a reach (`plans[].reach`) each slider says how
 * far it can go (`Can reach 35 with this mix`, `No limit with this mix`)
 * and the track past it is hatched. A role no plan has is disabled and
 * reads `Not simmed yet`. Under them: which plan the mix picks, what moving
 * a role does (or that it switched the gear), and that nothing is re-simmed.
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
                className="mt-1 px-2.25 py-1.25"
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

/**
 * The sliders.
 *
 * @param plans - The file's plans (at least one).
 * @param mix - Where the sliders sit.
 * @param plan - The plan they pick.
 * @param inWornView - On what you wear, the page says moving a role switches.
 * @param switched - A slider move switched the gear to the plan: says so,
 * with `Show what I wear`.
 * @param onChange - A role moved to a value.
 * @param onShowWorn - Back to what you wear.
 */
export function RoleSliders({
    plans,
    mix,
    plan,
    inWornView,
    switched = false,
    onChange,
    onShowWorn = () => {},
}: {
    plans: Plan[]
    mix: Mix
    plan: Plan | null
    inWornView: boolean
    switched?: boolean
    onChange: (role: Role, value: number) => void
    onShowWorn?: () => void
}) {
    const reach = plan?.reach ?? null
    return (
        <section aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="mb-1 text-xl leading-tight">
                What to gear for
            </h2>
            {reach && (
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                    Raising one role lowers how far the others can go. The
                    hatched part is out of reach with this mix.
                </p>
            )}
            <div className="mt-2 flex flex-col gap-3">
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
            {plan && (
                <p
                    aria-live="polite"
                    className="mt-3 border-l-2 border-chart-1 py-0.5 pl-2.5 text-[0.84375rem] text-muted-foreground"
                >
                    Your mix picks the{' '}
                    <b className="font-bold text-foreground">
                        {plan.label.toLowerCase()}
                    </b>{' '}
                    set.
                </p>
            )}
            <p
                aria-live="polite"
                className="mt-2 min-h-4.75 text-[0.8125rem] text-muted-foreground"
            >
                {inWornView ? (
                    "Moving a role switches the gear to the sim's plan."
                ) : switched ? (
                    <span className="text-foreground">
                        Switched the gear to the sim&apos;s plan for this mix.{' '}
                        <button
                            type="button"
                            className="text-[0.8125rem] text-muted-foreground underline underline-offset-3 hover:text-foreground"
                            onClick={onShowWorn}
                        >
                            Show what I wear
                        </button>
                    </span>
                ) : null}
            </p>
            <p className="mt-1 text-[0.78125rem] text-muted-foreground">
                These pick from plans the sim already made. Nothing is re-simmed
                here.
                {plans.length === 1 && ' This file has one plan.'}
            </p>
        </section>
    )
}
