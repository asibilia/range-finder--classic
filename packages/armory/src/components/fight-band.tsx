/**
 * The band under the gear, full width, as the approved mockup lays it out:
 * across the fight (the fight or pull chart with its sentences), where the
 * damage comes from and the stat weights, and the fight settings (the
 * fight picker, its settings read only, and how sure the sim is). Three
 * columns from 90rem, two below (the chart across both), one on a phone.
 * The fight is picked through `onPickFight` (the `pick-fight` action).
 */
import { useId } from 'react'

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

import { minutesSeconds } from '../format'
import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'
import { Checks } from './checks'
import { DamageSplit } from './damage-split'
import { FightChart } from './fight-chart'
import { PullChart } from './pull-chart'
import { Provisional } from './readings'
import { StatWeights } from './stat-weights'

type Fight = ResultsFile['fights'][number]

function yesNo(value: boolean): string {
    return value ? 'yes' : 'no'
}

/** The fight's settings, read only, one line each (spec section 9). */
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
        <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            {lines.map((line) => (
                <li key={line}>{line}</li>
            ))}
        </ul>
    )
}

function FightPicker({
    fights,
    fightId,
    onPick,
}: {
    fights: Fight[]
    fightId: string
    onPick: (fightId: string) => void
}) {
    const labelId = useId()
    const items = fights.map((fight) => ({
        value: fight.fight_id,
        label: fight.label,
    }))
    return (
        <div className="flex flex-col gap-1.5">
            <span id={labelId} className="text-sm font-medium">
                Fight
            </span>
            <Select
                items={items}
                value={fightId}
                onValueChange={(value) => {
                    if (typeof value === 'string') onPick(value)
                }}
            >
                <SelectTrigger aria-labelledby={labelId} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {items.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    )
}

/** What the band's Provisional marker says. */
const BAND_PROVISIONAL_TEXT =
    'Sim numbers are estimates until matched to real fights.'

/**
 * The band.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param fightId - The fight the band is on.
 * @param onPickFight - Another fight was picked.
 */
export function FightBand({
    file,
    plan,
    fightId,
    onPickFight,
}: {
    file: ResultsFile
    plan: Plan | null
    fightId: string
    onPickFight: (fightId: string) => void
}) {
    const headingId = useId()
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
    const planLabel = plan?.label ?? null

    return (
        <section
            aria-labelledby={headingId}
            data-slot="fight-band"
            className="grid gap-x-9 gap-y-8 border-t pt-6 md:grid-cols-2 min-[90rem]:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
        >
            <div
                data-slot="fight-band-chart"
                className="flex min-w-0 flex-col gap-2 md:col-span-2 min-[90rem]:col-span-1"
            >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 id={headingId} className="text-lg font-semibold">
                        Across the fight
                    </h2>
                    <span aria-hidden="true" className="text-muted-foreground">
                        ·
                    </span>
                    <span className="text-sm text-muted-foreground">
                        {fight.label}
                    </span>
                    {file.provisional && (
                        <>
                            <span
                                aria-hidden="true"
                                className="text-muted-foreground"
                            >
                                ·
                            </span>
                            <Provisional text={BAND_PROVISIONAL_TEXT} />
                        </>
                    )}
                </div>
                {!worn ? (
                    <p className="text-sm text-muted-foreground">
                        Not simmed for what you wear.
                    </p>
                ) : fight.kind === 'chain' ? (
                    <PullChart
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                ) : (
                    <FightChart
                        fight={fight}
                        worn={worn}
                        plan={planResult}
                        planLabel={planLabel}
                    />
                )}
            </div>
            <div className="flex min-w-0 flex-col gap-8">
                {worn && <DamageSplit worn={worn} fightLabel={fight.label} />}
                <StatWeights file={file} fightId={fight.fight_id} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
                <h2 className="text-lg font-semibold">Fight settings</h2>
                <FightPicker
                    fights={file.fights}
                    fightId={fight.fight_id}
                    onPick={onPickFight}
                />
                <FightSettings fight={fight} />
                <Checks checks={file.checks} />
            </div>
        </section>
    )
}
