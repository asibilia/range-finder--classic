/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * happy-dom's globals for the armory tests. Import this first in every test
 * file that renders. Its types are in `dom.d.ts`.
 *
 * This is CommonJS on purpose. Bun evaluates the CommonJS modules a test file
 * imports (React DOM, Testing Library) before any ES module body runs, so an
 * ES helper would register the globals too late: Testing Library's `screen`
 * and React DOM read `document` once, when they load. As the test file's
 * first import and a CommonJS module, this runs before them.
 *
 * The globals are removed after the file: a happy-dom `window` left in place
 * makes the addon's Lua loader load as a browser build.
 */
const { afterAll, afterEach } = require('bun:test')
const { GlobalRegistrator } = require('@happy-dom/global-registrator')

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()

/** Removes happy-dom's globals. Safe to call more than once. */
async function teardownDom() {
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
}

// The page keeps the last results file in localStorage
// (`src/remembered-file.ts`): each test starts with a browser that has
// nothing stored, as the next test's page would otherwise open that file.
// A test that stubs storage restores and clears it itself.
afterEach(() => {
    try {
        if (GlobalRegistrator.isRegistered) globalThis.localStorage.clear()
    } catch {
        // Stubbed storage that throws, or has no clear().
    }
})

afterAll(teardownDom)

module.exports = { teardownDom }
