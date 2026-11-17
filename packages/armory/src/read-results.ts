/**
 * Reads a results file for the page: its JSON (the sample) or its text (a
 * picked or dropped file, or the dev-only local latest file in
 * `local-latest.ts`), through `readResultsFile`, into the file or the read
 * error the new-visitor card shows.
 */
import type { ReadError } from '@/components/bring-in'

import { readResultsFile, type ResultsFile } from './results-file'

/** A results file that read, or why it didn't. */
export type Read =
    { file: ResultsFile; error: null } | { file: null; error: ReadError }

/**
 * Reads a parsed JSON value as a results file.
 *
 * @param input - The parsed JSON.
 * @returns The file, or a `version` or `invalid` read error.
 *
 * @example
 * ```ts
 * open(readResults(sample))
 * ```
 */
export function readResults(input: unknown): Read {
    const outcome = readResultsFile(input)
    if (outcome.ok) return { file: outcome.file, error: null }
    if (outcome.reason === 'version')
        return {
            file: null,
            error: { kind: 'version', version: outcome.version },
        }
    return {
        file: null,
        error: { kind: 'invalid', problems: outcome.problems },
    }
}

/**
 * Reads a file's text as a results file.
 *
 * @param text - The file's text.
 * @returns The file, or a `not-json`, `version` or `invalid` read error.
 *
 * @example
 * ```ts
 * const read = readResultsText(await file.text())
 * if (read.file !== null) show(read.file)
 * ```
 */
export function readResultsText(text: string): Read {
    let input: unknown
    try {
        input = JSON.parse(text)
    } catch {
        return { file: null, error: { kind: 'not-json' } }
    }
    return readResults(input)
}
