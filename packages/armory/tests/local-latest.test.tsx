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
import { showBis } from './gear-card'

import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from 'bun:test'
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    SimCancelled,
    type LevelProfile,
    type RaidSimRequest,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { App } from '../src/app'
import { REMEMBERED_FILE_KEY } from '../src/remembered-file'
import { readResultsFile } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'
import { recordedPool } from './helpers/recorded-pool'

const LATEST = '/local/latest.json'
const STATUS = '/local/latest-status.json'
const EXPORT = '/local/latest-export.lua'
const NO_EXPORT = 'Bring in your export to run the sim here.'
const LAST_MODIFIED = 'Tue, 17 Nov 2026 08:00:05 GMT'
const LOADED_LINE = 'Loaded from this computer, made Nov. 17'
const UNREADABLE =
    "The latest file from this computer couldn't be read; showing the last one that could."
const OPEN_ANOTHER = 'Open another file'
const BACK = 'Back to the latest from this computer'
const CHAIN = 'Chain, 4 pulls 20 s apart vs level 33'
const REFRESH_MS = 10_000

type Json = Record<string, unknown>

/** Whether `BIS` (the plan) is chosen in the gear card's `View` switch. */
function planChosen(): boolean {
    const group = screen.getByRole('group', { name: 'View' })
    return (
        within(group).getByRole('radio', { name: 'BIS' }) as HTMLInputElement
    ).checked
}

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
    export: notFound as Answer,
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

beforeAll(() => ensureSimBuild(), 600_000)

beforeEach(() => {
    server.latest = notFound
    server.status = notFound
    server.export = notFound
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
        if (path === EXPORT) return server.export()
        return notFound()
    }) as typeof fetch
    holdRefreshTimers()
})

afterEach(async () => {
    await settle()
    cleanup()
    globalThis.fetch = ORIGINAL_FETCH
    globalThis.setTimeout = ORIGINAL_SET_TIMEOUT
    globalThis.setInterval = ORIGINAL_SET_INTERVAL
    globalThis.clearTimeout = ORIGINAL_CLEAR_TIMEOUT
    globalThis.clearInterval = ORIGINAL_CLEAR_INTERVAL
    held.clear()
    localStorage.clear()
})

/** Renders the page with the local latest file on. */
function renderLocal(createPool?: () => SimPool) {
    render(<App localLatest createPool={createPool} />)
    return userEvent.setup()
}

type HoldablePool = SimPool & {
    holding: boolean
    cancelCalls: number
    pending(): number
    release(): void
}

function holdablePool(base: SimPool): HoldablePool {
    let held: { go: () => void; stop: (error: Error) => void }[] = []
    async function waitIfHeld<T>(run: () => Promise<T>): Promise<T> {
        if (wrapper.holding)
            await new Promise<void>((go, stop) => held.push({ go, stop }))
        return run()
    }
    const wrapper: HoldablePool = {
        ...base,
        size: base.size,
        holding: false,
        cancelCalls: 0,
        sim: (request: RaidSimRequest, profile?: LevelProfile) =>
            waitIfHeld(() =>
                base.sim(request, profile)
            ) as Promise<RaidSimResult>,
        sheet: (request: RaidSimRequest, profile?: LevelProfile) =>
            waitIfHeld(() => base.sheet(request, profile)) as Promise<SimSheet>,
        cancel() {
            wrapper.cancelCalls += 1
            const stopping = held
            held = []
            for (const call of stopping) call.stop(new SimCancelled())
            base.cancel()
        },
        pending: () => held.length,
        release() {
            wrapper.holding = false
            const going = held
            held = []
            for (const call of going) call.go()
        },
    }
    return wrapper
}

async function waitForName(name: string) {
    await screen.findByRole('heading', { name }, { timeout: 4000 })
}

/** The page shows `name` as its character (the gear card's heading). */
function showsCharacter(name: string): boolean {
    return screen.queryByRole('heading', { name }) !== null
}

describe('the page opens on the local latest file', () => {
    test('it overrides the remembered file and says, in the footer, it came from this computer', async () => {
        const kept = JSON.stringify(resultsFile('Kept'))
        localStorage.setItem(REMEMBERED_FILE_KEY, kept)
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        renderLocal()

        await waitForName('Localchar')
        const line = await screen.findByText(LOADED_LINE)
        // In the footer, as the page's other small lines (the owner's
        // design has no line under the header); not in the header.
        expect(line.closest('footer')).not.toBeNull()
        expect(line.closest('header')).toBeNull()
        expect(callsTo(LATEST)[0]?.ifModifiedSince ?? null).toBeNull()
        // The local file is never kept in this browser.
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBe(kept)
    })

    test('a 404 leaves the page as today: the remembered file, no local line or buttons, no polling', async () => {
        localStorage.setItem(
            REMEMBERED_FILE_KEY,
            JSON.stringify(resultsFile('Kept'))
        )
        renderLocal()

        await waitForName('Kept')
        await settle()
        expect(callsTo(LATEST).length).toBeGreaterThan(0)
        expect(screen.queryByText(/Loaded from this computer/)).toBeNull()
        expect(screen.queryByRole('button', { name: OPEN_ANOTHER })).toBeNull()
        expect(screen.queryByRole('button', { name: BACK })).toBeNull()
        expect(screen.queryByText(/couldn't be read/)).toBeNull()

        const before = localCalls().length
        await tick()
        await tick()
        await tick()
        expect(localCalls().length).toBe(before)
        expect(showsCharacter('Kept')).toBe(true)
    })

    test('a network error leaves the page as today: the remembered file, no local line or buttons, no polling', async () => {
        localStorage.setItem(
            REMEMBERED_FILE_KEY,
            JSON.stringify(resultsFile('Kept'))
        )
        server.latest = () => {
            throw new TypeError('Failed to fetch')
        }
        server.status = () => {
            throw new TypeError('Failed to fetch')
        }
        renderLocal()

        await waitForName('Kept')
        await settle()
        expect(callsTo(LATEST).length).toBeGreaterThan(0)
        expect(screen.queryByText(/Loaded from this computer/)).toBeNull()
        expect(screen.queryByText(/couldn't be read/)).toBeNull()
        expect(screen.queryByRole('button', { name: OPEN_ANOTHER })).toBeNull()

        const before = localCalls().length
        await tick()
        await tick()
        await tick()
        expect(localCalls().length).toBe(before)
        expect(showsCharacter('Kept')).toBe(true)
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

    test('a status file that is not JSON, or has no boolean ok, shows no note', async () => {
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.status = () =>
            new Response('not json {', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        renderLocal()
        await waitForName('Localchar')
        await screen.findByText(LOADED_LINE)
        await settle()
        expect(screen.queryByText(/Showing the previous good file/)).toBeNull()

        const statusBefore = callsTo(STATUS).length
        server.latest = notModified
        server.status = json({ ok: 'false', reason: 'the sim crashed' })
        await tick()
        await waitFor(() =>
            expect(callsTo(STATUS).length).toBeGreaterThan(statusBefore)
        )
        await settle()
        expect(screen.queryByText(/Showing the previous good file/)).toBeNull()
        expect(screen.getByText(LOADED_LINE)).toBeDefined()
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
        expect(showsCharacter('Localchar')).toBe(true)
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
        await showBis(user)
        await waitFor(() => expect(planChosen()).toBe(true))

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
        expect(planChosen()).toBe(true)
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
        expect(showsCharacter('Localchar')).toBe(true)
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

describe('Run Simulator with the latest file', () => {
    test('with the export beside the latest file, Run Simulator is enabled and there is no note', async () => {
        server.latest = json(resultsFile('Localchar'))
        server.export = () =>
            new Response('TurboCharExportDB = {}', { status: 200 })
        renderLocal()
        await waitForName('Localchar')
        await waitFor(() => {
            const run = screen.getByRole('button', { name: 'Run Simulator' })
            if (run.hasAttribute('disabled'))
                throw new Error('Run Simulator is still disabled')
        })
        expect(screen.queryByText(NO_EXPORT)).toBeNull()
        expect(callsTo(EXPORT).length).toBeGreaterThan(0)
    })

    test('with no export (a 404), Run Simulator is disabled and says to bring the export in', async () => {
        server.latest = json(resultsFile('Localchar'))
        renderLocal()
        await waitForName('Localchar')
        await settle()
        expect(callsTo(EXPORT).length).toBeGreaterThan(0)
        const run = screen.getByRole('button', { name: 'Run Simulator' })
        expect(run.hasAttribute('disabled')).toBe(true)
        expect(screen.getByText(NO_EXPORT).id).toBe(
            run.getAttribute('aria-describedby') ?? ''
        )
    })

    test('leaving the latest for a dropped results file disables Run Simulator with the no-export note, and Back to the latest re-enables it', async () => {
        server.latest = json(resultsFile('Localchar'))
        server.export = () =>
            new Response('TurboCharExportDB = {}', { status: 200 })
        const user = renderLocal()
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(resultsFile('Dropped'))] },
        })
        await waitForName('Dropped')
        const disabled = screen.getByRole('button', { name: 'Run Simulator' })
        expect(disabled.hasAttribute('disabled')).toBe(true)
        expect(screen.getByText(NO_EXPORT).id).toBe(
            disabled.getAttribute('aria-describedby') ?? ''
        )

        await user.click(screen.getByRole('button', { name: BACK }))
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )
        expect(screen.queryByText(NO_EXPORT)).toBeNull()
    })

    test('clicking Run Simulator on the latest file with its export sims it, updates localStorage, and stops polling', async () => {
        const pool = recordedPool()
        const character = await testcharCharacter(pool)
        const exportLua = exportFromCharacter(character, character.sheet)
        const local = resultsFile('Localchar')
        for (const fight of local.fights as Json[]) {
            if (fight.fight_id === 'dungeon-long') {
                fight.target_level = character.level + 2
                ;(fight.setup as Json).starting_mana_pct = 100
            }
        }
        server.latest = json(local)
        server.export = () => new Response(exportLua, { status: 200 })

        const user = renderLocal(() => pool)
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        await waitForName('Testchar')
        expect(screen.queryByText(LOADED_LINE)).toBeNull()
        const kept = localStorage.getItem(REMEMBERED_FILE_KEY) ?? ''
        expect(kept).not.toBe('')
        expect(readResultsFile(JSON.parse(kept) as unknown).ok).toBe(true)

        await settle()
        const before = localCalls().length
        await tick()
        await tick()
        expect(localCalls().length).toBe(before)
    })

    test('dropping a .json while Run Simulator is active cancels it and does not overwrite the dropped character', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const pool = holdablePool(base)
        const local = resultsFile('Localchar')
        server.latest = json(local)
        server.export = () => new Response(exportLua, { status: 200 })

        const user = renderLocal(() => pool)
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        pool.holding = true
        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0))

        fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(resultsFile('DroppedJson'))] },
        })
        await waitForName('DroppedJson')
        expect(pool.cancelCalls).toBe(1)
        expect(
            screen.queryByRole('progressbar', { name: 'Sim progress' })
        ).toBeNull()

        pool.release()
        await settle()
        expect(showsCharacter('DroppedJson')).toBe(true)
        expect(showsCharacter('Testchar')).toBe(false)
    })

    test('a Run Simulator failure alert on the latest file clears on a latest refresh', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const failing: SimPool = {
            ...base,
            size: base.size,
            sim: () => Promise.reject(new Error('boom')),
            sheet: () => Promise.reject(new Error('boom')),
        }
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.export = () => new Response(exportLua, { status: 200 })

        const user = renderLocal(() => failing)
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        await screen.findByText(/^The sim failed: boom/, undefined, {
            timeout: 4000,
        })

        server.latest = json(resultsFile('Refreshed', '2026-11-17T09:00:00Z'), {
            'Last-Modified': 'Tue, 17 Nov 2026 09:00:00 GMT',
        })
        await tick()
        await waitForName('Refreshed')
        expect(screen.queryByRole('alert')).toBeNull()
    })

    test('a Run Simulator failure alert on the latest file clears on dropping a .json', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const failing: SimPool = {
            ...base,
            size: base.size,
            sim: () => Promise.reject(new Error('boom')),
            sheet: () => Promise.reject(new Error('boom')),
        }
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.export = () => new Response(exportLua, { status: 200 })

        const user = renderLocal(() => failing)
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        await screen.findByText(/^The sim failed: boom/, undefined, {
            timeout: 4000,
        })

        fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(resultsFile('DroppedJson'))] },
        })
        await waitForName('DroppedJson')
        expect(screen.queryByRole('alert')).toBeNull()
    })

    test('a 10 s latest refresh while Run Simulator is active cancels it and does not overwrite the new character or localStorage', async () => {
        const base = recordedPool()
        const character = await testcharCharacter(base)
        const exportLua = exportFromCharacter(character, character.sheet)
        const pool = holdablePool(base)
        server.latest = json(resultsFile('Localchar'), {
            'Last-Modified': LAST_MODIFIED,
        })
        server.export = () => new Response(exportLua, { status: 200 })

        const user = renderLocal(() => pool)
        await waitForName('Localchar')
        await waitFor(() =>
            expect(
                screen
                    .getByRole('button', { name: 'Run Simulator' })
                    .hasAttribute('disabled')
            ).toBe(false)
        )

        pool.holding = true
        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0))

        server.latest = json(resultsFile('Newchar', '2026-11-17T09:00:00Z'), {
            'Last-Modified': 'Tue, 17 Nov 2026 09:00:00 GMT',
        })
        await tick()
        await waitForName('Newchar')
        expect(pool.cancelCalls).toBe(1)
        expect(
            screen.queryByRole('progressbar', { name: 'Sim progress' })
        ).toBeNull()

        pool.release()
        await settle()
        expect(showsCharacter('Newchar')).toBe(true)
        expect(showsCharacter('Testchar')).toBe(false)
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })
})
