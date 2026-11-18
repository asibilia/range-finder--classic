/**
 * Simulator Data (spec #109, section 2, and the owner's design): six
 * readings in three columns. The top row is the DPS of a short and a long
 * single fight (`Solo` and `Dungeon` in the sample) whatever fight is
 * picked, then `Resource Empty` (when you run out of mana); the bottom row
 * is `Health`, `Armor` and `Lifespan` (time to die vs an elite), for the
 * fight picked in the fight settings. Each reading is its label (with an
 * "i" where it has one), its number in bold JetBrains Mono with a small
 * unit and, under it, its gap from the sim's plan (owner decision A):
 * orange `↓ 14.7` when what you wear is below the plan, green `+ 32.8` when
 * it beats it, nothing when they match. Resource Empty and Lifespan are
 * written in hundredths (decision B). In the plan view the numbers are the
 * plan's, each with its change from what you wear (`+8.7`).
 */
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
    fightDetail,
    type GapReading,
    READING_DECIMALS,
    readingGap,
    shortLabel,
    shortLength,
    signed,
} from '../format'
import type { Plan } from '../plans'
import type { Fight, Result, ResultsFile } from '../results-file'
import { InfoButton } from './info'
import { SimBestIcon } from './sim-best-icon'

const NOT_SIMMED = 'Not simmed'
const PROVISIONAL_TEXT =
    "The sim hasn't been checked against real fights yet. Treat these as estimates."
const RESOURCE_INFO =
    'How long until you run out of mana in this fight. Called Resource so it also fits rage and energy.'

/** How a change reads: DPS gains in the accent, the rest in green. */
type Tone = 'dps' | 'good'

type Reading = {
    label: string
    fightId: string
    unit?: 'DPS' | 'sec'
    /** What its gap is read out in: `DPS`, `sec`, `health`, `armor`. */
    spokenUnit: string
    tone: Tone
    /** What its "i" says, when it has one. */
    info?: string
    /** Which gap from the plan it shows. */
    gap: GapReading
    read: (result: Result) => string
    /** The change from what you wear, or null when there is none to say. */
    change: (plan: Result, worn: Result) => string | null
}

function seconds(value: Result['out_of_mana_s']): number | null {
    return typeof value === 'number' ? value : null
}

function dps(fight: Fight, label: string, level: number): Reading {
    return {
        label,
        fightId: fight.fight_id,
        unit: 'DPS',
        spokenUnit: 'DPS',
        tone: 'dps',
        info: fightDetail(fight, level),
        gap: 'dps',
        read: (result) => result.dps.toFixed(1),
        change: (plan, worn) => signed(plan.dps - worn.dps, 1),
    }
}

/**
 * The DPS readings: their fights, each labelled with its short label, and
 * its length too when both get the same one (`Dungeon 30 s`).
 */
function dpsReadings(fights: Fight[], level: number): Reading[] {
    const labels = fights.map(shortLabel)
    const same = labels.length > 1 && new Set(labels).size === 1
    return fights.map((fight, index) =>
        dps(
            fight,
            same
                ? `${labels[index]} ${shortLength(fight.duration_s)}`
                : (labels[index] ?? fight.label),
            level
        )
    )
}

/** Seconds in hundredths (owner decision B): `15.20`. */
function hundredths(value: number): string {
    return value.toFixed(READING_DECIMALS.resource)
}

function forFight(fight: Fight): Reading[] {
    const fightId = fight.fight_id
    return [
        {
            label: 'Resource Empty',
            fightId,
            unit: 'sec',
            spokenUnit: 'sec',
            tone: 'good',
            info: RESOURCE_INFO,
            gap: 'resource',
            read: (result) =>
                result.out_of_mana_s === null
                    ? NOT_SIMMED
                    : result.out_of_mana_s === 'never'
                      ? 'Never'
                      : hundredths(result.out_of_mana_s),
            change: (plan, worn) => {
                const a = seconds(plan.out_of_mana_s)
                const b = seconds(worn.out_of_mana_s)
                if (a === null || b === null) return null
                const change = signed(a - b, READING_DECIMALS.resource)
                return change && `${change} s ${a > b ? 'later' : 'sooner'}`
            },
        },
        {
            label: 'Health',
            fightId,
            spokenUnit: 'health',
            tone: 'good',
            gap: 'health',
            read: (result) => String(result.health),
            change: (plan, worn) => signed(plan.health - worn.health, 0),
        },
        {
            label: 'Armor',
            fightId,
            spokenUnit: 'armor',
            tone: 'good',
            gap: 'armor',
            read: (result) => String(result.armor),
            change: (plan, worn) => signed(plan.armor - worn.armor, 0),
        },
        {
            label: 'Lifespan',
            fightId,
            unit: 'sec',
            spokenUnit: 'sec',
            tone: 'good',
            info: `How long you'd last against a level ${fight.target_level} elite in this fight.`,
            gap: 'lifespan',
            read: (result) =>
                result.time_to_die_s === null
                    ? NOT_SIMMED
                    : hundredths(result.time_to_die_s),
            change: (plan, worn) => {
                if (plan.time_to_die_s === null || worn.time_to_die_s === null)
                    return null
                const change = signed(
                    plan.time_to_die_s - worn.time_to_die_s,
                    READING_DECIMALS.lifespan
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
 * A reading's gap from the plan (owner decision A): below it, orange
 * `↓ 14.7` and the `best` icon, read out as `14.7 DPS below the sim's
 * plan`; above it, green `+ 32.8` and the `owned` icon, read out as `32.8
 * DPS above the sim's plan`.
 */
function GapLine({
    gap,
    decimals,
    unit,
}: {
    /** The signed gap: above zero, what you wear is below the plan. */
    gap: number
    decimals: number
    unit: string
}) {
    const below = gap > 0
    return (
        <dd
            data-reading-gap={below ? 'below' : 'above'}
            className={cn(
                'flex min-h-4.5 items-center gap-1 font-mono text-xs font-bold',
                below ? 'text-primary' : 'text-owned'
            )}
        >
            <span aria-hidden="true">{below ? '↓' : '+'}</span>{' '}
            <span>{Math.abs(gap).toFixed(decimals)}</span>
            <span className="sr-only">
                {` ${unit} ${below ? 'below' : 'above'} the sim's plan`}
            </span>
            <SimBestIcon
                variant={below ? 'best' : 'owned'}
                className="ml-0.5 size-3.5"
            />
        </dd>
    )
}

/**
 * The readings.
 *
 * @param file - The loaded results file.
 * @param fight - The fight picked in the fight settings (resource, health,
 * armor and lifespan read it).
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param planShown - The page shows the plan: its values, with their change
 * from what you wear. Otherwise what you wear's, with the gaps below the
 * plan.
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
    const level = file.character.level
    const readings: Reading[] = [
        ...dpsReadings(anchors.length > 0 ? anchors : [fight], level),
        ...forFight(fight),
    ]

    return (
        <section aria-labelledby={headingId}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 id={headingId} className="text-xl">
                    Simulator Data
                </h2>
                {showPlan && (
                    <span className="text-sm text-muted-foreground">
                        for the sim&apos;s plan
                    </span>
                )}
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
                    const gap =
                        !showPlan && planResult && worn
                            ? readingGap(reading.gap, worn, planResult)
                            : null
                    return (
                        <div
                            key={`${reading.fightId}:${reading.label}`}
                            data-reading={reading.label}
                            className="border-b pt-3.5 pr-2 pb-3"
                        >
                            <dt className="flex min-h-5 items-center gap-1 text-sm text-muted-foreground">
                                {reading.label}
                                {reading.info && (
                                    <InfoButton
                                        label={reading.label}
                                        text={reading.info}
                                    />
                                )}
                            </dt>
                            <dd className="mt-1 flex min-h-8.5 items-baseline">
                                <span
                                    data-reading-value
                                    className={cn(
                                        'tabular-nums',
                                        words
                                            ? 'text-lg'
                                            : 'font-mono text-stat font-bold whitespace-nowrap'
                                    )}
                                >
                                    {value}
                                </span>
                                {reading.unit && result && !words && (
                                    <small className="ml-1.5 font-mono text-sm text-muted-foreground">
                                        {reading.unit}
                                    </small>
                                )}
                            </dd>
                            {showPlan ? (
                                <dd
                                    data-reading-change
                                    className={cn(
                                        'min-h-4.5 font-mono text-xs font-bold',
                                        change?.startsWith('-')
                                            ? 'text-muted-foreground'
                                            : reading.tone === 'dps'
                                              ? 'text-chart-1-text'
                                              : 'text-good-text'
                                    )}
                                >
                                    {change ?? ''}
                                </dd>
                            ) : gap !== null ? (
                                <GapLine
                                    gap={gap}
                                    decimals={READING_DECIMALS[reading.gap]}
                                    unit={reading.spokenUnit}
                                />
                            ) : (
                                <dd aria-hidden="true" className="min-h-4.5" />
                            )}
                        </div>
                    )
                })}
            </dl>
        </section>
    )
}
