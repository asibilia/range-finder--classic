/**
 * The damage split names every line, as the runner's `simShares`
 * (`meter.ts`) and `lineOf` (`combatlog/parse.ts`) do, reference part 1:
 * triggered spells (Lightning Shield's damage, Windfury's attacks, totem
 * attacks) fold into their named line, and no line reads `Spell N`. The
 * names come from `build/spell-names.json` (spell id to name), which
 * `sim:build` writes from the vendored spell data, read through
 * `pool.data`.
 *
 * Driven through `simExport` of Testchar's export with a fake pool that
 * answers every `sim` and `sheet` call from the recorded outputs
 * (`tests/fixtures/sim-outputs.json`, `bun run sim:record`) and reads the
 * data files from `packages/sim/build/`, as `sim-page.test.tsx`'s does.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import {
    weightsBand,
    weightsFileName,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
    type SimVersion,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { simExport } from '../src/browser-sim'
import type { ResultsFile } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'

const BUILD = join(import.meta.dir, '../../sim/build')
const OUTPUTS = join(import.meta.dir, 'fixtures/sim-outputs.json')

/** The key a recorded call is kept under (`scripts/record-sim.ts`). */
function callKey(
    method: 'sim' | 'sheet',
    request: unknown,
    profile?: unknown
): string {
    return createHash('sha256')
        .update(JSON.stringify({ method, request, profile }))
        .digest('hex')
}

let recordedMemo: Promise<Record<string, unknown>> | undefined
function recorded(): Promise<Record<string, unknown>> {
    recordedMemo ??= Bun.file(OUTPUTS).json() as Promise<
        Record<string, unknown>
    >
    return recordedMemo
}

/** A `SimPool` that answers from the recorded outputs and the build. */
function recordedPool(): SimPool {
    async function answer(
        method: 'sim' | 'sheet',
        request: unknown,
        profile?: unknown
    ): Promise<unknown> {
        const key = callKey(method, request, profile)
        const value = (await recorded())[key]
        if (value === undefined)
            throw new Error(
                `sim-outputs.json has no ${method} call ${key}: run bun run sim:record.`
            )
        return structuredClone(value)
    }
    return {
        size: 1,
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
        stats: () => ({ calls: 0, iterations: 0, ms: 0 }),
        batch() {},
        onProgress: () => () => {},
        cancel() {},
        close() {},
    }
}

type Result = ResultsFile['results'][number]

/** Testchar's results file, simmed from the recorded outputs. */
async function testcharResults(): Promise<Result[]> {
    const pool = recordedPool()
    const testchar = await testcharCharacter(pool)
    const outcome = await simExport(
        exportFromCharacter(testchar, testchar.sheet),
        pool,
        () => {}
    )
    if (outcome.kind !== 'file')
        throw new Error(`Testchar's export stopped: ${outcome.kind}.`)
    return outcome.file.results
}

function linesOf(results: Result[], fightId: string): string[][] {
    const fights = results.filter((r) => r.fight_id === fightId)
    expect(fights.length).toBeGreaterThan(0)
    return fights.map((r) => r.damage_split.map((part) => part.name))
}

type Unit = {
    actions?: { id?: { spellId?: number } }[]
    pets?: Unit[]
}

/** A recorded answer: a sim's result has `raidMetrics`, a sheet none. */
type Recorded = { raidMetrics?: { parties?: { players?: Unit[] }[] } }

/** Every spell id in the `actions` of a unit and its pets. */
function spellIds(unit: Unit, into: Set<number>): Set<number> {
    for (const action of unit.actions ?? [])
        if (action.id?.spellId) into.add(action.id.spellId)
    for (const pet of unit.pets ?? []) spellIds(pet, into)
    return into
}

// The fake pool reads the data files, version and weights from the build.
beforeAll(() => ensureSimBuild(), 600_000)

describe('the damage split names every line', () => {
    test('Testchar’s dungeon-long damage split has no line starting Spell, and has a Windfury line', async () => {
        const results = await testcharResults()
        for (const names of linesOf(results, 'dungeon-long')) {
            expect(names.filter((name) => name.startsWith('Spell '))).toEqual(
                []
            )
            expect(names).toContain('Windfury')
        }
    })

    test('Testchar’s solo-hit-short damage split, where the mob hits the character, has a Lightning Shield line and no line starting Spell', async () => {
        const results = await testcharResults()
        for (const names of linesOf(results, 'solo-hit-short')) {
            expect(names).toContain('Lightning Shield')
            expect(names).toContain('Windfury')
            expect(names.filter((name) => name.startsWith('Spell '))).toEqual(
                []
            )
        }
        for (const result of results)
            expect(
                result.damage_split
                    .map((part) => part.name)
                    .filter((name) => name.startsWith('Spell '))
            ).toEqual([])
    })
})

describe('build/spell-names.json', () => {
    test('has a name for every spell id in the actions of Testchar’s recorded results', async () => {
        const file = Bun.file(join(BUILD, 'spell-names.json'))
        expect(await file.exists()).toBe(true)
        const names = (await file.json()) as Record<string, unknown>

        const ids = new Set<number>()
        for (const value of Object.values(await recorded())) {
            const raid = (value as Recorded).raidMetrics
            for (const party of raid?.parties ?? [])
                for (const player of party.players ?? []) spellIds(player, ids)
        }
        expect(ids.size).toBeGreaterThan(0)

        const unnamed = [...ids].filter((id) => {
            const name = names[String(id)]
            return typeof name !== 'string' || name.trim() === ''
        })
        expect(unnamed).toEqual([])
    })
})
