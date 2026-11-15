/**
 * The talents dialog (spec section 11): the sim's best build and yours on
 * one tree laid out by tier and column, each talent a round tile with its
 * initials and rank, and a dashed ring on the talents the best build
 * changes.
 */
import { useId, useState } from 'react'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

import type { ResultsFile } from '../results-file'
import { PlannerDialog } from './planner-dialog'

type Talents = ResultsFile['talents']
type Fight = ResultsFile['fights'][number]
type Build = 'best' | 'yours'

function range(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1)
}

/** `Ancestral Knowledge` is `AK`, `Flurry` is `Fl`. */
export function initials(name: string): string {
    const words = name.split(/[\s-]+/).filter((word) => /^[A-Za-z]/.test(word))
    if (words.length === 1) return (words[0] ?? '').slice(0, 2)
    return words
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join('')
}

function TalentGrid({ talents, build }: { talents: Talents; build: Build }) {
    const bestRanks = new Map(
        (talents.best?.ranks ?? []).map((entry) => [
            entry.talent_id,
            entry.rank,
        ])
    )
    const tiers = Math.max(0, ...talents.yours.map((talent) => talent.tier))
    const columns = Math.max(0, ...talents.yours.map((talent) => talent.column))

    return (
        <table className="w-full table-fixed border-separate border-spacing-y-1">
            <caption className="pb-2 text-left text-sm text-muted-foreground">
                {talents.tree}
            </caption>
            <tbody>
                {range(tiers).map((tier) => (
                    <tr key={tier}>
                        {range(columns).map((column) => {
                            const talent = talents.yours.find(
                                (candidate) =>
                                    candidate.tier === tier &&
                                    candidate.column === column
                            )
                            if (!talent) return <td key={column} />
                            const shown =
                                build === 'best'
                                    ? (bestRanks.get(talent.talent_id) ??
                                      talent.rank)
                                    : talent.rank
                            const changed =
                                build === 'best' && shown !== talent.rank
                            const rank = `${shown}/${talent.max_rank}`
                            const label = changed
                                ? `${talent.name}, ${rank}, changed from ${talent.rank}/${talent.max_rank}`
                                : `${talent.name}, ${rank}`
                            return (
                                <td key={column} className="align-top">
                                    <div
                                        role="group"
                                        aria-label={label}
                                        data-changed={changed}
                                        className="flex flex-col items-center gap-0.5 text-center text-xs leading-tight"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                'relative grid size-10 place-items-center rounded-full border bg-muted text-sm text-muted-foreground',
                                                shown > 0 &&
                                                    'border-ring bg-secondary text-foreground',
                                                shown === talent.max_rank &&
                                                    shown > 0 &&
                                                    'border-gain',
                                                changed &&
                                                    'after:absolute after:-inset-1.5 after:rounded-full after:border-[1.5px] after:border-dashed after:border-chart-2'
                                            )}
                                        >
                                            {initials(talent.name)}
                                        </span>
                                        <span
                                            className={cn(
                                                'tabular-nums',
                                                changed &&
                                                    'font-semibold text-chart-2'
                                            )}
                                        >
                                            {rank}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {talent.name}
                                        </span>
                                    </div>
                                </td>
                            )
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

/**
 * The dialog.
 *
 * @param talents - The file's talents.
 * @param fights - The file's fights (to name the best build's fight).
 * @param onClose - Closes the dialog.
 */
export function TalentsDialog({
    talents,
    fights,
    onClose,
}: {
    talents: Talents
    fights: Fight[]
    onClose: () => void
}) {
    const { best } = talents
    const [build, setBuild] = useState<Build>(best ? 'best' : 'yours')
    const groupId = useId()
    const fight = best
        ? fights.find((candidate) => candidate.fight_id === best.fight_id)
        : undefined

    return (
        <PlannerDialog
            title="Talents"
            description={`${talents.points} points`}
            onClose={onClose}
            wide
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span id={groupId} className="text-sm font-medium">
                        Build
                    </span>
                    <RadioGroup
                        aria-labelledby={groupId}
                        value={build}
                        onValueChange={(value) => setBuild(value as Build)}
                        className="flex w-auto gap-4"
                    >
                        <Label className="flex items-center gap-2">
                            <RadioGroupItem value="best" disabled={!best} />
                            Best simmed
                        </Label>
                        <Label className="flex items-center gap-2">
                            <RadioGroupItem value="yours" />
                            Your build
                        </Label>
                    </RadioGroup>
                </div>
                {!best && (
                    <p className="text-sm text-muted-foreground">
                        No best build in this file.
                    </p>
                )}
                <TalentGrid talents={talents} build={build} />
                {best && (
                    <p className="text-sm">
                        {`The sim's best build: +${best.dps_gain.toFixed(1)} DPS in ${fight?.label ?? best.fight_id}.`}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    A dashed ring marks a talent the best build changes.
                </p>
            </div>
        </PlannerDialog>
    )
}
