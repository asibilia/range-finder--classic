/**
 * The dev loop: one command links the shipped `Turbo` folder into the beta
 * client's AddOns folder, and a copy-on-save watcher stands in when WoW on
 * macOS doesn't follow the link.
 *
 * Both run from the repo root as `bun run dev:link` and `bun run dev:watch`.
 * `WOW_ADDONS_DIR` points them at an AddOns folder other than the beta
 * client's, as these tests do with a temporary one.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TURBO_DIR, TURBO_TOC, readToc } from './fake-game/fake-game'

const REPO_ROOT = join(import.meta.dir, '../../..')

let scratch: string | undefined
let watcher: ReturnType<typeof Bun.spawn> | undefined

afterEach(async () => {
    if (watcher) {
        watcher.kill()
        await watcher.exited
        watcher = undefined
    }
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
})

/** A fresh, empty AddOns folder in a temporary directory. */
function addonsFolder(): string {
    scratch = mkdtempSync(join(tmpdir(), 'turbo-dev-link-'))
    const addons = join(scratch, 'AddOns')
    mkdirSync(addons)
    return addons
}

function run(script: string, addonsDir: string) {
    const result = Bun.spawnSync(['bun', 'run', script], {
        cwd: REPO_ROOT,
        env: { ...process.env, WOW_ADDONS_DIR: addonsDir },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    return {
        exitCode: result.exitCode,
        output: `${result.stdout.toString()}${result.stderr.toString()}`,
    }
}

/** Every file under a folder, as sorted relative paths. */
function filesUnder(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => statSync(join(dir, f)).isFile())
        .sort()
}

describe('bun run dev:link', () => {
    test('links the shipped Turbo folder into the AddOns folder', () => {
        const addons = addonsFolder()

        const { exitCode, output } = run('dev:link', addons)

        expect(exitCode, output).toBe(0)
        const linked = join(addons, 'Turbo')
        expect(lstatSync(linked).isSymbolicLink()).toBe(true)
        expect(realpathSync(linked)).toBe(realpathSync(TURBO_DIR))
    })

    test('gives the beta client a loadable dev build: the Forever TOC at the top of AddOns/Turbo, and every file it lists', () => {
        const addons = addonsFolder()

        const { exitCode, output } = run('dev:link', addons)

        expect(exitCode, output).toBe(0)
        const installed = join(addons, 'Turbo')
        const toc = readFileSync(join(installed, TURBO_TOC), 'utf8')
        expect(toc).toMatch(/^## Interface:\s*16001\s*$/m)
        const listed = readToc(join(installed, TURBO_TOC)).files
        expect(listed.length).toBeGreaterThan(0)
        for (const file of listed) {
            expect(existsSync(join(installed, file))).toBe(true)
        }
    })

    test('running it again keeps one working link', () => {
        const addons = addonsFolder()

        expect(run('dev:link', addons).exitCode).toBe(0)
        const again = run('dev:link', addons)

        expect(again.exitCode, again.output).toBe(0)
        expect(readdirSync(addons)).toEqual(['Turbo'])
        expect(realpathSync(join(addons, 'Turbo'))).toBe(
            realpathSync(TURBO_DIR)
        )
    })

    test("fails and names the folder when the AddOns folder doesn't exist", () => {
        addonsFolder()
        const missing = join(scratch!, 'NoClient', 'AddOns')

        const { exitCode, output } = run('dev:link', missing)

        expect(exitCode).not.toBe(0)
        expect(output).toContain(missing)
        expect(existsSync(missing)).toBe(false)
    })
})

describe('bun run dev:watch', () => {
    test('replaces the link with a real copy of the Turbo folder', async () => {
        const addons = addonsFolder()
        expect(run('dev:link', addons).exitCode).toBe(0)
        const installed = join(addons, 'Turbo')

        watcher = Bun.spawn(['bun', 'run', 'dev:watch'], {
            cwd: REPO_ROOT,
            env: { ...process.env, WOW_ADDONS_DIR: addons },
            stdout: 'pipe',
            stderr: 'pipe',
        })

        const expected = filesUnder(TURBO_DIR)
        const copied = () =>
            existsSync(installed) &&
            !lstatSync(installed).isSymbolicLink() &&
            filesUnder(installed).join('\n') === expected.join('\n')
        const deadline = Date.now() + 15_000
        while (!copied() && Date.now() < deadline) {
            await Bun.sleep(100)
        }

        expect(copied()).toBe(true)
        for (const file of expected) {
            expect(readFileSync(join(installed, file), 'utf8')).toBe(
                readFileSync(join(TURBO_DIR, file), 'utf8')
            )
        }
    }, 30_000)
})
