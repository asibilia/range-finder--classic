/**
 * The page in dev opens on the owner's latest results file, served by the
 * dev server at `/local/latest.json`, and follows it every 10 s (spec #105,
 * section 3). `fetch` is stubbed with the dev route's answers, and the
 * page's 10 s timers are held: a test fires them with `tick()`, while every
 * other timer (Testing Library's, user-event's) runs as usual. The DOM
 * helper must be the first import.
 */
import './dom'
import { chooseFight, jsonFile, shownFight, variant } from './open-app'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../src/app'
import { REMEMBERED_FILE_KEY } from '../src/remembered-file'

const LATEST = '/local/latest.json'
const STATUS = '/local/latest-status.json'
const LAST_MODIFIED = 'Tue, 17 Nov 2026 08:00:05 GMT'
const LOADED_LINE = 'Loaded from this computer, made 17 November'
const UNREADABLE =
    "The latest file from this computer couldn't be read; showing the last one that could."
const OPEN_ANOTHER = 'Open another file'
const BACK = 'Back to the latest from this computer'
const SHOW_PLAN = "Show the sim's plan"
const SHOW_WORN = 'Show what I wear'
const CHAIN = 'Chain, 4 pulls 20 s apart vs level 33'
const REFRESH_MS = 10_000

type Json = Record<string, unknown>

/** A results file whose character is `name`, made at `madeAt`. */
function resultsFile(name: string, madeAt = '2026-11-17T08:00:00Z'): Json {
    return variant((file) => {
        ;(file.character as Json).name = name
        file.made_at = madeAt
        file.sample = false
    })
}

/** The dev route's answer to one request. */
type Answer = () => Response

function json(body: unknown, headers: Record<string, string> = {}): Answer {
    return () =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...headers },
        })
}

const notFound: Answer = () => new Response('Not found', { status: 404 })
const notModified: Answer = () => new Response(null, { status: 304 })

/** One request the page made: its path and its `If-Modified-Since`. */
type Call = { path: string; ifModifiedSince: string | null }

/** The stubbed dev server: what each path answers, and what was asked. */
const server = {
    latest: notFound as Answer,
    status: notFound as Answer,
    calls: [] as Call[],
}

function pathOf(input: unknown): string {
    const url =
        typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : String((input as { url?: unknown }).url ?? input)
    return new URL(url, 'http://localhost:5173').pathname
}

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_SET_TIMEOUT = globalThis.setTimeout
const ORIGINAL_SET_INTERVAL = globalThis.setInterval
const ORIGINAL_CLEAR_TIMEOUT = globalThis.clearTimeout
const ORIGINAL_CLEAR_INTERVAL = globalThis.clearInterval

/** The page's 10 s timers, held until `tick()`. */
const held = new Map<number, { callback: () => void; repeat: boolean }>()
let nextHeld = 1_000_000

function holdRefreshTimers() {
    const hold =
        (repeat: boolean, original: typeof setTimeout) =>
        (callback: unknown, delay?: number, ...args: unknown[]) => {
            if (delay === REFRESH_MS && typeof callback === 'function') {
                const id = nextHeld++
                held.set(id, {
                    callback: () =>
                        (callback as (...a: unknown[]) => void)(...args),
                    repeat,
                })
                return id
            }
            return (original as (...a: unknown[]) => unknown)(
                callback,
                delay,
                ...args
            )
        }
    const release = (original: typeof clearTimeout) => (id?: unknown) => {
        if (typeof id === 'number' && held.delete(id)) return
        ;(original as (id?: unknown) => void)(id)
    }
    globalThis.setTimeout = hold(
        false,
        ORIGINAL_SET_TIMEOUT
    ) as unknown as typeof setTimeout
    globalThis.setInterval = hold(
        true,
        ORIGINAL_SET_INTERVAL as unknown as typeof setTimeout
    ) as unknown as typeof setInterval
    globalThis.clearTimeout = release(
        ORIGINAL_CLEAR_TIMEOUT
    ) as typeof clearTimeout
    globalThis.clearInterval = release(
        ORIGINAL_CLEAR_INTERVAL as unknown as typeof clearTimeout
    ) as typeof clearInterval
}

/** Lets pending fetches and renders settle, on a real short timer. */
async function settle() {
    await act(
        () => new Promise<void>((resolve) => ORIGINAL_SET_TIMEOUT(resolve, 30))
    )
}

/** 10 s pass: every held refresh timer fires once. */
async function tick() {
    await act(async () => {
        for (const [id, timer] of [...held]) {
            if (!timer.repeat) held.delete(id)
            timer.callback()
        }
    })
    await settle()
}

function localCalls(): Call[] {
    return server.calls.filter((call) => call.path.startsWith('/local/'))
}

function callsTo(path: string): Call[] {
    return server.calls.filter((call) => call.path === path)
}

beforeEach(() => {
    server.latest = notFound
    server.status = notFound
    server.calls = []
    held.clear()
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const path = pathOf(input)
        server.calls.push({
            path,
            ifModifiedSince: new Headers(init?.headers).get(
                'If-Modified-Since'
            ),
        })
        if (path === LATEST) return server.latest()
        if (path === STATUS) return server.status()
        return notFound()
    }) as typeof fetch
    holdRefreshTimers()
})

afterEach(() => {
    cleanup()
    globalThis.fetch = ORIGINAL_FETCH
    globalThis.setTimeout = ORIGINAL_SET_TIMEOUT
    globalThis.setInterval = ORIGINAL_SET_INTERVAL
    globalThis.clearTimeout = ORIGINAL_CLEAR_TIMEOUT
    globalThis.clearInterval = ORIGINAL_CLEAR_INTERVAL
    held.clear()
})

/** Renders the page with the local latest file on. */
function renderLocal() {
    render(<App localLatest />)
    return userEvent.setup()
}

async function waitForName(name: string) {
    await screen.findByRole('heading', { level: 1, name }, { timeout: 4000 })
}

describe('the page opens on the local latest file', () => {
    test('it overrides the remembered file and says it came from this computer', async () => {
        const kept = JSON.stringify(resultsFile('Kept'))
        localStorage.setItem(REMEMBERED_FILE_KEY, kept)
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        renderLocal()

        await waitForName('Localchar')
        expect(await screen.findByText(LOADED_LINE)).toBeDefined()
        expect(callsTo(LATEST)[0]?.ifModifiedSince ?? null).toBeNull()
        // The local file is never kept in this browser.
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBe(kept)
    })
})

describe('the status file', () => {
    test('ok false with a reason shows the note with that reason', async () => {
        server.latest = json(resultsFile('Localchar'))
        server.status = json({
            made_at: '2026-11-17T08:00:00Z',
            export_saved_at: '2026-11-17T07:59:00Z',
            ok: false,
            reason: 'the export had no sheet',
            results_file: 'latest.json',
        })
        renderLocal()

        await waitForName('Localchar')
        expect(
            await screen.findByText(
                'Showing the previous good file because the export had no sheet.'
            )
        ).toBeDefined()
    })

    test('ok false with a null reason says the sim reported a problem', async () => {
        server.latest = json(resultsFile('Localchar'))
        server.status = json({
            made_at: '2026-11-17T08:00:00Z',
            export_saved_at: '2026-11-17T07:59:00Z',
            ok: false,
            reason: null,
            results_file: 'latest.json',
        })
        renderLocal()

        await waitForName('Localchar')
        expect(
            await screen.findByText(
                'Showing the previous good file because the sim reported a problem.'
            )
        ).toBeDefined()
    })

    test('a status that turns ok false while latest.json answers 304 shows its note after the next tick', async () => {
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.status = json({ ok: true, reason: null })
        renderLocal()
        await waitForName('Localchar')
        await screen.findByText(LOADED_LINE)
        await settle()

        server.latest = notModified
        server.status = json({ ok: false, reason: 'the sim crashed' })
        await tick()

        expect(
            await screen.findByText(
                'Showing the previous good file because the sim crashed.'
            )
        ).toBeDefined()
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
            'Localchar'
        )
    })
})

describe('the page follows the local latest file', () => {
    test('after 10 s it asks again with If-Modified-Since and the status, and a new file keeps the fight and plan view', async () => {
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.status = json({ ok: true, reason: null })
        const user = renderLocal()
        await waitForName('Localchar')
        await settle()

        await chooseFight(user, CHAIN)
        await user.click(screen.getByRole('button', { name: SHOW_PLAN }))
        await screen.findByRole('button', { name: SHOW_WORN })

        const latestBefore = callsTo(LATEST).length
        const statusBefore = callsTo(STATUS).length
        server.latest = json(resultsFile('Newchar', '2026-11-17T09:00:00Z'), {
            'Last-Modified': 'Tue, 17 Nov 2026 09:00:00 GMT',
        })
        await tick()

        await waitFor(() =>
            expect(callsTo(LATEST).length).toBeGreaterThan(latestBefore)
        )
        expect(callsTo(LATEST)[latestBefore]?.ifModifiedSince).toBe(
            LAST_MODIFIED
        )
        expect(callsTo(STATUS).length).toBeGreaterThan(statusBefore)

        await waitForName('Newchar')
        expect(shownFight()).toBe(CHAIN)
        expect(screen.getByRole('button', { name: SHOW_WORN })).toBeDefined()
    })

    test('a later 200 that does not read keeps the old character and says so', async () => {
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        renderLocal()
        await waitForName('Localchar')
        await settle()

        server.latest = json(
            { hello: 'world' },
            { 'Last-Modified': 'Tue, 17 Nov 2026 09:00:00 GMT' }
        )
        await tick()

        expect(await screen.findByText(UNREADABLE)).toBeDefined()
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
            'Localchar'
        )
    })
})

describe('opening another file while the latest shows', () => {
    test('a dropped file shows, stops the polling, and Back to the latest resumes it', async () => {
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        const user = renderLocal()
        await waitForName('Localchar')
        await screen.findByText(LOADED_LINE)
        expect(screen.getByRole('button', { name: OPEN_ANOTHER })).toBeDefined()
        await settle()

        fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(resultsFile('Dropped'))] },
        })
        await waitForName('Dropped')
        expect(screen.queryByText(LOADED_LINE)).toBeNull()

        const before = localCalls().length
        // 30 s.
        await tick()
        await tick()
        await tick()
        expect(localCalls().length).toBe(before)

        await user.click(screen.getByRole('button', { name: BACK }))
        await waitForName('Localchar')
        expect(await screen.findByText(LOADED_LINE)).toBeDefined()
        await settle()

        const resumed = callsTo(LATEST).length
        await tick()
        await waitFor(() =>
            expect(callsTo(LATEST).length).toBeGreaterThan(resumed)
        )
    })
})
