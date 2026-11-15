/**
 * Opening the armory planner in a test: render the page, load the sample or a
 * results file, and wait for the character. Import it right after `./dom`.
 */
import './dom'
import './chart-layout'

import { expect } from 'bun:test'
import { render, screen, waitFor, within } from '@testing-library/react'
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

/**
 * The readings table's row named `label`: the value in each of its cells
 * after the label (what you wear, then the plan), or null. The table is
 * drawn as stat blocks; a cell's value is its `data-reading-value` element,
 * apart from the change line under it.
 */
export function readingRow(label: string): string[] | null {
    const header = screen.getByRole('columnheader', { name: 'What you wear' })
    const table = header.closest('[role="table"]')
    if (!table) throw new Error('the readings table is missing')
    for (const row of within(table as HTMLElement).getAllByRole('row')) {
        const name = within(row).queryByRole('rowheader')?.textContent?.trim()
        if (name !== label) continue
        return within(row)
            .getAllByRole('cell')
            .map((cell) =>
                (
                    cell.querySelector('[data-reading-value]')?.textContent ??
                    ''
                ).trim()
            )
    }
    return null
}

/** The readings change line under the plan's value, or null. */
export function readingChange(label: string): string | null {
    const header = screen.getByRole('columnheader', { name: 'What you wear' })
    const table = header.closest('[role="table"]') as HTMLElement
    for (const row of within(table).getAllByRole('row'))
        if (within(row).queryByRole('rowheader')?.textContent === label)
            return (
                within(row).queryByText(/vs what you wear$/)?.textContent ??
                null
            )
    return null
}

/** The card's fight picker (a shadcn Select on Base UI). */
export function fightSelect(): HTMLElement {
    return screen.getByRole('combobox', { name: 'Fight' })
}

/** The fight the picker shows. */
export function shownFight(): string {
    return (fightSelect().textContent ?? '').replace(/[▼▾]/g, '').trim()
}

/** Opens the fight picker and returns its options' labels. */
export async function fightOptions(user: User): Promise<string[]> {
    await user.click(fightSelect())
    const options = await screen.findAllByRole('option')
    const labels = options.map((option) => (option.textContent ?? '').trim())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    return labels
}

/** Picks the fight labelled `label` with the card's fight picker. */
export async function chooseFight(user: User, label: string): Promise<void> {
    await user.click(fightSelect())
    await user.click(await screen.findByRole('option', { name: label }))
    await waitFor(() => expect(shownFight()).toBe(label))
}
