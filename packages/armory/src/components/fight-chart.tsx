/**
 * The fight chart (spec section 9, as the approved mockup frames it): the
 * out-of-mana sentence above it with its times coloured, ONE combined chart
 * (DPS as bars, about ten groups, and mana on two axes, drawn by `fight-plot.tsx`), and
 * the averages and the bars' spacing under it. The drawing is loaded lazily, so Recharts isn't in the first
 * load; until it arrives a placeholder of the same height holds its place.
 */
import { lazy, Suspense, useId } from 'react'

import { averageWords, fightChartData, timelineAverages } from '../chart-data'
import { planManaWords, wornManaWords } from '../mana-words'
import type { ResultsFile } from '../results-file'
import { ChartPlaceholder, TimedWords } from './chart-words'
import { FIGHT_CHART_NAME } from './series-key'

export { FIGHT_CHART_NAME }

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]

const FightPlot = lazy(() => import('./fight-plot'))

/**
 * The fight chart with its sentences.
 *
 * @param fight - The single fight the band is on.
 * @param worn - What you wear's result on it.
 * @param plan - The plan's result on it, or null (no plan, or not simmed).
 * @param planLabel - The plan's label, for the averages line.
 */
export function FightChart({
    fight,
    worn,
    plan,
    planLabel = null,
}: {
    fight: Fight
    worn: Result
    plan: Result | null
    planLabel?: string | null
}) {
    const wordsId = useId()
    const data = fightChartData(fight, worn, plan)
    const averages = timelineAverages(worn, data?.withPlan ? plan : null)
    if (!data)
        return (
            <p className="text-sm text-muted-foreground">
                No fight timeline in this file.
            </p>
        )
    return (
        <figure className="flex flex-col gap-2">
            <p
                id={wordsId}
                className="text-xl leading-snug font-semibold tracking-tight"
            >
                <TimedWords
                    text={wornManaWords(
                        worn.out_of_mana_s,
                        'keep mana to the end'
                    )}
                    className="text-chart-2-text"
                />
                {data.withPlan && plan && (
                    <>
                        {' '}
                        <TimedWords
                            text={planManaWords(
                                plan.out_of_mana_s,
                                'keeps mana to the end',
                                null,
                                worn.out_of_mana_s
                            )}
                            className="text-chart-1-text"
                        />
                    </>
                )}
            </p>
            <Suspense fallback={<ChartPlaceholder />}>
                <FightPlot data={data} describedBy={wordsId} />
            </Suspense>
            {averages && (
                <p className="text-xs text-muted-foreground">
                    {averageWords(
                        // The footnote names how long each bar group is.
                        { ...averages, spacing_s: data.bar_s },
                        data.withPlan ? planLabel : null
                    )}
                </p>
            )}
        </figure>
    )
}
