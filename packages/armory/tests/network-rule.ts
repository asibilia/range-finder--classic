/**
 * The network rule for the page's own code: no XMLHttpRequest, WebSocket,
 * EventSource or sendBeacon anywhere; `fetch` only in the sim loader and the
 * dev-only latest-file reader; and a dynamically inserted script only in the
 * reviewed Wowhead loader, whose one URL is the official remote script.
 */

/** The sim's loader, from the repo root. */
export const LOADER = 'packages/sim/src/loader.ts'
/** The dev-only module that reads the owner's latest file, from the repo root. */
export const LOCAL_LATEST = 'packages/armory/src/local-latest.ts'
/** The only module allowed to insert a remote script, from the repo root. */
export const WOWHEAD_LOADER = 'packages/armory/src/wowhead-loader.ts'

/** Ways of asking a server for something. */
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g
const SCRIPT = /\bdocument\.createElement\(\s*['"]script['"]\s*\)/g

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
    const scripts = [...code.matchAll(SCRIPT)]
    if (path !== WOWHEAD_LOADER && scripts.length > 0)
        problems.push(`${path} inserts a script`)
    if (path === WOWHEAD_LOADER) {
        if (scripts.length !== 1)
            problems.push(`${path} must insert exactly one script`)
        if (
            (code.match(/https:\/\/wow\.zamimg\.com\/js\/tooltips\.js/g) ?? [])
                .length !== 1
        )
            problems.push(`${path} does not pin the official Wowhead script`)
        if (/nether\.wowhead\.com|\/tooltip\/|dataEnv/.test(code))
            problems.push(`${path} calls Wowhead's data endpoint directly`)
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
