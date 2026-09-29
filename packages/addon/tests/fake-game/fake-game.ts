/**
 * The TypeScript side of the fake game: loads an addon's real Lua files into
 * a Lua 5.1 VM (WebAssembly) with `fake-game.lua` standing in for the safe
 * layer, and gives tests a scenario-style API over it.
 *
 * @example
 * ```typescript
 * const game = loadTurbo()
 * game.setReading('mana', game.secret('mana'))
 * game.fire('PLAYER_REGEN_DISABLED')
 * game.advance(0.3)
 * expect(game.frame('TurboCard')?.shown).toBe(true)
 * game.close()
 * ```
 *
 * Values cross the boundary as Lua literals going in and JSON coming out. In
 * results, a secret stand-in reads as `{ $secret: label }`, a frame as
 * `{ $frame: id }` and a function as `{ $function: true }`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createLuaVm } from '../../scripts/lua-vm'

/** The shipped addon folder, and the file the fake game replaces in it. */
export const TURBO_DIR = join(import.meta.dir, '../../Turbo')
export const TURBO_TOC = 'Turbo_Camelot.toc'
export const SAFE_LAYER_FILE = 'core/safe-layer.lua'

/** A secret stand-in, as tests pass it in and read it back. */
export type Secret = { $secret: string }

/** Raw Lua for a value, for tests of the fake itself. */
export type LuaExpression = { $lua: string }

export type WidgetCall = { frame: string; method: string; args: unknown[] }
export type StateChange = { frame: string; key: string; value: unknown }
export type Read = { name: string; args: unknown[] }

/** A frame's recorded state: known keys plus one key per `Set*` method. */
export type FrameState = {
    type: string
    parent: string | null
    shown: unknown
    alpha: unknown
    points: unknown[][]
    width?: unknown
    height?: unknown
    [key: string]: unknown
}

export type LoadOptions = {
    /** The addon folder, holding the TOC. */
    addonDir: string
    /** The TOC file name inside `addonDir`. */
    toc: string
    /** The name WoW passes as the first vararg; defaults to the folder's. */
    addonName?: string
    /** Where the clock starts (seconds). Defaults to 0. */
    startTime?: number
    /** SavedVariables as WoW would restore them; missing ones are nil. */
    savedVariables?: Record<string, unknown>
}

/** One control on a settings page, showing its value now. */
export type SettingsControl = {
    kind: 'checkbox' | 'slider' | 'text'
    label: string
    value?: unknown
    min?: number
    max?: number
    step?: number
}

/** A page registered in Options → AddOns. */
export type SettingsPage = { name: string; controls: SettingsControl[] }

export type FakeGame = {
    /** A secret stand-in; the same label always gives the same one. */
    secret(label: string, kind?: string): Secret
    /** Fires a game event at every subscribed handler. */
    fire(event: string, ...payload: unknown[]): void
    /** Moves the clock forward, firing due timers in order. */
    advance(seconds: number): void
    /** The clock. */
    now(): number
    /** Scripts a reading's return values. */
    setReading(name: string, ...values: unknown[]): void
    /** Scripts a reading's return values for exact arguments. */
    setReadingFor(name: string, args: unknown[], ...values: unknown[]): void
    /** Scripts one read after another; a read past the end fails. */
    scriptReadings(name: string, sequence: unknown[][]): void
    /** Every read the addon made, in order. */
    reads(): Read[]
    /** Every widget call, in order, optionally filtered. */
    calls(filter?: { frame?: string; method?: string }): WidgetCall[]
    /** Every frame state change, in order, optionally filtered. */
    changes(filter?: { frame?: string; key?: string }): StateChange[]
    /** A frame's current state, by name or generated id. */
    frame(id: string): FrameState | undefined
    /** Every frame id, in creation order. */
    frames(): string[]
    /** Chat lines the addon printed. */
    printed(): string[]
    /** Types a slash command (`/turbo help`) into chat. */
    slash(line: string): void
    /** The pages registered in Options → AddOns, as they show now. */
    settingsPages(): SettingsPage[]
    /** The player ticks a checkbox or moves a slider on a settings page. */
    changeSetting(page: string, label: string, value: unknown): void
    /** Runs a frame script (`OnUpdate`, `OnShow`...) and its hooks. */
    runScript(frameId: string, script: string, ...args: unknown[]): void
    /**
     * Runs Lua inside the addon's sandbox and returns its results. `...` holds
     * `args`; `ns` reads the addon's namespace. Errors are named `test:<line>`.
     */
    run(code: string, ...args: unknown[]): unknown[]
    /** An addon global (a SavedVariable, say). */
    global(name: string): unknown
    /** The TOC files that loaded (the safe layer never does). */
    loadedFiles(): string[]
    /** Frees the VM. */
    close(): void
}

const FAKE_GAME_SOURCE = readFileSync(
    join(import.meta.dir, 'fake-game.lua'),
    'utf8'
)

/**
 * Writes a Lua string literal. Bytes outside printable ASCII pass through, so
 * UTF-8 text survives.
 */
function luaString(text: string): string {
    return `"${text.replace(/[\\"\n\r\0]/g, (c) => {
        const escapes: Record<string, string> = {
            '\\': '\\\\',
            '"': '\\"',
            '\n': '\\n',
            '\r': '\\r',
            '\0': '\\0',
        }
        return escapes[c] ?? c
    })}"`
}

/** Writes any test value as a Lua expression. */
function toLua(value: unknown): string {
    if (value === undefined || value === null) return 'nil'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return '(0/0)'
        if (value === Infinity) return 'math.huge'
        if (value === -Infinity) return '(-math.huge)'
        return String(value)
    }
    if (typeof value === 'string') return luaString(value)
    if (Array.isArray(value)) {
        return `{${value.map((v, i) => `[${i + 1}]=${toLua(v)}`).join(',')}}`
    }
    if (typeof value === 'object') {
        if ('$secret' in value) {
            return `__secrets[${luaString(String((value as Secret).$secret))}]`
        }
        if ('$lua' in value) return (value as LuaExpression).$lua
        return `{${Object.entries(value)
            .map(([k, v]) => `[${luaString(k)}]=${toLua(v)}`)
            .join(',')}}`
    }
    throw new Error(`fake game: can't pass a ${typeof value} to Lua`)
}

/** Writes a list of values as a packed Lua table (`{ n = ..., ... }`). */
function packed(values: unknown[]): string {
    return `{n=${values.length},${values
        .map((v, i) => `[${i + 1}]=${toLua(v)}`)
        .join(',')}}`
}

type Toc = { files: string[]; savedVariables: string[] }

/** Reads a TOC: its file list, in order, and its SavedVariables. */
export function readToc(tocPath: string): Toc {
    const files: string[] = []
    const savedVariables: string[] = []
    for (const raw of readFileSync(tocPath, 'utf8').split(/\r?\n/)) {
        const line = raw.trim()
        const saved = line.match(/^##\s*SavedVariables(?:PerCharacter)?:(.*)$/)
        if (saved?.[1]) {
            savedVariables.push(
                ...saved[1]
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
            )
            continue
        }
        if (!line || line.startsWith('#')) continue
        files.push(line.replace(/\\/g, '/'))
    }
    return { files, savedVariables }
}

/**
 * Loads an addon's TOC files into a fresh VM under the fake game. The TOC's
 * safe-layer file is skipped: the fake game is the safe layer.
 *
 * @param options - which addon, and how the game starts
 * @returns the fake game, ready to drive
 * @throws when a file fails to load, touches a game global, or misuses a secret
 */
export function loadAddon(options: LoadOptions): FakeGame {
    const addonName =
        options.addonName ??
        options.addonDir.split('/').filter(Boolean).pop() ??
        'Addon'
    const toc = readToc(join(options.addonDir, options.toc))
    const saved: Record<string, unknown> = {}
    for (const name of toc.savedVariables) {
        saved[name] = options.savedVariables?.[name]
    }

    const vm = createLuaVm()
    vm.setString('__fake_src', FAKE_GAME_SOURCE)
    vm.run(`
        __FakeGame = assert(loadstring(__fake_src, "@fake-game.lua"))()
        __fake_src = nil
        __secrets = {}
    `)
    vm.run(
        `__game = __FakeGame.new({ addonName = ${luaString(addonName)}, startTime = ${toLua(options.startTime ?? 0)}, savedVariables = ${toLua(saved)} })
        for _, name in ipairs(${toLua(toc.savedVariables)}) do __game.allowedGlobals[name] = true end`
    )

    const json = (code: string): unknown => {
        const result = vm.run(code)
        return result === null ? null : JSON.parse(result)
    }
    const call = (code: string) => {
        vm.run(code)
    }

    for (const file of toc.files) {
        if (file === SAFE_LAYER_FILE) continue
        if (!file.endsWith('.lua')) {
            throw new Error(
                `fake game: ${file} is not a Lua file; the fake game only loads .lua files`
            )
        }
        vm.setString(
            '__file_src',
            readFileSync(join(options.addonDir, file), 'utf8')
        )
        call(
            `__game:loadFile(${luaString(`${addonName}/${file}`)}, __file_src); __file_src = nil`
        )
    }

    const game: FakeGame = {
        secret(label, kind) {
            call(
                `__secrets[${luaString(label)}] = __secrets[${luaString(label)}] or __game:secret(${luaString(label)}, ${toLua(kind)})`
            )
            return { $secret: label }
        },
        fire(event, ...payload) {
            call(
                `__game:fire(${luaString(event)}${payload.map((p) => `, ${toLua(p)}`).join('')})`
            )
        },
        advance(seconds) {
            call(`__game:advance(${toLua(seconds)})`)
        },
        now() {
            return json('return __game:encode(__game.clock)') as number
        },
        setReading(name, ...values) {
            call(`__game:setReading(${luaString(name)}, ${packed(values)})`)
        },
        setReadingFor(name, args, ...values) {
            call(
                `__game:setReadingFor(${luaString(name)}, ${toLua(args)}, ${packed(values)})`
            )
        },
        scriptReadings(name, sequence) {
            call(
                `__game:scriptReadings(${luaString(name)}, {${sequence
                    .map(packed)
                    .join(',')}})`
            )
        },
        reads() {
            return json('return __game:encode(__game.reads)') as Read[]
        },
        calls(filter = {}) {
            const all = json(
                'return __game:encode(__game.calls)'
            ) as WidgetCall[]
            return all.filter(
                (c) =>
                    (!filter.frame || c.frame === filter.frame) &&
                    (!filter.method || c.method === filter.method)
            )
        },
        changes(filter = {}) {
            const all = json(
                'return __game:encode(__game.changes)'
            ) as StateChange[]
            return all.filter(
                (c) =>
                    (!filter.frame || c.frame === filter.frame) &&
                    (!filter.key || c.key === filter.key)
            )
        },
        frame(id) {
            return (json(
                `return __game:encode(__game:frameState(${luaString(id)}))`
            ) ?? undefined) as FrameState | undefined
        },
        frames() {
            return json('return __game:encode(__game.frameOrder)') as string[]
        },
        printed() {
            return json('return __game:encode(__game.printed)') as string[]
        },
        slash(line) {
            call(`__game:slash(${luaString(line)})`)
        },
        settingsPages() {
            return json(
                'return __game:encode(__game:settingsSnapshot())'
            ) as SettingsPage[]
        },
        changeSetting(page, label, value) {
            call(
                `__game:changeSetting(${luaString(page)}, ${luaString(label)}, ${toLua(value)})`
            )
        },
        runScript(frameId, script, ...args) {
            call(
                `__game:runScript(${luaString(frameId)}, ${luaString(script)}${args.map((a) => `, ${toLua(a)}`).join('')})`
            )
        },
        run(code, ...args) {
            return json(
                `return __game:encodeResults(__game:run(${luaString(code)}${args.map((a) => `, ${toLua(a)}`).join('')}))`
            ) as unknown[]
        },
        global(name) {
            return json(
                `return __game:encode(__game:global(${luaString(name)}))`
            )
        },
        loadedFiles() {
            const prefix = `${addonName}/`
            return (
                json('return __game:encode(__game.loadedFiles)') as string[]
            ).map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f))
        },
        close() {
            vm.close()
        },
    }
    return game
}

/**
 * Loads the real Turbo addon (`Turbo/Turbo_Camelot.toc`) under the fake game.
 *
 * @param options - how the game starts
 */
export function loadTurbo(
    options: Omit<LoadOptions, 'addonDir' | 'toc'> = {}
): FakeGame {
    return loadAddon({
        addonDir: TURBO_DIR,
        toc: TURBO_TOC,
        addonName: 'Turbo',
        ...options,
    })
}
