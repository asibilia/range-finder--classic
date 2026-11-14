/**
 * The armory planner's Worker: hands every request to React Router. The page
 * itself is a prerendered static file (`build/client/index.html`), which
 * Cloudflare serves before the Worker runs; this only renders what isn't one
 * (error pages). It has no bindings and requests nothing from anywhere.
 */
import { createRequestHandler } from 'react-router'

const requestHandler = createRequestHandler(
    () => import('virtual:react-router/server-build'),
    import.meta.env.MODE
)

export default {
    fetch(request) {
        return requestHandler(request)
    },
} satisfies ExportedHandler<Env>
