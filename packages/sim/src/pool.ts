/**
 * The browser engine: a pool of Web Workers, each running the sim. The
 * module is fetched and compiled once on the page, and the compiled module
 * is posted to every worker (where a runtime can't post one, each worker
 * compiles its own from the bytes). Jobs queue; `cancel()` drops the queue
 * and replaces the busy workers; a worker left idle is let go, and the next
 * call starts a new one. `batch()` starts a progress count and the call
 * timing. The same call always gets the same answer (seeds are fixed), so
 * the pool answers a repeat from memory.
 */
import {
    loadJson,
    loadModule,
    loadModuleBytes,
    toBase,
    type Base,
} from './loader'
import {
    answer,
    type LevelProfile,
    type RaidSimRequest,
    type RaidSimResult,
    type SimSheet,
    type SimVersion,
} from './sim'
import {
    readWeightsFile,
    weightsFileName,
    type WeightsFile,
} from './weights-file'

/** A call the pool dropped: `cancel()` or `close()` came first. */
export class SimCancelled extends Error {
    constructor(message = 'The sim was cancelled.') {
        super(message)
        this.name = 'SimCancelled'
    }
}

/** Calls, iterations and time of the `sim` calls since the last `batch()`. */
export type SimStats = { calls: number; iterations: number; ms: number }

export type SimPool = {
    /** How many workers the pool runs at most. */
    readonly size: number
    sim(request: RaidSimRequest, profile?: LevelProfile): Promise<RaidSimResult>
    sheet(request: RaidSimRequest, profile?: LevelProfile): Promise<SimSheet>
    version(): Promise<SimVersion>
    /**
     * The precomputed weights file for a class, spec and level, read and
     * checked; `null` when there's no file for the band. A file that's
     * there but doesn't read is a broken build: the call rejects, naming
     * the problems.
     */
    weights(
        className: string,
        spec: string,
        level: number
    ): Promise<WeightsFile | null>
    /** The parsed JSON of a file `sim:build` wrote, e.g. `db.json`. */
    data(name: string): Promise<unknown>
    stats(): SimStats
    /** Starts a count of `planned` calls, from 0, and the call timing. */
    batch(planned: number): void
    /**
     * Called with `(done, planned)` after each `sim` or `sheet` call, and
     * with `(0, 0)` when `cancel()` resets the count.
     */
    onProgress(callback: (done: number, planned: number) => void): () => void
    /** Drops queued calls and stops running ones: they reject. */
    cancel(): void
    close(): void
}

type ExportName = 'turboSim' | 'turboSheet' | 'turboVersion'

type Job = {
    name: ExportName
    input?: string
    iterations: number
    /** Where its answer is remembered: `sim` and `sheet` calls only. */
    key?: string
    resolve: (reply: unknown) => void
    reject: (error: unknown) => void
}

type Slot = {
    worker: Worker
    ready: boolean
    job?: Job
    started?: number
    /** The timer that lets the worker go when it stays idle. */
    idle?: ReturnType<typeof setTimeout>
}

/** An answer the pool remembers: the export's reply and the time it took. */
type Kept = { reply: unknown; ms: number }

type FromWorker =
    | { type: 'ready' }
    | { type: 'need-bytes' }
    | { type: 'failed'; message: string }
    | { type: 'reply'; id: number; reply?: unknown; crash?: string }

/** Each worker holds about 92 MB, so the pool stays at 8 or fewer. */
const MAX_SIZE = 8
/**
 * A worker idle this long is let go, giving its memory back (it grows past
 * 100 MB once it has simmed); the next call starts a new one.
 */
const IDLE_MS = 2000
/** How many answers a pool remembers; the least recently used goes first. */
const REMEMBERED = 512

/** `navigator.hardwareConcurrency - 1` (4 when unknown), from 1 to 8. */
function defaultSize(): number {
    const cores = (
        globalThis as { navigator?: { hardwareConcurrency?: unknown } }
    ).navigator?.hardwareConcurrency
    const size = typeof cores === 'number' ? cores - 1 : 4
    return Math.min(MAX_SIZE, Math.max(1, size))
}

/** The precomputed weights' level band: 5 levels wide from 10, 60 alone. */
export function weightsBand(level: number): [number, number] | null {
    if (!Number.isInteger(level) || level < 10) return null
    if (level >= 60) return [60, 60]
    const min = Math.floor(level / 5) * 5
    return [min, min + 4]
}

function iterationsOf(request: RaidSimRequest): number {
    const options = request.simOptions as { iterations?: unknown } | undefined
    return typeof options?.iterations === 'number' ? options.iterations : 0
}

/**
 * Starts a pool of workers running the sim from `base` (the folder
 * `sim:build` writes; `/sim/` on the page by default). Workers start when
 * the first call needs them.
 */
export function createSimPool({
    base,
    size,
}: { base?: Base; size?: number } = {}): SimPool {
    const root = toBase(base)
    const poolSize = Math.min(
        MAX_SIZE,
        Math.max(1, Math.floor(size ?? defaultSize()))
    )
    const queue: Job[] = []
    const slots: Slot[] = []
    const listeners = new Set<(done: number, planned: number) => void>()
    const files = new Map<string, Promise<unknown>>()
    const remembered = new Map<string, Kept>()
    let closed = false
    /**
     * Bumped by `cancel()` and `close()`: a remembered answer still on its
     * way is dropped, as a running call would be.
     */
    let generation = 0
    let done = 0
    let planned = 0
    let stats: SimStats = { calls: 0, iterations: 0, ms: 0 }
    let nextId = 0
    const running = new Map<number, Slot>()

    /** Counts a finished call: its iterations and time (sims only). */
    function timed(name: ExportName, iterations: number, ms: number) {
        if (name !== 'turboSim') return
        stats = {
            calls: stats.calls + 1,
            iterations: stats.iterations + iterations,
            ms: stats.ms + ms,
        }
    }

    /** Counts a finished call in the progress (`version` doesn't count). */
    function progressed(name: ExportName) {
        if (name === 'turboVersion') return
        done += 1
        for (const listener of listeners) listener(done, planned)
    }

    function remember(key: string, kept: Kept) {
        remembered.delete(key)
        remembered.set(key, kept)
        if (remembered.size > REMEMBERED) {
            const oldest = remembered.keys().next().value
            if (oldest !== undefined) remembered.delete(oldest)
        }
    }

    /**
     * A remembered answer, counted like the call it repeats: its progress,
     * its iterations and the time the call took when it ran.
     */
    function replay(name: ExportName, iterations: number, kept: Kept) {
        const at = generation
        return Promise.resolve().then(() => {
            if (closed) throw new SimCancelled('The sim pool is closed.')
            if (at !== generation) throw new SimCancelled()
            timed(name, iterations, kept.ms)
            const value = answer(kept.reply)
            progressed(name)
            return value
        })
    }

    function drop(slot: Slot) {
        clearTimeout(slot.idle)
        slot.worker.terminate()
        const at = slots.indexOf(slot)
        if (at >= 0) slots.splice(at, 1)
        for (const [id, held] of running) if (held === slot) running.delete(id)
    }

    /** A worker that failed to start: it and every queued call fail. */
    function startFailed(slot: Slot, message: string) {
        drop(slot)
        const error = new Error(`The sim's worker didn't start: ${message}`)
        for (const job of queue.splice(0)) job.reject(error)
    }

    function finish(slot: Slot, id: number, reply: unknown, crash?: string) {
        const job = slot.job
        if (!job || running.get(id) !== slot) return
        running.delete(id)
        const ms = performance.now() - (slot.started ?? performance.now())
        slot.job = undefined
        slot.started = undefined
        if (crash !== undefined) {
            // Go's runtime is gone once an export throws: replace the worker.
            drop(slot)
            job.reject(new Error(`The sim stopped: ${crash}`))
        } else {
            timed(job.name, job.iterations, ms)
            try {
                const value = answer(reply)
                if (job.key !== undefined) remember(job.key, { reply, ms })
                job.resolve(value)
            } catch (error) {
                job.reject(error)
            }
        }
        progressed(job.name)
        pump()
    }

    /** Lets an idle worker go after `IDLE_MS`, unless a call comes first. */
    function rest(slot: Slot) {
        if (slot.idle !== undefined) return
        slot.idle = setTimeout(() => {
            slot.idle = undefined
            if (!slot.job) drop(slot)
        }, IDLE_MS)
    }

    function spawn() {
        const worker = new Worker(new URL('worker.js', root))
        const slot: Slot = { worker, ready: false }
        slots.push(slot)
        worker.addEventListener('message', (event: MessageEvent) => {
            const message = event.data as FromWorker
            if (message.type === 'ready') {
                slot.ready = true
                pump()
            } else if (message.type === 'need-bytes') {
                loadModuleBytes(root).then(
                    (bytes) =>
                        worker.postMessage({ type: 'bytes', bytes }, [bytes]),
                    (error: unknown) => startFailed(slot, String(error))
                )
            } else if (message.type === 'failed') {
                startFailed(slot, message.message)
            } else if (message.type === 'reply') {
                finish(slot, message.id, message.reply, message.crash)
            }
        })
        worker.addEventListener('error', (event: Event) => {
            const message = (event as ErrorEvent).message ?? 'unknown error'
            const job = slot.job
            if (!slot.ready) return startFailed(slot, message)
            drop(slot)
            job?.reject(new Error(`The sim stopped: ${message}`))
            pump()
        })
        loadModule(root).then(
            (compiled) => {
                const init = { type: 'init', base: root.href }
                try {
                    worker.postMessage({ ...init, module: compiled })
                } catch {
                    // This runtime can't post a module: the worker asks
                    // for the bytes and compiles its own.
                    worker.postMessage({ ...init, module: null })
                }
            },
            (error: unknown) => startFailed(slot, String(error))
        )
    }

    function pump() {
        if (closed) return
        for (const slot of slots) {
            if (!slot.ready || slot.job) continue
            const job = queue.shift()
            if (!job) {
                rest(slot)
                continue
            }
            clearTimeout(slot.idle)
            slot.idle = undefined
            const id = nextId++
            slot.job = job
            slot.started = performance.now()
            running.set(id, slot)
            slot.worker.postMessage({
                type: 'call',
                id,
                name: job.name,
                input: job.input,
            })
        }
        const starting = slots.filter((slot) => !slot.ready).length
        let wanted = Math.min(queue.length - starting, poolSize - slots.length)
        while (wanted-- > 0) spawn()
    }

    function run(
        name: ExportName,
        input?: string,
        iterations = 0,
        key?: string
    ): Promise<unknown> {
        if (closed)
            return Promise.reject(new SimCancelled('The sim pool is closed.'))
        const kept = key === undefined ? undefined : remembered.get(key)
        if (key !== undefined && kept) {
            remember(key, kept)
            return replay(name, iterations, kept)
        }
        return new Promise((resolve, reject) => {
            queue.push({ name, input, iterations, key, resolve, reject })
            pump()
        })
    }

    /** Drops queued calls and terminates busy workers; their calls reject. */
    function stopAll(error: () => Error, every: boolean) {
        for (const job of queue.splice(0)) job.reject(error())
        for (const slot of [...slots]) {
            const job = slot.job
            if (!every && !job) continue
            drop(slot)
            job?.reject(error())
        }
    }

    const call = (
        name: 'turboSim' | 'turboSheet',
        request: RaidSimRequest,
        profile?: LevelProfile
    ) => {
        const input = JSON.stringify({ request, level_profile: profile })
        return run(name, input, iterationsOf(request), `${name}\n${input}`)
    }

    return {
        size: poolSize,
        sim: (request, profile) =>
            call('turboSim', request, profile) as Promise<RaidSimResult>,
        sheet: (request, profile) =>
            call('turboSheet', request, profile) as Promise<SimSheet>,
        version: () => run('turboVersion') as Promise<SimVersion>,
        async weights(className, spec, level) {
            const levels = weightsBand(level)
            if (!levels) return null
            const name = `weights/${weightsFileName(className, spec, ...levels)}`
            const raw = await loadJson(root, name, { optional: true })
            if (raw === null) return null
            const read = readWeightsFile(raw)
            if (!read.ok)
                throw new Error(
                    `The sim's ${name} doesn't read: ${read.problems.join('; ')}`
                )
            return read.file
        },
        data(name) {
            let file = files.get(name)
            if (!file) {
                file = loadJson(root, name)
                files.set(name, file)
                file.catch(() => files.delete(name))
            }
            return file
        },
        stats: () => ({ ...stats }),
        batch(count) {
            done = 0
            planned = count
            stats = { calls: 0, iterations: 0, ms: 0 }
        },
        onProgress(callback) {
            listeners.add(callback)
            return () => listeners.delete(callback)
        },
        cancel() {
            generation += 1
            stopAll(() => new SimCancelled(), false)
            done = 0
            planned = 0
            stats = { calls: 0, iterations: 0, ms: 0 }
            // The count is reset: listeners hear (0, 0), so a run with no
            // call in flight still learns it was cancelled.
            for (const listener of [...listeners]) listener(0, 0)
        },
        close() {
            closed = true
            generation += 1
            stopAll(() => new SimCancelled('The sim pool is closed.'), true)
            listeners.clear()
            remembered.clear()
        },
    }
}
