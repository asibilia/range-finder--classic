/**
 * What the sim says (spec section 9, as the approved mockup lays it out):
 * stat blocks in three columns. When the file has results for a short and
 * a long single fight (solo and the 2-minute dungeon fight in the sample)
 * their DPS sit side by side, as the mockup showed; then out of mana,
 * health, armor and time to die for the fight the band below is on. The
 * plan's value is drawn large with its change from what you wear (`+8.7
 * vs what you wear`) in the plan view. Underneath it is still a table (ARIA
 * roles): one row per reading, one column per gear, for a screen reader.
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
import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]

/** One column of the table: a heading and the gear it reads. */
type Column = { heading: string; gear: string }

const NOT_SIMMED = 'Not simmed'
const PROVISIONAL_TEXT = "The sim isn't checked against real fights yet."

type Reading = {
    /** The row header's text (what a screen reader and the tests read). */
    label: string
    /** What shows instead of `label`, when it differs (a fight's label). */
    shown?: string
    /** The fight it reads. */
    fightId: string
    unit?: string
    read: (result: Result) => string
    /** The change from what you wear, or null when there is none to say. */
    change: (plan: Result, worn: Result) => string | null
}

function seconds(value: Result['out_of_mana_s']): number | null {
    return typeof value === 'number' ? value : null
}

function inSeconds(change: string | null): string | null {
    return change ? `${change} s` : null
}

function dps(fightId: string, label = 'DPS', shown?: string): Reading {
    return {
        label,
        shown,
        fightId,
        unit: 'DPS',
        read: (result) => result.dps.toFixed(1),
        change: (plan, worn) => signed(plan.dps - worn.dps, 1),
    }
}

function forFight(fightId: string): Reading[] {
    return [
        {
            label: 'Out of mana at',
            fightId,
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
                return inSeconds(signed(Math.floor(a) - Math.floor(b), 0))
            },
        },
        {
            label: 'Health',
            fightId,
            read: (result) => String(result.health),
            change: (plan, worn) => signed(plan.health - worn.health, 0),
        },
        {
            label: 'Armor',
            fightId,
            read: (result) => String(result.armor),
            change: (plan, worn) => signed(plan.armor - worn.armor, 0),
        },
    ]
}

function timeToDie(fightId: string): Reading {
    return {
        label: 'Time to die',
        fightId,
        read: (result) =>
            result.time_to_die_s === null
                ? NOT_SIMMED
                : `${Math.round(result.time_to_die_s)} s`,
        change: (plan, worn) => {
            if (plan.time_to_die_s === null || worn.time_to_die_s === null)
                return null
            return inSeconds(
                signed(
                    Math.round(plan.time_to_die_s) -
                        Math.round(worn.time_to_die_s),
                    0
                )
            )
        },
    }
}

/**
 * The two fights whose DPS the readings show side by side: the shortest
 * single fight (the first in file order on a tie: solo in the sample) and
 * the longest (the 2-minute dungeon fight), when their lengths differ and
 * both have a result for what you wear. Otherwise none, and the readings
 * show the DPS of the fight the band is on.
 *
 * @param file - The loaded results file.
 * @returns The two fights, or an empty list.
 */
export function dpsFights(file: ResultsFile): Fight[] {
    const singles = file.fights.filter(
        (fight) =>
            fight.kind === 'single' &&
            file.results.some(
                (result) =>
                    result.gear === 'worn' && result.fight_id === fight.fight_id
            )
    )
    const shortest = singles.reduce<Fight | null>(
        (best, fight) =>
            !best || fight.duration_s < best.duration_s ? fight : best,
        null
    )
    const longest = singles.reduce<Fight | null>(
        (best, fight) =>
            !best || fight.duration_s > best.duration_s ? fight : best,
        null
    )
    if (!shortest || !longest || shortest.duration_s === longest.duration_s)
        return []
    return [shortest, longest]
}

/**
 * The `Provisional` marker; its text is always in the page, tied by
 * `aria-describedby`.
 *
 * @param text - What it explains (the readings' text by default).
 */
export function Provisional({ text = PROVISIONAL_TEXT }: { text?: string }) {
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
                <TooltipContent>{text}</TooltipContent>
            </Tooltip>
            <span id={textId} className="sr-only">
                {text}
            </span>
        </>
    )
}

/**
 * The readings.
 *
 * @param file - The loaded results file.
 * @param fight - The fight the band is on (out of mana, health, armor and
 * time to die read it).
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param planShown - The page shows the plan: its values are drawn large,
 * with their change from what you wear. Otherwise what you wear is large.
 */
export function Readings({
    file,
    fight,
    plan,
    planShown,
}: {
    file: ResultsFile
    fight: Fight
    plan: Plan | null
    planShown: boolean
}) {
    const headingId = useId()
    const columns: Column[] = [{ heading: 'What you wear', gear: 'worn' }]
    if (plan) columns.push({ heading: plan.label, gear: plan.plan_id })
    const large = planShown && plan ? 1 : 0
    const resultOf = (gear: string, fightId: string) =>
        file.results.find(
            (result) => result.gear === gear && result.fight_id === fightId
        ) ?? null

    const anchors = dpsFights(file)
    const readings: Reading[] = [
        ...(anchors.length > 0
            ? anchors.map((anchor) =>
                  dps(anchor.fight_id, `DPS, ${anchor.label}`, anchor.label)
              )
            : [dps(fight.fight_id)]),
        ...forFight(fight.fight_id),
    ]
    if (
        columns.some(
            (column) =>
                resultOf(column.gear, fight.fight_id)?.time_to_die_s != null
        )
    )
        readings.push(timeToDie(fight.fight_id))

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 id={headingId} className="text-lg font-semibold">
                    What the sim says
                </h2>
                <span className="text-sm text-muted-foreground">
                    {large === 1
                        ? "for the sim's plan, vs what you wear"
                        : 'for what you wear'}
                </span>
                {file.provisional && <Provisional />}
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
                                key={column.gear}
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
                    className="grid grid-cols-2 border-t min-[30rem]:grid-cols-3"
                >
                    {readings.map((reading) => {
                        const wornResult = resultOf('worn', reading.fightId)
                        const planResult = plan
                            ? resultOf(plan.plan_id, reading.fightId)
                            : null
                        return (
                            <div
                                key={reading.label}
                                role="row"
                                className="flex min-w-0 flex-col gap-0.5 border-b py-2 pr-2"
                            >
                                <span
                                    role="rowheader"
                                    className="min-h-8 text-xs leading-snug text-muted-foreground"
                                >
                                    {reading.shown ? (
                                        <>
                                            <span className="sr-only">
                                                DPS,{' '}
                                            </span>
                                            {reading.shown}
                                        </>
                                    ) : (
                                        reading.label
                                    )}
                                </span>
                                {columns.map((column, index) => (
                                    <ReadingCell
                                        key={column.gear}
                                        reading={reading}
                                        heading={column.heading}
                                        result={
                                            index === 0
                                                ? wornResult
                                                : planResult
                                        }
                                        large={index === large}
                                        change={
                                            index === 1 &&
                                            large === 1 &&
                                            planResult &&
                                            wornResult
                                                ? reading.change(
                                                      planResult,
                                                      wornResult
                                                  )
                                                : null
                                        }
                                    />
                                ))}
                            </div>
                        )
                    })}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                {`Out of mana, health, armor and time to die: ${fight.label}.`}
            </p>
        </section>
    )
}

/** One cell: the value, large or as a small line naming its gear. */
function ReadingCell({
    reading,
    heading,
    result,
    large,
    change,
}: {
    reading: Reading
    heading: string
    result: Result | null
    large: boolean
    change: string | null
}) {
    const value = result ? reading.read(result) : NOT_SIMMED
    const words = value === NOT_SIMMED || value === 'Never'
    return (
        <span
            role="cell"
            className={cn(
                'flex min-w-0 flex-col',
                large ? 'order-1' : 'order-2'
            )}
        >
            {/* The small line wraps instead of cutting off ("Not simmed,
                Max damage" on the first-run sample). */}
            <span
                className={cn(
                    'flex flex-wrap items-baseline gap-x-1',
                    !large && 'text-xs leading-snug text-muted-foreground'
                )}
            >
                <span
                    data-reading-value
                    className={cn(
                        'tabular-nums',
                        large &&
                            (words
                                ? 'text-lg font-semibold'
                                : 'text-2xl font-semibold tracking-tight whitespace-nowrap')
                    )}
                >
                    {value}
                </span>
                {large && reading.unit && result && (
                    <span className="text-xs text-muted-foreground">
                        {reading.unit}
                    </span>
                )}
                {!large && (
                    <span>
                        {heading === 'What you wear'
                            ? 'what you wear'
                            : heading}
                    </span>
                )}
            </span>
            {change && (
                <span className="text-[0.7rem] text-muted-foreground">
                    <span className="font-semibold text-chart-1-text">
                        {change}
                    </span>
                    {' vs what you wear'}
                </span>
            )}
        </span>
    )
}
