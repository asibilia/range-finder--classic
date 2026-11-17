/**
 * `bun run sim:record`: runs the page's scenarios through the real WASM
 * under Bun, with a recording wrapper around the pool, and writes every
 * `sim` and `sheet` answer to `packages/armory/tests/fixtures/sim-outputs.json`
 * for the page tests' fake pool (spec section 10). Each answer is keyed by
 * the SHA-256 hex of `JSON.stringify({ method, request, profile })`.
 *
 * The scenarios: Testchar's export and its Refine (the page's settings),
 * an Arms and a Fury Warrior export (stops, so only their parse) and the
 * owner's buffed export of 15 November. It reads `packages/sim/build/`, so
 * the root script runs `sim:build` first.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSimPool, type SimPool } from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { exportFromCharacter } from '../tests/helpers/export-from-character'
import { refine, simExport } from '../src/browser-sim'

const SIM_DIR = join(import.meta.dir, '../../sim')
const BUILD = join(SIM_DIR, 'build')
const BUFFED = join(SIM_DIR, 'fixtures/truncha-export-buffed.lua')
const OUT_DIR = join(import.meta.dir, '../tests/fixtures')
const OUT = join(OUT_DIR, 'sim-outputs.json')

/** The key a recorded call is kept under; the fake pool computes the same. */
export function callKey(
    method: 'sim' | 'sheet',
    request: unknown,
    profile?: unknown
): string {
    return createHash('sha256')
        .update(JSON.stringify({ method, request, profile }))
        .digest('hex')
}

/** The pool, with every `sim` and `sheet` answer kept in `outputs`. */
function recording(pool: SimPool, outputs: Record<string, unknown>): SimPool {
    return {
        ...pool,
        size: pool.size,
        sim: async (request, profile) => {
            const result = await pool.sim(request, profile)
            outputs[callKey('sim', request, profile)] = result
            return result
        },
        sheet: async (request, profile) => {
            const result = await pool.sheet(request, profile)
            outputs[callKey('sheet', request, profile)] = result
            return result
        },
    }
}

/** Runs every scenario and writes the outputs; returns how many. */
export async function recordSim(): Promise<number> {
    const pool = createSimPool({ base: pathToFileURL(BUILD + '/') })
    const outputs: Record<string, unknown> = {}
    const recorder = recording(pool, outputs)
    const quiet = () => {}
    try {
        const testchar = await testcharCharacter(recorder)
        const text = exportFromCharacter(testchar, testchar.sheet)
        const first = await simExport(text, recorder, quiet)
        if (first.kind !== 'file')
            throw new Error(`Testchar's export stopped: ${first.kind}.`)
        await refine(first.file, first.character, recorder, quiet)

        // Warriors: every point in Arms, then every point in Fury.
        const points = testchar.talents.replace(/-/g, '')
        for (const talents of [points, `-${points}`]) {
            const warrior = {
                ...testchar,
                class: 'Warrior',
                talents,
                profile: { ...testchar.profile, class: 'ClassWarrior' },
            }
            await simExport(
                exportFromCharacter(warrior, testchar.sheet),
                recorder,
                quiet
            )
        }

        await simExport(readFileSync(BUFFED, 'utf8'), recorder, quiet)
    } finally {
        pool.close()
    }
    mkdirSync(OUT_DIR, { recursive: true })
    // One line: the outputs are large, and only the fake pool reads them.
    writeFileSync(OUT, JSON.stringify(outputs) + '\n')
    return Object.keys(outputs).length
}

if (import.meta.main) {
    const count = await recordSim()
    console.log(
        `Recorded ${count} calls in packages/armory/tests/fixtures/sim-outputs.json.`
    )
}
