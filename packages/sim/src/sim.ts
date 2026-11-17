/**
 * The sim on the calling thread: `loadSim({ base })` loads the WASM module
 * and runs our three exports, `turboSim`, `turboSheet` and `turboVersion`.
 * Each takes one JSON string and answers one; a `{ error }` answer throws a
 * `SimError`. The level profile travels with each call, so calls never leak
 * into each other.
 */
import { loadSimFiles, toBase, type Base } from './loader'

/**
 * The level-dependent data of one race and class at one level: the level
 * patch's `LevelProfile` Go struct, field for field (its JSON tags).
 */
export type LevelProfile = {
    level: number
    /** A `proto.Race` name, e.g. `RaceOrc`. */
    race: string
    /** A `proto.Class` name, e.g. `ClassShaman`. */
    class: string
    strength: number
    agility: number
    stamina: number
    intellect: number
    spirit: number
    /** Health before Stamina. */
    baseHealth: number
    /** Mana before Intellect. */
    baseMana: number
    /** Flat attack power before any stat converts into it. */
    baseAttackPower: number
    /** Melee crit percent per Agility point. */
    critPerAgility: number
    /** Dodge percent per Agility point. */
    dodgePerAgility: number
    /** Spell crit percent per Intellect point. */
    spellCritPerInt: number
    /** Melee crit percent before Agility. */
    baseMeleeCrit: number
    /** Spell crit percent before Intellect. */
    baseSpellCrit: number
    /** Dodge percent before Agility. */
    baseDodgePercent: number
    /** The spell ids the character has trained; empty means unknown. */
    knownSpells?: number[]
    /** Free text: where the numbers came from. */
    source?: string
}

/** A `RaidSimRequest` as protojson (lowerCamelCase field names). */
export type RaidSimRequest = Record<string, unknown>

/** A `RaidSimResult` as protojson. */
export type RaidSimResult = Record<string, unknown>

/** One call's input: the request, and the profile it runs with, if any. */
export type SimCall = { request: RaidSimRequest; level_profile?: LevelProfile }

/** What `turboSheet` answers: the sheet the character has in the sim. */
export type SimSheet = {
    level: number
    /** Spell ids the character has no rank of, answered at their lowest. */
    unreached_ranks: number[]
    /** The player's `PlayerStats` as protojson; stats by the proto `Stat` enum. */
    player: Record<string, unknown>
}

/** Which sim made a number. */
export type SimVersion = {
    upstream_commit: string
    /** 12 hex digits over the Go under `upstream/sim` and `upstream/proto`. */
    patch_id: string
    /** Go's `runtime.Version()`, e.g. `go1.27.1`. */
    go_version: string
}

/** A call the sim answered with `{ error }`. */
export class SimError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SimError'
    }
}

export type Sim = {
    sim(request: RaidSimRequest, profile?: LevelProfile): Promise<RaidSimResult>
    sheet(request: RaidSimRequest, profile?: LevelProfile): Promise<SimSheet>
    version(): Promise<SimVersion>
}

type Export = (input?: string) => unknown
const EXPORTS = ['turboSim', 'turboSheet', 'turboVersion'] as const
type Exports = Record<(typeof EXPORTS)[number], Export>

/** A reply of one of our exports, parsed; `{ error }` throws a `SimError`. */
export function answer<T>(reply: unknown): T {
    if (typeof reply !== 'string') {
        throw new SimError('The sim gave no answer.')
    }
    const parsed = JSON.parse(reply) as T & { error?: unknown }
    if (typeof parsed.error === 'string') throw new SimError(parsed.error)
    return parsed
}

/**
 * Loads the sim from `base` (the folder `sim:build` writes; `/sim/` on the
 * page by default) and starts it on the calling thread.
 */
export async function loadSim({
    base,
}: {
    /** A URL (the DOM's or `node:url`'s) or its text. */
    base?: Base
} = {}): Promise<Sim> {
    const { Go, module } = await loadSimFiles(toBase(base))
    const go = new Go()
    const instance = await WebAssembly.instantiate(module, go.importObject)
    // Go's main registers the exports on globalThis and then waits, so they
    // are there once run returns control. They're kept here, as a later
    // loadSim registers its own over them.
    void go.run(instance)
    const globals = globalThis as unknown as Partial<Exports>
    const turbo = {} as Exports
    for (const name of EXPORTS) {
        const fn = globals[name]
        if (typeof fn !== 'function') {
            throw new SimError(`The sim's module has no ${name}.`)
        }
        turbo[name] = fn
    }

    const call = (name: 'turboSim' | 'turboSheet', input: SimCall) =>
        turbo[name](JSON.stringify(input))

    return {
        sim: async (request, profile) =>
            answer<RaidSimResult>(
                call('turboSim', { request, level_profile: profile })
            ),
        sheet: async (request, profile) =>
            answer<SimSheet>(
                call('turboSheet', { request, level_profile: profile })
            ),
        version: async () => answer<SimVersion>(turbo.turboVersion()),
    }
}
