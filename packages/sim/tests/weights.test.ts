/**
 * Precomputed stat weights: `bun run sim:weights` sims them per class, spec
 * and level band and writes one committed JSON file per band to
 * `packages/sim/weights/`. `sim:build` copies them into `build/weights/`,
 * where the pool's `weights()` reads them. `readWeightsFile` checks the
 * format, and a file simmed on another sim build fails here.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as simApi from '../src'
import { scanForLeaks } from '../src/leak-scan'
import { FIGHTS, validWeights, type Json } from './helpers/weights-shared'

/** Read through the namespace, so each test fails alone until it exists. */
const readWeightsFile = (input: unknown): unknown =>
    (
        simApi as unknown as { readWeightsFile: (input: unknown) => unknown }
    ).readWeightsFile(input)

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const WEIGHTS_DIR = join(PACKAGE_DIR, 'weights')
const BAND_FILE = 'shaman-enhancement-30-34.json'

function committed(name = BAND_FILE): Json {
    return JSON.parse(readFileSync(join(WEIGHTS_DIR, name), 'utf8')) as Json
}

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

    test('its reference is testchar-l30.json, and the leak guard scans packages/sim/weights/ and finds nothing', () => {
        expect(committed().reference).toBe('testchar-l30.json')
        expect(readdirSync(WEIGHTS_DIR)).toContain(BAND_FILE)
        expect(scanForLeaks([WEIGHTS_DIR])).toEqual([])
    })
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
