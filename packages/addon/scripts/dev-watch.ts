#!/usr/bin/env bun
/**
 * The copy-on-save watcher, for when WoW on macOS doesn't follow the link
 * `dev:link` makes: replaces `AddOns/Turbo` with a real copy of the shipped
 * `Turbo` folder, then copies it again whenever a file in it changes. Stop it
 * with Ctrl-C.
 *
 * `WOW_ADDONS_DIR` points it at another AddOns folder.
 *
 * @example
 * ```bash
 * bun run dev:watch
 * ```
 */
import { cpSync, watch } from 'node:fs'
import { join } from 'node:path'

import { TURBO_DIR, addonsDir, removeInstalled } from './dev-link'

/** How long to wait after a change for the rest of a save to land. */
const SETTLE_MS = 100

/**
 * Copies `Turbo` into an AddOns folder, replacing what was there.
 *
 * @param addons - the AddOns folder
 * @returns the copy's path
 */
export function copyTurbo(addons: string): string {
    const installed = join(addons, 'Turbo')
    removeInstalled(installed)
    cpSync(TURBO_DIR, installed, { recursive: true })
    return installed
}

if (import.meta.main) {
    let addons: string
    try {
        addons = addonsDir()
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    }

    const installed = copyTurbo(addons)
    console.log(`Copied ${TURBO_DIR} to ${installed}; watching for changes.`)

    let pending: ReturnType<typeof setTimeout> | undefined
    watch(TURBO_DIR, { recursive: true }, () => {
        clearTimeout(pending)
        pending = setTimeout(() => {
            copyTurbo(addons)
            console.log(`Copied again at ${new Date().toLocaleTimeString()}`)
        }, SETTLE_MS)
    })
}
