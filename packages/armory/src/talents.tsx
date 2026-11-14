/**
 * The talents dialog (spec section 11): the sim's best build and yours on one
 * grid laid out by tier and column, with the talents that differ marked.
 */
import { useId, useState } from 'react'

import { Dialog } from './dialog'
import type { ResultsFile } from './results-file'

type Talents = ResultsFile['talents']
type Fight = ResultsFile['fights'][number]
type Build = 'best' | 'yours'

function range(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1)
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
        <table className="talent-grid">
            <caption>{talents.tree}</caption>
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
                                <td key={column}>
                                    <div
                                        className="talent"
                                        role="group"
                                        aria-label={label}
                                        data-changed={changed}
                                    >
                                        <span>{talent.name}</span>{' '}
                                        <span>{rank}</span>
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
        <Dialog title="Talents" onClose={onClose}>
            <p>{`${talents.points} points`}</p>
            <div
                className="talent-builds"
                role="radiogroup"
                aria-labelledby={groupId}
            >
                <span id={groupId}>Build</span>
                <label>
                    <input
                        type="radio"
                        name={groupId}
                        checked={build === 'best'}
                        disabled={!best}
                        onChange={() => setBuild('best')}
                    />
                    Best simmed
                </label>
                <label>
                    <input
                        type="radio"
                        name={groupId}
                        checked={build === 'yours'}
                        onChange={() => setBuild('yours')}
                    />
                    Your build
                </label>
            </div>
            {!best && <p>No best build in this file.</p>}
            <TalentGrid talents={talents} build={build} />
            {best && (
                <p>
                    {`The sim's best build: +${best.dps_gain.toFixed(1)} DPS in ${fight?.label ?? best.fight_id}.`}
                </p>
            )}
        </Dialog>
    )
}
