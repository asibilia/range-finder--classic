/**
 * What the sim says (spec section 9): DPS, health, armor, out of mana and
 * time to die for what you wear and the plan, drawn as stat blocks, the
 * plan's value large with its change from what you wear (`+8.7 vs what you
 * wear`). Underneath it is still a table (ARIA roles): one row per reading,
 * one column per gear, so it reads as a table to a screen reader.
 */
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { minutesSeconds, signed } from '../format'
import type { ResultsFile } from '../results-file'

type Result = ResultsFile['results'][number]

/** One column of the table: a heading and its result (null: not simmed). */
export type ReadingColumn = { heading: string; result: Result | null }

const NOT_SIMMED = 'Not simmed'
const PROVISIONAL_TEXT = "The sim isn't checked against real fights yet."

type Reading = {
    label: string
    unit?: string
    read: (result: Result) => string
    /** The change from what you wear, or null when there is none to say. */
    change: (plan: Result, worn: Result) => string | null
}

function seconds(value: Result['out_of_mana_s']): number | null {
    return typeof value === 'number' ? value : null
}

const READINGS: Reading[] = [
    {
        label: 'DPS',
        unit: 'DPS',
        read: (result) => result.dps.toFixed(1),
        change: (plan, worn) => signed(plan.dps - worn.dps, 1),
    },
    {
        label: 'Health',
        read: (result) => String(result.health),
        change: (plan, worn) => signed(plan.health - worn.health, 0),
    },
    {
        label: 'Armor',
        read: (result) => String(result.armor),
        change: (plan, worn) => signed(plan.armor - worn.armor, 0),
    },
    {
        label: 'Out of mana at',
        read: (result) =>
            result.out_of_mana_s === null
                ? NOT_SIMMED
                : result.out_of_mana_s === 'never'
                  ? 'Never'
                  : minutesSeconds(result.out_of_mana_s),
        change: (plan, worn) => {
            const a = seconds(plan.out_of_mana_s)
            const b = seconds(worn.out_of_mana_s)
            if (a === null || b === null) return null
            const change = signed(Math.floor(a) - Math.floor(b), 0)
            return change ? `${change} s` : null
        },
    },
]

const TIME_TO_DIE: Reading = {
    label: 'Time to die',
    read: (result) =>
        result.time_to_die_s === null
            ? NOT_SIMMED
            : `${Math.round(result.time_to_die_s)} s`,
    change: (plan, worn) => {
        if (plan.time_to_die_s === null || worn.time_to_die_s === null)
            return null
        const change = signed(
            Math.round(plan.time_to_die_s) - Math.round(worn.time_to_die_s),
            0
        )
        return change ? `${change} s` : null
    },
}

/** The `Provisional` marker; its text is always in the page, tied by `aria-describedby`. */
function Provisional() {
    const textId = useId()
    return (
        <>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Badge
                            variant="outline"
                            tabIndex={0}
                            aria-describedby={textId}
                            className="cursor-help border-dashed font-normal text-muted-foreground"
                        />
                    }
                >
                    Provisional
                </TooltipTrigger>
                <TooltipContent>{PROVISIONAL_TEXT}</TooltipContent>
            </Tooltip>
            <span id={textId} className="sr-only">
                {PROVISIONAL_TEXT}
            </span>
        </>
    )
}

/**
 * The readings.
 *
 * @param columns - What you wear, then the plan when there is one.
 * @param provisional - Show the `Provisional` marker.
 * @param planShown - The page shows the plan: its values are drawn large,
 * with their change from what you wear. Otherwise what you wear is large.
 */
export function Readings({
    columns,
    provisional,
    planShown,
}: {
    columns: ReadingColumn[]
    provisional: boolean
    planShown: boolean
}) {
    const headingId = useId()
    const [worn, plan] = columns
    const large = planShown && plan ? 1 : 0
    const readings = columns.some(
        (column) => column.result?.time_to_die_s != null
    )
        ? [...READINGS, TIME_TO_DIE]
        : READINGS
    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <h2 id={headingId} className="text-lg font-semibold">
                    What the sim says
                </h2>
                {provisional && <Provisional />}
            </div>
            <div
                role="table"
                aria-labelledby={headingId}
                className="flex flex-col gap-2"
            >
                <div role="rowgroup">
                    <div
                        role="row"
                        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                    >
                        <span role="cell" className="sr-only">
                            Reading
                        </span>
                        {columns.map((column, index) => (
                            <span
                                key={column.heading}
                                role="columnheader"
                                className={cn(
                                    'flex items-center gap-1.5',
                                    index === large && 'text-foreground'
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'inline-block size-2 rounded-full',
                                        index === 0
                                            ? 'bg-muted-foreground/60'
                                            : 'bg-chart-1'
                                    )}
                                />
                                {column.heading}
                            </span>
                        ))}
                    </div>
                </div>
                <div
                    role="rowgroup"
                    className="grid grid-cols-2 border-t sm:grid-cols-3"
                >
                    {readings.map((reading) => (
                        <div
                            key={reading.label}
                            role="row"
                            className="flex min-w-0 flex-col border-b py-2 pr-2"
                        >
                            <span
                                role="rowheader"
                                className="text-xs text-muted-foreground"
                            >
                                {reading.label}
                            </span>
                            {columns.map((column, index) => (
                                <ReadingCell
                                    key={column.heading}
                                    reading={reading}
                                    column={column}
                                    large={index === large}
                                    change={
                                        index === 1 &&
                                        large === 1 &&
                                        plan?.result &&
                                        worn?.result
                                            ? reading.change(
                                                  plan.result,
                                                  worn.result
                                              )
                                            : null
                                    }
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/** One cell: the value, large or as a small line naming its gear. */
function ReadingCell({
    reading,
    column,
    large,
    change,
}: {
    reading: Reading
    column: ReadingColumn
    large: boolean
    change: string | null
}) {
    const value = column.result ? reading.read(column.result) : NOT_SIMMED
    return (
        <span
            role="cell"
            className={cn(
                'flex min-w-0 flex-col',
                large ? 'order-1' : 'order-2'
            )}
        >
            <span
                className={cn(
                    'flex items-baseline gap-1',
                    !large && 'text-xs text-muted-foreground'
                )}
            >
                <span
                    data-reading-value
                    className={cn(
                        'tabular-nums',
                        large &&
                            'text-2xl font-semibold tracking-tight whitespace-nowrap'
                    )}
                >
                    {value}
                </span>
                {large && reading.unit && column.result && (
                    <span className="text-xs text-muted-foreground">
                        {reading.unit}
                    </span>
                )}
                {!large && (
                    <span className="truncate">
                        {column.heading === 'What you wear'
                            ? 'what you wear'
                            : column.heading}
                    </span>
                )}
            </span>
            {change && (
                <span className="truncate text-[0.7rem] text-muted-foreground">
                    <span className="font-semibold text-chart-1">{change}</span>
                    {' vs what you wear'}
                </span>
            )}
        </span>
    )
}
