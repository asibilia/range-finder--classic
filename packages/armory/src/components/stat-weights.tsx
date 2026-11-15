/**
 * What a point of each stat is worth (spec section 9): a horizontal bar per
 * stat for the fight the card is on and, as a second dashed bar, the
 * longest single fight with weights (the 2-minute dungeon fight), with both
 * values. Stats worth far more (Weapon DPS) are said in words, off the
 * scale.
 */
import { statWeightsData } from '../chart-data'
import type { ResultsFile } from '../results-file'

/** The bars' accessible name. */
export const WEIGHTS_CHART_NAME = 'Stat weights'

function width(value: number, max: number): string {
    return `${max > 0 ? (Math.max(value, 0) / max) * 100 : 0}%`
}

/**
 * The stat weights.
 *
 * @param file - The loaded results file.
 * @param fightId - The fight the card is on.
 */
export function StatWeights({
    file,
    fightId,
}: {
    file: ResultsFile
    fightId: string
}) {
    const data = statWeightsData(file, fightId)
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">
                What a point of each stat is worth
            </h2>
            <p className="text-xs text-muted-foreground">
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
                        className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm"
                    >
                        {data.rows.map((row) => (
                            <div key={row.stat} className="contents">
                                <dt>{row.label}</dt>
                                <dd className="relative h-3" aria-hidden="true">
                                    {row.compare_ep !== null && (
                                        <span
                                            data-bar="compare"
                                            className="absolute inset-y-0.5 left-0 rounded-sm border border-dashed border-chart-2 bg-chart-2/10"
                                            style={{
                                                width: width(
                                                    row.compare_ep,
                                                    data.max
                                                ),
                                            }}
                                        />
                                    )}
                                    <span
                                        data-bar="fight"
                                        className="absolute inset-y-0 left-0 rounded-sm bg-foreground/45"
                                        style={{
                                            width: width(row.ep, data.max),
                                        }}
                                    />
                                </dd>
                                <dd className="flex justify-end gap-2 text-right tabular-nums">
                                    <span>{row.ep.toFixed(2)}</span>
                                    {row.compare_ep !== null && (
                                        <span className="text-chart-2">
                                            {row.compare_ep.toFixed(2)}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {data.offScale.map((line) => (
                        <p key={line} className="text-xs text-muted-foreground">
                            {line}
                        </p>
                    ))}
                </>
            )}
        </section>
    )
}
