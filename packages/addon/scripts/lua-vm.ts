/**
 * A real Lua 5.1.5 VM (compiled to WebAssembly by `lua-wasm-bindings`), with
 * the small bridge the tests and scripts need.
 *
 * The binding only exposes a slice of the C API (no numbers or C functions
 * across the boundary), so everything crosses as strings: TypeScript sets a
 * string global, Lua runs, and Lua returns one string (usually JSON).
 *
 * @example
 * ```typescript
 * const vm = createLuaVm()
 * vm.setString('greeting', 'hello')
 * vm.run('return greeting .. " world"') // 'hello world'
 * vm.close()
 * ```
 */
import { lauxlib, lua, lualib } from 'lua-wasm-bindings/dist/lua.51'

/** The pseudo-index of the globals table in Lua 5.1. */
const LUA_GLOBALSINDEX = -10002

export type LuaVm = {
    /**
     * Runs a chunk and returns its first result as a string (`null` for nil
     * or a non-string, non-number result).
     *
     * @param code - Lua source
     * @param chunkName - how errors name the chunk; prefix `@` for a file path
     * @throws Error with Lua's message and traceback when the chunk fails
     */
    run(code: string, chunkName?: string): string | null
    /** Sets a global to a string value. */
    setString(name: string, value: string): void
    /** Frees the VM. */
    close(): void
}

/**
 * The runner every chunk goes through: compiles `__vm_src` under
 * `__vm_name`, and calls it with a traceback handler, so a failure reports
 * where it happened.
 */
const RUNNER = `
local f, err = loadstring(__vm_src, __vm_name)
__vm_src = nil
if not f then error(err, 0) end
local ok, result = xpcall(f, function(e)
    return debug.traceback(tostring(e), 2)
end)
if not ok then error(result, 0) end
if type(result) == "number" then return tostring(result) end
return result
`

/**
 * Creates a fresh Lua 5.1 state with the standard libraries open.
 *
 * @returns a VM; call `close()` when done
 */
export function createLuaVm(): LuaVm {
    const L = lauxlib.luaL_newstate()
    lualib.luaL_openlibs(L)

    const setString = (name: string, value: string) => {
        lua.lua_pushstring(L, value)
        lua.lua_setfield(L, LUA_GLOBALSINDEX, name)
    }

    return {
        run(code, chunkName = '=(vm)') {
            setString('__vm_src', code)
            setString('__vm_name', chunkName)
            const status = lauxlib.luaL_dostring(L, RUNNER)
            if (status !== 0) {
                const message = lua.lua_tostring(L, -1)
                lua.lua_settop(L, 0)
                throw new Error(message)
            }
            const result = lua.lua_isstring(L, -1)
                ? lua.lua_tostring(L, -1)
                : null
            lua.lua_settop(L, 0)
            return result
        },
        setString,
        close() {
            lua.lua_close(L)
        },
    }
}
