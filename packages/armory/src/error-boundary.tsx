/**
 * Catches a render error anywhere in the page and says so, in place of a
 * blank page. Start over clears the error and mounts the page afresh, which
 * brings back the new-visitor state.
 *
 * React only catches render errors in a class component, so this uses
 * `react-error-boundary`, which keeps that class inside the library behind a
 * function component.
 */
import {
    ErrorBoundary as Boundary,
    type FallbackProps,
} from 'react-error-boundary'
import type { ReactNode } from 'react'

/** What the page shows after a render error. */
function WentWrong({ error, resetErrorBoundary }: FallbackProps) {
    const message = error instanceof Error ? error.message : String(error)
    return (
        <main className="planner">
            <div role="alert" className="read-error">
                <p>Something went wrong showing this file.</p>
                <p>{message}</p>
            </div>
            <button type="button" onClick={resetErrorBoundary}>
                Start over
            </button>
        </main>
    )
}

/**
 * Wraps the page so a render error shows `WentWrong` instead of a blank page.
 *
 * @example
 * <ErrorBoundary><Planner /></ErrorBoundary>
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
    return <Boundary FallbackComponent={WentWrong}>{children}</Boundary>
}
