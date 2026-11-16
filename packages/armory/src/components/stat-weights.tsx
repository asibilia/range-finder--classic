/**
 * What a point of each stat is worth (spec section 9), as the mockup draws
 * it: a solid bar per stat for one fight and, where the fight picked in the
 * fight settings differs, a dashed bar for it, with both values side by
 * side (`1.15 4.04`). Stats worth far more (Weapon DPS) are said in words,
 * off the scale.
 */
import type { ReactNode } from 'react'

import { statWeightsData } from '../chart-data'
import { withArticle } from '../format'
import type { ResultsFile } from '../results-file'

/** The bars' accessible name. */
export const WEIGHTS_CHART_NAME = 'Stat weights'

/** The bars run to a little past the largest value, as the mockup's do. */
const HEADROOM = 1.04

function width(value: number, max: number): string {
    return `${max > 0 ? (Math.max(value, 0) / (max * HEADROOM)) * 100 : 0}%`
}

/**
 * Where the weights came from (`stat_weights[].source`), said under them:
 * the shown fight's, else the first entry's that has one. Null when no
 * entry says (simmed for the character, and the page says nothing new).
 */
function sourceWords(file: ResultsFile, fightId: string): string | null {
    const source =
        file.stat_weights.find((w) => w.fight_id === fightId)?.source ??
        file.stat_weights.find((w) => w.source)?.source
    if (!source) return null
    if (source.kind === 'yours') return 'Stat weights: simmed for your gear.'
    const { spec, class: className } = file.character
    return `Stat weights: precomputed for ${withArticle(`${spec} ${className}`)} at level ${source.level_min}–${source.level_max}, not your gear.`
}

/**
 * The stat weights.
 *
 * @param file - The loaded results file.
 * @param fightId - The solid fight.
 * @param compareId - The dashed fight, or null.
 * @param action - Shown under the weights (Refine), or nothing.
 */
export function StatWeights({
    file,
    fightId,
    compareId = null,
    action,
}: {
    file: ResultsFile
    fightId: string
    compareId?: string | null
    action?: ReactNode
}) {
    const data = statWeightsData(file, fightId, compareId)
    const sourceLine = sourceWords(file, fightId)
    return (
        <section className="mt-5.5">
            <h2 className="mb-1.5 text-xl leading-tight">
                What a point of each stat is worth
            </h2>
            <p className="mb-1.5 text-[0.78125rem] text-muted-foreground">
                In attack power (1 attack power = 1).
                {data?.compareNote && ` ${data.compareNote}`}
            </p>
            {!data ? (
                <p className="text-sm text-muted-foreground">
                    No stat weights for this fight.
                </p>
            ) : (
                <>
                    <dl
                        aria-label={WEIGHTS_CHART_NAME}
                        className="grid grid-cols-[5.375rem_minmax(0,1fr)_4.875rem] items-center gap-x-2 gap-y-2 text-[0.8125rem]"
                    >
                        {data.rows.map((row) => (
                            <div key={row.stat} className="contents">
                                <dt>{row.label}</dt>
                                <dd
                                    className="relative h-2.5"
                                    aria-hidden="true"
                                >
                                    {row.compare_ep !== null && (
                                        <span
                                            data-bar="compare"
                                            className="absolute top-0.5 left-0 h-1.5 rounded-sm border border-dashed border-chart-2"
                                            style={{
                                                width: width(
                                                    row.compare_ep,
                                                    data.max
                                                ),
                                            }}
                                        />
                                    )}
                                    {row.ep !== null && (
                                        <span
                                            data-bar="fight"
                                            className="absolute inset-y-0 left-0 rounded-sm bg-muted-foreground"
                                            style={{
                                                width: width(row.ep, data.max),
                                            }}
                                        />
                                    )}
                                </dd>
                                <dd className="text-right text-muted-foreground tabular-nums">
                                    {row.ep !== null && row.ep.toFixed(2)}
                                    {row.compare_ep !== null && (
                                        <span className="text-chart-2-text">
                                            {' '}
                                            {row.compare_ep.toFixed(2)}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {data.offScale.map((line) => (
                        <p
                            key={line}
                            className="mt-1.5 text-[0.78125rem] text-muted-foreground"
                        >
                            {line}
                        </p>
                    ))}
                </>
            )}
            {sourceLine && (
                <p className="mt-1.5 text-[0.78125rem] text-muted-foreground">
                    {sourceLine}
                </p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </section>
    )
}
