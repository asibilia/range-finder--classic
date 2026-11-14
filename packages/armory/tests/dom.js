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
const { afterAll } = require('bun:test')
const { GlobalRegistrator } = require('@happy-dom/global-registrator')

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()

/** Removes happy-dom's globals. Safe to call more than once. */
async function teardownDom() {
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister()
}

afterAll(teardownDom)

module.exports = { teardownDom }
