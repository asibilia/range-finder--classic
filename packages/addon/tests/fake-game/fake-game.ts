/**
 * The TypeScript side of the fake game: loads an addon's real Lua files into
 * a Lua 5.1 VM (WebAssembly) with `fake-game.lua` standing in for the safe
 * layer, and gives tests a scenario-style API over it.
 *
 * @example
 * ```typescript
 * const game = loadTurbo()
 * game.setReading('inCombat', false)
 * game.fire('PLAYER_LOGIN')
 * game.slash('/turbo macros')
 * expect(game.printed()).toContain('Turbo made 0 macros and swapped 0 buttons.')
 * game.close()
 * ```
 *
 * Values cross the boundary as Lua literals going in and JSON coming out. In
 * results, a secret stand-in reads as `{ $secret: label }` and a function as
 * `{ $function: true }`.
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

export type Read = { name: string; args: unknown[] }

export type LoadOptions = {
    /** The addon folder, holding the TOC. */
    addonDir: string
    /** The TOC file name inside `addonDir`. */
    toc: string
    /** The name WoW passes as the first vararg; defaults to the folder's. */
    addonName?: string
}

/**
 * What an action slot or the cursor holds. A test names a macro by its name
 * (the first with that name, account list first, unless `perCharacter` says
 * which list); read back, a macro always says which list it's in.
 */
export type Action =
    | { type: 'spell' | 'item'; id: number }
    | { type: 'macro'; name: string; perCharacter?: boolean }

/** A macro in the player's account or character list. */
export type Macro = {
    /** The game's index: 1–120 for account macros, 121–150 per character. */
    index: number
    name: string
    icon: unknown
    body: string
    perCharacter: boolean
}

export type FakeGame = {
    /** A secret stand-in; the same label always gives the same one. */
    secret(label: string, kind?: string): Secret
    /** Fires a game event at every subscribed handler. */
    fire(event: string, ...payload: unknown[]): void
    /** Scripts a reading's return values. */
    setReading(name: string, ...values: unknown[]): void
    /** Scripts a reading's return values for exact arguments. */
    setReadingFor(name: string, args: unknown[], ...values: unknown[]): void
    /** Scripts one read after another; a read past the end fails. */
    scriptReadings(name: string, sequence: unknown[][]): void
    /** Every read the addon made, in order. */
    reads(): Read[]
    /** Chat lines the addon printed. */
    printed(): string[]
    /** Types a slash command (`/turbo help`) into chat. */
    slash(line: string): void
    /**
     * Adds a macro to the player's account or character list, as if they
     * made it. Each list stays in name order; a full list fails.
     */
    addMacro(macro: {
        name: string
        body: string
        icon?: number
        perCharacter: boolean
    }): void
    /** Both macro lists, account first, each in name order. */
    macros(): Macro[]
    /** Puts an action in a slot (1–180), or empties it with null. */
    setAction(slot: number, action: Action | null): void
    /** What every non-empty action slot holds, by slot. */
    actions(): Record<number, Action>
    /** Puts something on the cursor, or clears it with null. */
    setCursor(action: Action | null): void
    /** What the cursor holds, or null. */
    cursor(): Action | null
    /**
     * Runs Lua inside the addon's sandbox and returns its results. `...` holds
     * `args`; `ns` reads the addon's namespace. Errors are named `test:<line>`.
     */
    run(code: string, ...args: unknown[]): unknown[]
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

type Toc = { files: string[] }

/** Reads a TOC: its file list, in order. */
export function readToc(tocPath: string): Toc {
    const files: string[] = []
    for (const raw of readFileSync(tocPath, 'utf8').split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        files.push(line.replace(/\\/g, '/'))
    }
    return { files }
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

    const vm = createLuaVm()
    vm.setString('__fake_src', FAKE_GAME_SOURCE)
    vm.run(`
        __FakeGame = assert(loadstring(__fake_src, "@fake-game.lua"))()
        __fake_src = nil
        __secrets = {}
    `)
    vm.run(`__game = __FakeGame.new({ addonName = ${luaString(addonName)} })`)

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
        printed() {
            return json('return __game:encode(__game.printed)') as string[]
        },
        slash(line) {
            call(`__game:slash(${luaString(line)})`)
        },
        addMacro(macro) {
            call(`__game:addMacro(${toLua(macro)})`)
        },
        macros() {
            return json(
                'return __game:encode(__game:macroSnapshot())'
            ) as Macro[]
        },
        setAction(slot, action) {
            call(`__game:setAction(${toLua(slot)}, ${toLua(action)})`)
        },
        actions() {
            const list = json(
                'return __game:encode(__game:actionSnapshot())'
            ) as { slot: number; action: Action }[]
            return Object.fromEntries(list.map((e) => [e.slot, e.action]))
        },
        setCursor(action) {
            call(`__game:setCursor(${toLua(action)})`)
        },
        cursor() {
            return json(
                'return __game:encode(__game:cursorSnapshot())'
            ) as Action | null
        },
        run(code, ...args) {
            return json(
                `return __game:encodeResults(__game:run(${luaString(code)}${args.map((a) => `, ${toLua(a)}`).join('')}))`
            ) as unknown[]
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
