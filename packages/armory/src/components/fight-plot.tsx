/**
 * The fight chart's drawing (Recharts 3 inside shadcn's `ChartContainer`):
 * DPS on the left axis (the plan a solid accent line, what you wear a
 * thinner faded one), mana on the right axis (the plan a filled area, what
 * you wear a dashed line), a dashed line at each out-of-mana time with its
 * label, time in m:ss, and a legend. Its own module, loaded only once a
 * file with a timeline is shown (`React.lazy` in `fight-chart.tsx`), so the
 * first load and the new-visitor screen don't carry Recharts.
 */
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
import { cn } from '@/lib/utils'

import { type FightChartData, type ManaMarker, timeTicks } from '../chart-data'
import { minutesSeconds } from '../format'
import {
    FIGHT_CHART_NAME,
    FIGHT_KEYS,
    legendOrder,
    SERIES_COLOR,
    SERIES_LABELS,
} from './series-key'

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
    // Two rows under the axis titles, so no label meets them.
    const y = (viewBox?.y ?? 0) - 18 + marker.row * 13
    return (
        <text
            x={x}
            y={y}
            textAnchor={marker.anchor}
            className={cn(
                'text-[0.7rem] font-semibold',
                marker.who === 'plan'
                    ? 'fill-chart-1-text'
                    : 'fill-muted-foreground'
            )}
        >
            {marker.label}
        </text>
    )
}

/**
 * The plot.
 *
 * @param data - What it draws (`fightChartData`).
 * @param describedBy - The id of the sentences that describe it.
 */
export default function FightPlot({
    data,
    describedBy,
}: {
    data: FightChartData
    describedBy: string
}) {
    return (
        <ChartContainer
            config={CONFIG}
            initialDimension={{ width: 400, height: 260 }}
            className="aspect-auto h-65 w-full"
        >
            <ComposedChart
                data={data.points}
                role="img"
                aria-label={FIGHT_CHART_NAME}
                aria-describedby={describedBy}
                accessibilityLayer
                margin={{ top: 50, right: 4, bottom: 0, left: 4 }}
            >
                <CartesianGrid vertical={false} strokeDasharray="2 4" />
                <XAxis
                    dataKey="t_s"
                    type="number"
                    domain={[0, data.duration_s]}
                    ticks={timeTicks(data.duration_s)}
                    tickFormatter={minutesSeconds}
                    tickLine={false}
                    // Even spacing when the chart is too narrow for every
                    // tick (a phone): every other one, not a ragged few.
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
                        offset: 36,
                        className: 'fill-chart-1-text text-[0.7rem]',
                    }}
                />
                <YAxis
                    yAxisId="mana"
                    orientation="right"
                    width={40}
                    tickLine={false}
                    axisLine={false}
                    // Mana ticks in the mana colour, as the mockup draws
                    // them (a style beats the container's tick fill).
                    tick={{ style: { fill: 'var(--chart-2-text)' } }}
                    label={{
                        value: 'Mana',
                        position: 'top',
                        offset: 36,
                        className: 'fill-chart-2-text text-[0.7rem]',
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
                    itemSorter={legendOrder}
                    // Below the out-of-mana labels, so it never covers them.
                    position={{ y: 54 }}
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
    )
}
