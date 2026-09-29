#!/usr/bin/env bun
/**
 * Runs LuaLS headless over the addon (lint + type check), with the pinned WoW
 * annotations and the in-repo Forever stubs (`types/`) as libraries. Settings
 * live in `packages/addon/.luarc.json`; LuaLS resolves its library paths from
 * the checked folder, so it runs from `packages/addon`.
 *
 * Exits non-zero on any warning or error.
 *
 * @example
 * ```bash
 * bun run lua:check
 * ```
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { TOOL_PATHS, TOOLS_DIR } from './fetch-tools'

const ADDON_DIR = resolve(import.meta.dir, '..')

for (const [name, path] of [
    ['LuaLS', TOOL_PATHS.luals],
    ['the WoW API annotations', TOOL_PATHS.wowApi],
] as const) {
    if (!existsSync(path)) {
        console.error(
            `${name} not found at ${path}. Run \`bun run tools:fetch\` first.`
        )
        process.exit(1)
    }
}

const proc = Bun.spawn(
    [
        TOOL_PATHS.luals,
        '--check=.',
        '--checklevel=Warning',
        '--check_format=pretty',
        `--logpath=${join(TOOLS_DIR, 'luals-run', 'log')}`,
        `--metapath=${join(TOOLS_DIR, 'luals-run', 'meta')}`,
    ],
    { cwd: ADDON_DIR, stdout: 'inherit', stderr: 'inherit' }
)
process.exit(await proc.exited)
