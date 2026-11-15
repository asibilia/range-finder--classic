/**
 * How sure is this? (spec section 9): a disclosure with the counts of the
 * sim's own checks and one line per check, then the items the sim left out
 * of the plans (`left_out_items`), listed apart and not counted as checks.
 */
import { useId } from 'react'

import type { ResultsFile } from '../results-file'

type LeftOut = NonNullable<ResultsFile['left_out_items']>[number]

/**
 * A left-out item's line: `Made-up Helm (12345), because it has no source.`
 *
 * @param item - One of the file's `left_out_items`.
 * @returns The line, with one full stop at the end however the reason ends.
 */
export function leftOutWords(item: LeftOut): string {
    const reason = item.reason.trim().replace(/\.+$/, '')
    return `${item.name} (${item.item_id}), because ${reason}.`
}

/**
 * The checks.
 *
 * @param checks - The file's checks: the accuracy gates, all counted.
 * @param leftOut - The file's `left_out_items`; absent or empty, no list.
 */
export function Checks({
    checks,
    leftOut,
}: {
    checks: ResultsFile['checks']
    leftOut?: ResultsFile['left_out_items']
}) {
    const leftOutId = useId()
    const passed = checks.filter((check) => check.passed).length
    return (
        <details className="group rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
                How sure is this?
            </summary>
            <p className="mt-2">{`${passed} checks passed, ${checks.length - passed} failed.`}</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {checks.map((check, index) => (
                    <li key={index}>
                        {`${check.passed ? 'Passed' : 'Failed'}: ${check.name}. ${check.detail}`}
                    </li>
                ))}
            </ul>
            {leftOut && leftOut.length > 0 && (
                <>
                    <p id={leftOutId} className="mt-2">
                        Left out of the plan:
                    </p>
                    <ul
                        aria-labelledby={leftOutId}
                        className="mt-1 flex flex-col gap-0.5 text-muted-foreground"
                    >
                        {leftOut.map((item, index) => (
                            // By position: the schema refuses a repeated
                            // item_id, but the list never relies on it.
                            <li key={index}>{leftOutWords(item)}</li>
                        ))}
                    </ul>
                </>
            )}
        </details>
    )
}
