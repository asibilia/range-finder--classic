/**
 * The fight chart's drawing (Recharts 3 inside shadcn's `ChartContainer`):
 * DPS on the left axis as very thin bars, one group per time point (the
 * plan's in the accent, then what you wear's, faded, side by side, a
 * hairline between groups), mana on the right axis (the plan a filled
 * area, what you wear a dashed line) drawn over the bars, a dashed line at
 * each out-of-mana time with its label, time in m:ss, and a legend. Its
 * own module, loaded only once a file with a timeline is shown
 * (`React.lazy` in `fight-chart.tsx`), so the first load and the
 * new-visitor screen don't carry Recharts.
 */
import {
    Area,
    Bar,
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

import {
    type FightChartData,
    type ManaMarker,
    timeTicks,
    valueTicks,
} from '../chart-data'
import { minutesSeconds } from '../format'
import {
    FIGHT_CHART_NAME,
    FIGHT_KEYS,
    inLegendOrder,
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
    const highest = (keys: (keyof (typeof data.points)[number])[]) =>
        Math.max(
            0,
            ...data.points.flatMap((point) =>
                keys.map((key) => Number(point[key] ?? 0))
            )
        )
    const dpsTicks = valueTicks(highest(['dps_worn', 'dps_plan']), 4, 1.1, 20)
    const manaTicks = valueTicks(
        highest(['mana_worn', 'mana_plan']),
        3,
        1.3,
        300
    )
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
                // Two bars to a group, touching; a hairline between groups.
                barGap={0}
                barCategoryGap={0.5}
            >
                <CartesianGrid vertical={false} strokeDasharray="2 4" />
                <XAxis
                    dataKey="t_s"
                    type="number"
                    domain={[0, data.duration_s]}
                    ticks={timeTicks(data.duration_s)}
                    tickFormatter={minutesSeconds}
                    tickLine={false}
                    // Half a group's room at each end, so the first and
                    // last bars stay inside the plot.
                    padding="gap"
                    // Even spacing when the chart is too narrow for every
                    // tick (a phone): every other one, not a ragged few.
                    interval="equidistantPreserveStart"
                />
                <YAxis
                    yAxisId="dps"
                    domain={[0, dpsTicks.at(-1) ?? 'auto']}
                    ticks={dpsTicks}
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
                    domain={[0, manaTicks.at(-1) ?? 'auto']}
                    ticks={manaTicks}
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
                        // Mana over the bars (Recharts draws areas under
                        // bars by default): tried both on the screenshot,
                        // and the mana lines read unbroken this way while
                        // the bars only tint a little under the faint area.
                        zIndex={350}
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
                    zIndex={400}
                />
                {data.withPlan && (
                    <Bar
                        yAxisId="dps"
                        dataKey="dps_plan"
                        name={SERIES_LABELS.dps_plan}
                        fill={SERIES_COLOR.dps_plan}
                        isAnimationActive={false}
                    />
                )}
                <Bar
                    yAxisId="dps"
                    dataKey="dps_worn"
                    name={SERIES_LABELS.dps_worn}
                    fill={SERIES_COLOR.dps_worn}
                    fillOpacity={0.7}
                    isAnimationActive={false}
                />
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
                    // Below the out-of-mana labels, so it never covers them.
                    position={{ y: 54 }}
                    content={(props) => (
                        <ChartTooltipContent
                            active={props.active}
                            label={props.label}
                            payload={inLegendOrder(props.payload)}
                            labelFormatter={(_, payload) =>
                                minutesSeconds(
                                    Number(payload[0]?.payload?.t_s ?? 0)
                                )
                            }
                        />
                    )}
                />
                <ChartLegend
                    itemSorter={legendOrder}
                    content={<ChartLegendContent className="flex-wrap" />}
                />
            </ComposedChart>
        </ChartContainer>
    )
}
