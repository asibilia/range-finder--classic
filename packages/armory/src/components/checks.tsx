/**
 * How sure is this? (spec section 9): a disclosure with the counts of the
 * sim's own checks and one line per check.
 */
import type { ResultsFile } from '../results-file'

/**
 * The checks.
 *
 * @param checks - The file's checks.
 */
export function Checks({ checks }: { checks: ResultsFile['checks'] }) {
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
        </details>
    )
}
