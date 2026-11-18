/**
 * The legend swatches for the fight and pull charts: a short sample of each
 * series as it is drawn (dashed line, filled area, faded bar, the fight
 * chart's DPS as solid bars), so the legend reads like the chart. Used as
 * shadcn `ChartConfig` icons.
 */
import type { ComponentType } from 'react'

import { SimBestIcon } from './sim-best-icon'

function lineKey(color: string, dashed: boolean, faded: boolean) {
    return function LineKey() {
        return (
            <svg
                viewBox="0 0 18 6"
                aria-hidden="true"
                className="!h-1.5 !w-4.5"
            >
                <line
                    x1="0"
                    x2="18"
                    y1="3"
                    y2="3"
                    stroke={color}
                    strokeWidth={faded ? 1.6 : 2.4}
                    strokeOpacity={faded ? 0.7 : 1}
                    strokeDasharray={dashed ? '4 3' : undefined}
                />
            </svg>
        )
    }
}

function areaKey(color: string) {
    return function AreaKey() {
        return (
            <svg
                viewBox="0 0 18 10"
                aria-hidden="true"
                className="!h-2.5 !w-4.5"
            >
                <rect
                    width="18"
                    height="10"
                    rx="2"
                    fill={color}
                    fillOpacity={0.25}
                />
                <line
                    x1="0"
                    x2="18"
                    y1="1"
                    y2="1"
                    stroke={color}
                    strokeWidth={2}
                />
            </svg>
        )
    }
}

function barKey(color: string, faded: boolean) {
    return function BarKey() {
        return (
            <svg viewBox="0 0 10 10" aria-hidden="true" className="!size-2.5">
                <rect
                    x="0.75"
                    y="0.75"
                    width="8.5"
                    height="8.5"
                    rx="1.5"
                    fill={color}
                    fillOpacity={faded ? 0.3 : 0.85}
                    stroke={color}
                    strokeDasharray={faded ? '2 1.5' : undefined}
                />
            </svg>
        )
    }
}

/** One solid bar, as the fight chart draws DPS. */
function wideBarKey(color: string) {
    return function WideBarKey() {
        return (
            <svg
                viewBox="0 0 6 10"
                aria-hidden="true"
                className="!h-2.5 !w-1.5"
            >
                <rect width="6" height="10" rx="0.5" fill={color} />
            </svg>
        )
    }
}

/** Series colours: the plan's accent, what you wear (muted), mana. */
export const SERIES_COLOR = {
    dps_plan: 'var(--chart-1)',
    dps_worn: 'var(--muted-foreground)',
    mana: 'var(--chart-2)',
} as const

/** The sim's best icon (spec #109 section 3) before a swatch. */
function withSimBest(Swatch: ComponentType) {
    return function SimBestKey() {
        return (
            <>
                <SimBestIcon variant="best" className="!size-3" />
                <Swatch />
            </>
        )
    }
}

/** Legend icons for the fight chart's four series. */
export const FIGHT_KEYS: Record<string, ComponentType> = {
    dps_worn: wideBarKey(SERIES_COLOR.dps_worn),
    dps_plan: withSimBest(wideBarKey(SERIES_COLOR.dps_plan)),
    mana_worn: lineKey(SERIES_COLOR.mana, true, true),
    mana_plan: areaKey(SERIES_COLOR.mana),
}

/** Legend icons for the pull chart's four series. */
export const PULL_KEYS: Record<string, ComponentType> = {
    dps_worn: barKey(SERIES_COLOR.dps_worn, true),
    dps_plan: barKey(SERIES_COLOR.dps_plan, false),
    mana_worn: barKey(SERIES_COLOR.mana, true),
    mana_plan: barKey(SERIES_COLOR.mana, false),
}

/** The legend's words, in the approved mockup's order. */
export const SERIES_LABELS = {
    dps_plan: "DPS, sim's plan",
    dps_worn: 'DPS, what you wear',
    mana_plan: "Mana, sim's plan",
    mana_worn: 'Mana, what you wear',
} as const

/** Legend order, as the mockup's: DPS plan, DPS worn, mana plan, mana worn. */
export function legendOrder(item: { dataKey?: unknown }): number {
    return Object.keys(SERIES_LABELS).indexOf(String(item.dataKey))
}

/**
 * A chart tooltip's items in legend order. Recharts skips its `itemSorter`
 * with custom tooltip content, so the content sorts them itself.
 *
 * @param payload - The tooltip's items.
 * @returns A sorted copy.
 */
export function inLegendOrder<T extends { dataKey?: unknown }>(
    payload: readonly T[] | undefined
): T[] {
    return [...(payload ?? [])].sort((a, b) => legendOrder(a) - legendOrder(b))
}

/** The fight chart's accessible name. */
export const FIGHT_CHART_NAME = 'DPS and mana over the fight'

/** The pull chart's accessible name. */
export const PULL_CHART_NAME = 'DPS and mana per pull'
