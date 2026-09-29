/**
 * Installs the rf-probe diagnostic addon into the WoW: Forever beta client.
 *
 * Copies only the addon files (`*.toc` and `*.lua`) from this directory into
 * `/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/rf-probe/`,
 * replacing that folder if it already exists. Nothing else in the WoW folder
 * is touched.
 *
 * @example
 * ```bash
 * bun tools/probe/install.ts
 * ```
 */
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE_DIR = import.meta.dir
const ADDONS_DIR =
    '/Applications/World of Warcraft/_classic_beta_/Interface/AddOns'
const TARGET_DIR = join(ADDONS_DIR, 'rf-probe')

/**
 * Returns true for files that belong in the installed addon.
 *
 * @param name - file name inside the source directory
 * @returns whether the file is a TOC or Lua file
 */
const isAddonFile = (name: string): boolean =>
    name.endsWith('.toc') || name.endsWith('.lua')

/**
 * Copies the addon files into a fresh target folder.
 *
 * @returns the list of installed file names
 * @throws if the AddOns directory does not exist (client not installed)
 */
async function install(): Promise<string[]> {
    const addonsStat = await stat(ADDONS_DIR).catch(() => null)
    if (!addonsStat?.isDirectory()) {
        throw new Error(`AddOns folder not found: ${ADDONS_DIR}`)
    }

    const files = (await readdir(SOURCE_DIR)).filter(isAddonFile).sort()
    if (files.length === 0) {
        throw new Error(`No .toc/.lua files found in ${SOURCE_DIR}`)
    }

    await rm(TARGET_DIR, { recursive: true, force: true })
    await mkdir(TARGET_DIR, { recursive: true })

    for (const name of files) {
        await Bun.write(
            join(TARGET_DIR, name),
            Bun.file(join(SOURCE_DIR, name))
        )
    }
    return files
}

const installed = await install()
console.log(`Installed ${installed.length} files to ${TARGET_DIR}:`)
for (const name of installed) console.log(`  ${name}`)
