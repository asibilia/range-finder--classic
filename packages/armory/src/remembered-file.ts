/**
 * The last results file, kept in this browser so a reload doesn't start
 * empty. This module is the only code that touches browser storage
 * (`tests/build-output.test.ts` fails any other): it keeps the text of the
 * last file that read OK under one localStorage key, `REMEMBERED_FILE_KEY`,
 * and nothing else. Nothing is sent anywhere.
 *
 * Storage that is unavailable (access throws, as in some privacy modes) or
 * full (`setItem` throws `QuotaExceededError`) is never an error: the page
 * works as before, it just doesn't remember.
 */
import { readResultsFile, type ResultsFile } from './results-file'

/** The one localStorage key the page uses. */
export const REMEMBERED_FILE_KEY = 'armory:last-results-file'

/** What `recallFile` found. */
export type Recalled =
    /** Nothing stored, or storage unavailable. */
    | { kind: 'none' }
    /** The stored file, read through `readResultsFile`. */
    | { kind: 'file'; file: ResultsFile }
    /** A stored file that no longer reads; it has been removed. */
    | { kind: 'forgotten' }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The browser's localStorage, or null when it can't be reached. */
function store(): Store | null {
    try {
        return globalThis.localStorage ?? null
    } catch {
        return null
    }
}

/** Removes the stored file; never throws. */
function remove(storage: Store | null): void {
    try {
        storage?.removeItem(REMEMBERED_FILE_KEY)
    } catch {
        // Storage gone: there is nothing to remove.
    }
}

/**
 * Keeps `text`, the text of a results file that just read OK, in place of
 * any file kept before.
 *
 * @param text - The file's text, as read.
 * @returns True when it was kept; false when storage is unavailable or full
 * (then no older file is left behind either).
 *
 * @example
 * ```ts
 * if (outcome.ok) remembered = rememberFile(text)
 * ```
 */
export function rememberFile(text: string): boolean {
    const storage = store()
    try {
        if (!storage) return false
        storage.setItem(REMEMBERED_FILE_KEY, text)
        return true
    } catch {
        // Full: an older file left stored would come back on reload in
        // place of this one.
        remove(storage)
        return false
    }
}

/**
 * Reads the kept file back, with the same checks as a file the visitor
 * opens. A kept file that isn't JSON or no longer validates is removed.
 * Call it in the browser only (an effect), never while prerendering.
 *
 * @returns The kept file, `none`, or `forgotten` when it was removed.
 *
 * @example
 * ```ts
 * const recalled = recallFile()
 * if (recalled.kind === 'file') show(recalled.file)
 * ```
 */
export function recallFile(): Recalled {
    const storage = store()
    let text: string | null
    try {
        text = storage ? storage.getItem(REMEMBERED_FILE_KEY) : null
    } catch {
        return { kind: 'none' }
    }
    if (text === null) return { kind: 'none' }
    let input: unknown
    try {
        input = JSON.parse(text)
    } catch {
        remove(storage)
        return { kind: 'forgotten' }
    }
    const outcome = readResultsFile(input)
    if (outcome.ok) return { kind: 'file', file: outcome.file }
    remove(storage)
    return { kind: 'forgotten' }
}

/**
 * Forgets the kept file (`Forget this file`). Never throws.
 *
 * @example
 * ```ts
 * forgetFile()
 * ```
 */
export function forgetFile(): void {
    remove(store())
}
