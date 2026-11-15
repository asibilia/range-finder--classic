/**
 * The data behind the card's charts, worked out from a results file before
 * anything is drawn: the fight chart's points and out-of-mana markers, the
 * pull chart's groups, the damage split's parts and the stat weights' bars.
 * Pure functions, so each chart is tested on the series it is given apart
 * from how Recharts draws it.
 */
import { minutesSeconds } from './format'
import type { ResultsFile, Stat } from './results-file'

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]

/** Who a series belongs to: what you wear, or the sim's plan. */
export type Who = 'worn' | 'plan'

/** One moment of the fight chart; plan values are absent without a plan. */
export type FightPoint = {
    t_s: number
    dps_worn?: number
    mana_worn?: number
    dps_plan?: number
    mana_plan?: number
}

/** A dashed out-of-mana line and its label. */
export type ManaMarker = {
    who: Who
    at_s: number
    label: string
    /** 0 for the earlier marker, 1 for the later, so labels don't overlap. */
    row: 0 | 1
    /** The label reads right of the line (`start`) or left of it (`end`). */
    anchor: 'start' | 'end'
}

/** Everything the fight chart draws. */
export type FightChartData = {
    points: FightPoint[]
    withPlan: boolean
    markers: ManaMarker[]
    duration_s: number
}

/**
 * The fight chart's data: what you wear and, when the plan has a timeline,
 * the plan, joined on time; plus a marker at each out-of-mana time.
 *
 * @param fight - The fight the card is on (a single fight).
 * @param worn - What you wear's result on it.
 * @param plan - The plan's result on it, or null.
 * @returns The data, or null when what you wear has no timeline.
 */
export function fightChartData(
    fight: Fight,
    worn: Result,
    plan: Result | null
): FightChartData | null {
    if (worn.timeline === null) return null
    const planTimeline = plan?.timeline ?? null
    const byTime = new Map<number, FightPoint>()
    const at = (t_s: number) => {
        const found = byTime.get(t_s)
        if (found) return found
        const point: FightPoint = { t_s }
        byTime.set(t_s, point)
        return point
    }
    for (const point of worn.timeline) {
        const row = at(point.t_s)
        row.dps_worn = point.dps
        row.mana_worn = point.mana
    }
    for (const point of planTimeline ?? []) {
        const row = at(point.t_s)
        row.dps_plan = point.dps
        row.mana_plan = point.mana
    }
    const points = [...byTime.values()].sort((a, b) => a.t_s - b.t_s)

    const times: { who: Who; at_s: number }[] = []
    if (typeof worn.out_of_mana_s === 'number')
        times.push({ who: 'worn', at_s: worn.out_of_mana_s })
    if (planTimeline && typeof plan?.out_of_mana_s === 'number')
        times.push({ who: 'plan', at_s: plan.out_of_mana_s })
    times.sort((a, b) => a.at_s - b.at_s)
    const lastT = points.at(-1)?.t_s ?? 0
    const duration_s = Math.max(fight.duration_s, lastT)
    // As the mockup places them: with two markers the earlier label reads
    // leftwards from its line (top row) and the later one rightwards (second
    // row), so they never overlap. A label that would run off the chart
    // flips: leftwards past 60% of the fight, rightwards before 30%.
    const anchorFor = (at_s: number, preferred: 'start' | 'end') => {
        if (at_s > duration_s * 0.6) return 'end'
        if (at_s < duration_s * 0.3) return 'start'
        return preferred
    }
    const markers = times.map(({ who, at_s }, index): ManaMarker => ({
        who,
        at_s,
        label: `${who === 'worn' ? 'Worn' : 'Plan'}: out of mana ${minutesSeconds(at_s)}`,
        row: index === 0 ? 0 : 1,
        anchor: anchorFor(
            at_s,
            times.length === 2 && index === 0 ? 'end' : 'start'
        ),
    }))
    return {
        points,
        withPlan: planTimeline !== null,
        markers,
        duration_s,
    }
}
function average(values: number[]): number | null {
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** The averages under a chart, and how far apart its points are. */
export type ChartAverages = {
    worn: number
    /** The plan's average, or null when the chart draws no plan. */
    plan: number | null
    /** Seconds between points when they are evenly spaced, else null. */
    spacing_s: number | null
}

/**
 * The fight chart's averages: mean DPS over the timeline for what you wear
 * and the plan, and the spacing between its points.
 *
 * @param worn - What you wear's result (with a timeline).
 * @param plan - The plan's result, or null.
 * @returns The averages, or null without a worn timeline.
 */
export function timelineAverages(
    worn: Result,
    plan: Result | null
): ChartAverages | null {
    const wornAverage = average((worn.timeline ?? []).map((point) => point.dps))
    if (wornAverage === null || !worn.timeline) return null
    const gaps = worn.timeline
        .slice(1)
        .map((point, index) => point.t_s - (worn.timeline?.[index]?.t_s ?? 0))
    const spacing = gaps[0]
    return {
        worn: wornAverage,
        plan: average((plan?.timeline ?? []).map((point) => point.dps)),
        spacing_s:
            spacing !== undefined &&
            spacing > 0 &&
            gaps.every((gap) => Math.abs(gap - spacing) < 1e-9)
                ? spacing
                : null,
    }
}

/**
 * The pull chart's averages: mean DPS per pull for what you wear and the
 * plan (spacing is one pull, so null).
 *
 * @param worn - What you wear's result on the chain fight.
 * @param plan - The plan's result, or null.
 * @returns The averages, or null without worn pulls.
 */
export function pullAverages(
    worn: Result,
    plan: Result | null
): ChartAverages | null {
    const wornAverage = average((worn.pulls ?? []).map((pull) => pull.dps))
    if (wornAverage === null) return null
    return {
        worn: wornAverage,
        plan: average((plan?.pulls ?? []).map((pull) => pull.dps)),
        spacing_s: null,
    }
}

/** Time ticks from 0 to the end: every 10 s up to a minute, 15 s up to 3 minutes, else 30 s. */
export function timeTicks(duration_s: number): number[] {
    const step = duration_s <= 60 ? 10 : duration_s <= 180 ? 15 : 30
    const ticks: number[] = []
    for (let t = 0; t <= duration_s; t += step) ticks.push(t)
    return ticks
}

/**
 * One pull of the pull chart. Mana is a span, `[end, start]`, drawn as a
 * bar from the mana left at the end up to the mana at the start.
 */
export type PullGroup = {
    pull: number
    label: string
    dps_worn?: number
    dps_plan?: number
    mana_worn?: [number, number]
    mana_plan?: [number, number]
}

/** Everything the pull chart draws. */
export type PullChartData = { groups: PullGroup[]; withPlan: boolean }

/**
 * The pull chart's data: per pull, DPS and the mana from start to end, for
 * what you wear and, when the plan has pulls, the plan.
 *
 * @param worn - What you wear's result on the chain fight.
 * @param plan - The plan's result on it, or null.
 * @returns The data, or null when what you wear has no pulls.
 */
export function pullChartData(
    worn: Result,
    plan: Result | null
): PullChartData | null {
    if (worn.pulls === null) return null
    const planPulls = plan?.pulls ?? null
    const byPull = new Map<number, PullGroup>()
    const group = (pull: number) => {
        const found = byPull.get(pull)
        if (found) return found
        const made: PullGroup = { pull, label: `Pull ${pull}` }
        byPull.set(pull, made)
        return made
    }
    for (const pull of worn.pulls) {
        const row = group(pull.pull)
        row.dps_worn = pull.dps
        row.mana_worn = [pull.mana_end, pull.mana_start]
    }
    for (const pull of planPulls ?? []) {
        const row = group(pull.pull)
        row.dps_plan = pull.dps
        row.mana_plan = [pull.mana_end, pull.mana_start]
    }
    return {
        groups: [...byPull.values()].sort((a, b) => a.pull - b.pull),
        withPlan: planPulls !== null,
    }
}

/** One part of the damage split, with its colour by order. */
export type SplitPart = {
    name: string
    share_pct: number
    /** `Melee 33%`: whole percent. */
    text: string
    color: string
}

/**
 * The damage split's parts in file order, coloured by order (the file has
 * no spell school to colour by).
 *
 * @param worn - What you wear's result.
 * @returns The parts.
 */
export function splitParts(worn: Result): SplitPart[] {
    return worn.damage_split.map((part, index) => ({
        name: part.name,
        share_pct: part.share_pct,
        text: `${part.name} ${Math.round(part.share_pct)}%`,
        // Five chart colours, then the same five paler.
        color:
            index < 5
                ? `var(--chart-${index + 1})`
                : `color-mix(in oklch, var(--chart-${(index % 5) + 1}) 50%, var(--background))`,
    }))
}

/** The words for each stat in the results file (spec section 9). */
export const STAT_LABELS: Record<Stat, string> = {
    strength: 'Strength',
    agility: 'Agility',
    stamina: 'Stamina',
    intellect: 'Intellect',
    spirit: 'Spirit',
    attack_power: 'Attack power',
    hit_rating: 'Hit rating',
    crit_rating: 'Crit rating',
    spell_damage: 'Spell damage',
    mana_per_5: 'Mana per 5 s',
    weapon_dps: 'Weapon DPS',
}

/** Stats worth far more per point than the rest, kept off the bar scale. */
const OFF_SCALE: readonly Stat[] = ['weapon_dps']

/** One stat's bars: the chosen fight, and the long fight to compare. */
export type WeightRow = {
    stat: Stat
    label: string
    ep: number
    compare_ep: number | null
}

/** Everything the stat weights draw. */
export type StatWeightsData = {
    rows: WeightRow[]
    /** The longest single fight with weights, when it isn't the chosen one. */
    compare: Fight | null
    /** The note for the dashed bars, when there is a fight to compare. */
    compareNote: string | null
    /** Off-scale stats, said in words: `Weapon DPS is worth 14.19 per point, off this scale.` */
    offScale: string[]
    /** The value the bars are scaled to (the largest on the scale). */
    max: number
}

/**
 * The stat weights for a fight, with the longest single fight that has
 * weights (the 2-minute dungeon fight in the samples) as a second, dashed
 * bar to compare, unless it is the chosen fight or its weights are the
 * chosen fight's.
 *
 * @param file - The loaded results file.
 * @param fightId - The fight the card is on.
 * @returns The data, or null when the fight has no weights.
 */
export function statWeightsData(
    file: ResultsFile,
    fightId: string
): StatWeightsData | null {
    const weightsOf = (id: string) =>
        file.stat_weights.find((entry) => entry.fight_id === id)?.weights ??
        null
    const chosen = weightsOf(fightId)
    if (!chosen || chosen.length === 0) return null

    const compare =
        file.fights
            .filter(
                (fight) =>
                    fight.kind === 'single' &&
                    (weightsOf(fight.fight_id)?.length ?? 0) > 0
            )
            .reduce<Fight | null>(
                (longest, fight) =>
                    !longest || fight.duration_s > longest.duration_s
                        ? fight
                        : longest,
                null
            ) ?? null
    const otherFight = compare && compare.fight_id !== fightId ? compare : null
    const otherWeights = otherFight ? weightsOf(otherFight.fight_id) : null
    // Weights the same as the chosen fight's add nothing to compare.
    const same =
        otherWeights !== null &&
        chosen.every(
            (weight) =>
                otherWeights.find((other) => other.stat === weight.stat)?.ep ===
                weight.ep
        )
    const compareWith = same ? null : otherFight
    const compareWeights = compareWith ? otherWeights : null
    const compareEp = (stat: Stat) =>
        compareWeights?.find((weight) => weight.stat === stat)?.ep ?? null

    const rows = chosen
        .filter((weight) => !OFF_SCALE.includes(weight.stat))
        .map((weight) => ({
            stat: weight.stat,
            label: STAT_LABELS[weight.stat],
            ep: weight.ep,
            compare_ep: compareWith ? compareEp(weight.stat) : null,
        }))
        .sort(
            (a, b) => b.ep - a.ep || (b.compare_ep ?? 0) - (a.compare_ep ?? 0)
        )
    const offScale = chosen
        .filter((weight) => OFF_SCALE.includes(weight.stat))
        .map(
            (weight) =>
                `${STAT_LABELS[weight.stat]} is worth ${weight.ep.toFixed(2)} per point, off this scale.`
        )
    const max = Math.max(
        0,
        ...rows.flatMap((row) => [row.ep, row.compare_ep ?? 0])
    )
    return {
        rows,
        compare: compareWith,
        compareNote: compareWith
            ? compareWith.fight_id === 'dungeon-long'
                ? 'Dashed: in 2-minute dungeon fights, once you run dry.'
                : `Dashed: in ${compareWith.label}.`
            : null,
        offScale,
        max,
    }
}

/**
 * The line under a chart, as the mockup words it: `Average about 75.4 DPS
 * in what you wear, 84.5 with the sim's plan (max damage). Points every 5
 * seconds.`
 *
 * @param averages - The chart's averages.
 * @param planLabel - The plan's label, or null when the chart draws no plan.
 * @param perPull - On the pull chart: `DPS per pull`, and no spacing.
 * @returns The sentence(s).
 */
export function averageWords(
    averages: ChartAverages,
    planLabel: string | null,
    perPull = false
): string {
    const unit = perPull ? 'DPS per pull' : 'DPS'
    const plan =
        averages.plan !== null && planLabel !== null
            ? `, ${averages.plan.toFixed(1)} with the sim's plan (${planLabel.toLowerCase()})`
            : ''
    const spacing =
        averages.spacing_s === null
            ? ''
            : ` Points every ${averages.spacing_s} ${averages.spacing_s === 1 ? 'second' : 'seconds'}.`
    return `Average about ${averages.worn.toFixed(1)} ${unit} in what you wear${plan}.${spacing}`
}
