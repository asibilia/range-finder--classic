/**
 * The leak guard (`scanForLeaks` in `src/leak-scan.ts`): technical details
 * of the owner's computer and other players' GUIDs must never get into the
 * repo; the owner's own character data may. This file plants leaks in a
 * temporary folder, so it is the one test file the guard skips by name:
 * keep strings like these out of every other file under `packages/sim`.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { hostname, tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

import { scanForLeaks } from '../src/leak-scan'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const LEAK_SCAN = join(PACKAGE_DIR, 'src/leak-scan.ts')
const OWNER = { name: 'Truncha', guid: 'Player-1-0000000A' }
const KINDS = [
    'home path',
    'game folder',
    'temporary folder',
    'Config.wtf',
    'machine name',
    'machine word',
    'other player',
    'named unit',
]
/** Names the guard skips: CI's user name and other everyday words. */
const COMMON_NAMES = ['runner', 'root', 'user', 'admin', 'ubuntu', 'localhost']

const made: string[] = []

/** A fresh temporary folder holding `files` (relative name to contents). */
function plant(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'leak-guard-'))
    made.push(root)
    for (const [name, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, name)), { recursive: true })
        writeFileSync(join(root, name), text)
    }
    return root
}

/** A machine-words file that does not exist. */
function noWordsFile(): string {
    return join(plant({}), 'absent.machine-words')
}

/** This computer's user or host name, if the guard would look for one. */
function machineName(): string | undefined {
    return [userInfo().username, hostname()].find(
        (name) => name.length >= 4 && !COMMON_NAMES.includes(name.toLowerCase())
    )
}

/** Runs `body` (code using `scanForLeaks`) in a new Bun; returns its output. */
function runScan(body: string): string {
    const code = `import { scanForLeaks } from ${JSON.stringify(LEAK_SCAN)}\n${body}`
    const result = Bun.spawnSync([process.execPath, '-e', code], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    return result.stdout.toString() + result.stderr.toString()
}

afterAll(() => {
    for (const root of made) rmSync(root, { recursive: true, force: true })
})

describe('the repo', () => {
    test('has no leaks, the fixtures included', () => {
        const roots = [
            PACKAGE_DIR,
            join(PACKAGE_DIR, 'build'),
            join(REPO_ROOT, 'packages/armory/src/browser-sim'),
        ].filter((root) => existsSync(root))
        expect(existsSync(join(PACKAGE_DIR, 'fixtures'))).toBe(true)
        expect(scanForLeaks(roots)).toEqual([])
    }, 120_000)

    test('scans the ported runner in packages/armory/src/browser-sim/ and finds nothing', () => {
        const browserSim = join(REPO_ROOT, 'packages/armory/src/browser-sim')
        expect(existsSync(browserSim)).toBe(true)
        expect(readdirSync(browserSim).length).toBeGreaterThan(0)
        expect(scanForLeaks([browserSim])).toEqual([])
    }, 120_000)

    test("finds nothing in the owner's buffed export fixture or the armory's export writer helper", () => {
        const fixture = join(PACKAGE_DIR, 'fixtures/truncha-export-buffed.lua')
        const helpers = join(REPO_ROOT, 'packages/armory/tests/helpers')
        expect(existsSync(fixture)).toBe(true)
        const writer = join(helpers, 'export-from-character.ts')
        expect(existsSync(writer)).toBe(true)
        expect(scanForLeaks([join(PACKAGE_DIR, 'fixtures'), helpers])).toEqual(
            []
        )
    }, 120_000)
})

describe('scanForLeaks on planted files', () => {
    test('finds one leak of each kind, naming the file and the kind only', () => {
        const name = machineName()
        expect(name).toBeDefined()
        const wordsRoot = plant({ words: 'zorblaxian\n' })
        const planted: Record<string, [string, string]> = {
            'home.txt': ['home path', 'log: /Users/someperson/notes.txt'],
            'install.txt': [
                'game folder',
                'D:/Games/World of Warcraft/_classic_/Wow.exe',
            ],
            'saved.txt': [
                'game folder',
                'WTF/Account/SOMEACCOUNT/SavedVariables/x.lua',
            ],
            'temp.txt': [
                'temporary folder',
                'written to /var/folders/ab/cd1234/T/run',
            ],
            'config.txt': ['Config.wtf', 'SET gxWindow "1"\n'],
            'Config.wtf.bak': ['Config.wtf', 'nothing here\n'],
            'machine-name.txt': ['machine name', `built on ${name} today`],
            'machine-word.txt': ['machine word', 'the zorblaxian account'],
            'other-player.txt': ['other player', 'guid Player-1-0000000B'],
            'named-unit.lua': ['named unit', '["name:Cat"] = {'],
        }
        const root = plant(
            Object.fromEntries(
                Object.entries(planted).map(([file, [, text]]) => [file, text])
            )
        )
        const found = scanForLeaks([root], {
            owner: OWNER,
            machineWordsFile: join(wordsRoot, 'words'),
        })

        for (const [file, [kind]] of Object.entries(planted)) {
            const hits = found.filter((r) => r.file.endsWith(file))
            expect(hits.map((r) => r.kind)).toContain(kind)
        }
        expect([...new Set(found.map((r) => r.kind))].sort()).toEqual(
            [...KINDS].sort()
        )
        for (const result of found) {
            expect(Object.keys(result).sort()).toEqual(['file', 'kind'])
            expect(KINDS).toContain(result.kind)
        }
    })

    test("finds nothing in the owner's own character data", () => {
        const root = plant({
            'character.lua': [
                'name = "Truncha"',
                'guid = "Player-1-0000000A"',
                'realm = "Some Realm"',
                'character_key = "3f2a9c1e-0000-4000-8000-000000000001"',
                'target = "Creature-0-1-2-3-4-5678-0000000001"',
            ].join('\n'),
        })
        expect(
            scanForLeaks([root], {
                owner: OWNER,
                machineWordsFile: noWordsFile(),
            })
        ).toEqual([])
    })

    test('skips node_modules', () => {
        const root = plant({
            'node_modules/x/index.js': "const home = '/Users/someperson/x'\n",
        })
        expect(
            scanForLeaks([root], {
                owner: OWNER,
                machineWordsFile: noWordsFile(),
            })
        ).toEqual([])
    })

    test("skips the guard's own files: leak-scan.ts, its test and .machine-words", () => {
        const home = "const home = '/Users/someperson/x'\n"
        const root = plant({
            'src/leak-scan.ts': home,
            'tests/leak-guard.test.ts': home,
            '.machine-words': '/Users/someperson\n',
        })
        expect(
            scanForLeaks([root], {
                owner: OWNER,
                machineWordsFile: noWordsFile(),
            })
        ).toEqual([])
    })

    test('skips the common machine name runner, matching others as whole words, ignoring case', () => {
        const root = plant({
            'ci.txt': 'the runner ran on RUNNER',
            'host.txt': 'built on ZebedeeHost',
            'part.txt': 'notzebedeehostatall',
        })
        const found = scanForLeaks([root], {
            owner: OWNER,
            machineWordsFile: noWordsFile(),
            machineNames: ['runner', 'zebedeehost'],
        })
        expect(found.map((r) => [r.file.split(/[\\/]/).pop(), r.kind])).toEqual(
            [['host.txt', 'machine name']]
        )
    })
})

describe('what the guard says', () => {
    test('without a machine-words file it says it skipped the word check and still runs the rest', () => {
        const root = plant({ 'home.txt': 'log: /Users/someperson/notes.txt' })
        const output = runScan(
            `const found = scanForLeaks([${JSON.stringify(root)}], { owner: ${JSON.stringify(OWNER)}, machineWordsFile: ${JSON.stringify(noWordsFile())} })\n` +
                `console.log('RESULT ' + JSON.stringify(found.map((r) => r.kind)))`
        )
        expect(output).toContain(
            'No packages/sim/.machine-words: skipped the machine-word check.'
        )
        expect(output).toContain('RESULT ["home path"]')
    })

    test('with no owner and no owner.json it skips the other player check and says so', () => {
        const root = plant({ 'other.txt': 'guid Player-1-0000000B' })
        const noOwnerFile = join(root, 'no-owner.json')
        const output = runScan(
            `const found = scanForLeaks([${JSON.stringify(root)}], { machineWordsFile: ${JSON.stringify(noWordsFile())}, ownerFile: ${JSON.stringify(noOwnerFile)} })\n` +
                `console.log('RESULT ' + JSON.stringify(found))`
        )
        expect(output).toContain('RESULT []')
        expect(output).toMatch(/other player/i)
        expect(output).toMatch(/skip/i)
    })
})
