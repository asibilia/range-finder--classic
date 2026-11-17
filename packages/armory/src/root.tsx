/**
 * The document around the armory planner: the same head the page had before
 * React Router (charset, viewport, title) plus React Router's own tags.
 */
import type { ReactNode } from 'react'
import { Links, Meta, Outlet, Scripts } from 'react-router'

import './styles.css'

/**
 * The HTML document every route renders into.
 *
 * @param children - The matched route (or its error boundary).
 */
export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className="dark">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <Meta />
                <Links />
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    )
}

/** The root route: renders the matched page. */
export default function Root() {
    return <Outlet />
}
