/**
 * The runner's core, ported to the browser (`src/browser-sim/`), driven
 * from outside under Bun with the real WASM: `simCharacter(character,
 * weights, pool, onProgress)` turns a character into a results file or a
 * stop. The character is Testchar's (`testcharCharacter(pool)`, from
 * `packages/sim/tests/helpers/testchar.ts`) until #83.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSimPool, type SimPool } from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import {
    testcharCharacter,
    type TestcharCharacter,
} from '../../sim/tests/helpers/testchar'
import {
    buildRequest,
    simCharacter,
    type SimOutcome,
    type StatWeights,
} from '../src/browser-sim'
import { readResultsFile, type ResultsFile } from '../src/results-file'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')

const SINGLE_FIGHTS = ['solo-hit-short', 'dungeon-short', 'dungeon-long']
const ALL_FIGHTS = [...SINGLE_FIGHTS, 'chain-solo']
const NOTES: Record<string, string> = {
    'real fights':
        "Not checked: the sim hasn't been compared with a real combat log for this character.",
    'mana model':
        "Untested: no combat log has been checked against the sim's mana use, so out-of-mana times and the chain fight are estimates.",
    'long-fight weights':
        "Low confidence: the 2-minute fight's stat weights lean on the mana model, which is untested.",
}
/** An item that only the "left out" rule keeps out of the plan. */
const MADE_UP_ID = 999_999_001

const pools: SimPool[] = []
function pool(): SimPool {
    const made = createSimPool({ base: BASE, size: 2 })
    pools.push(made)
    return made
}

beforeAll(() => ensureSimBuild(), 600_000)

afterAll(() => {
    for (const made of pools.splice(0)) made.close()
})

/** The results file's stat_weights array from the first real file. */
async function sampleWeights(): Promise<StatWeights> {
    const sample: ResultsFile = await Bun.file(
        join(ARMORY, 'src/sample-truncha-first-run.json')
    ).json()
    return sample.stat_weights
}

function run(
    character: TestcharCharacter,
    weights: StatWeights,
    on: SimPool
): Promise<SimOutcome> {
    return simCharacter(character, weights, on, () => {})
}

/** One passing run of Testchar, shared by the tests that read its file. */
let passing:
    Promise<{ character: TestcharCharacter; outcome: SimOutcome }> | undefined
function passingRun() {
    passing ??= (async () => {
        const on = pool()
        const character = await testcharCharacter(on)
        const outcome = await run(character, await sampleWeights(), on)
        return { character, outcome }
    })()
    return passing
}

function fileOf(outcome: SimOutcome): ResultsFile {
    expect(outcome.kind).toBe('file')
    if (outcome.kind !== 'file') throw new Error(`a ${outcome.kind} stop`)
    return outcome.file
}

describe('simCharacter on Testchar with the real WASM', () => {
    test('gives a file readResultsFile accepts: provisional, worn and max-damage results on the three single fights and chain-solo, and the max-damage plan', async () => {
        const { outcome } = await passingRun()
        const file = fileOf(outcome)
        const read = readResultsFile(file)
        expect(read.ok ? 'ok' : JSON.stringify(read)).toBe('ok')
        expect(file.provisional).toBe(true)
        expect(file.fights.map((f) => f.fight_id).sort()).toEqual(
            [...ALL_FIGHTS].sort()
        )
        for (const fight of ALL_FIGHTS)
            for (const gear of ['worn', 'max-damage'])
                expect(
                    file.results.some(
                        (r) => r.gear === gear && r.fight_id === fight
                    )
                ).toBe(true)
        expect(file.plans.map((p) => p.plan_id)).toContain('max-damage')
    }, 1_200_000)

    test('run twice with the same character, weights and seeds, gives identical files apart from made_at', async () => {
        const { character, outcome } = await passingRun()
        const again = await run(
            structuredClone(character),
            await sampleWeights(),
            pool()
        )
        const withoutMadeAt = (file: ResultsFile) => {
            const copy: Partial<ResultsFile> = structuredClone(file)
            delete copy.made_at
            return copy
        }
        const first = fileOf(outcome)
        const second = fileOf(again)
        expect(second.made_at).toEqual(expect.any(String))
        expect(withoutMadeAt(second)).toEqual(withoutMadeAt(first))
    }, 1_200_000)

    test("the level-60 gate's detail names the 1e-9 tolerance", async () => {
        const { outcome } = await passingRun()
        const gate = fileOf(outcome).checks.find((c) =>
            /level[ -]?60/i.test(c.name)
        )
        expect(gate).toBeDefined()
        expect(gate!.passed).toBe(true)
        expect(gate!.detail).toContain('1e-9')
    }, 1_200_000)

    test('a passing run carries exactly three failed checks: the real fights, mana model and long-fight weights notes, with their neutral text', async () => {
        const { outcome } = await passingRun()
        const failed = fileOf(outcome).checks.filter((c) => !c.passed)
        expect(
            failed
                .map((c) => ({ name: c.name, detail: c.detail }))
                .sort((a, b) => a.name.localeCompare(b.name))
        ).toEqual(
            Object.entries(NOTES)
                .map(([name, detail]) => ({ name, detail }))
                .sort((a, b) => a.name.localeCompare(b.name))
        )
    }, 1_200_000)
})

describe('the ported request builder', () => {
    test("with Testchar, seed 23 and 2000 iterations, gives the fixture's recorded DPS on the three single fights within 1e-9 relative", async () => {
        const fixture = (await Bun.file(
            join(SIM_DIR, 'fixtures/testchar-l30.json')
        ).json()) as { fights: { fight_id: string; worn_dps: number }[] }
        const on = pool()
        const character = await testcharCharacter(on)
        for (const id of SINGLE_FIGHTS) {
            const expected = fixture.fights.find((f) => f.fight_id === id)!
            const result = (await on.sim(
                buildRequest(character, id, { seed: 23, iterations: 2000 }),
                character.profile
            )) as {
                raidMetrics: {
                    parties: { players: { dps: { avg: number } }[] }[]
                }
            }
            const dps = result.raidMetrics.parties[0]!.players[0]!.dps.avg
            const relative =
                Math.abs(dps - expected.worn_dps) / expected.worn_dps
            expect(relative).toBeLessThanOrEqual(1e-9)
        }
    }, 1_200_000)
})

describe('simCharacter stops and leaves out', () => {
    test('a sheet with Strength 10 higher than the sim says returns a gates stop naming sheet strength, and no file', async () => {
        const on = pool()
        const character = structuredClone(await testcharCharacter(on))
        character.sheet.strength += 10
        const outcome = await run(character, await sampleWeights(), on)
        expect(outcome.kind).toBe('gates')
        expect(outcome).not.toHaveProperty('file')
        if (outcome.kind !== 'gates') throw new Error('not a gates stop')
        const strength = outcome.failed.find((c) => c.name === 'sheet strength')
        expect(strength).toBeDefined()
        expect(strength!.passed).toBe(false)
    }, 1_200_000)

    test('a Warrior with every talent point in Arms returns an unsupported stop before any sim or sheet call', async () => {
        const real = pool()
        const character = structuredClone(await testcharCharacter(real))
        character.class = 'Warrior'
        character.profile.class = 'ClassWarrior'
        // Every point moves into the first tree, Arms.
        character.talents = character.talents.replace(/-/g, '')

        const calls: string[] = []
        const counting: SimPool = {
            ...real,
            size: real.size,
            sim: (...args) => {
                calls.push('sim')
                return real.sim(...args)
            },
            sheet: (...args) => {
                calls.push('sheet')
                return real.sheet(...args)
            },
            batch: (planned) => real.batch(planned),
        }
        const outcome = await run(character, await sampleWeights(), counting)
        expect(outcome).toEqual({
            kind: 'unsupported',
            class: 'Warrior',
            spec: 'Arms',
        })
        expect(calls).toEqual([])
    }, 1_200_000)

    test('an unconfirmed item (no source, no level requirement) is in left_out_items, never in alternatives or the plan', async () => {
        const real = pool()
        const character = await testcharCharacter(real)
        // A leather helm far better than anything worn, that no source
        // confirms and that needs level 1 (a missing reqLvl means 60).
        const madeUp = {
            id: MADE_UP_ID,
            name: 'Made-up Helm',
            icon: 'inv_helmet_01',
            type: 1,
            armorType: 2,
            reqLvl: 1,
            phase: 1,
            quality: 4,
            scalingOptions: {
                '0': {
                    randPropPoints: 20,
                    stats: { '0': 120, '1': 120, '2': 60, '3': 60 },
                    ilvl: 35,
                },
            },
        }
        const withMadeUp: SimPool = {
            ...real,
            size: real.size,
            async data(name) {
                const data = await real.data(name)
                if (name === 'db.json') {
                    const db = data as { items: unknown[] }
                    return { ...db, items: [...db.items, madeUp] }
                }
                if (name === 'item_first_seen.json' && Array.isArray(data))
                    return [...data, { id: MADE_UP_ID, firstSeen: 1794294967 }]
                return data
            },
        }
        const outcome = await run(character, await sampleWeights(), withMadeUp)
        const file = fileOf(outcome)
        expect((file.left_out_items ?? []).map((i) => i.item_id)).toContain(
            MADE_UP_ID
        )
        for (const slot of file.slots)
            expect(slot.alternatives.map((a) => a.item.item_id)).not.toContain(
                MADE_UP_ID
            )
        for (const plan of file.plans)
            expect(Object.values(plan.gear)).not.toContain(MADE_UP_ID)
    }, 1_200_000)
})
