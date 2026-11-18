/**
 * Dev only: the owner's latest results file, served by the dev server at
 * `/local/latest.json` (`vite-plugin-latest.ts`), and the sim's status file
 * beside it. The page's dev-only hook (`components/latest-file.tsx`) loads
 * this module with a dynamic import when the `localLatest` prop is on, so
 * no build carries it.
 *
 * `followLatest` loads the latest file, then asks again every 10 s with
 * `If-Modified-Since`, and asks for the status file on load and on every
 * refresh. The file is never kept in this browser.
 */
import type { ReadError } from '@/components/bring-in'

import { exportDay } from './format'
import { readResultsText } from './read-results'
import type { ResultsFile } from './results-file'

/** How long between two asks for the latest file. */
const REFRESH_MS = 10_000

/** Said when a later latest file doesn't read and the last good one stays. */
export const UNREADABLE_LATEST =
    "The latest file from this computer couldn't be read; showing the last one that could."

/** What the page is told as the latest file and its status change. */
export type LatestHandlers = {
    /**
     * A latest file that read: show it. `line` says where it came from;
     * `refresh` is true for a newer file found by a refresh (keep the
     * player's choices where the new file has them).
     */
    onFile: (file: ResultsFile, line: string, refresh: boolean) => void
    /** The first latest file didn't read: show the usual read error. */
    onReadError: (error: ReadError) => void
    /**
     * A problem with a newer latest file while an older one shows (or null
     * once a newer one reads).
     */
    onProblem: (problem: string | null) => void
    /** The status file's note, or null for none. */
    onNote: (note: string | null) => void
}

/** The footer's line for a latest file. */
function loadedLine(file: ResultsFile): string {
    return `Loaded from this computer, made ${exportDay(file.made_at)}`
}

/** The note for the status file's JSON, or null when there is none. */
export function statusNote(status: unknown): string | null {
    if (typeof status !== 'object' || status === null) return null
    const { ok, reason } = status as { ok?: unknown; reason?: unknown }
    if (typeof ok !== 'boolean' || ok) return null
    const why =
        typeof reason === 'string' && reason !== ''
            ? reason
            : 'the sim reported a problem'
    return `Showing the previous good file because ${why}.`
}

/**
 * Follows the latest file: loads it, then refreshes every 10 s until
 * stopped. With no latest file (a 404 or a network error on load) it tells
 * the page nothing and stops by itself.
 *
 * @param handlers - What the page does as the file and status change.
 * @returns Stops following: no request is made after it.
 */
export function followLatest(handlers: LatestHandlers): () => void {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastModified: string | null = null
    let shown = false

    const status = async () => {
        let note: string | null = null
        try {
            const answer = await fetch('/local/latest-status.json', {
                cache: 'no-store',
            })
            if (answer.ok) note = statusNote(await answer.json())
        } catch {
            // No status file, or not JSON: no note.
        }
        if (!stopped) handlers.onNote(note)
    }

    /** One ask for the latest file; false when there is no local file. */
    const latest = async (): Promise<boolean> => {
        const headers: Record<string, string> = {}
        if (lastModified !== null) headers['If-Modified-Since'] = lastModified
        let answer: Response
        let text: string
        try {
            answer = await fetch('/local/latest.json', {
                headers,
                cache: 'no-store',
            })
            if (answer.status === 304) return true
            if (!answer.ok) return false
            text = await answer.text()
        } catch {
            return false
        }
        if (stopped) return true
        lastModified = answer.headers.get('Last-Modified') ?? lastModified
        const read = readResultsText(text)
        if (read.file !== null) {
            handlers.onFile(read.file, loadedLine(read.file), shown)
            handlers.onProblem(null)
            shown = true
        } else if (shown) handlers.onProblem(UNREADABLE_LATEST)
        else handlers.onReadError(read.error)
        return true
    }

    const schedule = () => {
        if (stopped) return
        timer = setTimeout(() => {
            timer = null
            void round()
        }, REFRESH_MS)
    }

    const round = async () => {
        if (stopped) return
        await Promise.all([latest(), status()])
        schedule()
    }

    void (async () => {
        const found = await latest()
        if (stopped || !found) return
        await status()
        schedule()
    })()

    return () => {
        stopped = true
        if (timer !== null) clearTimeout(timer)
        timer = null
    }
}
