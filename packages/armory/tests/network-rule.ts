/**
 * The network rule for the page's own code: no XMLHttpRequest, WebSocket,
 * EventSource or sendBeacon anywhere, and `fetch` only in two modules. In
 * the sim's loader every `fetch(` takes `new URL(`; in
 * `src/local-latest.ts` (dev only) every `fetch(` takes a string literal
 * starting `'/local/'`, with an optional options argument.
 */

/** The sim's loader, from the repo root. */
export const LOADER = 'packages/sim/src/loader.ts'
/** The dev-only module that reads the owner's latest file, from the repo root. */
export const LOCAL_LATEST = 'packages/armory/src/local-latest.ts'

/** Ways of asking a server for something. */
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g

/**
 * How `code` (a source file without comments, at `path` from the repo
 * root) breaks the network rule.
 */
export function networkProblems(path: string, code: string): string[] {
    const problems: string[] = []
    const allowed = path === LOADER || path === LOCAL_LATEST
    for (const [, name] of code.matchAll(NETWORK)) {
        if (name !== 'fetch') problems.push(`${path} uses ${name}`)
        else if (!allowed) problems.push(`${path} uses fetch`)
    }
    if (!allowed) return problems

    const fetches = code.match(/\bfetch\b/g) ?? []
    const calls = [...code.matchAll(/\bfetch\s*\(/g)]
    if (calls.length !== fetches.length)
        problems.push(`${path} names fetch without calling it`)
    if (path === LOADER) {
        const ofUrl = code.match(/\bfetch\s*\(\s*new\s+URL\s*\(/g) ?? []
        if (ofUrl.length !== calls.length)
            problems.push(`${path} fetches something not new URL(`)
    } else {
        const local =
            code.match(
                /\bfetch\s*\(\s*(?:'\/local\/[^'\\\n]*'|"\/local\/[^"\\\n]*")\s*[,)]/g
            ) ?? []
        if (local.length !== calls.length)
            problems.push(`${path} fetches something not a '/local/' string`)
    }
    return problems
}
