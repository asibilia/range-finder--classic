/**
 * Renders a page to HTML on the Worker and at build time (the prerender of
 * `/`). It always waits for the whole page, so the prerendered file is
 * complete.
 */
import type { EntryContext } from 'react-router'
import { ServerRouter } from 'react-router'
import { renderToReadableStream } from 'react-dom/server'

/**
 * React Router's server entry.
 *
 * @param request - The page request.
 * @param responseStatusCode - The status React Router chose (200, or 404/500
 * for an error page).
 * @param responseHeaders - Headers React Router set; the content type is added.
 * @param routerContext - What React Router needs to render the matched routes.
 * @returns The page as a streamed HTML response.
 */
export default async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext
) {
    let shellRendered = false
    const body = await renderToReadableStream(
        <ServerRouter context={routerContext} url={request.url} />,
        {
            onError(error: unknown) {
                responseStatusCode = 500
                // Errors in the shell reject above and React Router logs
                // them; log only the ones after it.
                if (shellRendered) console.error(error)
            },
        }
    )
    shellRendered = true
    await body.allReady

    responseHeaders.set('Content-Type', 'text/html')
    return new Response(body, {
        headers: responseHeaders,
        status: responseStatusCode,
    })
}
