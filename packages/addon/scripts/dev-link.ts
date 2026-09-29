#!/usr/bin/env bun
/**
 * Links the shipped `Turbo` folder into the beta client's AddOns folder, so
 * the client loads a dev build straight from the repo: edit, `/reload`, see
 * the change.
 *
 * Whatever is at `AddOns/Turbo` already (an older link, a copy from
 * `dev:watch`, an installed release) is replaced. Nothing else in the WoW
 * folder is touched. If WoW on macOS doesn't follow the link, use
 * `bun run dev:watch` instead (scripts/dev-watch.ts).
 *
 * `WOW_ADDONS_DIR` points it at another AddOns folder.
 *
 * @example
 * ```bash
 * bun run dev:link
 * WOW_ADDONS_DIR="/path/to/Interface/AddOns" bun run dev:link
 * ```
 */
import { lstatSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** The Forever beta client's AddOns folder. */
export const BETA_ADDONS_DIR =
    '/Applications/World of Warcraft/_classic_beta_/Interface/AddOns'

/** The shipped addon folder. */
export const TURBO_DIR = resolve(import.meta.dir, '../Turbo')

/**
 * The AddOns folder to install into: `WOW_ADDONS_DIR`, or the beta client's.
 *
 * @throws when the folder doesn't exist (the client isn't installed there)
 */
export function addonsDir(): string {
    const dir = process.env.WOW_ADDONS_DIR || BETA_ADDONS_DIR
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error(
            `AddOns folder not found: ${dir}. Install the beta client, or set WOW_ADDONS_DIR.`
        )
    }
    return dir
}

/**
 * Removes whatever is installed at a path: a link goes, never its target.
 *
 * @param path - `AddOns/Turbo`
 */
export function removeInstalled(path: string): void {
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (!stat) return
    if (stat.isSymbolicLink()) unlinkSync(path)
    else rmSync(path, { recursive: true, force: true })
}

/**
 * Links `Turbo` into an AddOns folder, replacing what was there.
 *
 * @param addons - the AddOns folder
 * @returns the link's path
 */
export function linkTurbo(addons: string): string {
    const installed = join(addons, 'Turbo')
    removeInstalled(installed)
    symlinkSync(TURBO_DIR, installed, 'dir')
    return installed
}

if (import.meta.main) {
    try {
        const installed = linkTurbo(addonsDir())
        console.log(`Linked ${installed} -> ${TURBO_DIR}`)
        console.log('Restart the client once, then /reload after each change.')
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    }
}
