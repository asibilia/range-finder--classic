/**
 * The damage split names every line, as the runner's `simShares`
 * (`meter.ts`) and `lineOf` (`combatlog/parse.ts`) do, reference part 1:
 * triggered spells (Lightning Shield's damage, Windfury's attacks, totem
 * attacks) fold into their named line, and no line reads `Spell N`. The
 * names come from `build/spell-names.json` (spell id to name), which
 * `sim:build` writes from the vendored spell data, read through
 * `pool.data`.
 *
 * Driven through `simExport` of Testchar's export with the fake pool
 * (`helpers/recorded-pool.ts`), which answers every `sim` and `sheet` call
 * from the recorded outputs (`tests/fixtures/sim-outputs.json`,
 * `bun run sim:record`) and reads the data files from `packages/sim/build/`.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { simExport } from '../src/browser-sim'
import type { ResultsFile } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'
import { BUILD, recorded, recordedPool } from './helpers/recorded-pool'

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
