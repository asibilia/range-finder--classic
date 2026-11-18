/**
 * Precomputed stat weights: `bun run sim:weights` sims them per class, spec
 * and level band and writes one committed JSON file per band to
 * `packages/sim/weights/`. `sim:build` copies them into `build/weights/`,
 * where the pool's `weights()` reads them. `readWeightsFile` checks the
 * format, and a file simmed on another sim build fails here.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import * as simApi from '../src'
import { createSimPool, loadSim, type SimPool, type WeightsFile } from '../src'
import { ensureSimBuild } from './helpers/sim-build'
import { validWeights, type Json } from './helpers/weights-shared'

/** Read through the namespace, so each test fails alone until it exists. */
const readWeightsFile = (input: unknown): unknown =>
    (
        simApi as unknown as { readWeightsFile: (input: unknown) => unknown }
    ).readWeightsFile(input)

const PACKAGE_DIR = join(import.meta.dir, '..')
const WEIGHTS_DIR = join(PACKAGE_DIR, 'weights')
const BAND_FILE = 'shaman-enhancement-30-34.json'
const BUILD = join(PACKAGE_DIR, 'build')
const BASE = pathToFileURL(BUILD + '/')
const STALE =
    'Weights were simmed on another sim build: run bun run sim:weights.'

type SimStamp = { upstream_commit: string; patch_id: string }

function committed(name = BAND_FILE): Json {
    return JSON.parse(readFileSync(join(WEIGHTS_DIR, name), 'utf8')) as Json
}

/**
 * Throws the staleness message, naming the files, when any weights file's
 * `sim` isn't `version`'s `upstream_commit` and `patch_id`.
 */
function assertFresh(files: [string, Json][], version: SimStamp): void {
    const stale = files
        .filter(([, file]) => {
            const sim = file.sim as SimStamp | undefined
            return (
                sim?.upstream_commit !== version.upstream_commit ||
                sim?.patch_id !== version.patch_id
            )
        })
        .map(([name]) => name)
    if (stale.length > 0) throw new Error(`${STALE} (${stale.join(', ')})`)
}

let pool: SimPool | undefined

/** Runs `sim:build` if the build has no worker, version or weights yet. */
const ensureBuild = () =>
    ensureSimBuild({
        needs: ['worker.js', 'version.json', `weights/${BAND_FILE}`],
    })

afterAll(() => {
    pool?.close()
})

describe('the committed weights file', () => {
    test("the pool's weights('Shaman', 'Enhancement', 32) returns the committed file, and level 45 returns null", async () => {
        ensureBuild()
        pool = createSimPool({ base: BASE, size: 1 })
        expect(await pool.weights('Shaman', 'Enhancement', 32)).toEqual(
            committed() as unknown as WeightsFile
        )
        expect(await pool.weights('Shaman', 'Enhancement', 45)).toBeNull()
    }, 600_000)

    test("the pool's weights() rejects, naming the problems, when the band's file is there but doesn't read", async () => {
        const base = mkdtempSync(join(tmpdir(), 'sim-weights-'))
        const broken = createSimPool({
            base: pathToFileURL(base + '/'),
            size: 1,
        })
        try {
            const bad = validWeights()
            bad.account = 'x'
            mkdirSync(join(base, 'weights'))
            writeFileSync(join(base, 'weights', BAND_FILE), JSON.stringify(bad))
            const read = readWeightsFile(bad) as { problems?: string[] }
            expect(read.problems?.length).toBeGreaterThan(0)

            const error = await broken
                .weights('Shaman', 'Enhancement', 32)
                .then(
                    () => undefined,
                    (thrown: unknown) => thrown
                )
            expect(error).toBeInstanceOf(Error)
            const message = (error as Error).message
            expect(message).toContain(BAND_FILE)
            for (const problem of read.problems!)
                expect(message).toContain(problem)

            // No file for the band is still no file, not an error.
            expect(await broken.weights('Shaman', 'Enhancement', 45)).toBeNull()
        } finally {
            broken.close()
            rmSync(base, { recursive: true, force: true })
        }
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

        // What changing the patch without re-running the script looks like:
        // the same check fails, with the staleness message.
        const otherPatch = structuredClone(committed())
        ;(otherPatch.sim as SimStamp).patch_id = 'ffffffffffff'
        expect(() => assertFresh([[BAND_FILE, otherPatch]], version)).toThrow(
            STALE
        )

        // A stale committed file fails here with the message, before any diff.
        assertFresh(files, version)
        expect(committed().sim).toEqual({
            upstream_commit: version.upstream_commit,
            patch_id: version.patch_id,
        })
    }, 600_000)
})
