/**
 * The card on the right of the gear: the fight picker and its settings,
 * what the sim says, the fight or pull chart with its sentences, the role
 * sliders, where the damage comes from, the stat weights and how sure the
 * sim is. It shows what it is given; the fight is picked through
 * `onPickFight` (the `pick-fight` action).
 */
import { type ReactNode, useId } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

import { minutesSeconds } from '../format'
import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'
import { Checks } from './checks'
import { DamageSplit } from './damage-split'
import { FightChart } from './fight-chart'
import { PullChart } from './pull-chart'
import { type ReadingColumn, Readings } from './readings'
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
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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

/**
 * The card.
 *
 * @param file - The loaded results file.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param fightId - The fight the card is on.
 * @param planShown - The gear shows the plan (its readings are drawn large).
 * @param sliders - The role sliders, under the chart (when the file has plans).
 * @param onPickFight - Another fight was picked.
 */
export function FightCard({
    file,
    plan,
    fightId,
    planShown,
    sliders,
    onPickFight,
}: {
    file: ResultsFile
    plan: Plan | null
    fightId: string
    planShown: boolean
    sliders?: ReactNode
    onPickFight: (fightId: string) => void
}) {
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
    const columns: ReadingColumn[] = [
        { heading: 'What you wear', result: worn },
    ]
    if (plan) columns.push({ heading: plan.label, result: planResult })

    return (
        <aside aria-label="The sim's numbers">
            <Card className="gap-0 rounded-2xl py-5">
                <CardContent className="flex flex-col gap-5 px-5">
                    <div className="flex flex-col gap-2">
                        <FightPicker
                            fights={file.fights}
                            fightId={fight.fight_id}
                            onPick={onPickFight}
                        />
                        <FightSettings fight={fight} />
                    </div>
                    <Readings
                        columns={columns}
                        provisional={file.provisional}
                        planShown={planShown}
                    />
                    {worn &&
                        (fight.kind === 'chain' ? (
                            <PullChart worn={worn} plan={planResult} />
                        ) : (
                            <FightChart
                                fight={fight}
                                worn={worn}
                                plan={planResult}
                            />
                        ))}
                    {sliders && (
                        <>
                            <Separator />
                            {sliders}
                        </>
                    )}
                    <Separator />
                    {worn && <DamageSplit worn={worn} />}
                    <StatWeights file={file} fightId={fight.fight_id} />
                    <Checks checks={file.checks} />
                </CardContent>
            </Card>
        </aside>
    )
}
