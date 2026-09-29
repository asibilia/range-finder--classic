#!/usr/bin/env bun
/**
 * The secret-read guard: fails when addon code outside the safe layer
 * references a game function that can return a secret value.
 *
 * Which functions those are comes from Forever's own API documentation
 * (`Blizzard_APIDocumentationGenerated`, fetched by `bun run tools:fetch`). A
 * function counts when Blizzard flags it `SecretReturns`,
 * `ConditionalSecret`, any `SecretWhen...` / `SecretIn...` condition,
 * `SecretReturnsForAspect` (widget getters), or marks one of its returns
 * `SecretValue`. The WoW annotations LuaLS reads drop these flags, which is
 * why this guard exists.
 *
 * It flags, outside `Turbo/core/safe-layer.lua`:
 * - globals (`UnitHealth`) and namespaced functions (`C_Spell.GetSpellCooldown`),
 *   called or not (a reference can be called later);
 * - widget methods (`bar:GetValue()`);
 * - `_G` and `getglobal`, which could reach any of them indirectly.
 * Comments and strings are ignored.
 *
 * @example
 * ```bash
 * bun run lua:guard                                   # Turbo's addon folder
 * bun packages/addon/scripts/secret-guard.ts <addon-dir>
 * ```
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { TOOL_PATHS } from './fetch-tools'
import { createLuaVm } from './lua-vm'

/** A game function that can return secret values. */
export type SecretApi = {
    kind: 'global' | 'namespaced' | 'method'
    name: string
    namespace?: string
    /** How findings name it: `UnitHealth`, `C_Spell.GetSpellCooldown`, `:GetValue`. */
    display: string
    /** The Blizzard flags that make it secret-returning. */
    flags: string[]
}

export type Finding = {
    file: string
    line: number
    api: string
    flags: string[]
}

export type GuardOptions = {
    /** The addon folder to check. */
    addonDir: string
    /** Forever's `Blizzard_APIDocumentationGenerated` folder. */
    docsDir: string
    /** The one file allowed to call them, relative to `addonDir`. */
    safeLayerFile?: string
}

const DEFAULT_ADDON_DIR = resolve(import.meta.dir, '../Turbo')
const SAFE_LAYER_FILE = 'core/safe-layer.lua'

/** Doc files are Lua; this runs them and pulls out the flagged functions. */
const EXTRACT = `
local docs = {}
-- Docs refer to enums and constants (Enum.SecretAspect.Alpha, Constants.X + 1);
-- any unknown name becomes a table that tolerates whatever a doc does with it.
local autoMeta = {}
local function auto()
    return setmetatable({}, autoMeta)
end
autoMeta.__index = function(t, k) local v = auto(); rawset(t, k, v); return v end
autoMeta.__call = function() return auto() end
autoMeta.__concat = function() return "" end
for _, op in ipairs({ "__add", "__sub", "__mul", "__div", "__mod", "__pow", "__unm" }) do
    autoMeta[op] = function() return 0 end
end
local env = setmetatable({
    APIDocumentation = { AddDocumentationTable = function(_, t) table.insert(docs, t) end },
}, { __index = function(t, k)
    if _G[k] ~= nil then return _G[k] end
    local v = auto(); rawset(t, k, v); return v
end })

for name, source in pairs(__docs_sources) do
    local chunk, err = loadstring(source, "@" .. name)
    if not chunk then error(err, 0) end
    setfenv(chunk, env)
    chunk()
end

local function jsonString(s)
    return '"' .. s:gsub('[%c"\\\\]', function(c) return string.format("\\\\u%04x", c:byte()) end) .. '"'
end

local out = {}
for _, doc in ipairs(docs) do
    if doc.Type == "System" or doc.Type == "ScriptObject" then
        for _, fn in ipairs(doc.Functions or {}) do
            local flags = {}
            for key, value in pairs(fn) do
                if value and type(key) == "string" and (key:match("^Secret") or key:match("^ConditionalSecret")) and key ~= "SecretArguments" and not key:match("^SecretArguments") then
                    table.insert(flags, jsonString(key))
                end
            end
            for _, ret in ipairs(fn.Returns or {}) do
                if ret.SecretValue then
                    table.insert(flags, jsonString("SecretValue return"))
                    break
                end
            end
            if #flags > 0 then
                table.sort(flags)
                table.insert(out, string.format('{"type":%s,"namespace":%s,"name":%s,"flags":[%s]}',
                    jsonString(doc.Type), doc.Namespace and jsonString(doc.Namespace) or "null",
                    jsonString(fn.Name), table.concat(flags, ",")))
            end
        end
    end
end
return "[" .. table.concat(out, ",") .. "]"
`

/**
 * Reads Forever's API docs and lists every function that can return secrets.
 *
 * @param docsDir - the `Blizzard_APIDocumentationGenerated` folder
 * @returns the flagged functions (globals, namespaced functions, widget methods)
 * @throws when the folder is missing (run `bun run tools:fetch`) or a doc fails to load
 */
export function loadSecretApis(docsDir: string): SecretApi[] {
    if (!existsSync(docsDir)) {
        throw new Error(
            `Forever's API docs are not at ${docsDir}. Run \`bun run tools:fetch\` first.`
        )
    }
    const files = readdirSync(docsDir).filter((f) => f.endsWith('.lua'))
    const vm = createLuaVm()
    try {
        vm.run('__docs_sources = {}')
        for (const file of files) {
            vm.setString('__doc', readFileSync(join(docsDir, file), 'utf8'))
            vm.run(`__docs_sources[${JSON.stringify(file)}] = __doc`)
        }
        const raw = JSON.parse(vm.run(EXTRACT) ?? '[]') as {
            type: string
            namespace: string | null
            name: string
            flags: string[]
        }[]
        const apis = raw.map((r): SecretApi => {
            if (r.type === 'ScriptObject') {
                return {
                    kind: 'method',
                    name: r.name,
                    display: `:${r.name}`,
                    flags: r.flags,
                }
            }
            if (r.namespace) {
                return {
                    kind: 'namespaced',
                    name: r.name,
                    namespace: r.namespace,
                    display: `${r.namespace}.${r.name}`,
                    flags: r.flags,
                }
            }
            return {
                kind: 'global',
                name: r.name,
                display: r.name,
                flags: r.flags,
            }
        })
        // A method is documented once per widget type; keep one entry each.
        const unique = new Map<string, SecretApi>()
        for (const api of apis) {
            const known = unique.get(api.display)
            if (known) {
                known.flags = [
                    ...new Set([...known.flags, ...api.flags]),
                ].sort()
            } else {
                unique.set(api.display, api)
            }
        }
        return [...unique.values()]
    } finally {
        vm.close()
    }
}

/**
 * Blanks out comments and strings (keeping newlines), so only code is
 * scanned and line numbers stay right.
 */
function codeOnly(source: string): string {
    let out = ''
    let i = 0
    const blank = (text: string) => text.replace(/[^\n]/g, ' ')
    const longBracket = (at: number) => source.slice(at).match(/^\[(=*)\[/)
    while (i < source.length) {
        if (source.startsWith('--', i)) {
            const long = longBracket(i + 2)
            let end: number
            if (long) {
                const close = `]${long[1]}]`
                const found = source.indexOf(close, i + 2 + long[0].length)
                end = found === -1 ? source.length : found + close.length
            } else {
                const found = source.indexOf('\n', i)
                end = found === -1 ? source.length : found
            }
            out += blank(source.slice(i, end))
            i = end
            continue
        }
        const long = source[i] === '[' ? longBracket(i) : null
        if (long) {
            const close = `]${long[1]}]`
            const found = source.indexOf(close, i + long[0].length)
            const end = found === -1 ? source.length : found + close.length
            out += blank(source.slice(i, end))
            i = end
            continue
        }
        const quote = source[i]
        if (quote === '"' || quote === "'") {
            let j = i + 1
            while (j < source.length && source[j] !== quote) {
                j += source[j] === '\\' ? 2 : 1
            }
            out += blank(source.slice(i, j + 1))
            i = j + 1
            continue
        }
        out += source[i]
        i += 1
    }
    return out
}

/**
 * Finds every reference to a secret-returning function in one Lua source.
 *
 * @param source - the Lua code
 * @param apis - from `loadSecretApis`
 * @param file - the name findings carry
 */
export function scanSource(
    source: string,
    apis: SecretApi[],
    file: string
): Finding[] {
    const code = codeOnly(source)
    const lineAt = (index: number) => code.slice(0, index).split('\n').length

    const globals = new Map<string, SecretApi>()
    const namespaces = new Map<string, Map<string, SecretApi>>()
    const methods = new Map<string, SecretApi>()
    for (const api of apis) {
        if (api.kind === 'global') globals.set(api.name, api)
        if (api.kind === 'method') methods.set(api.name, api)
        if (api.kind === 'namespaced' && api.namespace) {
            const members = namespaces.get(api.namespace) ?? new Map()
            members.set(api.name, api)
            namespaces.set(api.namespace, members)
        }
    }

    const findings: (Finding & { index: number })[] = []
    const add = (index: number, api: string, flags: string[]) =>
        findings.push({ file, line: lineAt(index), api, flags, index })

    // Names read as globals: not a field (`x.Name`, `x:Name`), not part of a
    // longer word.
    const globalName = /(?<![\w])(?<![.:]\s*)([A-Za-z_]\w*)/g
    for (const match of code.matchAll(globalName)) {
        const name = match[1] ?? ''
        const index = match.index ?? 0
        if (name === '_G' || name === 'getglobal') {
            add(index, name, ['indirect global access'])
            continue
        }
        const global = globals.get(name)
        if (global) {
            add(index, global.display, global.flags)
            continue
        }
        const members = namespaces.get(name)
        if (members) {
            const after = code.slice(index + name.length)
            const member = after.match(/^\s*\.\s*([A-Za-z_]\w*)/)
            const api = member?.[1] ? members.get(member[1]) : undefined
            if (api) add(index, api.display, api.flags)
        }
    }

    for (const match of code.matchAll(/:\s*([A-Za-z_]\w*)\s*\(/g)) {
        const api = methods.get(match[1] ?? '')
        if (api) add(match.index ?? 0, api.display, api.flags)
    }

    return findings
        .sort((a, b) => a.index - b.index)
        .map(({ index: _index, ...finding }) => finding)
}

/** Lists every `.lua` file under a folder, as forward-slash relative paths. */
function luaFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => f.endsWith('.lua'))
        .sort()
}

/**
 * Checks every Lua file in an addon folder except its safe layer.
 *
 * @returns the findings, by file then line; empty when the folder is clean
 */
export function runGuard(options: GuardOptions): Finding[] {
    const apis = loadSecretApis(options.docsDir)
    const safeLayer = options.safeLayerFile ?? SAFE_LAYER_FILE
    return luaFiles(options.addonDir)
        .filter((file) => file !== safeLayer)
        .flatMap((file) =>
            scanSource(
                readFileSync(join(options.addonDir, file), 'utf8'),
                apis,
                file
            )
        )
}

if (import.meta.main) {
    const addonDir = resolve(process.argv[2] ?? DEFAULT_ADDON_DIR)
    const findings = runGuard({ addonDir, docsDir: TOOL_PATHS.foreverApiDocs })
    const shown = relative(process.cwd(), addonDir) || '.'
    if (findings.length === 0) {
        console.log(
            `secret guard: ${shown} is clean (no secret-returning game call outside ${SAFE_LAYER_FILE})`
        )
    } else {
        for (const f of findings) {
            const what =
                f.flags[0] === 'indirect global access'
                    ? 'reaches game globals indirectly'
                    : `can return secret values (${f.flags.join(', ')})`
            console.error(
                `${join(shown, f.file)}:${f.line}: ${f.api} ${what}. Only ${SAFE_LAYER_FILE} may touch the game; add a reading there.`
            )
        }
        console.error(`secret guard: ${findings.length} problem(s)`)
        process.exit(1)
    }
}
