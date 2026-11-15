/**
 * The pull chart for a chain fight (spec section 9), framed as the fight
 * chart is: the run-dry sentence above it, the drawing (`pull-plot.tsx`,
 * loaded lazily so Recharts isn't in the first load; a same-height
 * placeholder holds its place), and the averages under it.
 */
import { lazy, Suspense, useId } from 'react'

import { averageWords, pullAverages, pullChartData } from '../chart-data'
import { dryPull, planManaWords, wornManaWords } from '../mana-words'
import type { ResultsFile } from '../results-file'
import { ChartPlaceholder } from './chart-words'
import { PULL_CHART_NAME } from './series-key'

export { PULL_CHART_NAME }

type Result = ResultsFile['results'][number]

const PullPlot = lazy(() => import('./pull-plot'))

/**
 * The pull chart with its sentences.
 *
 * @param worn - What you wear's result on the chain fight.
 * @param plan - The plan's result on it, or null.
 * @param planLabel - The plan's label, for the averages line.
 */
export function PullChart({
    worn,
    plan,
    planLabel = null,
}: {
    worn: Result
    plan: Result | null
    planLabel?: string | null
}) {
    const wordsId = useId()
    const data = pullChartData(worn, plan)
    if (!data || worn.pulls === null)
        return (
            <p className="text-sm text-muted-foreground">
                No pull data in this file.
            </p>
        )
    const planPulls = plan?.pulls ?? null
    const averages = pullAverages(worn, data.withPlan ? plan : null)
    return (
        <figure className="flex flex-col gap-2">
            <p
                id={wordsId}
                className="text-xl leading-snug font-semibold tracking-tight"
            >
                <span>
                    {wornManaWords(
                        worn.out_of_mana_s,
                        'keep mana through every pull',
                        dryPull(worn.pulls)
                    )}
                </span>
                {data.withPlan && plan && planPulls && (
                    <>
                        {' '}
                        <span>
                            {planManaWords(
                                plan.out_of_mana_s,
                                'keeps mana through every pull',
                                dryPull(planPulls)
                            )}
                        </span>
                    </>
                )}
            </p>
            <Suspense fallback={<ChartPlaceholder />}>
                <PullPlot data={data} describedBy={wordsId} />
            </Suspense>
            <p className="text-xs text-muted-foreground">
                {averages &&
                    `${averageWords(averages, data.withPlan ? planLabel : null, true)} `}
                Each pull shows DPS, then a mana bar from the mana at the start
                of the pull down to what is left at its end.
            </p>
        </figure>
    )
}
