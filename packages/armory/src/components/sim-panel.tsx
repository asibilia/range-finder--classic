/**
 * The column on the right of the gear (below it under 90rem), as the
 * owner's design (layout v2) has it: Simulator Data (the readings) open on
 * top, then ONE glass card holding Stat Priority (the role sliders), the
 * fight settings and a light `Run Simulator` pill at its bottom right. The
 * talents pill sits on the character (`talents-pill.tsx`). Before a file
 * loads it shows the same column dimmed and inert, under `These unlock once
 * a character is loaded.`
 *
 * Run Simulator sims the export behind the file again with the fight
 * settings (the page's `onRunSimulator`). With no export (a results file
 * picked on its own, or a public build), the button is disabled and says
 * why: `Bring in your export to run the sim here.` While it runs, the
 * progress and Cancel take its place.
 */
import { type ReactNode, useId } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Plan } from '../plans'
import type { Result, ResultsFile } from '../results-file'
import { Readings } from './readings'

/** Under Run Simulator when there is no export to sim. */
export const NO_EXPORT_NOTE = 'Bring in your export to run the sim here.'

/** Shown, with the button disabled, while running the sim here isn't switched on yet. */
export const COMING_SOON_NOTE = 'Coming soon: running the sim here.'

/**
 * The card with a file loaded.
 *
 * @param file - The loaded results file.
 * @param fightId - The fight the band is on.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param planShown - The gear shows the plan (its readings are drawn large).
 * @param sliders - The role sliders (when the file has plans).
 * @param settings - The fight settings.
 * @param wornOf - What you wear's result on a fight (a bag item put on).
 * @param onRunSimulator - Runs the sim; absent when there is no export to
 * sim, and the button is disabled with a note.
 * @param running - The run's progress and Cancel, while it runs.
 * @param runProblem - Why the last run didn't replace the file, or null.
 * @param className - Where the page's grid places it.
 */
export function SimPanel({
    file,
    fightId,
    plan,
    planShown,
    sliders,
    settings,
    wornOf,
    onRunSimulator,
    runNote = NO_EXPORT_NOTE,
    running,
    runProblem,
    className,
}: {
    file: ResultsFile
    fightId: string
    plan: Plan | null
    planShown: boolean
    sliders?: ReactNode
    settings?: ReactNode
    wornOf?: (fightId: string) => Result | null
    onRunSimulator?: () => void
    /** The note beside the disabled button: why it can't run. */
    runNote?: string
    running?: ReactNode
    runProblem?: string | null
    className?: string
}) {
    const noExportId = useId()
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    return (
        <aside
            aria-label="The sim's numbers"
            data-slot="sim-panel"
            className={cn('flex min-w-0 flex-col gap-5', className)}
        >
            {fight && (
                <Readings
                    file={file}
                    fight={fight}
                    plan={plan}
                    planShown={planShown}
                    wornOf={wornOf}
                />
            )}
            <div
                data-slot="sim-card"
                className="glass flex flex-col gap-7 rounded-xl px-3.5 pt-4 pb-3.5"
            >
                {sliders}
                {settings}
                {runProblem && !running && (
                    <p role="alert" className="text-sm text-gain-text">
                        {runProblem}
                    </p>
                )}
                {running ?? (
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                        {!onRunSimulator && (
                            <p
                                id={noExportId}
                                className="text-[0.78125rem] text-muted-foreground"
                            >
                                {runNote}
                            </p>
                        )}
                        <Button
                            variant="pill"
                            className="h-auto px-4 py-1.5 text-base"
                            disabled={!onRunSimulator}
                            aria-describedby={
                                onRunSimulator ? undefined : noExportId
                            }
                            onClick={onRunSimulator}
                        >
                            Run Simulator
                        </Button>
                    </div>
                )}
            </div>
        </aside>
    )
}

const PLACEHOLDER_READINGS = [
    'Solo',
    'Dungeon',
    'Resource Empty',
    'Health',
    'Armor',
    'Lifespan',
]

const PLACEHOLDER_ROLES = ['Damage', 'Survival', 'Healing', 'Utility']

/**
 * The column before a file loads: dimmed and inert, showing where the
 * readings and the sliders will be. Only its first
 * line is read out; the rest is hidden from screen readers and can't be
 * focused.
 *
 * @param className - Where the page's grid places it.
 */
export function LockedSimPanel({ className }: { className?: string }) {
    return (
        <section
            aria-label="What unlocks with a character"
            data-slot="sim-panel"
            className={cn('flex min-w-0 flex-col gap-5', className)}
        >
            <p className="border-l-2 border-chart-2 py-0.5 pl-2.5 text-[0.84375rem]">
                These unlock once a character is loaded.
            </p>
            <div
                aria-hidden="true"
                inert
                data-slot="locked-body"
                className="flex flex-col gap-5 opacity-40 saturate-50 select-none"
            >
                <div>
                    <p className="mb-1.5 text-xl leading-tight">
                        Simulator Data
                    </p>
                    <div className="grid grid-cols-2 border-t min-[30rem]:grid-cols-3">
                        {PLACEHOLDER_READINGS.map((label) => (
                            <div
                                key={label}
                                className="border-b pt-2.5 pr-2 pb-2.25"
                            >
                                <span className="block min-h-7.75 text-[0.78125rem] text-muted-foreground">
                                    {label}
                                </span>
                                <span className="text-[1.625rem]">–</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="glass flex flex-col gap-3 rounded-xl px-3.5 pt-4 pb-3.5">
                    <p className="text-xl leading-tight">Stat Priority</p>
                    {PLACEHOLDER_ROLES.map((role) => (
                        <div key={role} className="flex flex-col gap-2">
                            <span className="text-sm">{role}</span>
                            <span className="relative h-2 rounded-full bg-muted">
                                <span className="absolute top-1/2 left-0 size-4.5 -translate-y-1/2 rounded-full border-3 border-background bg-foreground" />
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
