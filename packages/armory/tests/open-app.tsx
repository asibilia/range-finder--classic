/**
 * Opening the armory planner in a test: render the page, load the sample or a
 * results file, and wait for the character. Import it right after `./dom`.
 */
import './dom'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../src/app'
import sample from '../src/sample-truncha.json'

export type Json = Record<string, unknown>
export type User = ReturnType<typeof userEvent.setup>

/** A copy of `base` (the sample unless given), changed by `change`. */
export function variant(
    change: (file: Json) => void,
    base: unknown = sample
): Json {
    const copy = structuredClone(base) as Json
    change(copy)
    return copy
}

/** `data` as a `.json`-named file. */
export function jsonFile(data: unknown, name = 'truncha.json'): File {
    return new File([JSON.stringify(data)], name, { type: 'application/json' })
}

/** Renders the page with nothing loaded. */
export function renderApp(): User {
    render(<App />)
    return userEvent.setup()
}

/** Picks `file` with the page's file input. */
export async function pick(user: User, file: File): Promise<void> {
    await user.upload(screen.getByLabelText('Open a results file'), file)
}

/** Renders the page, loads the bundled sample and waits for its h1. */
export async function openSample(): Promise<User> {
    const user = renderApp()
    await user.click(
        screen.getByRole('button', { name: 'Look at a sample character' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Truncha' })
    return user
}

/**
 * Renders the page, picks `data` as a results file and waits for the h1 to
 * name `character`. The page always has an h1 (`Armory planner` before a file
 * loads), so waiting for any h1 would not wait for the file.
 */
export async function openFile(
    data: unknown,
    character = 'Truncha'
): Promise<User> {
    const user = renderApp()
    await pick(user, jsonFile(data))
    await screen.findByRole('heading', { level: 1, name: character })
    return user
}

/** The readings table's row named `label`: its cells after the label, or null. */
export function readingRow(label: string): string[] | null {
    const header = screen.getByRole('columnheader', { name: 'What you wear' })
    const table = header.closest('table')
    if (!table) throw new Error('the readings table is missing')
    for (const row of table.querySelectorAll('tr')) {
        const cells = [...row.querySelectorAll('th, td')].map((cell) =>
            (cell.textContent ?? '').trim()
        )
        if (cells[0] === label) return cells.slice(1)
    }
    return null
}
