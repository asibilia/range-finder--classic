/**
 * The page side of the browser sim: drop an export, watch it sim, read the
 * result, Refine, and the stops. The page gets its pool through the root's
 * `createPool` prop; here that's a fake `SimPool` answering every `sim` and
 * `sheet` call from `tests/fixtures/sim-outputs.json` (`bun run sim:record`),
 * keyed by the SHA-256 hex of `JSON.stringify({ method, request, profile })`,
 * and reading the data files from `packages/sim/build/`. Exports are
 * Testchar's (`exportFromCharacter`) until #83, and the owner's buffed
 * export. The DOM helper must be the first import.
 */
import './dom'
import { readingLabels, sentence, shownFight, variant } from './open-app'

import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    SimCancelled,
    weightsBand,
    weightsFileName,
    type RaidSimRequest,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
    type SimVersion,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { App } from '../src/app'
import { buildRequest, level60Check } from '../src/browser-sim'
import { COMING_SOON_NOTE, NO_EXPORT_NOTE } from '../src/components/sim-panel'
import { readResultsFile } from '../src/results-file'
import sample from '../src/sample-truncha.json'
import { exportFromCharacter } from './helpers/export-from-character'
import { BUILD, callKey, recorded } from './helpers/recorded-pool'

const SIM_DIR = join(import.meta.dir, '../../sim')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')
const OUTPUTS = join(import.meta.dir, 'fixtures/sim-outputs.json')

const SIMMING = 'Simming your character on this computer.'
const CREDIT =
    'Sim: WoWSims Forever (MIT), changed to sim levels below 60. Item and spell data: World of Warcraft game data, as WoWSims packages it.'
const BANNER =
    "The sim isn't checked against real fights yet. Use these numbers to compare gear, not as a promise of DPS."
const PHONE =
    'This works best on a computer. On a phone the sim is slow and may run out of memory.'
const PHONE_QUERY = '(pointer: coarse) and (max-width: 768px)'
const PRECOMPUTED =
    'Stat weights: precomputed for an Enhancement Shaman at level 30–34, not your gear.'
const YOURS = 'Stat weights: simmed for your gear.'
const EXPORT_AGAIN = 'Export again out of combat and drop the new file.'
const REFINE = 'Refine for your gear (about 3 min)'
const WEIGHTS_FIRST = 'Simming stat weights for your gear first (about 3 min).'
const REMEMBERED_KEY = 'armory:last-results-file'
/** The sim that times the device before weights are simmed (spec section 5). */
const WARM_UP_ITERATIONS = 500

/** The fake pool's time per iteration: Refine's estimate comes to 3 min. */
const MS_PER_ITERATION = 0.93
const LOADS = { timeout: 20_000 }

type Listener = (done: number, planned: number) => void

type FakePool = SimPool & {
    /** While true, `sim` and `sheet` calls wait for `release()`. */
    holding: boolean
    /** While true, calls report no progress: the test calls `emit`. */
    scripted: boolean
    /** Answers that replace the recorded ones, by call key. */
    overrides: Map<string, unknown>
    /** Answers a call with no recorded answer (else it throws). */
    fallback?: (
        method: 'sim' | 'sheet',
        request: RaidSimRequest,
        profile?: unknown
    ) => unknown
    /** Every sim request, in order. */
    requests: RaidSimRequest[]
    pending(): number
    /** Lets every waiting call go on, and stops holding. */
    release(): void
    emit(done: number, planned: number): void
}

/** A `SimPool` that answers from the recorded outputs. */
function fakePool(): FakePool {
    const listeners = new Set<Listener>()
    let held: { go: () => void; stop: (error: Error) => void }[] = []
    let done = 0
    let planned = 0
    let stats = { calls: 0, iterations: 0, ms: 0 }

    async function answer(
        method: 'sim' | 'sheet',
        request: RaidSimRequest,
        profile?: unknown
    ): Promise<unknown> {
        if (fake.holding)
            await new Promise<void>((go, stop) => held.push({ go, stop }))
        if (method === 'sim') fake.requests.push(request)
        const key = callKey(method, request, profile)
        const value =
            fake.overrides.get(key) ??
            (await recorded())[key] ??
            (await fake.fallback?.(method, request, profile))
        if (value === undefined)
            throw new Error(
                `sim-outputs.json has no ${method} call ${key}: run bun run sim:record.`
            )
        if (method === 'sim') {
            const options = request.simOptions as
                { iterations?: number } | undefined
            const iterations = options?.iterations ?? 0
            stats = {
                calls: stats.calls + 1,
                iterations: stats.iterations + iterations,
                ms: stats.ms + iterations * MS_PER_ITERATION,
            }
        }
        done += 1
        if (!fake.scripted)
            for (const listener of [...listeners]) listener(done, planned)
        return structuredClone(value)
    }

    const fake: FakePool = {
        size: 8,
        holding: false,
        scripted: false,
        overrides: new Map(),
        requests: [],
        sim: (request, profile) =>
            answer('sim', request, profile) as Promise<RaidSimResult>,
        sheet: (request, profile) =>
            answer('sheet', request, profile) as Promise<SimSheet>,
        version: () =>
            Bun.file(join(BUILD, 'version.json')).json() as Promise<SimVersion>,
        async weights(className, spec, level) {
            const band = weightsBand(level)
            if (!band) return null
            const file = Bun.file(
                join(
                    BUILD,
                    'weights',
                    weightsFileName(className, spec, ...band)
                )
            )
            return (await file.exists()) ? file.json() : null
        },
        data: (name) => Bun.file(join(BUILD, name)).json(),
        stats: () => ({ ...stats }),
        batch(count) {
            done = 0
            planned = count
            stats = { calls: 0, iterations: 0, ms: 0 }
        },
        onProgress(callback) {
            listeners.add(callback)
            return () => {
                listeners.delete(callback)
            }
        },
        cancel() {
            const stopping = held
            held = []
            for (const call of stopping) call.stop(new SimCancelled())
            done = 0
            planned = 0
            stats = { calls: 0, iterations: 0, ms: 0 }
            for (const listener of [...listeners]) listener(0, 0)
        },
        close() {},
        pending: () => held.length,
        release() {
            fake.holding = false
            const going = held
            held = []
            for (const call of going) call.go()
        },
        emit(doneNow, plannedNow) {
            for (const listener of [...listeners]) listener(doneNow, plannedNow)
        },
    }
    return fake
}

type Testchar = Awaited<ReturnType<typeof testcharCharacter>>
let testcharMemo: Promise<Testchar> | undefined
function testchar(): Promise<Testchar> {
    testcharMemo ??= testcharCharacter(fakePool())
    return testcharMemo
}

/** Testchar's export, its sheet changed by `sheet` when given. */
async function testcharExport(
    sheet?: (sheet: Testchar['sheet']) => Testchar['sheet']
): Promise<string> {
    const character = await testchar()
    return exportFromCharacter(
        character,
        sheet ? sheet(character.sheet) : character.sheet
    )
}

/** Testchar as a Warrior, every point in the first tree or the second. */
async function warriorExport(tree: 'Arms' | 'Fury'): Promise<string> {
    const character = await testchar()
    const points = character.talents.replace(/-/g, '')
    const warrior = {
        ...character,
        class: 'Warrior',
        talents: tree === 'Arms' ? points : `-${points}`,
        profile: { ...character.profile, class: 'ClassWarrior' },
    }
    return exportFromCharacter(warrior, character.sheet)
}

function luaFile(text: string): File {
    return new File([text], 'TurboCharExport.lua', { type: '' })
}

function renderWith(pool: FakePool) {
    render(<App createPool={() => pool} runSimulator />)
    return userEvent.setup()
}

type User = ReturnType<typeof userEvent.setup>

function fileInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('no file input on the page')
    return input
}

async function pickFile(user: User, file: File): Promise<void> {
    await user.upload(fileInput(), file)
}

function dropFile(file: File): void {
    fireEvent.drop(document.body, { dataTransfer: { files: [file] } })
}

async function characterLoaded(name = 'Testchar'): Promise<HTMLElement> {
    // The gear card's h2 names the character.
    return screen.findByRole('heading', { name }, LOADS)
}

/** Renders the page with `pool`, picks Testchar's export, waits for it. */
async function simmedTestchar(pool = fakePool()) {
    const text = await testcharExport()
    const user = renderWith(pool)
    await pickFile(user, luaFile(text))
    await characterLoaded()
    return { user, pool }
}

function progressBar(): HTMLElement {
    return screen.getByRole('progressbar', { name: 'Sim progress' })
}

/** The progress bar reads `text` (shown, or as its value text). */
function expectProgress(text: string): void {
    const bar = progressBar()
    const shown =
        bar.getAttribute('aria-valuetext') === text ||
        screen.queryAllByText(text).length > 0
    expect(shown).toBe(true)
}

/** The innermost element whose text starts with `prefix`. */
function startingWith(prefix: string) {
    return (_: string, element: Element | null): boolean =>
        (element?.textContent ?? '').startsWith(prefix) &&
        [...(element?.children ?? [])].every(
            (child) => !(child.textContent ?? '').startsWith(prefix)
        )
}

/** Still bringing a character in: no character, no readings. */
function expectNoNumbers(): void {
    expect(screen.queryByRole('heading', { name: 'Testchar' })).toBeNull()
    expect(readingLabels()).toEqual([])
    expect(
        screen.getByRole('heading', {
            level: 2,
            name: 'Bring your character in',
        })
    ).toBeDefined()
    expect(fileInput()).toBeDefined()
}

async function tabTo(user: User, target: HTMLElement): Promise<boolean> {
    for (let i = 0; i < 250; i++) {
        if (document.activeElement === target) return true
        await user.tab()
    }
    return document.activeElement === target
}

const MATCH_MEDIA = Object.getOwnPropertyDescriptor(window, 'matchMedia')
const GLOBAL_MATCH_MEDIA = Object.getOwnPropertyDescriptor(
    globalThis,
    'matchMedia'
)

/** `matchMedia` that answers `phone` for the phone query, false otherwise. */
function stubMatchMedia(phone: boolean): void {
    const stub = (query: string) => ({
        matches: query === PHONE_QUERY ? phone : false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
    })
    for (const target of [window, globalThis])
        Object.defineProperty(target, 'matchMedia', {
            configurable: true,
            writable: true,
            value: stub,
        })
}

// The fake pool reads the data files, version and weights from the build.
beforeAll(() => ensureSimBuild(), 600_000)

afterEach(() => {
    cleanup()
    if (MATCH_MEDIA) Object.defineProperty(window, 'matchMedia', MATCH_MEDIA)
    if (GLOBAL_MATCH_MEDIA)
        Object.defineProperty(globalThis, 'matchMedia', GLOBAL_MATCH_MEDIA)
    localStorage.clear()
})

describe('simming an export', () => {
    test('picking a .lua shows Simming your character on this computer. and Sim progress 0 of 3, 1 of 3, 2 of 3 and 3 of 3 sims, then the character', async () => {
        const text = await testcharExport()
        const pool = fakePool()
        pool.holding = true
        pool.scripted = true
        const user = renderWith(pool)
        await pickFile(user, luaFile(text))

        expect(await screen.findByText(SIMMING, undefined, LOADS)).toBeDefined()
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0), LOADS)
        for (const done of [0, 1, 2, 3]) {
            act(() => pool.emit(done, 3))
            await waitFor(() => expectProgress(`${done} of 3 sims`))
        }
        pool.release()

        await characterLoaded()
        expect(screen.queryByText(SIMMING)).toBeNull()
    })

    test('Cancel while simming returns to the bring-your-character-in state, and a second drop works', async () => {
        const text = await testcharExport()
        const pool = fakePool()
        pool.holding = true
        const user = renderWith(pool)
        await pickFile(user, luaFile(text))
        await screen.findByText(SIMMING, undefined, LOADS)

        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByText(SIMMING)).toBeNull())
        expectNoNumbers()

        // Cancel already rejected the held calls; the second run goes on.
        pool.holding = false
        dropFile(luaFile(text))
        await characterLoaded()
    })

    test('the credit line is on the page while simming and once loaded', async () => {
        const text = await testcharExport()
        const pool = fakePool()
        pool.holding = true
        const user = renderWith(pool)
        await pickFile(user, luaFile(text))
        await screen.findByText(SIMMING, undefined, LOADS)
        expect(screen.getAllByText(CREDIT).length).toBeGreaterThan(0)

        pool.release()
        await characterLoaded()
        expect(screen.getAllByText(CREDIT).length).toBeGreaterThan(0)
    })

    test('after a .lua sim, localStorage holds only armory:last-results-file, a results file and not the export', async () => {
        await simmedTestchar()
        await waitFor(() => expect(localStorage.length).toBe(1))
        expect(localStorage.key(0)).toBe(REMEMBERED_KEY)
        const kept = localStorage.getItem(REMEMBERED_KEY) ?? ''
        expect(kept).not.toContain('TurboCharExport')
        expect(readResultsFile(JSON.parse(kept) as unknown).ok).toBe(true)
    })

    test('Cancel is reachable with Tab while simming, focus moves to the character h1 when the file loads, and Refine is reachable with Tab', async () => {
        const text = await testcharExport()
        const pool = fakePool()
        pool.holding = true
        const user = renderWith(pool)
        await pickFile(user, luaFile(text))
        await screen.findByText(SIMMING, undefined, LOADS)
        const cancel = screen.getByRole('button', { name: 'Cancel' })
        expect(await tabTo(user, cancel)).toBe(true)

        pool.release()
        const h1 = await characterLoaded()
        await waitFor(() => expect(document.activeElement).toBe(h1))

        const refine = await screen.findByRole('button', { name: REFINE })
        expect(await tabTo(user, refine)).toBe(true)
    })
})

describe('the fight chart for a browser-simmed file', () => {
    test('after Testchar’s export sims, the page draws the DPS and mana over the fight chart and not No fight timeline in this file.', async () => {
        await simmedTestchar()

        const chart = await screen.findByRole(
            'img',
            { name: 'DPS and mana over the fight' },
            LOADS
        )
        expect(chart.tagName.toLowerCase()).toBe('svg')
        expect(screen.queryByText('No fight timeline in this file.')).toBeNull()
    })
})

describe('buffed exports and stops', () => {
    test('dropping the buffed export of 15 November now sims cleanly via Warchief’s Blessing cross-check and shows the unbuffed sheet and buff list', async () => {
        renderWith(fakePool())
        dropFile(luaFile(await Bun.file(BUFFED).text()))

        expect(
            await screen.findByText('Unbuffed sheet.', undefined, LOADS)
        ).toBeDefined()
        expect(screen.getByText('Buffs taken off the sheet:')).toBeDefined()
        expect(
            screen.getByText("Warchief's Blessing: the game's numbers")
        ).toBeDefined()
    })

    test('an Arms Warrior export says the sim covers Enhancement Shaman only and the character is an Arms Warrior; a Fury Warrior one says a Fury Warrior; neither shows numbers', async () => {
        const arms = await warriorExport('Arms')
        const fury = await warriorExport('Fury')

        const user = renderWith(fakePool())
        await pickFile(user, luaFile(arms))
        expect(
            await screen.findByText(
                'The sim covers Enhancement Shaman only for now. Your character is an Arms Warrior.',
                undefined,
                LOADS
            )
        ).toBeDefined()
        expectNoNumbers()
        cleanup()

        const again = renderWith(fakePool())
        await pickFile(again, luaFile(fury))
        expect(
            await screen.findByText(
                'The sim covers Enhancement Shaman only for now. Your character is a Fury Warrior.',
                undefined,
                LOADS
            )
        ).toBeDefined()
        expectNoNumbers()
    })

    test("with the level-60 sim overridden to fail, the page shows one line Failed: level 60 regression. and the check's detail, and no numbers", async () => {
        const text = await testcharExport()
        const l60 = (await Bun.file(
            join(BUILD, 'l60-test.in.json')
        ).json()) as unknown
        const version = (await Bun.file(
            join(BUILD, 'version.json')
        ).json()) as {
            l60_expected_dps: number
        }
        const key = callKey('sim', l60)
        const real = (await recorded())[key]
        expect(real).toBeDefined()
        const failing = structuredClone(real) as {
            raidMetrics: {
                parties: { players: { dps: { avg: number } }[] }[]
            }
        }
        failing.raidMetrics.parties[0]!.players[0]!.dps.avg = 700
        const check = level60Check(700, version.l60_expected_dps)
        expect(check.passed).toBe(false)

        const pool = fakePool()
        pool.overrides.set(key, failing)
        const user = renderWith(pool)
        await pickFile(user, luaFile(text))

        const line = `Failed: level 60 regression. ${check.detail}`
        const found = await screen.findAllByText(
            sentence(line),
            undefined,
            LOADS
        )
        expect(found).toHaveLength(1)
        expectNoNumbers()
    })

    test('with the sheet’s Strength off by 10 in the export, the page shows Failed: sheet strength. and Export again out of combat, and no numbers', async () => {
        const text = await testcharExport((sheet) => ({
            ...sheet,
            strength: sheet.strength + 10,
        }))
        const user = renderWith(fakePool())
        await pickFile(user, luaFile(text))

        const found = await screen.findAllByText(
            startingWith('Failed: sheet strength. '),
            undefined,
            LOADS
        )
        expect(found).toHaveLength(1)
        expect(screen.getByText(EXPORT_AGAIN)).toBeDefined()
        expectNoNumbers()
    })
})

describe('no weights file for the band', () => {
    test('the simming card says Simming stat weights for your gear first (about 3 min). once the warm-up has timed the device, and Cancel clears it', async () => {
        const text = await testcharExport()
        const l60 = (await Bun.file(
            join(BUILD, 'l60-test.in.json')
        ).json()) as unknown
        const standIn = (await recorded())[callKey('sim', l60)]
        expect(standIn).toBeDefined()

        const fake = fakePool()
        let warmedUp = false
        const pool: SimPool = {
            ...fake,
            size: fake.size,
            weights: () => Promise.resolve(null),
            sim(request, profile) {
                const options = request.simOptions as
                    { iterations?: number } | undefined
                if (options?.iterations !== WARM_UP_ITERATIONS)
                    return fake.sim(request, profile)
                // The warm-up isn't recorded: it answers like a recorded
                // sim, and the weights sims after it wait.
                fake.overrides.set(callKey('sim', request, profile), standIn)
                const answered = fake.sim(request, profile)
                fake.holding = true
                warmedUp = true
                return answered
            },
        }
        render(<App createPool={() => pool} runSimulator />)
        const user = userEvent.setup()
        await pickFile(user, luaFile(text))

        const line = await screen.findByText(WEIGHTS_FIRST, undefined, LOADS)
        expect(warmedUp).toBe(true)
        const card = line.closest('section')
        expect(card).not.toBeNull()
        expect(card!.textContent).toContain(SIMMING)
        expect(card!.contains(progressBar())).toBe(true)
        await waitFor(() => expect(fake.pending()).toBeGreaterThan(0), LOADS)

        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() =>
            expect(screen.queryByText(WEIGHTS_FIRST)).toBeNull()
        )
        expect(screen.queryByText(SIMMING)).toBeNull()
        expectNoNumbers()
    })
})

describe('the accuracy banner', () => {
    test('a provisional file shows the accuracy banner at the top; a copy with provisional false does not', async () => {
        const user = renderWith(fakePool())
        await pickFile(
            user,
            new File(
                [JSON.stringify(variant((file) => (file.provisional = true)))],
                'truncha.json',
                { type: 'application/json' }
            )
        )
        await characterLoaded('Truncha')
        const banner = screen.getByText(BANNER)
        const body = document.querySelector('[data-slot="planner-body"]')
        expect(body).not.toBeNull()
        expect(
            banner.compareDocumentPosition(body!) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        cleanup()
        localStorage.clear()

        const again = renderWith(fakePool())
        await pickFile(
            again,
            new File(
                [
                    JSON.stringify(
                        variant((file) => (file.provisional = false), sample)
                    ),
                ],
                'truncha.json',
                { type: 'application/json' }
            )
        )
        await characterLoaded('Truncha')
        expect(screen.queryByText(BANNER)).toBeNull()
    })
})

describe('Refine', () => {
    test('Refine for your gear (about 3 min) runs Refine with its progress, then the weights say simmed for your gear', async () => {
        const { user, pool } = await simmedTestchar()
        expect(screen.getByText(PRECOMPUTED)).toBeDefined()
        const refine = await screen.findByRole('button', { name: REFINE })

        pool.holding = true
        await user.click(refine)
        expect(progressBar()).toBeDefined()
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0), LOADS)
        pool.release()

        expect(await screen.findByText(YOURS, undefined, LOADS)).toBeDefined()
        expect(screen.queryByText(PRECOMPUTED)).toBeNull()
        expect(screen.getByRole('heading', { name: 'Testchar' })).toBeDefined()
    })

    test('Cancel during Refine keeps the unrefined file and its weights sentence', async () => {
        const { user, pool } = await simmedTestchar()
        const refine = await screen.findByRole('button', { name: REFINE })

        pool.holding = true
        await user.click(refine)
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0), LOADS)
        expect(progressBar()).toBeDefined()
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() =>
            expect(
                screen.queryByRole('progressbar', { name: 'Sim progress' })
            ).toBeNull()
        )
        expect(screen.getByRole('heading', { name: 'Testchar' })).toBeDefined()
        expect(screen.getByText(PRECOMPUTED)).toBeDefined()
        expect(screen.queryByText(YOURS)).toBeNull()
    })

    test('after a reload that restores the remembered file, there is no Refine button', async () => {
        await simmedTestchar()
        await screen.findByRole('button', { name: REFINE })
        await waitFor(() =>
            expect(localStorage.getItem(REMEMBERED_KEY)).not.toBeNull()
        )
        cleanup()

        renderWith(fakePool())
        await characterLoaded()
        expect(
            screen.queryByRole('button', { name: /^Refine for your gear/ })
        ).toBeNull()
    })
})

/**
 * Answers a sim the recorded outputs lack because Run Simulator changed the
 * long dungeon fight: the recorded answer to the same call against the
 * fixed long fight (its encounter, full mana).
 */
async function asFixedLongFight(
    request: RaidSimRequest,
    profile: unknown
): Promise<unknown> {
    const character = await testchar()
    const fixed = structuredClone(request) as RaidSimRequest & {
        raid: { parties: { players: Record<string, unknown>[] }[] }
    }
    fixed.encounter = buildRequest(character, 'dungeon-long', {
        seed: 1,
        iterations: 1,
    }).encounter
    delete fixed.raid.parties[0]!.players[0]!.startingManaPercent
    return (await recorded())[callKey('sim', fixed, profile)]
}

describe('Run Simulator', () => {
    test('off by default: the button is disabled and says it is coming soon, even with an export brought in', async () => {
        const pool = fakePool()
        render(<App createPool={() => pool} />)
        const user = userEvent.setup()
        await pickFile(user, luaFile(await testcharExport()))
        await characterLoaded()

        const run = screen.getByRole('button', { name: 'Run Simulator' })
        expect((run as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText(COMING_SOON_NOTE)).toBeDefined()
        expect(screen.queryByText(NO_EXPORT_NOTE)).toBeNull()
    })

    test('with the export brought in, it sims the export again for the enemy level picked, with progress, and the new file replaces the shown one on that fight', async () => {
        const { user, pool } = await simmedTestchar()
        const level = (await testchar()).level
        const fallbacks: Promise<unknown>[] = []
        pool.fallback = (method, request, profile) => {
            if (method !== 'sim') return undefined
            const answer = asFixedLongFight(request, profile)
            fallbacks.push(answer)
            return answer
        }
        // The file has no fight against level + 3: picking it says so.
        await user.click(screen.getByRole('radio', { name: String(level + 3) }))
        expect(
            screen.queryByText('Not simmed for this combination.') !== null
        ).toBe(true)
        const run = screen.getByRole('button', { name: 'Run Simulator' })
        expect(run.hasAttribute('disabled')).toBe(false)
        expect(screen.queryByText(NO_EXPORT_NOTE)).toBeNull()

        pool.requests.length = 0
        pool.holding = true
        await user.click(run)
        expect(progressBar()).toBeDefined()
        await waitFor(() => expect(pool.pending()).toBeGreaterThan(0), LOADS)
        pool.release()

        await waitFor(() => {
            if (!shownFight().endsWith(`vs level ${level + 3}`))
                throw new Error(`still on ${shownFight()}`)
        }, LOADS)
        expect(shownFight()).toBe(`Dungeon, 2 min vs level ${level + 3}`)
        expect(
            screen.queryByRole('progressbar', { name: 'Sim progress' })
        ).toBeNull()
        expect(
            screen.queryByText('Not simmed for this combination.')
        ).toBeNull()
        // The run's long fight was simmed against the level picked.
        const levels = new Set(
            pool.requests.map(
                (request) =>
                    (request.encounter as { targets: { level: number }[] })
                        .targets[0]!.level
            )
        )
        expect(levels.has(level + 3)).toBe(true)
        expect(fallbacks.length).toBeGreaterThan(0)
        // The button stays, for another run.
        expect(
            screen
                .getByRole('button', { name: 'Run Simulator' })
                .hasAttribute('disabled')
        ).toBe(false)
    })

    test('a run that fails keeps the file shown and says why under the button', async () => {
        const { user } = await simmedTestchar()
        const level = (await testchar()).level
        // No answers recorded for level + 3, and no fallback: the run fails.
        await user.click(screen.getByRole('radio', { name: String(level + 3) }))
        await user.click(screen.getByRole('button', { name: 'Run Simulator' }))
        const alert = await screen.findByText(
            /^The sim failed: /,
            undefined,
            LOADS
        )
        expect(alert.getAttribute('role')).toBe('alert')
        expect(shownFight()).toBe(`Dungeon, 2 min vs level ${level + 2}`)
        expect(screen.getByRole('heading', { name: 'Testchar' })).toBeDefined()
    })

    test('with a results file picked on its own (no export), the button is disabled and says to bring the export in', async () => {
        const user = renderWith(fakePool())
        await pickFile(
            user,
            new File([JSON.stringify(sample)], 'truncha.json', {
                type: 'application/json',
            })
        )
        await characterLoaded('Truncha')
        const run = screen.getByRole('button', { name: 'Run Simulator' })
        expect(run.hasAttribute('disabled')).toBe(true)
        const note = screen.getByText(NO_EXPORT_NOTE)
        expect(run.getAttribute('aria-describedby')).toBe(note.id)
    })
})

describe('bun run check', () => {
    test('the recorded outputs the page tests read are in the repo, so a clean checkout runs them under test:armory', async () => {
        expect(await Bun.file(OUTPUTS).exists()).toBe(true)
        const root = (await Bun.file(
            join(import.meta.dir, '../../../package.json')
        ).json()) as { scripts: Record<string, string> }
        expect(root.scripts['check:all']).toContain('bun run test:armory')
    })
})

describe('the phone note', () => {
    test('with the phone query true the note shows in the bring-your-character-in state; false, it does not', async () => {
        stubMatchMedia(true)
        renderWith(fakePool())
        expect(await screen.findByText(PHONE)).toBeDefined()
        cleanup()

        stubMatchMedia(false)
        renderWith(fakePool())
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Bring your character in',
            })
        ).toBeDefined()
        expect(screen.queryByText(PHONE)).toBeNull()
    })
})
