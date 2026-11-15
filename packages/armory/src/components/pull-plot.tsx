/**
 * The pull chart's drawing (Recharts 3 inside shadcn's `ChartContainer`):
 * per pull, DPS bars on the left axis and a mana bar on the right axis
 * running from the mana at the start of the pull down to what is left at its
 * end; what you wear faded and dashed, the plan filled. Its own module,
 * loaded lazily by `pull-chart.tsx`, so the first load doesn't carry
 * Recharts.
 */
import { Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from 'recharts'

import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'

import type { PullChartData } from '../chart-data'
import {
    legendOrder,
    PULL_CHART_NAME,
    PULL_KEYS,
    SERIES_COLOR,
    SERIES_LABELS,
} from './series-key'

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
 * The plot.
 *
 * @param data - What it draws (`pullChartData`).
 * @param describedBy - The id of the sentences that describe it.
 */
export default function PullPlot({
    data,
    describedBy,
}: {
    data: PullChartData
    describedBy: string
}) {
    return (
        <ChartContainer
            config={CONFIG}
            initialDimension={{ width: 400, height: 260 }}
            className="aspect-auto h-65 w-full"
        >
            <ComposedChart
                data={data.groups}
                role="img"
                aria-label={PULL_CHART_NAME}
                aria-describedby={describedBy}
                accessibilityLayer
                barGap={2}
                margin={{ top: 24, right: 4, bottom: 0, left: 4 }}
            >
                <CartesianGrid vertical={false} strokeDasharray="2 4" />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    interval="equidistantPreserveStart"
                />
                <YAxis
                    yAxisId="dps"
                    width={34}
                    tickLine={false}
                    axisLine={false}
                    label={{
                        value: 'DPS',
                        position: 'top',
                        offset: 12,
                        className: 'fill-chart-1-text text-[0.7rem]',
                    }}
                />
                <YAxis
                    yAxisId="mana"
                    orientation="right"
                    width={40}
                    tickLine={false}
                    axisLine={false}
                    // Mana ticks in the mana colour, as on the fight chart.
                    tick={{ style: { fill: 'var(--chart-2-text)' } }}
                    label={{
                        value: 'Mana',
                        position: 'top',
                        offset: 12,
                        className: 'fill-chart-2-text text-[0.7rem]',
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
                    itemSorter={legendOrder}
                    // Pinned to the top of the plot, clear of the bars' labels.
                    position={{ y: 28 }}
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
    )
}
