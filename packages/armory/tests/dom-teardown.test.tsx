/**
 * The DOM helper's globals must never outlive a test file: a happy-dom
 * `window` left in place makes the addon's Lua loader load as a browser build.
 */
import { teardownDom } from './dom'

import { describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { App } from '../src/app'

describe('the DOM test helper', () => {
    test('its teardown leaves globalThis.window undefined', async () => {
        render(<App />)
        expect(
            screen.getByRole('heading', { level: 1 })
        ).toBeDefined()
        cleanup()

        await teardownDom()

        expect((globalThis as { window?: unknown }).window).toBeUndefined()
    })
})
