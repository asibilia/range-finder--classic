/**
 * The fake `SimPool` the armory's tests share, with no sim behind it: it
 * answers each `sim` and `sheet` call from the recorded outputs
 * (`tests/fixtures/sim-outputs.json`, `bun run sim:record`), and reads the
 * data files, the version and the weights files from the sim's build
 * (`packages/sim/build/`). A test scripts it by passing the calls it
 * answers itself: `recordedPool({ sim, sheet })`.
 */
import { join } from 'node:path'

import {
    weightsBand,
    weightsFileName,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
    type SimVersion,
} from '@goturbo/sim'

import { callKey } from '../../scripts/record-sim'

/** The key a recorded call is kept under, as `sim:record` keeps it. */
export { callKey }

/** The sim's build: data files, version and weights files. */
export const BUILD = join(import.meta.dir, '../../../sim/build')
const OUTPUTS = join(import.meta.dir, '../fixtures/sim-outputs.json')

let recordedMemo: Promise<Record<string, unknown>> | undefined
/** Every recorded answer, by its call's key. Read once. */
export function recorded(): Promise<Record<string, unknown>> {
    recordedMemo ??= Bun.file(OUTPUTS).json() as Promise<
        Record<string, unknown>
    >
    return recordedMemo
}

/** A copy of the recorded answer to a call; rejects when it isn't recorded. */
export async function recordedAnswer(
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

/**
 * The fake pool: `sim` and `sheet` from the recorded outputs, the rest from
 * the build, unless `overrides` answers them.
 */
export function recordedPool(overrides: Partial<SimPool> = {}): SimPool {
    return {
        size: 1,
        sim: (request, profile) =>
            recordedAnswer('sim', request, profile) as Promise<RaidSimResult>,
        sheet: (request, profile) =>
            recordedAnswer('sheet', request, profile) as Promise<SimSheet>,
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
        ...overrides,
    }
}
