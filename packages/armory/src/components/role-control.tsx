import { useState } from 'react'

import type { Mix, Plan, Role } from '../plans'
import { RoleShape } from './role-shape'
import { RoleSliders } from './role-sliders'
import { Segmented } from './segmented'

type RoleView = 'shape' | 'sliders'

/** Shape and Sliders: two presentations of one planner mix and picked plan. */
export function RoleControl({
    plans,
    mix,
    plan,
    inWornView,
    switched = false,
    onChange,
}: {
    plans: Plan[]
    mix: Mix
    plan: Plan | null
    inWornView: boolean
    switched?: boolean
    onChange: (role: Role, value: number) => void
}) {
    const [view, setView] = useState<RoleView>('shape')
    return (
        <section aria-labelledby="roles-heading">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 id="roles-heading" className="text-xl leading-tight">
                    Stat Priority
                </h2>
                <Segmented
                    legend="Role control"
                    hideLegend
                    options={[
                        { value: 'shape', label: 'Shape' },
                        { value: 'sliders', label: 'Sliders' },
                    ]}
                    value={view}
                    onChange={(next) => setView(next as RoleView)}
                />
            </div>
            {view === 'shape' ? (
                <RoleShape
                    plans={plans}
                    mix={mix}
                    plan={plan}
                    onChange={onChange}
                />
            ) : (
                <RoleSliders
                    plans={plans}
                    mix={mix}
                    plan={plan}
                    onChange={onChange}
                />
            )}
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
                        Switched the gear to the sim&apos;s plan for this mix.
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
