/**
 * The page's error boundary: a render error shows what went wrong and a Start
 * over button that brings back the new-visitor state. A test-only component
 * throws on demand, since a file the schema accepts shouldn't. The DOM helper
 * must be the first import.
 */
import './dom'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { App } from '../src/app'
import { ErrorBoundary } from '../src/error-boundary'

const WENT_WRONG = 'Something went wrong showing this file.'

/** Set by the mounted Tripwire: makes it throw on its next render. */
let trip: () => void = () => {}

function Tripwire() {
    const [tripped, setTripped] = useState(false)
    trip = () => setTripped(true)
    if (tripped) throw new Error('The grid had no end.')
    return null
}

afterEach(() => {
    cleanup()
})

describe('the error boundary', () => {
    test('a render error shows the message, the error and Start over', async () => {
        // React reports caught render errors on the console; keep it quiet.
        const quiet = spyOn(console, 'error').mockImplementation(() => {})
        try {
            render(
                <ErrorBoundary>
                    <Tripwire />
                </ErrorBoundary>
            )
            act(() => trip())

            expect(screen.getByRole('alert').textContent).toContain(WENT_WRONG)
            expect(screen.getByText('The grid had no end.')).toBeDefined()
            expect(
                screen.getByRole('button', { name: 'Start over' })
            ).toBeDefined()
        } finally {
            quiet.mockRestore()
        }
    })

    test('Start over after an error brings back the new-visitor state', async () => {
        const quiet = spyOn(console, 'error').mockImplementation(() => {})
        try {
            const user = userEvent.setup()
            render(
                <ErrorBoundary>
                    <App />
                    <Tripwire />
                </ErrorBoundary>
            )
            await user.click(
                screen.getByRole('button', {
                    name: 'Look at a sample character',
                })
            )
            await screen.findByRole('heading', { level: 1, name: 'Truncha' })

            act(() => trip())
            expect(screen.getByText(WENT_WRONG)).toBeDefined()

            await user.click(screen.getByRole('button', { name: 'Start over' }))

            expect(screen.queryByText(WENT_WRONG)).toBeNull()
            expect(
                screen.getByRole('heading', {
                    level: 2,
                    name: 'Bring your character in',
                })
            ).toBeDefined()
            expect(
                screen.queryByRole('heading', { level: 1, name: 'Truncha' })
            ).toBeNull()
        } finally {
            quiet.mockRestore()
        }
    })

    test('the page is wrapped in the boundary', async () => {
        const { App: page } = await import('../src/app')
        const tree = page() as { type: unknown }
        expect(tree.type).toBe(ErrorBoundary)
    })
})
