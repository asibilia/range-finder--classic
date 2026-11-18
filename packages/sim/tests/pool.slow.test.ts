/**
 * The browser engine under Bun (which has Web Workers): `createSimPool`
 * runs the sim in a pool of workers that share one compiled module, queues
 * jobs, cancels them, counts progress and times each call.
 */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSimPool, loadSim, SimCancelled } from '../src'
import { ensureSimBuild } from './helpers/sim-build'

const PACKAGE_DIR = join(import.meta.dir, '..')
const BUILD = join(PACKAGE_DIR, 'build')
const BASE = pathToFileURL(BUILD + '/')

type Pool = ReturnType<typeof createSimPool>
type Sim = Awaited<ReturnType<typeof loadSim>>
type SimRequest = Parameters<Sim['sim']>[0]
type Profile = NonNullable<Parameters<Sim['sim']>[1]>
type Json = Record<string, unknown>
type Fight = {
    fight_id: string
    request: Json & { simOptions: { iterations: number; randomSeed: number } }
}

const testchar = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'fixtures/testchar-l30.json'), 'utf8')
) as { profile: Json; fights: Fight[] }
const profile = testchar.profile as unknown as Profile
const FIGHT_IDS = ['solo-hit-short', 'dungeon-short', 'dungeon-long']

/** One of Testchar's fights, with its own seed and iteration count. */
function request(id: string, seed: number, iterations: number): SimRequest {
    const found = testchar.fights.find((f) => f.fight_id === id)
    if (!found) throw new Error(`testchar-l30.json has no ${id} fight`)
    const copy = structuredClone(found.request)
    copy.simOptions.iterations = iterations
    copy.simOptions.randomSeed = seed
    return copy as unknown as SimRequest
}

const dpsOf = (result: unknown) =>
    (
        result as {
            raidMetrics: {
                parties: { players: { dps: { avg: number } }[] }[]
            }
        }
    ).raidMetrics.parties[0]!.players[0]!.dps.avg

const open: Pool[] = []
function pool(options: { size?: number } = {}): Pool {
    const made = createSimPool({ base: BASE, size: 2, ...options })
    open.push(made)
    return made
}

beforeAll(() => ensureSimBuild(), 600_000)

afterEach(() => {
    for (const made of open.splice(0)) made.close()
})

describe('createSimPool under Bun', () => {
    test('a pool of 3 runs 12 calls and returns the same results as running them one by one', async () => {
        const calls = [1, 2, 3, 4].flatMap((seed) =>
            FIGHT_IDS.map((id) => request(id, seed, 200))
        )
        expect(calls.length).toBe(12)

        const single = await loadSim({ base: BASE })
        const oneByOne: number[] = []
        for (const call of calls)
            oneByOne.push(dpsOf(await single.sim(call, profile)))

        const three = pool({ size: 3 })
        three.batch(12)
        const together = await Promise.all(
            calls.map((call) => three.sim(call, profile))
        )
        expect(together.map(dpsOf)).toEqual(oneByOne)
        // Different seeds really gave different numbers.
        expect(new Set(oneByOne).size).toBeGreaterThan(1)
    }, 600_000)

    test('cancel() during a batch rejects the queued calls with SimCancelled, and a new batch after it runs normally', async () => {
        const one = pool({ size: 1 })
        one.batch(4)
        const queued = [1, 2, 3, 4].map((seed) =>
            one.sim(request('dungeon-long', seed, 2000), profile)
        )
        const settled = Promise.allSettled(queued)
        one.cancel()
        for (const outcome of await settled) {
            expect(outcome.status).toBe('rejected')
            const reason = (outcome as PromiseRejectedResult).reason as Error
            expect(reason).toBeInstanceOf(SimCancelled)
            expect(reason.name).toBe('SimCancelled')
        }

        const after = request('solo-hit-short', 7, 200)
        const expected = dpsOf(
            await (await loadSim({ base: BASE })).sim(after, profile)
        )
        one.batch(1)
        expect(dpsOf(await one.sim(after, profile))).toBe(expected)
    }, 600_000)

    test('cancel() stops a running call: it and the calls queued behind it reject with SimCancelled, and the replaced worker runs a new batch', async () => {
        const after = request('solo-hit-short', 9, 200)
        const expected = dpsOf(
            await (await loadSim({ base: BASE })).sim(after, profile)
        )

        const one = pool({ size: 1 })
        // The worker is up and idle, so the next call starts running at once.
        await one.version()
        one.batch(3)
        const long = one.sim(request('dungeon-long', 1, 100_000), profile)
        const behind = [2, 3].map((seed) =>
            one.sim(request('dungeon-long', seed, 2000), profile)
        )
        const settled = Promise.allSettled([long, ...behind])
        await Bun.sleep(200)
        one.cancel()
        for (const outcome of await settled) {
            expect(outcome.status).toBe('rejected')
            const reason = (outcome as PromiseRejectedResult).reason as Error
            expect(reason).toBeInstanceOf(SimCancelled)
            expect(reason.name).toBe('SimCancelled')
        }

        // A worker left to finish 100,000 iterations would hold this call up
        // far longer than the bound: the running worker was really stopped.
        one.batch(1)
        const started = performance.now()
        const next = await Promise.race([
            one.sim(after, profile).then(dpsOf),
            Bun.sleep(30_000).then(() => 'timed out' as const),
        ])
        expect(next).toBe(expected)
        expect(performance.now() - started).toBeLessThan(30_000)
    }, 600_000)

    test('progress counts sim calls only, (1, 3) to (3, 3), and starts again from (1, 2) after cancel()', async () => {
        const two = pool({ size: 2 })
        const seen: [number, number][] = []
        two.onProgress((done, planned) => seen.push([done, planned]))

        two.batch(3)
        await two.sim(request('solo-hit-short', 1, 100), profile)
        await two.version()
        await two.sim(request('dungeon-short', 1, 100), profile)
        await two.weights('shaman', 'enhancement', 30)
        await two.sim(request('dungeon-long', 1, 100), profile)
        expect(seen).toEqual([
            [1, 3],
            [2, 3],
            [3, 3],
        ])

        two.cancel()
        seen.length = 0
        two.batch(2)
        await two.sim(request('solo-hit-short', 2, 100), profile)
        expect(seen).toEqual([[1, 2]])
    }, 600_000)

    test("data('db.json') returns the item data, and stats() reports a batch's calls, iterations and time", async () => {
        const two = pool({ size: 2 })
        const db = (await two.data('db.json')) as { items: Json[] }
        const onDisk = JSON.parse(
            readFileSync(join(BUILD, 'db.json'), 'utf8')
        ) as { items: Json[] }
        expect(db.items.length).toBe(onDisk.items.length)
        expect(db.items.length).toBeGreaterThan(0)
        expect(db.items[0]).toEqual(onDisk.items[0]!)

        two.batch(2)
        await Promise.all([
            two.sim(request('solo-hit-short', 3, 150), profile),
            two.sim(request('dungeon-short', 3, 250), profile),
        ])
        const stats = two.stats()
        expect(stats.calls).toBe(2)
        expect(stats.iterations).toBe(400)
        expect(stats.ms).toBeGreaterThan(0)
    }, 600_000)

    test('the same sim call twice gives an equal answer, counted like a call: progress (1, 2) then (2, 2), and stats() twice the first call', async () => {
        const two = pool({ size: 2 })
        const seen: [number, number][] = []
        two.onProgress((done, planned) => seen.push([done, planned]))
        const call = request('dungeon-short', 5, 300)

        two.batch(2)
        const first = await two.sim(call, profile)
        const once = two.stats()
        expect(once.calls).toBe(1)
        expect(once.iterations).toBe(300)
        expect(once.ms).toBeGreaterThan(0)

        const second = await two.sim(call, profile)
        expect(second).toEqual(first)
        expect(seen).toEqual([
            [1, 2],
            [2, 2],
        ])
        const twice = two.stats()
        expect(twice.calls).toBe(2)
        expect(twice.iterations).toBe(600)
        // Answered from memory: it adds the time the first call took.
        expect(twice.ms).toBe(2 * once.ms)
    }, 600_000)

    test('a remembered call made just before cancel() rejects with SimCancelled, and adds no progress', async () => {
        const one = pool({ size: 1 })
        const seen: [number, number][] = []
        one.onProgress((done, planned) => seen.push([done, planned]))
        const call = request('solo-hit-short', 11, 200)

        one.batch(2)
        const first = await one.sim(call, profile)
        const again = one.sim(call, profile).then(
            () => 'resolved' as const,
            (error: unknown) => error
        )
        one.cancel()
        const reason = await again
        expect(reason).toBeInstanceOf(SimCancelled)
        expect((reason as Error).name).toBe('SimCancelled')
        expect(seen).toEqual([
            [1, 2],
            [0, 0],
        ])

        // The pool still answers the same call after the cancel.
        one.batch(1)
        expect(dpsOf(await one.sim(call, profile))).toBe(dpsOf(first))
    }, 600_000)

    test('after the pool sits idle for more than 2 s, a new call still answers', async () => {
        const fresh = request('dungeon-long', 13, 200)
        const expected = dpsOf(
            await (await loadSim({ base: BASE })).sim(fresh, profile)
        )

        const one = pool({ size: 1 })
        one.batch(1)
        await one.sim(request('solo-hit-short', 13, 100), profile)
        // Longer than the pool keeps an idle worker.
        await Bun.sleep(2600)

        one.batch(1)
        const next = await Promise.race([
            one.sim(fresh, profile).then(dpsOf),
            Bun.sleep(60_000).then(() => 'timed out' as const),
        ])
        expect(next).toBe(expected)
    }, 600_000)
})

describe('the pool size with no size given', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const withCores = (cores: number | undefined) => {
        Object.defineProperty(globalThis, 'navigator', {
            value: cores === undefined ? {} : { hardwareConcurrency: cores },
            configurable: true,
            writable: true,
        })
        try {
            // `size: undefined` takes the default size, which this tests.
            return pool({ size: undefined }).size
        } finally {
            if (original)
                Object.defineProperty(globalThis, 'navigator', original)
        }
    }

    test('is 1 for 1 core, 7 for 8, 8 for 16, and 4 when hardwareConcurrency is undefined', () => {
        expect(withCores(1)).toBe(1)
        expect(withCores(8)).toBe(7)
        expect(withCores(16)).toBe(8)
        expect(withCores(undefined)).toBe(4)
    }, 120_000)
})
