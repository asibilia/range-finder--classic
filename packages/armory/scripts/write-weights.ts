/**
 * `bun run sim:weights`: sims the precomputed stat weights (spec section 5)
 * and writes one committed file per class, spec and level band to
 * `packages/sim/weights/<class>-<spec>-<min>-<max>.json`.
 *
 * It runs the same WASM the page runs, through `@goturbo/sim`'s pool under
 * Bun, with the runner's weights method (`simStatWeights`: 5 seeds × 8000
 * iterations, the three single fights). It reads `packages/sim/build/`, so
 * the root script runs `sim:build` first; the new file is also copied into
 * `build/weights/`, where the pool's `weights()` reads it.
 *
 * The only band so far is 30–34, from Testchar (`testchar-l30.json`) until
 * the owner's reference character replaces it (#83).
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    createSimPool,
    readWeightsFile,
    weightsBand,
    weightsFileName,
    WEIGHTS_SCHEMA_VERSION,
} from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    scenariosFor,
    simStatWeights,
    specOf,
    talentTrees,
    type Character,
} from '../src/browser-sim'

const SIM_DIR = join(import.meta.dir, '../../sim')
const WEIGHTS = join(SIM_DIR, 'weights')
const BUILD = join(SIM_DIR, 'build')

/** Sims every band's weights and writes their files; returns their names. */
export async function writeWeights(): Promise<string[]> {
    const pool = createSimPool({ base: pathToFileURL(BUILD + '/') })
    try {
        const version = await pool.version()
        const character = (await testcharCharacter(
            pool
        )) as unknown as Character
        const reference = 'testchar-l30.json'
        const spec = specOf(
            character.talents,
            await talentTrees(pool, character.class)
        )
        const band = weightsBand(character.level)
        if (!band)
            throw new Error(`No weights band for level ${character.level}.`)
        const [levelMin, levelMax] = band

        const fights = await simStatWeights(
            character,
            pool,
            scenariosFor(character.level)
        )
        const file = {
            schema_version: WEIGHTS_SCHEMA_VERSION,
            class: character.class,
            spec,
            level_min: levelMin,
            level_max: levelMax,
            sim: {
                upstream_commit: version.upstream_commit,
                patch_id: version.patch_id,
            },
            made_at: new Date().toISOString(),
            reference,
            fights,
        }
        const read = readWeightsFile(file)
        if (!read.ok)
            throw new Error(
                `The weights file doesn't read:\n${read.problems.join('\n')}`
            )

        const name = weightsFileName(character.class, spec, levelMin, levelMax)
        mkdirSync(WEIGHTS, { recursive: true })
        writeFileSync(join(WEIGHTS, name), JSON.stringify(file, null, 2) + '\n')
        mkdirSync(join(BUILD, 'weights'), { recursive: true })
        copyFileSync(join(WEIGHTS, name), join(BUILD, 'weights', name))
        return [name]
    } finally {
        pool.close()
    }
}

if (import.meta.main) {
    const written = await writeWeights()
    for (const name of written)
        console.log(`Wrote packages/sim/weights/${name}.`)
}
