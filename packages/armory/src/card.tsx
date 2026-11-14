/**
 * The card on the right: the fight picker and its settings, what you wear
 * against the sim's plan, the fight or pull chart with the same facts in
 * words, where the damage comes from, the stat weights and how sure the sim is.
 */
import { useId, useState } from 'react'

import type { Plan } from './plans'
import type { ResultsFile, Stat } from './results-file'

type Fight = ResultsFile['fights'][number]
type Result = ResultsFile['results'][number]
type TimePoint = NonNullable<Result['timeline']>[number]
type Pull = NonNullable<Result['pulls']>[number]

const STAT_LABELS: Record<Stat, string> = {
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

const NOT_SIMMED = 'Not simmed'

/** `m:ss`, whole seconds rounded down. */
export function minutesSeconds(seconds: number): string {
    const whole = Math.floor(seconds)
    const rest = whole % 60
    return `${Math.floor(whole / 60)}:${rest < 10 ? '0' : ''}${rest}`
}

function yesNo(value: boolean): string {
    return value ? 'yes' : 'no'
}

function FightSettings({ fight }: { fight: Fight }) {
    const lines = [
        `Target level ${fight.target_level}`,
        `${fight.kind === 'chain' ? 'Pull length' : 'Fight length'} ${minutesSeconds(fight.duration_s)}`,
    ]
    const { setup } = fight
    if (setup)
        lines.push(
            `Starting mana ${Math.round(setup.starting_mana_pct)}%`,
            `Being hit: ${yesNo(setup.being_hit)}`,
            `Pulls: ${setup.pulls}`,
            `Gap between pulls: ${Math.round(setup.gap_s)} s`,
            `Drinks between pulls: ${yesNo(setup.drinks)}`,
            `Target armor ${setup.target_armor}`
        )
    return (
        <ul className="fight-settings">
            {lines.map((line) => (
                <li key={line}>{line}</li>
            ))}
        </ul>
    )
}

type Column = { heading: string; result: Result | null }

function Readings({
    columns,
    provisional,
}: {
    columns: Column[]
    provisional: boolean
}) {
    const describedBy = useId()
    const cell = (column: Column, read: (result: Result) => string) =>
        column.result ? read(column.result) : NOT_SIMMED
    const rows: [string, (result: Result) => string][] = [
        ['DPS', (result) => result.dps.toFixed(1)],
        ['Health', (result) => String(result.health)],
        ['Armor', (result) => String(result.armor)],
        [
            'Out of mana at',
            (result) =>
                result.out_of_mana_s === null
                    ? 'Never'
                    : minutesSeconds(result.out_of_mana_s),
        ],
    ]
    if (columns.some((column) => column.result?.time_to_die_s != null))
        rows.push([
            'Time to die',
            (result) =>
                result.time_to_die_s === null
                    ? NOT_SIMMED
                    : `${Math.round(result.time_to_die_s)} s`,
        ])
    return (
        <section className="readings">
            <div className="readings-heading">
                <h2>What the sim says</h2>
                {provisional && (
                    <span className="provisional">
                        <span
                            className="provisional-marker"
                            tabIndex={0}
                            aria-describedby={describedBy}
                        >
                            Provisional
                        </span>
                        <span
                            id={describedBy}
                            role="tooltip"
                            className="provisional-text"
                        >
                            The sim isn&apos;t checked against real fights yet.
                        </span>
                    </span>
                )}
            </div>
            <table>
                <thead>
                    <tr>
                        <td />
                        {columns.map((column) => (
                            <th key={column.heading} scope="col">
                                {column.heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([label, read]) => (
                        <tr key={label}>
                            <th scope="row">{label}</th>
                            {columns.map((column) => (
                                <td key={column.heading}>
                                    {cell(column, read)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}

const CHART_WIDTH = 320
const CHART_HEIGHT = 160
const PAD = 20

function Legend({ withPlan }: { withPlan: boolean }) {
    const entries = [
        ['dps-worn', 'DPS, what you wear'],
        ['dps-plan', "DPS, sim's plan"],
        ['mana-worn', 'Mana, what you wear'],
        ['mana-plan', "Mana, sim's plan"],
    ].filter(([key]) => withPlan || !key?.endsWith('plan'))
    return (
        <ul className="chart-legend">
            {entries.map(([key, text]) => (
                <li key={key} data-line={key}>
                    {text}
                </li>
            ))}
        </ul>
    )
}

/** Scales a value into the chart's drawing area, top to bottom. */
function scaleY(value: number, max: number): number {
    const inner = CHART_HEIGHT - 2 * PAD
    return CHART_HEIGHT - PAD - (max > 0 ? (value / max) * inner : 0)
}

function scaleX(value: number, max: number): number {
    const inner = CHART_WIDTH - 2 * PAD
    return PAD + (max > 0 ? (value / max) * inner : 0)
}

function TimeChart({
    fight,
    worn,
    plan,
}: {
    fight: Fight
    worn: Result
    plan: Result | null
}) {
    if (worn.timeline === null) return <p>No fight timeline in this file.</p>
    const planTimeline = plan?.timeline ?? null
    const lines: [string, TimePoint[]][] = [['worn', worn.timeline]]
    if (planTimeline) lines.push(['plan', planTimeline])
    const points = lines.flatMap(([, timeline]) => timeline)
    const maxT = Math.max(fight.duration_s, ...points.map((p) => p.t_s))
    const maxDps = Math.max(0, ...points.map((p) => p.dps))
    const maxMana = Math.max(0, ...points.map((p) => p.mana))
    const polyline = (
        timeline: TimePoint[],
        read: (p: TimePoint) => number,
        max: number
    ) =>
        timeline
            .map((p) => `${scaleX(p.t_s, maxT)},${scaleY(read(p), max)}`)
            .join(' ')
    const markers: [string, number][] = []
    if (worn.out_of_mana_s !== null) markers.push(['worn', worn.out_of_mana_s])
    if (planTimeline && plan?.out_of_mana_s != null)
        markers.push(['plan', plan.out_of_mana_s])
    return (
        <>
            <svg
                role="img"
                aria-label="DPS and mana over the fight"
                className="chart"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
                {lines.map(([key, timeline]) => (
                    <g key={key}>
                        <polyline
                            className={`line dps-${key}`}
                            fill="none"
                            points={polyline(timeline, (p) => p.dps, maxDps)}
                        />
                        <polyline
                            className={`line mana-${key}`}
                            fill="none"
                            points={polyline(timeline, (p) => p.mana, maxMana)}
                        />
                    </g>
                ))}
                {markers.map(([key, at], index) => {
                    const x = scaleX(at, maxT)
                    return (
                        <g key={key} className={`marker marker-${key}`}>
                            <line
                                x1={x}
                                x2={x}
                                y1={PAD}
                                y2={CHART_HEIGHT - PAD}
                                strokeDasharray="4 3"
                            />
                            <text x={x + 2} y={PAD - 4 + index * 12}>
                                {`Out of mana ${minutesSeconds(at)}`}
                            </text>
                        </g>
                    )
                })}
            </svg>
            <Legend withPlan={planTimeline !== null} />
            <p>
                {worn.out_of_mana_s === null
                    ? 'In what you wear you keep mana to the end.'
                    : `In what you wear you run out of mana at ${minutesSeconds(worn.out_of_mana_s)}.`}
            </p>
            {planTimeline && plan && (
                <p>
                    {plan.out_of_mana_s === null
                        ? "The sim's plan keeps mana to the end."
                        : `The sim's plan runs out at ${minutesSeconds(plan.out_of_mana_s)}.`}
                </p>
            )}
        </>
    )
}

/** The pull whose mana ends at 0 first, or null. */
function dryPull(pulls: Pull[]): number | null {
    return pulls.find((pull) => pull.mana_end === 0)?.pull ?? null
}

function PullChart({ worn, plan }: { worn: Result; plan: Result | null }) {
    if (worn.pulls === null) return <p>No pull data in this file.</p>
    const planPulls = plan?.pulls ?? null
    const sets: [string, Pull[]][] = [['worn', worn.pulls]]
    if (planPulls) sets.push(['plan', planPulls])
    const all = sets.flatMap(([, pulls]) => pulls)
    const maxDps = Math.max(0, ...all.map((p) => p.dps))
    const manaMax = Math.max(
        0,
        ...all.flatMap((p) => [p.mana_start, p.mana_end])
    )
    const count = Math.max(...sets.map(([, pulls]) => pulls.length))
    const groupWidth = (CHART_WIDTH - 2 * PAD) / Math.max(count, 1)
    const barWidth = groupWidth / (sets.length * 3 + 1)
    const bottom = CHART_HEIGHT - PAD
    const bar = (key: string, x: number, value: number, max: number) => {
        const y = scaleY(value, max)
        return (
            <rect
                key={key}
                className={`bar ${key}`}
                x={x}
                y={y}
                width={barWidth}
                height={bottom - y}
            />
        )
    }
    return (
        <>
            <svg
                role="img"
                aria-label="DPS and mana per pull"
                className="chart"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
                {Array.from({ length: count }, (_, index) => {
                    const left = PAD + index * groupWidth
                    return (
                        <g key={index} className="pull-group">
                            {sets.map(([key, pulls], setIndex) => {
                                const pull = pulls[index]
                                if (!pull) return null
                                const x = left + barWidth * (setIndex * 3 + 0.5)
                                return (
                                    <g key={key}>
                                        {bar(`dps-${key}`, x, pull.dps, maxDps)}
                                        {bar(
                                            `mana-${key} start`,
                                            x + barWidth,
                                            pull.mana_start,
                                            manaMax
                                        )}
                                        {bar(
                                            `mana-${key} end`,
                                            x + 2 * barWidth,
                                            pull.mana_end,
                                            manaMax
                                        )}
                                    </g>
                                )
                            })}
                        </g>
                    )
                })}
            </svg>
            <Legend withPlan={planPulls !== null} />
            <p className="chart-note">
                Each pull shows a DPS bar, then mana at the start and mana at
                the end (the paler bar).
            </p>
            <p>{dryWords('In what you wear you', worn.pulls)}</p>
            {planPulls && <p>{dryWords("The sim's plan", planPulls, true)}</p>}
        </>
    )
}

function dryWords(subject: string, pulls: Pull[], third = false): string {
    const dry = dryPull(pulls)
    if (dry === null)
        return `${subject} ${third ? 'keeps' : 'keep'} mana through every pull.`
    return `${subject} ${third ? 'runs' : 'run'} dry in pull ${dry}.`
}

function DamageSplit({ worn }: { worn: Result }) {
    return (
        <section>
            <h2>Where the damage comes from</h2>
            <ul className="damage-split">
                {worn.damage_split.map((part) => (
                    <li key={part.name}>
                        {`${part.name} ${Math.round(part.share_pct)}%`}
                    </li>
                ))}
            </ul>
        </section>
    )
}

function StatWeights({
    file,
    fightId,
}: {
    file: ResultsFile
    fightId: string
}) {
    const weights =
        file.stat_weights.find((entry) => entry.fight_id === fightId)
            ?.weights ?? []
    return (
        <section>
            <h2>What a point of each stat is worth</h2>
            <p>In attack power (1 attack power = 1).</p>
            {weights.length === 0 ? (
                <p>No stat weights for this fight.</p>
            ) : (
                <dl className="stat-weights">
                    {weights.map((weight) => (
                        <div key={weight.stat} className="stat-weight">
                            <dt>{STAT_LABELS[weight.stat]}</dt>
                            <dd>{weight.ep.toFixed(2)}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    )
}

function Checks({ checks }: { checks: ResultsFile['checks'] }) {
    const passed = checks.filter((check) => check.passed).length
    return (
        <details className="checks">
            <summary>How sure is this?</summary>
            <p>{`${passed} checks passed, ${checks.length - passed} failed.`}</p>
            <ul>
                {checks.map((check, index) => (
                    <li key={index}>
                        {`${check.passed ? 'Passed' : 'Failed'}: ${check.name}. ${check.detail}`}
                    </li>
                ))}
            </ul>
        </details>
    )
}

export function Card({ file, plan }: { file: ResultsFile; plan: Plan | null }) {
    const [fightId, setFightId] = useState(file.default_fight_id)
    const fightSelectId = useId()
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    if (!fight) return null
    const resultFor = (gear: string) =>
        file.results.find(
            (result) =>
                result.gear === gear && result.fight_id === fight.fight_id
        ) ?? null
    const worn = resultFor('worn')
    const planResult = plan ? resultFor(plan.plan_id) : null
    const columns: Column[] = [{ heading: 'What you wear', result: worn }]
    if (plan) columns.push({ heading: plan.label, result: planResult })

    return (
        <aside className="card" aria-label="The sim's numbers">
            <label htmlFor={fightSelectId}>Fight</label>
            <select
                id={fightSelectId}
                value={fight.fight_id}
                onChange={(event) => setFightId(event.target.value)}
            >
                {file.fights.map((entry) => (
                    <option key={entry.fight_id} value={entry.fight_id}>
                        {entry.label}
                    </option>
                ))}
            </select>
            <FightSettings fight={fight} />
            <Readings columns={columns} provisional={file.provisional} />
            {worn &&
                (fight.kind === 'chain' ? (
                    <PullChart worn={worn} plan={planResult} />
                ) : (
                    <TimeChart fight={fight} worn={worn} plan={planResult} />
                ))}
            {worn && <DamageSplit worn={worn} />}
            <StatWeights file={file} fightId={fight.fight_id} />
            <Checks checks={file.checks} />
        </aside>
    )
}
