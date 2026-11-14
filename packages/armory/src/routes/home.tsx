/**
 * The armory planner's one page, `/`. A render error in it shows
 * `WentWrong` (see `../error-boundary.tsx`) instead of a blank page.
 */
import { App } from '../app'

export { WentWrong as ErrorBoundary } from '../error-boundary'

/** The page's title in the browser tab. */
export function meta() {
    return [{ title: 'Armory planner' }]
}

/** Renders the armory planner. */
export default function Home() {
    return <App />
}
