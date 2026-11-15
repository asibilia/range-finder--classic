/**
 * Catches a render error anywhere in the page and says so, in place of a
 * blank page. Start over clears the error and mounts the page afresh, which
 * brings back the new-visitor state.
 *
 * This is the home route's `ErrorBoundary` (see `routes/home.tsx`): React
 * Router keeps the class React needs to catch render errors inside the
 * library. Start over navigates to the page again; the new location clears
 * the route's error and mounts the page fresh. The page has no loaders, so
 * that navigation asks the server for nothing.
 */
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** The words for whatever was thrown. */
function describe(error: unknown): string {
    if (isRouteErrorResponse(error))
        return `${error.status} ${error.statusText}`.trim()
    return error instanceof Error ? error.message : String(error)
}

/**
 * What the page shows after a render error: the message, the error and a
 * Start over button.
 *
 * @example
 * // src/routes/home.tsx
 * export { WentWrong as ErrorBoundary } from '../error-boundary'
 */
export function WentWrong() {
    const error = useRouteError()
    const navigate = useNavigate()
    return (
        <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-10">
            <Alert variant="destructive">
                <AlertTitle>Something went wrong showing this file.</AlertTitle>
                <AlertDescription>{describe(error)}</AlertDescription>
            </Alert>
            <Button onClick={() => void navigate('/', { replace: true })}>
                Start over
            </Button>
        </main>
    )
}
