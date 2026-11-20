/**
 * The talents dialog (spec section 11): the sim's best build and yours on
 * one tree laid out by tier and column, each talent a round tile with its
 * initials and rank, and a dashed ring on the talents the best build
 * changes.
 */
import { useState } from 'react'

import { cn } from '@/lib/utils'

import type { ResultsFile } from '../results-file'
import { PlannerDialog } from './planner-dialog'
import { Provisional } from './readings'
import { Segmented } from './segmented'

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
        <table className="mt-1 w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-1">
            <caption className="sr-only">{talents.tree}</caption>
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
                            // The dashed ring marks where the two builds
                            // differ, on either build, as the mockup does.
                            const changed =
                                (bestRanks.get(talent.talent_id) ??
                                    talent.rank) !== talent.rank
                            const rank = `${shown}/${talent.max_rank}`
                            const label =
                                changed && build === 'best'
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
                                                'relative mb-0.75 grid size-10 place-items-center rounded-full border bg-muted text-[0.9375rem] text-muted-foreground',
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
                                                'text-foreground tabular-nums',
                                                changed &&
                                                    'font-semibold text-chart-2-text'
                                            )}
                                        >
                                            {rank}
                                        </span>
                                        <span>{talent.name}</span>
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

function names(list: string[]): string {
    if (list.length <= 1) return list.join('')
    return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

/**
 * The words the best-build line draws bold, as the mockup does: the talents
 * it moves from and into, and the DPS gain.
 *
 * @param talents - The file's talents (with a best build).
 * @returns The bold parts.
 */
export function bestBuildBold(talents: Talents): string[] {
    const best = talents.best
    if (!best) return []
    const rankOf = new Map(
        best.ranks.map((entry) => [entry.talent_id, entry.rank])
    )
    const bold = talents.yours.flatMap((talent) => {
        const rank = rankOf.get(talent.talent_id) ?? talent.rank
        if (rank < talent.rank) return [talent.name]
        if (rank > talent.rank)
            return [`${talent.name} ${rank}/${talent.max_rank}`]
        return []
    })
    return [...bold, `+${best.dps_gain.toFixed(1)} DPS`]
}

/** `text` with each of `bold` in it drawn bold. */
function Bolded({ text, bold }: { text: string; bold: string[] }) {
    const escaped = bold
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (escaped.length === 0) return <>{text}</>
    const parts = text.split(new RegExp(`(${escaped.join('|')})`))
    return (
        <>
            {parts.map((part, index) =>
                index % 2 === 1 ? (
                    <b key={index} className="font-bold text-foreground">
                        {part}
                    </b>
                ) : (
                    part
                )
            )}
        </>
    )
}

/**
 * The line under the tree for the best build, in the mockup's words:
 * `Best simmed moves the point from Anticipation into Flurry 5/5: about
 * +1.6 DPS solo.`
 *
 * @param talents - The file's talents (with a best build).
 * @param fight - The fight the best build was simmed on.
 * @returns The sentence.
 */
export function bestBuildWords(
    talents: Talents,
    fight: Fight | undefined
): string {
    const best = talents.best
    if (!best) return ''
    const rankOf = new Map(
        best.ranks.map((entry) => [entry.talent_id, entry.rank])
    )
    const from: string[] = []
    const into: string[] = []
    let moved = 0
    for (const talent of talents.yours) {
        const rank = rankOf.get(talent.talent_id) ?? talent.rank
        if (rank < talent.rank) from.push(talent.name)
        if (rank > talent.rank) {
            into.push(`${talent.name} ${rank}/${talent.max_rank}`)
            moved += rank - talent.rank
        }
    }
    const where = fight
        ? ` ${fight.label.split(',')[0]?.trim().toLowerCase() ?? ''}`
        : ''
    const gain = `about +${best.dps_gain.toFixed(1)} DPS${where}`
    if (moved === 0) return `Best simmed is your build: ${gain}.`
    const points = moved === 1 ? 'the point' : `${moved} points`
    return `Best simmed moves ${points} from ${names(from)} into ${names(into)}: ${gain}.`
}

/**
 * The dialog.
 *
 * @param talents - The file's talents.
 * @param fights - The file's fights (to name the best build's fight).
 * @param sample - A sample file: the best build is made up, and says so.
 * @param provisional - The sim isn't checked yet: marked Provisional.
 * @param onClose - Closes the dialog.
 */
export function TalentsDialog({
    talents,
    fights,
    sample = false,
    provisional = false,
    onClose,
}: {
    talents: Talents
    fights: Fight[]
    sample?: boolean
    provisional?: boolean
    onClose: () => void
}) {
    const { best } = talents
    const [build, setBuild] = useState<Build>(best ? 'best' : 'yours')
    const fight = best
        ? fights.find((candidate) => candidate.fight_id === best.fight_id)
        : undefined

    return (
        <PlannerDialog title="Talents" onClose={onClose} overPane>
            <Segmented
                legend="Which build to show"
                hideLegend
                options={[
                    { value: 'best', label: 'Best simmed', disabled: !best },
                    { value: 'yours', label: 'Your build' },
                ]}
                value={build}
                onChange={(value) => setBuild(value as Build)}
            />
            <TalentGrid talents={talents} build={build} />
            <p
                aria-live="polite"
                className="text-[0.84375rem] text-muted-foreground"
            >
                {build === 'best' && best ? (
                    <>
                        <span data-best-build>
                            <Bolded
                                text={bestBuildWords(talents, fight)}
                                bold={bestBuildBold(talents)}
                            />
                        </span>{' '}
                        {provisional && <Provisional />}
                        {sample && (
                            <span className="ml-1.5 text-[0.71875rem] italic">
                                Sample file
                            </span>
                        )}
                    </>
                ) : (
                    `Your ${talents.points} points.${best ? ' Dashed rings mark where the sim would differ.' : ' Best simmed: Not simmed yet; this file has no best build.'}`
                )}
            </p>
        </PlannerDialog>
    )
}
