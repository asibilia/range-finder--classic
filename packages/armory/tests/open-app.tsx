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
// The chart drawings are lazy in the page (so Recharts isn't in its first
// load). Loaded here up front, so a test doesn't pay for Recharts inside
// its own time limit; `lazy()` then resolves from the module cache.
import '../src/components/fight-plot'
import '../src/components/pull-plot'
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

/**
 * Waits for the lazily loaded chart drawings (Recharts) to replace their
 * placeholders.
 */
export async function chartsLoaded(): Promise<void> {
    // A plain error: a failed expect() would print the whole element on
    // every retry, which is slow on this page.
    await waitFor(
        () => {
            if (document.querySelector('[data-chart-loading]'))
                throw new Error('a chart is still loading')
        },
        { timeout: 4000 }
    )
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
        screen.getByRole('button', { name: 'Or look at a sample character' })
    )
    await screen.findByRole('heading', { level: 1, name: 'Truncha' })
    await chartsLoaded()
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
    await chartsLoaded()
    return user
}

/**
 * The value shown in the reading named `label` (what you wear's, or the
 * plan's in the plan view), or null when there is no such reading.
 */
export function readingValue(label: string): string | null {
    const cell = document.querySelector(`[data-reading="${CSS.escape(label)}"]`)
    if (!cell) return null
    return (
        cell.querySelector('[data-reading-value]')?.textContent ?? ''
    ).trim()
}

/** The labels of the readings, in order. */
export function readingLabels(): string[] {
    return [...document.querySelectorAll('[data-reading]')].map(
        (cell) => cell.getAttribute('data-reading') ?? ''
    )
}

/** The change under a reading's value in the plan view, or null. */
export function readingChange(label: string): string | null {
    const cell = document.querySelector(`[data-reading="${CSS.escape(label)}"]`)
    const text = cell?.querySelector('[data-reading-change]')?.textContent
    return text ? text.trim() : null
}

/** The fight the chart, the readings and the band are on (its label). */
export function shownFight(): string {
    return (
        document
            .querySelector('[data-slot="fight-band"]')
            ?.getAttribute('data-fight') ?? ''
    )
}

/** The fight length select in the fight settings. */
export function lengthSelect(): HTMLElement {
    return screen.getByRole('combobox', { name: 'Fight length' })
}

/** Picks a fight length (`30 seconds`, `1 minute`) in the fight settings. */
export async function chooseLength(user: User, label: string): Promise<void> {
    await user.click(lengthSelect())
    await user.click(await screen.findByRole('option', { name: label }))
    await waitFor(() =>
        expect((lengthSelect().textContent ?? '').trim()).toContain(label)
    )
}

/**
 * Puts the page on the fight labelled `label` through the fight settings:
 * a length no fight in the sample has (1 minute) makes them say `Not simmed
 * for this combination.` and list the file's fights, and the fight is
 * picked from that list.
 */
export async function chooseFight(user: User, label: string): Promise<void> {
    if (shownFight() === label) return
    await chooseLength(user, '1 minute')
    const list = await screen.findByRole('status')
    await user.click(within(list).getByRole('button', { name: label }))
    await waitFor(() => expect(shownFight()).toBe(label))
    await chartsLoaded()
}

/** The text of the elements an element's `aria-describedby` names. */
export function description(element: Element): string {
    return (element.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
}

/**
 * A text matcher for a sentence split across elements (its times are
 * coloured spans): the innermost element whose whole text is `text`.
 */
export function sentence(text: string) {
    return (_: string, element: Element | null): boolean =>
        element?.textContent === text &&
        [...element.children].every((child) => child.textContent !== text)
}

/**
 * The gain pill in `element` that reads `text` (`+23.6 EP`; the unit is
 * drawn small, in its own element). Throws when there is none.
 */
export function pill(element: HTMLElement, text: string): HTMLElement {
    const found = [
        ...element.querySelectorAll<HTMLElement>('[data-size]'),
    ].find((candidate) => candidate.textContent === text)
    if (!found) throw new Error(`no gain pill reading ${text}`)
    return found
}

/** The gain pills in `element`, as they read. */
export function pills(element: HTMLElement): string[] {
    return [...element.querySelectorAll('[data-size]')].map(
        (candidate) => candidate.textContent ?? ''
    )
}
