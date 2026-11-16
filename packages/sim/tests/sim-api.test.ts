/**
 * `@goturbo/sim`'s TypeScript API under Bun: `loadSim({ base })` loads the
 * built WASM from `packages/sim/build/` and runs our three exports
 * (`turboSim`, `turboSheet`, `turboVersion`) on the calling thread, with the
 * level profile passed with each call.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadSim, SimError } from '../src'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const BASE = pathToFileURL(join(PACKAGE_DIR, 'build') + '/')
const L60_DPS = 819.0224561454966
const UPSTREAM_COMMIT = '47205c966132ef52b5d12cef97dac6ebe017190c'

type Sim = Awaited<ReturnType<typeof loadSim>>
type SimRequest = Parameters<Sim['sim']>[0]
type Profile = NonNullable<Parameters<Sim['sim']>[1]>

type Json = Record<string, unknown>
type RaidSimResult = {
    raidMetrics: {
        parties: {
            players: { dps: { avg: number }; timeline?: Json[] }[]
        }[]
    }
}
type Sheet = {
    level: number
    unreached_ranks: number[]
    player: {
        baseStats: { stats: number[] }
        finalStats: { stats: number[] }
    }
}
type Version = { upstream_commit: string; patch_id: string; go_version: string }

type Fight = {
    fight_id: string
    request: Json & {
        encounter: { duration: number; durationVariation?: number }
        simOptions: Json
    }
    worn_dps: number
}
type Testchar = { profile: Json & Record<string, number>; fights: Fight[] }

const testchar = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'fixtures/testchar-l30.json'), 'utf8')
) as Testchar
const profileA = testchar.profile as unknown as Profile
const fight = (id: string): Fight => {
    const found = testchar.fights.find((f) => f.fight_id === id)
    if (!found) throw new Error(`testchar-l30.json has no ${id} fight`)
    return structuredClone(found)
}
const asRequest = (request: unknown) => request as SimRequest
const l60Request = () =>
    asRequest(
        JSON.parse(
            readFileSync(join(PACKAGE_DIR, 'fixtures/l60-test.in.json'), 'utf8')
        )
    )

const dpsOf = (result: unknown) =>
    (result as RaidSimResult).raidMetrics.parties[0]!.players[0]!.dps.avg
const relative = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** A proto field as protojson writes it: its proto name or lowerCamelCase. */
const field = (point: Json, protoName: string) => {
    const camel = protoName.replace(/_([a-z0-9])/g, (_, c: string) =>
        c.toUpperCase()
    )
    return protoName in point ? point[protoName] : point[camel]
}

// Stat enum indices from proto/common.proto.
const STAT = {
    Strength: 0,
    Agility: 1,
    Stamina: 2,
    Intellect: 3,
    Spirit: 13,
    Health: 29,
    Mana: 30,
    ArmorNoMods: 38,
}

let sim: Sim

beforeAll(async () => {
    const build = Bun.spawnSync([process.execPath, 'run', 'sim:build'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (build.exitCode !== 0) {
        console.error(build.stdout.toString() + build.stderr.toString())
        throw new Error('bun run sim:build failed')
    }
    sim = await loadSim({ base: BASE })
}, 600_000)

describe('loadSim under Bun', () => {
    test('the level-60 request with no profile is within 1e-9 relative of 819.0224561454966', async () => {
        const result = await sim.sim(l60Request())
        expect(relative(dpsOf(result), L60_DPS)).toBeLessThanOrEqual(1e-9)
    }, 120_000)

    test("Testchar's profile doesn't leak between calls: A, none, A again, and none in a fresh sim", async () => {
        const request = asRequest(fight('dungeon-long').request)
        const first = dpsOf(await sim.sim(request, profileA))
        const second = dpsOf(await sim.sim(request))
        const third = dpsOf(await sim.sim(request, profileA))

        expect(third).toBe(first)
        expect(second).not.toBe(first)

        const fresh = await loadSim({ base: BASE })
        const freshNoProfile = dpsOf(await fresh.sim(request))
        expect(second).toBe(freshNoProfile)
    }, 300_000)

    test("Testchar's three single fights with its profile give the fixture's DPS within 1e-9 relative", async () => {
        const ids = ['solo-hit-short', 'dungeon-short', 'dungeon-long']
        for (const id of ids) {
            const { request, worn_dps } = fight(id)
            const dps = dpsOf(await sim.sim(asRequest(request), profileA))
            expect({ id, close: relative(dps, worn_dps) <= 1e-9 }).toEqual({
                id,
                close: true,
            })
        }
    }, 300_000)

    test('sim() with WeaponSkillUnarmed throws a SimError naming it', async () => {
        const request = fight('dungeon-long').request as unknown as {
            raid: { parties: { players: Json[] }[] }
        }
        request.raid.parties[0]!.players[0]!.weaponSkills = [
            { skill: 'WeaponSkillUnarmed', value: 150 },
        ]
        let caught: unknown
        try {
            await sim.sim(asRequest(request), profileA)
        } catch (error) {
            caught = error
        }
        expect(caught).toBeInstanceOf(SimError)
        expect((caught as Error).name).toBe('SimError')
        expect((caught as Error).message).toContain('WeaponSkillUnarmed')
    }, 120_000)

    test('sim() with timelineBucketMs 1000 returns one timeline point per second of the fight', async () => {
        const { request } = fight('dungeon-long')
        request.simOptions.timelineBucketMs = 1000
        const { duration, durationVariation = 0 } = request.encounter
        const result = (await sim.sim(
            asRequest(request),
            profileA
        )) as unknown as RaidSimResult
        const timeline = result.raidMetrics.parties[0]!.players[0]!.timeline
        expect(Array.isArray(timeline)).toBe(true)
        expect(timeline!.length).toBeGreaterThanOrEqual(
            duration - durationVariation
        )
        expect(timeline!.length).toBeLessThanOrEqual(
            duration + durationVariation
        )
        timeline!.forEach((point, i) => {
            expect(field(point, 't_s')).toBe(i)
            for (const name of [
                'dps',
                'dps_stdev',
                'mana',
                'mana_stdev',
                'iterations',
            ]) {
                expect(typeof field(point, name)).toBe('number')
            }
        })
        expect(field(timeline![0]!, 'dps') as number).toBeGreaterThan(0)
        expect(field(timeline![0]!, 'iterations')).toBe(
            request.simOptions.iterations
        )
    }, 120_000)

    test('the timeline only records: DPS is the same with timelineBucketMs set or unset', async () => {
        const off = fight('dungeon-long').request
        const on = fight('dungeon-long').request
        on.simOptions.timelineBucketMs = 1000
        const testcharOff = dpsOf(await sim.sim(asRequest(off), profileA))
        const testcharOn = dpsOf(await sim.sim(asRequest(on), profileA))
        expect(testcharOn).toBe(testcharOff)

        const l60Off = dpsOf(await sim.sim(l60Request()))
        const l60On = l60Request() as unknown as { simOptions: Json }
        l60On.simOptions.timelineBucketMs = 1000
        const l60OnDps = dpsOf(await sim.sim(asRequest(l60On)))
        expect(l60OnDps).toBe(l60Off)
        expect(relative(l60OnDps, L60_DPS)).toBeLessThanOrEqual(1e-9)
    }, 300_000)
})

describe('sheet() under Bun', () => {
    test("Testchar's profile reports level 30, its base stats and unreached ranks; no profile then reports level 60 and none", async () => {
        const request = asRequest(fight('dungeon-long').request)
        const at30 = (await sim.sheet(request, profileA)) as unknown as Sheet
        expect(at30.level).toBe(30)
        const base = at30.player.baseStats.stats
        const p = testchar.profile
        expect([
            base[STAT.Strength],
            base[STAT.Agility],
            base[STAT.Stamina],
            base[STAT.Intellect],
            base[STAT.Spirit],
        ]).toEqual([p.strength, p.agility, p.stamina, p.intellect, p.spirit])
        expect(at30.unreached_ranks.length).toBeGreaterThan(0)

        const at60 = (await sim.sheet(request)) as unknown as Sheet
        expect(at60.level).toBe(60)
        expect(at60.unreached_ranks).toEqual([])
    }, 120_000)

    test('returns unreached_ranks as spell ids and finalStats.stats in the proto Stat order', async () => {
        const request = asRequest(fight('dungeon-long').request)
        const sheet = (await sim.sheet(request, profileA)) as unknown as Sheet
        for (const id of sheet.unreached_ranks) {
            expect(Number.isInteger(id)).toBe(true)
            expect(id).toBeGreaterThan(0)
        }
        expect(new Set(sheet.unreached_ranks).size).toBe(
            sheet.unreached_ranks.length
        )

        const final = sheet.player.finalStats.stats
        const p = testchar.profile
        expect(final.length).toBeGreaterThan(STAT.ArmorNoMods)
        expect(final[STAT.Strength]).toBeGreaterThanOrEqual(p.strength!)
        expect(final[STAT.Stamina]).toBeGreaterThanOrEqual(p.stamina!)
        expect(final[STAT.Intellect]).toBeGreaterThanOrEqual(p.intellect!)
        expect(final[STAT.Spirit]).toBeGreaterThanOrEqual(p.spirit!)
        // Health and mana come from base plus Stamina and Intellect.
        expect(final[STAT.Health]).toBeGreaterThan(
            p.baseHealth! + final[STAT.Stamina]!
        )
        expect(final[STAT.Mana]).toBeGreaterThan(
            p.baseMana! + final[STAT.Intellect]!
        )
    }, 120_000)
})

describe('version() under Bun', () => {
    test('returns the pinned upstream commit, a patch_id and the Go version', async () => {
        const version = (await sim.version()) as unknown as Version
        expect(version.upstream_commit).toBe(UPSTREAM_COMMIT)
        expect(version.patch_id).toMatch(/^[0-9a-f]{12}$/)
        expect(version.go_version).toMatch(/^go\d+\.\d+/)
    }, 60_000)
})
