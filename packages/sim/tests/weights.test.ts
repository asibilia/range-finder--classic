/**
 * Precomputed stat weights: `bun run sim:weights` sims them per class, spec
 * and level band and writes one committed JSON file per band to
 * `packages/sim/weights/`. `sim:build` copies them into `build/weights/`,
 * where the pool's `weights()` reads them. `readWeightsFile` checks the
 * format, and a file simmed on another sim build fails here.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import * as simApi from '../src'
import { createSimPool, loadSim, scanForLeaks, type SimPool } from '../src'

/** Read through the namespace, so each test fails alone until it exists. */
const readWeightsFile = (input: unknown): unknown =>
    (
        simApi as unknown as { readWeightsFile: (input: unknown) => unknown }
    ).readWeightsFile(input)

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const WEIGHTS_DIR = join(PACKAGE_DIR, 'weights')
const BAND_FILE = 'shaman-enhancement-30-34.json'
const BUILD = join(PACKAGE_DIR, 'build')
const BASE = pathToFileURL(BUILD + '/')
const FIGHTS = ['solo-hit-short', 'dungeon-short', 'dungeon-long']
const STALE =
    'Weights were simmed on another sim build: run bun run sim:weights.'

type Json = Record<string, unknown>
type SimStamp = { upstream_commit: string; patch_id: string }

/** A made-up weights file in the spec's format, for the format tests. */
function validWeights(): Json {
    const weights = [
        { stat: 'strength', ep: 2, half: 0.1 },
        { stat: 'agility', ep: 0.94, half: 0.12 },
        { stat: 'attack_power', ep: 1, half: 0 },
    ]
    return {
        schema_version: 1,
        class: 'Shaman',
        spec: 'Enhancement',
        level_min: 30,
        level_max: 34,
        sim: {
            upstream_commit: '47205c966132ef52b5d12cef97dac6ebe017190c',
            patch_id: '0123456789ab',
        },
        made_at: '2026-11-16T10:00:00+01:00',
        reference: 'testchar-l30.json',
        fights: FIGHTS.map((fight_id) => ({
            fight_id,
            weights: structuredClone(weights),
        })),
    }
}

function committed(name = BAND_FILE): Json {
    return JSON.parse(readFileSync(join(WEIGHTS_DIR, name), 'utf8')) as Json
}

/** The committed weights files whose `sim` isn't `version`'s. */
function staleFiles(files: [string, Json][], version: SimStamp): string[] {
    return files
        .filter(([, file]) => {
            const sim = file.sim as SimStamp | undefined
            return (
                sim?.upstream_commit !== version.upstream_commit ||
                sim?.patch_id !== version.patch_id
            )
        })
        .map(([name]) => name)
}

let pool: SimPool | undefined

/** Runs `sim:build` once if the build has no worker or no weights yet. */
function ensureBuild(): void {
    if (
        existsSync(join(BUILD, 'worker.js')) &&
        existsSync(join(BUILD, 'weights', BAND_FILE))
    )
        return
    const build = Bun.spawnSync([process.execPath, 'run', 'sim:build'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (build.exitCode !== 0) {
        console.error(build.stdout.toString() + build.stderr.toString())
        throw new Error('bun run sim:build failed')
    }
}

afterAll(() => {
    pool?.close()
})

describe('the committed weights file', () => {
    test('sim:weights is a root and package script, and shaman-enhancement-30-34.json reads with readWeightsFile, with the three single fights', () => {
        const root = JSON.parse(
            readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')
        ) as { scripts?: Record<string, string> }
        const sim = JSON.parse(
            readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')
        ) as { scripts?: Record<string, string> }
        expect(root.scripts?.['sim:weights']).toBeDefined()
        expect(sim.scripts?.['sim:weights']).toBeDefined()

        expect(existsSync(join(WEIGHTS_DIR, BAND_FILE))).toBe(true)
        const outcome = readWeightsFile(committed()) as {
            ok: boolean
            problems?: string[]
            file?: Json
        }
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        const file = outcome.file!
        expect(file).toMatchObject({
            schema_version: 1,
            level_min: 30,
            level_max: 34,
        })
        expect(String(file.class).toLowerCase()).toBe('shaman')
        expect(String(file.spec).toLowerCase()).toBe('enhancement')
        expect(
            (file.fights as { fight_id: string }[]).map((f) => f.fight_id)
        ).toEqual(FIGHTS)
    })

    test("the pool's weights('Shaman', 'Enhancement', 32) returns the committed file, and level 45 returns null", async () => {
        ensureBuild()
        pool = createSimPool({ base: BASE, size: 1 })
        expect(await pool.weights('Shaman', 'Enhancement', 32)).toEqual(
            committed()
        )
        expect(await pool.weights('Shaman', 'Enhancement', 45)).toBeNull()
    }, 600_000)

    test('its reference is testchar-l30.json, and the leak guard scans packages/sim/weights/ and finds nothing', () => {
        expect(committed().reference).toBe('testchar-l30.json')
        expect(readdirSync(WEIGHTS_DIR)).toContain(BAND_FILE)
        expect(scanForLeaks([WEIGHTS_DIR])).toEqual([])
    })
})

describe('staleness', () => {
    test("every weights file's sim equals turboVersion()'s upstream_commit and patch_id, and a file from another patch is stale", async () => {
        ensureBuild()
        const version = await (await loadSim({ base: BASE })).version()
        const files = readdirSync(WEIGHTS_DIR)
            .filter((name) => name.endsWith('.json'))
            .map((name): [string, Json] => [name, committed(name)])
        expect(files.map(([name]) => name)).toContain(BAND_FILE)
        expect(committed().sim).toEqual({
            upstream_commit: version.upstream_commit,
            patch_id: version.patch_id,
        })

        // What changing the patch without re-running the script looks like.
        const otherPatch = structuredClone(committed())
        ;(otherPatch.sim as SimStamp).patch_id = 'ffffffffffff'
        expect(staleFiles([[BAND_FILE, otherPatch]], version)).toEqual([
            BAND_FILE,
        ])

        const stale = staleFiles(files, version)
        if (stale.length > 0) throw new Error(`${STALE} (${stale.join(', ')})`)
    }, 600_000)
})

describe('readWeightsFile', () => {
    test('reads a well-formed file and refuses one with an extra key, at the top or in a weight', () => {
        const good = readWeightsFile(validWeights()) as {
            ok: boolean
            problems?: string[]
        }
        expect(good.problems).toBeUndefined()
        expect(good.ok).toBe(true)

        const topLevel = validWeights()
        topLevel.account = 'x'
        const top = readWeightsFile(topLevel) as {
            ok: boolean
            problems?: string[]
        }
        expect(top.ok).toBe(false)
        expect(top.problems!.length).toBeGreaterThan(0)

        const inWeight = validWeights()
        ;(inWeight.fights as { weights: Json[] }[])[0]!.weights[0]!.extra = 1
        const weight = readWeightsFile(inWeight) as {
            ok: boolean
            problems?: string[]
        }
        expect(weight.ok).toBe(false)
        expect(weight.problems!.length).toBeGreaterThan(0)
    })

    test('refuses a band whose level_min is above its level_max', () => {
        const backwards = validWeights()
        backwards.level_min = 35
        backwards.level_max = 34
        const outcome = readWeightsFile(backwards) as {
            ok: boolean
            problems?: string[]
        }
        expect(outcome.ok).toBe(false)
        expect(outcome.problems!.length).toBeGreaterThan(0)
    })
})
