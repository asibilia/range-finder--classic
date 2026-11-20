/**
 * The document around the armory planner: charset, viewport, no-referrer and
 * the bounded Wowhead/same-origin CSP, plus React Router's own tags.
 */
import type { ReactNode } from 'react'
import { Links, Meta, Outlet, Scripts } from 'react-router'

import { ARMORY_CSP, DEV_ARMORY_CSP, REFERRER_POLICY } from './security'

// JetBrains Mono (OFL), self-hosted: Vite bundles its latin woff2 files.
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
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
                <meta name="referrer" content={REFERRER_POLICY} />
                <meta
                    httpEquiv="Content-Security-Policy"
                    content={import.meta.env.DEV ? DEV_ARMORY_CSP : ARMORY_CSP}
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
