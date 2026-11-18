/**
 * The band under the gear card, as the owner's design (layout v2) lays it
 * out: two columns under the gear card only, with the right column of the
 * page (Simulator Data and its card) alongside. Left, across the fight (the
 * fight or pull chart with its sentences); right, where the damage comes
 * from, then what a point of each stat is worth. One column on a phone.
 * The fight settings that pick its fight are in the card under Simulator
 * Data (`fight-settings-form.tsx`).
 */
import { type ReactNode, useId } from 'react'

import { cn } from '@/lib/utils'

import { fightWords } from '../chart-data'
import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'
import { DamageSplit } from './damage-split'
import { FightChart } from './fight-chart'
import { PullChart } from './pull-chart'
import { dpsFights, Provisional } from './readings'
import { StatWeights } from './stat-weights'

type Result = ResultsFile['results'][number]

/** What the band's Provisional marker says. */
const BAND_PROVISIONAL_TEXT =
    'Sim numbers are estimates until matched to real fights.'

/**
 * The band.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param fightId - The fight the band is on.
 * @param wornOf - What you wear's result on a fight (with a bag item put
 * on, its results); the file's worn results by default.
 * @param weightsAction - Shown under the stat weights (Refine), or nothing.
 * @param className - Where the page's grid places it.
 */
export function FightBand({
    file,
    plan,
    fightId,
    wornOf,
    weightsAction,
    className,
}: {
    file: ResultsFile
    plan: Plan | null
    fightId: string
    wornOf?: (fightId: string) => Result | null
    weightsAction?: ReactNode
    className?: string
}) {
    const headingId = useId()
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    if (!fight) return null
    const resultFor = (gear: string, id: string) =>
        file.results.find(
            (result) => result.gear === gear && result.fight_id === id
        ) ?? null
    const wornResult = wornOf ?? ((id: string) => resultFor('worn', id))
    const worn = wornResult(fight.fight_id)
    const planResult = plan ? resultFor(plan.plan_id, fight.fight_id) : null
    const planLabel = plan?.label ?? null
    // The split and the solid stat bars are for the short fight the
    // readings lead with (solo in the sample), as the mockup keeps them;
    // the dashed bars for the fight picked.
    const reference = dpsFights(file)[0] ?? fight
    const referenceWorn = wornResult(reference.fight_id)

    return (
        <section
            aria-labelledby={headingId}
            data-slot="fight-band"
            data-fight={fight.label}
            className={cn(
                'grid gap-x-9 gap-y-8 border-t pt-5.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
                className
            )}
        >
            <div data-slot="fight-band-chart" className="flex min-w-0 flex-col">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h2 id={headingId} className="text-xl leading-tight">
                        Across the fight
                    </h2>
                    <span className="text-[0.8125rem] text-muted-foreground">
                        {fightWords(fight)}
                    </span>
                    {file.provisional && (
                        <Provisional text={BAND_PROVISIONAL_TEXT} />
                    )}
                    {file.sample && (
                        <span className="text-[0.71875rem] text-muted-foreground italic">
                            Sample file
                        </span>
                    )}
                </div>
                {!worn ? (
                    <p className="text-sm text-muted-foreground">
                        Not simmed for what you wear.
                    </p>
                ) : fight.kind === 'chain' ? (
                    <PullChart
                        fight={fight}
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                ) : (
                    <FightChart
                        fight={fight}
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                )}
            </div>
            <div className="flex min-w-0 flex-col">
                {referenceWorn && (
                    <DamageSplit
                        worn={referenceWorn}
                        fightLabel={fightWords(reference)}
                    />
                )}
                <StatWeights
                    file={file}
                    fightId={reference.fight_id}
                    compareId={fight.fight_id}
                    action={weightsAction}
                />
            </div>
        </section>
    )
}
