/**
 * The fight chart (spec section 9, as the approved mockup draws it): ONE
 * combined chart. DPS on the left axis (the plan a solid accent line, what
 * you wear a thinner faded one), mana on the right axis (the plan a filled
 * area, what you wear a dashed line), a dashed line at each out-of-mana time
 * with its label, time in m:ss, and a legend. The sentences above it say the
 * same in words. Recharts 3 inside shadcn's `ChartContainer`.
 */
import { useId } from 'react'
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts'

import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'

import { fightChartData, type ManaMarker, timeTicks } from '../chart-data'
import { minutesSeconds } from '../format'
import { planManaWords, wornManaWords } from '../mana-words'
import type { ResultsFile } from '../results-file'
import {
    FIGHT_KEYS,
    legendOrder,
    SERIES_COLOR,
    SERIES_LABELS,
} from './series-key'

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]

/** The chart's accessible name. */
export const FIGHT_CHART_NAME = 'DPS and mana over the fight'

const CONFIG = Object.fromEntries(
    Object.entries(SERIES_LABELS).map(([key, label]) => [
        key,
        { label, icon: FIGHT_KEYS[key] },
    ])
) satisfies ChartConfig

/** An out-of-mana label, above the chart, beside its dashed line. */
function MarkerLabel({
    marker,
    viewBox,
}: {
    marker: ManaMarker
    viewBox?: { x?: number; y?: number }
}) {
    const x = (viewBox?.x ?? 0) + (marker.anchor === 'start' ? 6 : -6)
    const y = (viewBox?.y ?? 0) - 18 + marker.row * 14
    return (
        <text
            x={x}
            y={y}
            textAnchor={marker.anchor}
            className="text-[0.7rem] font-semibold"
            fill={
                marker.who === 'plan'
                    ? SERIES_COLOR.dps_plan
                    : SERIES_COLOR.dps_worn
            }
        >
            {marker.label}
        </text>
    )
}

/**
 * The fight chart with its sentences.
 *
 * @param fight - The single fight the card is on.
 * @param worn - What you wear's result on it.
 * @param plan - The plan's result on it, or null (no plan, or not simmed).
 */
export function FightChart({
    fight,
    worn,
    plan,
}: {
    fight: Fight
    worn: Result
    plan: Result | null
}) {
    const wordsId = useId()
    const data = fightChartData(fight, worn, plan)
    if (!data)
        return (
            <p className="text-sm text-muted-foreground">
                No fight timeline in this file.
            </p>
        )
    return (
        <figure className="flex flex-col gap-2">
            <div id={wordsId} className="flex flex-col text-base leading-snug">
                <p>
                    {wornManaWords(worn.out_of_mana_s, 'keep mana to the end')}
                </p>
                {data.withPlan && plan && (
                    <p>
                        {planManaWords(
                            plan.out_of_mana_s,
                            'keeps mana to the end'
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
                    data={data.points}
                    role="img"
                    aria-label={FIGHT_CHART_NAME}
                    aria-describedby={wordsId}
                    accessibilityLayer
                    margin={{ top: 40, right: 4, bottom: 0, left: 4 }}
                >
                    <CartesianGrid vertical={false} strokeDasharray="2 4" />
                    <XAxis
                        dataKey="t_s"
                        type="number"
                        domain={[0, data.duration_s]}
                        ticks={timeTicks(data.duration_s)}
                        tickFormatter={minutesSeconds}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="dps"
                        width={34}
                        tickLine={false}
                        axisLine={false}
                        label={{
                            value: 'DPS',
                            position: 'top',
                            offset: 26,
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
                            offset: 26,
                            className: 'fill-chart-2 text-[0.7rem]',
                        }}
                    />
                    {data.withPlan && (
                        <Area
                            yAxisId="mana"
                            dataKey="mana_plan"
                            name={SERIES_LABELS.mana_plan}
                            type="linear"
                            stroke={SERIES_COLOR.mana}
                            strokeWidth={1.8}
                            fill={SERIES_COLOR.mana}
                            fillOpacity={0.15}
                            isAnimationActive={false}
                        />
                    )}
                    <Line
                        yAxisId="mana"
                        dataKey="mana_worn"
                        name={SERIES_LABELS.mana_worn}
                        type="linear"
                        stroke={SERIES_COLOR.mana}
                        strokeWidth={1.4}
                        strokeOpacity={0.8}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        yAxisId="dps"
                        dataKey="dps_worn"
                        name={SERIES_LABELS.dps_worn}
                        type="linear"
                        stroke={SERIES_COLOR.dps_worn}
                        strokeOpacity={0.7}
                        strokeWidth={1.6}
                        dot={false}
                        isAnimationActive={false}
                    />
                    {data.withPlan && (
                        <Line
                            yAxisId="dps"
                            dataKey="dps_plan"
                            name={SERIES_LABELS.dps_plan}
                            type="linear"
                            stroke={SERIES_COLOR.dps_plan}
                            strokeWidth={2.4}
                            dot={{ r: 2, fill: SERIES_COLOR.dps_plan }}
                            isAnimationActive={false}
                        />
                    )}
                    {data.markers.map((marker) => (
                        <ReferenceLine
                            key={marker.who}
                            yAxisId="dps"
                            x={marker.at_s}
                            stroke={
                                marker.who === 'plan'
                                    ? SERIES_COLOR.dps_plan
                                    : SERIES_COLOR.dps_worn
                            }
                            strokeDasharray="4 3"
                            className={`marker-${marker.who}`}
                            label={<MarkerLabel marker={marker} />}
                        />
                    ))}
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                labelFormatter={(_, payload) =>
                                    minutesSeconds(
                                        Number(payload[0]?.payload?.t_s ?? 0)
                                    )
                                }
                            />
                        }
                    />
                    <ChartLegend
                        itemSorter={legendOrder}
                        content={<ChartLegendContent className="flex-wrap" />}
                    />
                </ComposedChart>
            </ChartContainer>
        </figure>
    )
}
