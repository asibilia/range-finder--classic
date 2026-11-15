/**
 * The pull chart for a chain fight (spec section 9), drawn with the fight
 * chart's encodings: per pull, DPS bars on the left axis and a mana bar on
 * the right axis running from the mana at the start of the pull down to
 * what is left at its end; what you wear faded and dashed, the plan filled.
 * The sentences above it say when each runs dry.
 */
import { useId } from 'react'
import { Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from 'recharts'

import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'

import { pullChartData } from '../chart-data'
import { dryPull, planManaWords, wornManaWords } from '../mana-words'
import type { ResultsFile } from '../results-file'
import {
    legendOrder,
    PULL_KEYS,
    SERIES_COLOR,
    SERIES_LABELS,
} from './series-key'

type Result = ResultsFile['results'][number]

/** The chart's accessible name. */
export const PULL_CHART_NAME = 'DPS and mana per pull'

const CONFIG = Object.fromEntries(
    Object.entries(SERIES_LABELS).map(([key, label]) => [
        key,
        { label, icon: PULL_KEYS[key] },
    ])
) satisfies ChartConfig

/** A mana span as the tooltip reads it: `1660 to 980`. */
function manaSpan(value: unknown): string {
    return Array.isArray(value) ? `${value[1]} to ${value[0]}` : String(value)
}

/**
 * The pull chart with its sentences.
 *
 * @param worn - What you wear's result on the chain fight.
 * @param plan - The plan's result on it, or null.
 */
export function PullChart({
    worn,
    plan,
}: {
    worn: Result
    plan: Result | null
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
    return (
        <figure className="flex flex-col gap-2">
            <div id={wordsId} className="flex flex-col text-base leading-snug">
                <p>
                    {wornManaWords(
                        worn.out_of_mana_s,
                        'keep mana through every pull',
                        dryPull(worn.pulls)
                    )}
                </p>
                {data.withPlan && plan && planPulls && (
                    <p>
                        {planManaWords(
                            plan.out_of_mana_s,
                            'keeps mana through every pull',
                            dryPull(planPulls)
                        )}
                    </p>
                )}
            </div>
            <ChartContainer
                config={CONFIG}
                initialDimension={{ width: 400, height: 260 }}
                className="aspect-auto h-65 w-full"
            >
                <ComposedChart
                    data={data.groups}
                    role="img"
                    aria-label={PULL_CHART_NAME}
                    aria-describedby={wordsId}
                    accessibilityLayer
                    barGap={2}
                    margin={{ top: 24, right: 4, bottom: 0, left: 4 }}
                >
                    <CartesianGrid vertical={false} strokeDasharray="2 4" />
                    <XAxis dataKey="label" tickLine={false} />
                    <YAxis
                        yAxisId="dps"
                        width={34}
                        tickLine={false}
                        axisLine={false}
                        label={{
                            value: 'DPS',
                            position: 'top',
                            offset: 12,
                            className: 'fill-chart-1 text-[0.7rem]',
                        }}
                    />
                    <YAxis
                        yAxisId="mana"
                        orientation="right"
                        width={40}
                        tickLine={false}
                        axisLine={false}
                        label={{
                            value: 'Mana',
                            position: 'top',
                            offset: 12,
                            className: 'fill-chart-2 text-[0.7rem]',
                        }}
                    />
                    <Bar
                        yAxisId="dps"
                        dataKey="dps_worn"
                        name={SERIES_LABELS.dps_worn}
                        fill={SERIES_COLOR.dps_worn}
                        fillOpacity={0.3}
                        stroke={SERIES_COLOR.dps_worn}
                        strokeDasharray="3 2"
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={false}
                    />
                    {data.withPlan && (
                        <Bar
                            yAxisId="dps"
                            dataKey="dps_plan"
                            name={SERIES_LABELS.dps_plan}
                            fill={SERIES_COLOR.dps_plan}
                            radius={[3, 3, 0, 0]}
                            isAnimationActive={false}
                        />
                    )}
                    <Bar
                        yAxisId="mana"
                        dataKey="mana_worn"
                        name={SERIES_LABELS.mana_worn}
                        fill={SERIES_COLOR.mana}
                        fillOpacity={0.15}
                        stroke={SERIES_COLOR.mana}
                        strokeDasharray="3 2"
                        radius={3}
                        isAnimationActive={false}
                    />
                    {data.withPlan && (
                        <Bar
                            yAxisId="mana"
                            dataKey="mana_plan"
                            name={SERIES_LABELS.mana_plan}
                            fill={SERIES_COLOR.mana}
                            fillOpacity={0.75}
                            radius={3}
                            isAnimationActive={false}
                        />
                    )}
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                formatter={(value, name) => (
                                    <span className="flex w-full justify-between gap-3">
                                        <span className="text-muted-foreground">
                                            {name}
                                        </span>
                                        <span className="font-mono tabular-nums">
                                            {manaSpan(value)}
                                        </span>
                                    </span>
                                )}
                            />
                        }
                    />
                    <ChartLegend
                        itemSorter={legendOrder}
                        content={<ChartLegendContent className="flex-wrap" />}
                    />
                </ComposedChart>
            </ChartContainer>
            <p className="text-xs text-muted-foreground">
                Each pull shows DPS, then a mana bar from the mana at the start
                of the pull down to what is left at its end.
            </p>
        </figure>
    )
}
