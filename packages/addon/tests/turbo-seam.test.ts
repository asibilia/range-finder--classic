/**
 * The seam between Turbo and the game: the real addon's Lua loads under the
 * fake game, and the fake keeps the same contract as the real safe layer.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createLuaVm } from '../scripts/lua-vm'
import {
    SAFE_LAYER_FILE,
    TURBO_DIR,
    TURBO_TOC,
    loadTurbo,
    readToc,
    type FakeGame,
} from './fake-game/fake-game'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

/** The function names on a safe-layer table, sorted. */
const CONTRACT_NAMES_LUA = `
    local names = {}
    for name, value in pairs(ns.safe) do
        if type(value) == "function" then table.insert(names, name) end
    end
    table.sort(names)
    return names
`

describe('the real addon under the fake game', () => {
    test("loads every file in Turbo's TOC except the safe layer, touching no game global", () => {
        const toc = readToc(join(TURBO_DIR, TURBO_TOC))
        expect(toc.files).toContain(SAFE_LAYER_FILE)

        game = loadTurbo()
        const expected = toc.files.filter((f) => f !== SAFE_LAYER_FILE)
        expect(expected.length).toBeGreaterThan(0)
        expect(game.loadedFiles()).toEqual(expected)
    })

    test('the safe layer loads first, so every other file finds it', () => {
        const toc = readToc(join(TURBO_DIR, TURBO_TOC))
        expect(toc.files[0]).toBe(SAFE_LAYER_FILE)
    })
})

describe('the shipped folder', () => {
    test('holds only addon files: dev-only files stay outside Turbo/', () => {
        const files = readdirSync(TURBO_DIR, {
            recursive: true,
            encoding: 'utf8',
        }).filter((f) => f.includes('.'))
        expect(files.length).toBeGreaterThan(0)
        expect(
            files.filter((f) => !/\.(toc|lua|xml|tga|blp|ogg|ttf)$/.test(f))
        ).toEqual([])
    })
})

describe('the safe-layer contract', () => {
    test('the fake game offers exactly the functions the real safe layer does', () => {
        // Load the real safe layer against a bare stand-in for the game API,
        // just far enough to see which functions it exposes.
        const vm = createLuaVm()
        vm.setString(
            '__src',
            readFileSync(join(TURBO_DIR, SAFE_LAYER_FILE), 'utf8')
        )
        const realNames = JSON.parse(
            vm.run(`
                local frame = setmetatable({}, { __index = function() return function() end end })
                local env = setmetatable({
                    CreateFrame = function() return frame end,
                    GetTime = function() return 0 end,
                    C_Timer = { After = function() end, NewTicker = function() end },
                    issecretvalue = function() return false end,
                    print = function() end,
                }, { __index = _G })
                local chunk = assert(loadstring(__src, "@Turbo/core/safe-layer.lua"))
                setfenv(chunk, env)
                local ns = {}
                chunk("Turbo", ns)
                local names = {}
                for name, value in pairs(ns.safe) do
                    if type(value) == "function" then table.insert(names, '"' .. name .. '"') end
                end
                table.sort(names)
                return "[" .. table.concat(names, ",") .. "]"
            `) ?? '[]'
        ) as string[]
        vm.close()

        game = loadTurbo()
        const fakeNames = game.run(CONTRACT_NAMES_LUA)[0]
        expect(realNames.length).toBeGreaterThan(0)
        expect(fakeNames).toEqual(realNames)
    })
})
