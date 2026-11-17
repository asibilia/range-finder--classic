/**
 * What the sim says (spec section 9), as the approved mockup lays it out:
 * six readings in three columns. The DPS of a short and a long single fight
 * (solo and the 2-minute dungeon fight in the sample) whatever fight is
 * picked, as the mockup keeps them; then `Mana runs out at`, health, armor
 * and `Time to die vs a level 33 elite` for the fight picked in the fight
 * settings. Each value is large; in the plan view it is the plan's, with
 * its change from what you wear under it (`+8.7`), as the mockup shows.
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

const NOT_SIMMED = 'Not simmed'
const PROVISIONAL_TEXT =
    "The sim hasn't been checked against real fights yet. Treat these as estimates."

/** How a change reads: DPS gains in the accent, the rest in green. */
type Tone = 'dps' | 'good'

type Reading = {
    label: string
    fightId: string
    unit?: string
    tone: Tone
    read: (result: Result) => string
    /** The change from what you wear, or null when there is none to say. */
    change: (plan: Result, worn: Result) => string | null
}

function seconds(value: Result['out_of_mana_s']): number | null {
    return typeof value === 'number' ? value : null
}

function dps(fight: Fight): Reading {
    return {
        label: fight.label,
        fightId: fight.fight_id,
        unit: 'DPS',
        tone: 'dps',
        read: (result) => result.dps.toFixed(1),
        change: (plan, worn) => signed(plan.dps - worn.dps, 1),
    }
}

function forFight(fight: Fight): Reading[] {
    const fightId = fight.fight_id
    return [
        {
            label: 'Mana runs out at',
            fightId,
            tone: 'good',
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
                return change && `${change} s ${a > b ? 'later' : 'sooner'}`
            },
        },
        {
            label: 'Health',
            fightId,
            tone: 'good',
            read: (result) => String(result.health),
            change: (plan, worn) => signed(plan.health - worn.health, 0),
        },
        {
            label: 'Armor',
            fightId,
            tone: 'good',
            read: (result) => String(result.armor),
            change: (plan, worn) => signed(plan.armor - worn.armor, 0),
        },
        {
            label: `Time to die vs a level ${fight.target_level} elite`,
            fightId,
            unit: 's',
            tone: 'good',
            read: (result) =>
                result.time_to_die_s === null
                    ? NOT_SIMMED
                    : String(Math.round(result.time_to_die_s)),
            change: (plan, worn) => {
                if (plan.time_to_die_s === null || worn.time_to_die_s === null)
                    return null
                const change = signed(
                    Math.round(plan.time_to_die_s) -
                        Math.round(worn.time_to_die_s),
                    0
                )
                return change && `${change} s`
            },
        },
    ]
}

/**
 * The two fights whose DPS the readings show side by side: the shortest
 * single fight (the first in file order on a tie: solo in the sample) and
 * the longest (the 2-minute dungeon fight), when their lengths differ and
 * both have a result for what you wear. Otherwise none, and the readings
 * show the DPS of the fight picked.
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
                            className="h-auto cursor-help rounded-sm border-dashed px-1.75 py-px text-[0.71875rem] font-normal text-muted-foreground"
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
 * @param fight - The fight picked in the fight settings (mana, health,
 * armor and time to die read it).
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param planShown - The page shows the plan: its values, with their change
 * from what you wear. Otherwise what you wear's.
 * @param wornOf - What you wear's result on a fight (with a bag item put
 * on, its results); the file's worn results by default.
 */
export function Readings({
    file,
    fight,
    plan,
    planShown,
    wornOf,
}: {
    file: ResultsFile
    fight: Fight
    plan: Plan | null
    planShown: boolean
    wornOf?: (fightId: string) => Result | null
}) {
    const headingId = useId()
    const resultOf = (gear: string, fightId: string) =>
        file.results.find(
            (result) => result.gear === gear && result.fight_id === fightId
        ) ?? null
    const wornResult =
        wornOf ?? ((fightId: string) => resultOf('worn', fightId))
    const showPlan = planShown && plan !== null
    const anchors = dpsFights(file)
    const readings: Reading[] = [
        ...(anchors.length > 0 ? anchors.map(dps) : [dps(fight)]),
        ...forFight(fight),
    ]

    return (
        <section aria-labelledby={headingId}>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 id={headingId} className="text-xl leading-tight">
                    What the sim says
                </h2>
                <span className="text-[0.8125rem] text-muted-foreground">
                    {showPlan
                        ? "for the sim's plan, vs what you wear"
                        : 'for what you wear'}
                </span>
                {file.provisional && <Provisional />}
            </div>
            <dl
                aria-live="polite"
                className="grid grid-cols-2 border-t min-[30rem]:grid-cols-3"
            >
                {readings.map((reading) => {
                    const worn = wornResult(reading.fightId)
                    const planResult = plan
                        ? resultOf(plan.plan_id, reading.fightId)
                        : null
                    const result = showPlan ? planResult : worn
                    const value = result ? reading.read(result) : NOT_SIMMED
                    const words = value === NOT_SIMMED || value === 'Never'
                    const change =
                        showPlan && planResult && worn
                            ? reading.change(planResult, worn)
                            : null
                    return (
                        <div
                            key={reading.label}
                            data-reading={reading.label}
                            className="border-b pt-2.5 pr-2 pb-2.25"
                        >
                            <dt className="min-h-7.75 text-[0.78125rem] leading-tight text-muted-foreground">
                                {reading.label}
                            </dt>
                            <dd className="mt-0.75">
                                <span
                                    data-reading-value
                                    className={cn(
                                        'tabular-nums',
                                        words
                                            ? 'text-lg'
                                            : 'font-mono text-[1.625rem] leading-tight whitespace-nowrap'
                                    )}
                                >
                                    {value}
                                </span>
                                {reading.unit && result && !words && (
                                    <small className="ml-0.75 text-[0.8125rem] text-muted-foreground">
                                        {reading.unit}
                                    </small>
                                )}
                            </dd>
                            <dd
                                data-reading-change
                                className={cn(
                                    'min-h-4.5 text-[0.78125rem] font-bold',
                                    change?.startsWith('-')
                                        ? 'text-muted-foreground'
                                        : reading.tone === 'dps'
                                          ? 'text-chart-1-text'
                                          : 'text-good-text'
                                )}
                            >
                                {change ?? ''}
                            </dd>
                        </div>
                    )
                })}
            </dl>
        </section>
    )
}
