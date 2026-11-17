/**
 * The page remembers the last results file it read, in this browser only:
 * its text under one localStorage key, `armory:last-results-file`. A reload
 * brings it back, a stored file that no longer reads is forgotten with a
 * note, `Forget this file` clears it, and storage that is unavailable or full
 * leaves the page working as before, just not remembering. The sample is
 * never stored. The DOM helper must be the first import.
 */
import './dom'
import { jsonFile, openSample, pick, renderApp, variant } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen } from '@testing-library/react'

import {
    forgetFile,
    recallFile,
    REMEMBERED_FILE_KEY,
    rememberFile,
} from '../src/remembered-file'
import sample from '../src/sample-truncha.json'

const KEPT = 'This file is kept in this browser only.'
const FORGOTTEN =
    'The results file this browser kept no longer reads, so it was forgotten.'

/** A results file named `name`, as the text a picked file would hold. */
function fileNamed(name: string) {
    return variant((file) => {
        ;(file.character as Record<string, unknown>).name = name
        file.sample = false
    })
}

const ORIGINAL = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

/** Replaces `globalThis.localStorage` for one test (see `afterEach`). */
function stubStorage(descriptor: PropertyDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        ...descriptor,
    })
}

/** Storage that throws on access, as a browser in privacy mode can. */
function storageUnavailable() {
    stubStorage({
        get() {
            throw new DOMException(
                'The operation is insecure.',
                'SecurityError'
            )
        },
    })
}

/** Storage that reads fine but is full: every `setItem` throws. */
function storageFull(): { removed: string[] } {
    const calls = { removed: [] as string[] }
    stubStorage({
        value: {
            getItem: () => null,
            setItem: () => {
                throw new DOMException('Quota exceeded.', 'QuotaExceededError')
            },
            removeItem: (key: string) => calls.removed.push(key),
        },
    })
    return calls
}

/** Waits for a heading named `name` (the gear card's names the character). */
async function waitForName(name: string) {
    await screen.findByRole('heading', { name })
}

/** The new-visitor state's heading: the page has no file open. */
function noFileHeading(): HTMLElement {
    return screen.getByRole('heading', {
        level: 2,
        name: 'Bring your character in',
    })
}

/** Unmounts the page and renders it again, as a reload would. */
function reload() {
    cleanup()
    return renderApp()
}

afterEach(() => {
    cleanup()
    if (ORIGINAL) Object.defineProperty(globalThis, 'localStorage', ORIGINAL)
    localStorage.clear()
})

describe('remembered-file', () => {
    test('the key is armory:last-results-file', () => {
        expect(REMEMBERED_FILE_KEY).toBe('armory:last-results-file')
    })

    test('rememberFile stores the text under the key and nothing else', () => {
        expect(rememberFile('{"a":1}')).toBe(true)
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBe('{"a":1}')
        expect(localStorage.length).toBe(1)
    })

    test('a new file replaces the stored one', () => {
        rememberFile(JSON.stringify(fileNamed('First')))
        rememberFile(JSON.stringify(fileNamed('Second')))
        expect(localStorage.length).toBe(1)
        const recalled = recallFile()
        expect(recalled.kind).toBe('file')
        if (recalled.kind === 'file')
            expect(recalled.file.character.name).toBe('Second')
    })

    test('recallFile with nothing stored says none', () => {
        expect(recallFile()).toEqual({ kind: 'none' })
    })

    test('recallFile reads the stored text through readResultsFile', () => {
        rememberFile(JSON.stringify(fileNamed('Kept')))
        const recalled = recallFile()
        expect(recalled.kind).toBe('file')
        if (recalled.kind === 'file')
            expect(recalled.file.character.name).toBe('Kept')
    })

    test('a stored text that is not JSON is removed and reported forgotten', () => {
        localStorage.setItem(REMEMBERED_FILE_KEY, '{not json')
        expect(recallFile()).toEqual({ kind: 'forgotten' })
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })

    test('a stored file that no longer validates is removed and reported forgotten', () => {
        localStorage.setItem(
            REMEMBERED_FILE_KEY,
            JSON.stringify(variant((file) => (file.schema_version = 2)))
        )
        expect(recallFile()).toEqual({ kind: 'forgotten' })
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })

    test('forgetFile clears the key', () => {
        rememberFile('{}')
        forgetFile()
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })

    test('storage that throws on access: nothing throws, nothing is remembered', () => {
        storageUnavailable()
        expect(rememberFile('{}')).toBe(false)
        expect(recallFile()).toEqual({ kind: 'none' })
        expect(() => forgetFile()).not.toThrow()
    })

    test('full storage: rememberFile says it could not keep the file, and drops the older one', () => {
        const calls = storageFull()
        expect(rememberFile('{}')).toBe(false)
        // An older file left stored would come back on reload in place of
        // the one just opened.
        expect(calls.removed).toEqual([REMEMBERED_FILE_KEY])
    })
})

describe('the page remembers the last results file', () => {
    test('a picked file is stored, comes back on reload, and says it is kept in this browser', async () => {
        const data = fileNamed('Kept')
        const user = renderApp()
        await pick(user, jsonFile(data))
        await waitForName('Kept')

        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBe(
            JSON.stringify(data)
        )
        expect(localStorage.length).toBe(1)
        expect(screen.getByText(KEPT)).toBeDefined()

        reload()
        // Back straight away, from the stored text.
        await waitForName('Kept')
        expect(screen.getByText(KEPT)).toBeDefined()
        expect(
            screen.getByRole('button', { name: 'Forget this file' })
        ).toBeDefined()
    })

    test('a dropped file is stored too', async () => {
        renderApp()
        const data = fileNamed('Dropped')
        fireEvent.drop(document.body, {
            dataTransfer: { files: [jsonFile(data)] },
        })
        await waitForName('Dropped')
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBe(
            JSON.stringify(data)
        )
    })

    test('a file that fails to read is not stored', async () => {
        const user = renderApp()
        await pick(user, jsonFile({ hello: 'world' }))
        await screen.findByText(
            "This file isn't a results file the planner can read."
        )
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })

    test('Forget this file clears the key and goes back to the new-visitor state', async () => {
        const user = renderApp()
        await pick(user, jsonFile(fileNamed('Kept')))
        await waitForName('Kept')

        await user.click(
            screen.getByRole('button', { name: 'Forget this file' })
        )

        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
        await waitForName('Bring your character in')
        expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
        expect(screen.queryByText(KEPT)).toBeNull()

        reload()
        expect(noFileHeading()).toBeDefined()
    })

    test('after Forget, a new file is the one stored', async () => {
        const user = renderApp()
        await pick(user, jsonFile(fileNamed('First')))
        await waitForName('First')
        await user.click(
            screen.getByRole('button', { name: 'Forget this file' })
        )
        await pick(user, jsonFile(fileNamed('Second')))
        await waitForName('Second')

        expect(localStorage.length).toBe(1)
        reload()
        await waitForName('Second')
    })

    test('a stored file that no longer reads is dropped, with one note, on the new-visitor state', async () => {
        localStorage.setItem(
            REMEMBERED_FILE_KEY,
            JSON.stringify(variant((file) => (file.schema_version = 2)))
        )
        renderApp()

        expect(await screen.findByText(FORGOTTEN)).toBeDefined()
        expect(screen.getAllByText(FORGOTTEN)).toHaveLength(1)
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
        expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
        expect(noFileHeading()).toBeDefined()
        // Not the error for a file the visitor just opened.
        expect(
            screen.queryByText(
                'This results file is version 2. The planner reads version 1.'
            )
        ).toBeNull()
    })

    test('stored text that is not JSON is dropped with the same note', async () => {
        localStorage.setItem(REMEMBERED_FILE_KEY, 'not json at all')
        renderApp()
        expect(await screen.findByText(FORGOTTEN)).toBeDefined()
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
    })

    test('the note goes once a file opens', async () => {
        localStorage.setItem(REMEMBERED_FILE_KEY, 'not json at all')
        const user = renderApp()
        await screen.findByText(FORGOTTEN)
        await pick(user, jsonFile(fileNamed('Kept')))
        await waitForName('Kept')
        expect(screen.queryByText(FORGOTTEN)).toBeNull()
    })

    test('the sample is not stored, and says nothing about being kept', async () => {
        await openSample()
        expect(localStorage.getItem(REMEMBERED_FILE_KEY)).toBeNull()
        expect(localStorage.length).toBe(0)
        expect(screen.queryByText(KEPT)).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Forget this file' })
        ).toBeNull()
    })

    test('storage that throws on access: the page opens empty, reads a file, and does not claim to keep it', async () => {
        storageUnavailable()
        const user = renderApp()
        expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
        expect(noFileHeading()).toBeDefined()
        await pick(user, jsonFile(sample))
        await waitForName('Truncha')
        expect(screen.queryByText(KEPT)).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Forget this file' })
        ).toBeNull()

        reload()
        expect(noFileHeading()).toBeDefined()
    })

    test('full storage: the file still opens, and the page does not claim to keep it', async () => {
        storageFull()
        const user = renderApp()
        await pick(user, jsonFile(fileNamed('Kept')))
        await waitForName('Kept')
        expect(screen.queryByText(KEPT)).toBeNull()
        expect(
            screen.queryByRole('button', { name: 'Forget this file' })
        ).toBeNull()
    })
})
