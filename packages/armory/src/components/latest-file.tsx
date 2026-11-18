/**
 * Dev only: the page's side of the owner's latest results file, the one the
 * dev server serves at `/local/` (`local-latest.ts` reads and follows it).
 * `useLocalLatest` owns its state, starts and stops following it, and
 * makes the header's `Open another file` / `Back to the latest from this
 * computer` buttons (plain text, like Wishlist), the lines under the header
 * (the status note, a problem) and the footer's `Loaded from this computer,
 * made Nov. 17` line.
 *
 * Off in a build: Vite sets `import.meta.env.PROD` there, so Rollup keeps
 * only the inert hook, and none of the code, words or `local-latest.ts`
 * below reaches the built page.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'

import type { ReadError } from '@/components/bring-in'
import { Button } from '@/components/ui/button'

import type { LatestHandlers } from '../local-latest'
import type { ResultsFile } from '../results-file'

/** What the page does for the latest file. */
export type LatestPage = {
    /** Follow the latest file (the `App` prop `localLatest`). */
    on: boolean
    /**
     * Shows a latest file that read. `refresh` is true for a newer file
     * found by a refresh: keep the player's choices where it has them.
     */
    show: (file: ResultsFile, refresh: boolean) => void
    /** Shows the first latest file's read error. */
    showError: (error: ReadError) => void
    /** Stops a run that would replace the latest file when done. */
    beforeFollow: () => void
    /** Opens a file picked with `Open another file`. */
    openPicked: (picked: File) => void
}

/** The latest file's part of the page. */
export type Latest = {
    /** Whether the latest file shows (and is followed). */
    following: boolean
    /** Another file replaces the latest one: following stops. */
    leave: () => void
    /** The header's button, or null. */
    action: ReactNode
    /** The lines under the header (the status note, a problem), or null. */
    lines: ReactNode
    /** The footer's line (`Loaded from this computer, made Nov. 17`), or null. */
    footer: ReactNode
}

/** The latest file's state, once one showed. */
type Shown = {
    /** True while it shows; false once another file replaced it. */
    following: boolean
    /** `Loaded from this computer, made Nov. 17`. */
    line: string
    /** The status file's note, or null. */
    note: string | null
    /** Why a newer latest file isn't shown, or null. */
    problem: string | null
}

/** No latest file: nothing to leave, nothing added to the page. */
const INERT: Latest = {
    following: false,
    leave: () => {},
    action: null,
    lines: null,
    footer: null,
}

/** A plain text button, as the header's Wishlist. */
const TEXT_BUTTON =
    'h-auto px-1 py-1 text-[0.9375rem] font-normal text-muted-foreground'

/** The hook in dev: follows the latest file while `page.on`. */
function useFollowedLatest(page: LatestPage): Latest {
    const [shown, setShown] = useState<Shown | null>(null)
    // Stops following the latest file, while it's followed.
    const stopFollowing = useRef<(() => void) | null>(null)
    // Each follow's number: a follow that's no longer the latest is ignored.
    const follow = useRef(0)
    const openOther = useRef<HTMLInputElement | null>(null)

    /** Stops following the latest file (no state change). */
    const unfollow = () => {
        follow.current += 1
        stopFollowing.current?.()
        stopFollowing.current = null
    }

    /** Another file replaces the latest one: following stops. */
    const leave = () => {
        unfollow()
        setShown((current) => current && { ...current, following: false })
    }

    const handlers: LatestHandlers = {
        onFile: (file, line, refresh) => {
            page.show(file, refresh)
            setShown((current) => ({
                following: true,
                line,
                note: current?.following ? current.note : null,
                problem: null,
            }))
        },
        onReadError: page.showError,
        onProblem: (problem) =>
            setShown((current) => current && { ...current, problem }),
        onNote: (note) =>
            setShown((current) => current && { ...current, note }),
    }

    /** Loads the latest file and follows it. */
    const start = () => {
        unfollow()
        page.beforeFollow()
        const id = follow.current
        void import('../local-latest').then((module) => {
            if (follow.current === id)
                stopFollowing.current = module.followLatest(handlers)
        })
    }

    // The latest file overrides the kept one: the page calls this hook
    // after it recalls that one.
    useEffect(() => {
        if (page.on) start()
        return unfollow
    }, [page.on])

    if (shown === null) return { ...INERT, leave }
    if (!shown.following)
        return {
            following: false,
            leave,
            action: (
                <Button variant="ghost" className={TEXT_BUTTON} onClick={start}>
                    Back to the latest from this computer
                </Button>
            ),
            lines: null,
            footer: null,
        }
    return {
        following: true,
        leave,
        action: (
            <>
                <input
                    ref={openOther}
                    type="file"
                    accept=".json,application/json,.lua"
                    hidden
                    onChange={(event) => {
                        const picked = event.currentTarget.files?.[0]
                        event.currentTarget.value = ''
                        if (picked) page.openPicked(picked)
                    }}
                />
                <Button
                    variant="ghost"
                    className={TEXT_BUTTON}
                    onClick={() => openOther.current?.click()}
                >
                    Open another file
                </Button>
            </>
        ),
        lines:
            shown.note || shown.problem ? (
                <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {shown.note && <p role="note">{shown.note}</p>}
                    {shown.problem && <p role="alert">{shown.problem}</p>}
                </div>
            ) : null,
        footer: <p>{shown.line}</p>,
    }
}

/**
 * The page's side of the local latest file. In a build it is inert:
 * nothing is followed, and it adds no button or line.
 *
 * @param page - What the page does as the latest file changes.
 * @returns Whether it shows, how to leave it, and what it adds to the page.
 *
 * @example
 * ```tsx
 * const latest = useLocalLatest(page)
 * if (latest.following) latest.leave()
 * ```
 */
export function useLocalLatest(page: LatestPage): Latest {
    // A constant for the page's whole life, so the hooks called never vary.
    return import.meta.env.PROD ? INERT : useFollowedLatest(page)
}
