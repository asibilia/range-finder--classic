/**
 * The data behind the card's charts, worked out from a results file before
 * anything is drawn: the fight chart's points and out-of-mana markers, the
 * pull chart's groups, the damage split's parts and the stat weights' bars.
 * Pure functions, so each chart is tested on the series it is given apart
 * from how Recharts draws it.
 */
import { lengthWords, minutesSeconds } from './format'
import type { ResultsFile, Stat } from './results-file'

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]

/** Who a series belongs to: what you wear, or the sim's plan. */
export type Who = 'worn' | 'plan'

/**
 * One bar group of the fight chart: a stretch of the fight and each
 * series' average DPS over the points in it (absent when it has none).
 */
export type BarGroup = {
    start_s: number
    end_s: number
    dps_worn?: number
    dps_plan?: number
}

/**
 * One moment of the fight chart; plan values are absent without a plan.
 * DPS is its bar group's average (what the bars draw); mana is the
 * moment's own. The first moment of each group carries the group, so the
 * bars are drawn once per group.
 */
export type FightPoint = {
    t_s: number
    dps_worn?: number
    mana_worn?: number
    dps_plan?: number
    mana_plan?: number
    bar?: BarGroup
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
    /** The bar groups, in time order. */
    bars: BarGroup[]
    withPlan: boolean
    markers: ManaMarker[]
    duration_s: number
    /** Seconds each bar group covers (`bucketSeconds`). */
    bar_s: number
}

/** The bar group lengths the fight chart picks from, in seconds. */
export const BUCKET_STEPS_S = [5, 10, 15, 20, 30, 60, 120] as const

/** About how many bar groups the fight chart draws. */
export const BUCKET_COUNT = 10

/**
 * How many seconds each of the fight chart's bar groups covers: the
 * smallest of 5, 10, 15, 20, 30, 60 and 120 that is at least a tenth of
 * the fight, so a fight has at most ten groups (120 for fights past 20
 * minutes, which then have more).
 *
 * @param duration_s - The fight's length.
 * @returns The seconds per group.
 *
 * @example
 * ```ts
 * bucketSeconds(120) // 15: 8 groups
 * bucketSeconds(30) // 5: 6 groups
 * ```
 */
export function bucketSeconds(duration_s: number): number {
    const wanted = duration_s / BUCKET_COUNT
    return BUCKET_STEPS_S.find((step) => step >= wanted) ?? 120
}

/** The mean of the values present, or undefined when none is. */
function meanOf(values: (number | undefined)[]): number | undefined {
    const present = values.filter((value) => value !== undefined)
    if (present.length === 0) return undefined
    return present.reduce((sum, value) => sum + value, 0) / present.length
}

/**
 * The points in bar groups of `bucket_s` seconds from 0, each group the
 * average DPS of each series over its own points. A point at the very end
 * of the fight (t = the length, a whole number of groups) joins the last
 * group rather than starting one of its own; a last group shorter than
 * the rest (a length that isn't a whole number of groups) ends at the
 * fight's end and is averaged over its own points.
 *
 * @param points - The chart's points, in time order.
 * @param duration_s - The fight's length.
 * @param bucket_s - Seconds per group (`bucketSeconds`).
 * @returns The groups that have points, in time order, and for each point
 * the index of its group.
 *
 * @example
 * ```ts
 * dpsBuckets([{ t_s: 0, dps_worn: 100 }, { t_s: 5, dps_worn: 110 }], 120, 15)
 * // groups: [{ start_s: 0, end_s: 15, dps_worn: 105 }]
 * ```
 */
export function dpsBuckets(
    points: FightPoint[],
    duration_s: number,
    bucket_s: number
): { groups: BarGroup[]; groupOf: number[] } {
    const count = Math.max(1, Math.ceil(duration_s / bucket_s - 1e-9))
    const members = new Map<number, FightPoint[]>()
    const indexOf = points.map((point) =>
        Math.min(Math.floor(point.t_s / bucket_s + 1e-9), count - 1)
    )
    points.forEach((point, at) => {
        const index = indexOf[at] ?? 0
        members.set(index, [...(members.get(index) ?? []), point])
    })
    const order = [...members.keys()].sort((a, b) => a - b)
    const groups = order.map((index): BarGroup => {
        const inside = members.get(index) ?? []
        const group: BarGroup = {
            start_s: index * bucket_s,
            end_s: Math.min((index + 1) * bucket_s, duration_s),
        }
        const worn = meanOf(inside.map((point) => point.dps_worn))
        const plan = meanOf(inside.map((point) => point.dps_plan))
        if (worn !== undefined) group.dps_worn = worn
        if (plan !== undefined) group.dps_plan = plan
        return group
    })
    return {
        groups,
        groupOf: indexOf.map((index) => order.indexOf(index)),
    }
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
    const sorted = [...byTime.values()].sort((a, b) => a.t_s - b.t_s)

    const times: { who: Who; at_s: number }[] = []
    if (typeof worn.out_of_mana_s === 'number')
        times.push({ who: 'worn', at_s: worn.out_of_mana_s })
    if (planTimeline && typeof plan?.out_of_mana_s === 'number')
        times.push({ who: 'plan', at_s: plan.out_of_mana_s })
    times.sort((a, b) => a.at_s - b.at_s)
    const lastT = sorted.at(-1)?.t_s ?? 0
    const duration_s = Math.max(fight.duration_s, lastT)
    // DPS is drawn as wide bars, two to a group, one group per
    // `bucketSeconds` of the fight: each point shows its group's average,
    // and the first point of each group carries the group to draw.
    const bar_s = bucketSeconds(duration_s)
    const { groups, groupOf } = dpsBuckets(sorted, duration_s, bar_s)
    const drawn = new Set<number>()
    const points = sorted.map((point, at) => {
        const index = groupOf[at] ?? -1
        const group = groups[index]
        if (!group) return point
        const shown: FightPoint = { ...point }
        delete shown.dps_worn
        delete shown.dps_plan
        if (group.dps_worn !== undefined) shown.dps_worn = group.dps_worn
        if (group.dps_plan !== undefined) shown.dps_plan = group.dps_plan
        if (!drawn.has(index)) {
            drawn.add(index)
            shown.bar = group
        }
        return shown
    })
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
        bars: groups,
        withPlan: planTimeline !== null,
        markers,
        duration_s,
        bar_s,
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

/**
 * Ticks for a value axis as the mockup's fight chart has them: from 0 to a
 * round top with some room above the highest value, in `parts` even steps
 * (DPS 0, 35, 70, 105, 140; mana 0, 800, 1600, 2400).
 *
 * @param highest - The highest value drawn.
 * @param parts - How many steps.
 * @param room - How much room above it (1.1: a tenth).
 * @param round - The top is a multiple of this.
 * @returns The ticks, from 0 up.
 */
export function valueTicks(
    highest: number,
    parts: number,
    room: number,
    round: number
): number[] {
    const top = Math.max(round, Math.ceil((highest * room) / round) * round)
    return Array.from({ length: parts + 1 }, (_, index) =>
        Math.round((top / parts) * index)
    )
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

/** One part of the damage split, with its colour. */
export type SplitPart = {
    name: string
    share_pct: number
    /** `Melee 33%`: whole percent. */
    text: string
    color: string
}

/**
 * The damage split's parts in file order. When every part has a spell
 * school (`damage_split[].school`) each is coloured by its school, a little
 * darker for each further part of the same school, as the mockup colours
 * them; otherwise by order.
 *
 * @param worn - What you wear's result.
 * @returns The parts.
 */
export function splitParts(worn: Result): SplitPart[] {
    const bySchool = splitHasSchools(worn)
    const seen = new Map<string, number>()
    return worn.damage_split.map((part, index) => {
        let color: string
        if (bySchool && part.school) {
            const nth = seen.get(part.school) ?? 0
            seen.set(part.school, nth + 1)
            color =
                nth === 0
                    ? `var(--school-${part.school})`
                    : `color-mix(in oklch, var(--school-${part.school}), black ${Math.min(nth * 22, 60)}%)`
        } else
            // Five chart colours, then the same five paler.
            color =
                index < 5
                    ? `var(--chart-${index + 1})`
                    : `color-mix(in oklch, var(--chart-${(index % 5) + 1}) 50%, var(--background))`
        return {
            name: part.name,
            share_pct: part.share_pct,
            text: `${part.name} ${Math.round(part.share_pct)}%`,
            color,
        }
    })
}

/**
 * True when every part of the split has a spell school, so the split is
 * coloured by school (and says so).
 *
 * @param worn - What you wear's result.
 * @returns Whether the split is coloured by school.
 */
export function splitHasSchools(worn: Result): boolean {
    return (
        worn.damage_split.length > 0 &&
        worn.damage_split.every((part) => Boolean(part.school))
    )
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
    mana_per_5: 'Mana per 5',
    weapon_dps: 'Weapon DPS',
}

/** Stats worth far more per point than the rest, kept off the bar scale. */
const OFF_SCALE: readonly Stat[] = ['weapon_dps']

/**
 * One stat's bars: the solid fight's value (null when it is worth nothing
 * there) and, when it differs, the dashed fight's.
 */
export type WeightRow = {
    stat: Stat
    label: string
    ep: number | null
    compare_ep: number | null
}

/** Everything the stat weights draw. */
export type StatWeightsData = {
    rows: WeightRow[]
    /** The fight drawn dashed, or null with none to compare. */
    compare: Fight | null
    /** The note for the dashed bars, when there is a fight to compare. */
    compareNote: string | null
    /** Off-scale stats, said in words: `Weapon DPS is worth 14.19 per point, off this scale.` */
    offScale: string[]
    /** The value the bars are scaled to (the largest on the scale). */
    max: number
}

/**
 * How the dashed fight is named in the note, as the mockup words it: `2-minute
 * dungeon fights`. Falls back to the fight's label.
 */
function fightsLike(fight: Fight): string {
    const kind = fight.label.split(',')[0]?.trim().toLowerCase() ?? ''
    if (fight.kind !== 'single' || !kind) return fight.label
    const length =
        fight.duration_s % 60 === 0
            ? `${fight.duration_s / 60}-minute`
            : `${fight.duration_s}-second`
    return `${length} ${kind} fights`
}

/**
 * The stat weights as the mockup shows them: a solid bar per stat for one
 * fight (the shortest single fight, solo in the sample) and, where the other
 * fight's value differs, a dashed bar for it (the fight picked in the fight
 * settings: the 2-minute dungeon fight the sample opens on), with both
 * values. Stats worth nothing in both are left out; rows run from the most
 * worth (solid) down, stats worth nothing in the solid fight last.
 *
 * @param file - The loaded results file.
 * @param fightId - The solid fight.
 * @param compareId - The dashed fight, or null.
 * @returns The data, or null when neither fight has weights.
 */
export function statWeightsData(
    file: ResultsFile,
    fightId: string,
    compareId: string | null = null
): StatWeightsData | null {
    const weightsOf = (id: string | null) =>
        id === null
            ? null
            : (file.stat_weights.find((entry) => entry.fight_id === id)
                  ?.weights ?? null)
    const chosen = weightsOf(fightId)
    if (!chosen || chosen.length === 0) return null
    const compareFight =
        compareId !== null && compareId !== fightId
            ? (file.fights.find((fight) => fight.fight_id === compareId) ??
              null)
            : null
    const other = compareFight ? weightsOf(compareFight.fight_id) : null
    const otherEp = (stat: Stat) =>
        other?.find((weight) => weight.stat === stat)?.ep ?? null
    const differs = chosen.some((weight) => {
        const value = otherEp(weight.stat)
        return value !== null && value !== weight.ep
    })
    const compare = other && differs ? compareFight : null

    const rows: WeightRow[] = chosen
        .filter((weight) => !OFF_SCALE.includes(weight.stat))
        .map((weight) => {
            const value = compare ? otherEp(weight.stat) : null
            return {
                stat: weight.stat,
                label: STAT_LABELS[weight.stat],
                ep: weight.ep === 0 ? null : weight.ep,
                compare_ep:
                    value !== null && value !== weight.ep && value !== 0
                        ? value
                        : null,
            }
        })
        .filter((row) => row.ep !== null || row.compare_ep !== null)
        .sort(
            (a, b) =>
                (b.ep ?? -1) - (a.ep ?? -1) ||
                (b.compare_ep ?? 0) - (a.compare_ep ?? 0)
        )
    const offScale = chosen
        .filter((weight) => OFF_SCALE.includes(weight.stat))
        .map(
            (weight) =>
                `${STAT_LABELS[weight.stat]} is worth ${weight.ep.toFixed(2)} per point, off this scale.`
        )
    const max = Math.max(
        0,
        ...rows.flatMap((row) => [row.ep ?? 0, row.compare_ep ?? 0])
    )
    const runsDry =
        compare !== null &&
        file.results.some(
            (result) =>
                result.gear === 'worn' &&
                result.fight_id === compare.fight_id &&
                typeof result.out_of_mana_s === 'number'
        )
    return {
        rows,
        compare,
        compareNote: compare
            ? `Dashed: in ${fightsLike(compare)}${runsDry ? ', once you run dry' : ''}.`
            : null,
        offScale,
        max,
    }
}

/**
 * A fight in the mockup's words, for headings and notes: `Dungeon, 2
 * minutes vs level 33` (the label's first part, the length in words and the
 * level). A chain fight keeps its label.
 *
 * @param fight - The fight.
 * @returns The words.
 */
export function fightWords(fight: Fight): string {
    const kind = fight.label.split(',')[0]?.trim()
    if (fight.kind !== 'single' || !kind) return fight.label
    return `${kind}, ${lengthWords(fight.duration_s)} vs level ${fight.target_level}`
}

/**
 * The line under a chart, as the mockup words it: `Average about 75.4 DPS
 * in what you wear, 84.5 with the sim's plan (max damage). Bars every 5
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
            : ` Bars every ${averages.spacing_s} ${averages.spacing_s === 1 ? 'second' : 'seconds'}.`
    return `Average about ${averages.worn.toFixed(1)} ${unit} in what you wear${plan}.${spacing}`
}
