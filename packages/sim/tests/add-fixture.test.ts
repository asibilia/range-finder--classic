/**
 * `bun run sim:add-fixture <export> <fixture name> [--out <dir>]` copies an
 * export's contents into the fixtures folder (`--out`, for tests), with
 * other players' names and GUIDs replaced, and writes `owner.json`.
 *
 * The leak guard scans this file, so GUIDs are built from parts here: only
 * `leak-guard.test.ts` may hold them whole.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const SCRIPT = join(PACKAGE_DIR, 'scripts/add-fixture.ts')

/** A player GUID on realm 1 ending in `last`. */
const guid = (last: string) => ['Player', '1', `0000000${last}`].join('-')
const OWNER_GUID = guid('A')
const OTHER_GUID = guid('B')
const PLACEHOLDER_GUID = ['Player', '0', '00000001'].join('-')

const made: string[] = []

function tempDir(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), name))
    made.push(dir)
    return dir
}

function run(args: string[]) {
    const result = Bun.spawnSync(args, {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    return {
        exitCode: result.exitCode,
        output: result.stdout.toString() + result.stderr.toString(),
    }
}

/** A test export: Truncha, with Somebody in the party and on a buff. */
function testExport(): string {
    return [
        'TurboCharExportDB = {',
        '\t["format"] = 1,',
        '\t["identity"] = {',
        '\t\t["name"] = "Truncha",',
        '\t\t["realm"] = "Some Realm",',
        `\t\t["guid"] = "${OWNER_GUID}",`,
        '\t\t["character_key"] = "00000000-0000-0000-0000-000000000000",',
        '\t},',
        '\t["party"] = {',
        `\t\t{ ["name"] = "Somebody", ["guid"] = "${OTHER_GUID}" },`,
        '\t},',
        '\t["buffs"] = {',
        `\t\t{ ["name"] = "Battle Shout", ["caster"] = "Somebody", ["caster_guid"] = "${OTHER_GUID}" },`,
        '\t},',
        '}',
        '',
    ].join('\n')
}

/** Writes the test export in a folder named after a private handoff. */
function handoff(): { source: string; folder: string } {
    const folder = join(tempDir('add-fixture-'), 'private-handoff-zq7')
    mkdirSync(folder)
    const source = join(folder, 'TurboCharExport.lua')
    writeFileSync(source, testExport())
    return { source, folder }
}

afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('sim:add-fixture', () => {
    test('refuses a fixture name not shaped truncha-*.lua', () => {
        const { source } = handoff()
        const { exitCode, output } = run([
            process.execPath,
            'run',
            'sim:add-fixture',
            source,
            'export.lua',
        ])
        expect(exitCode).toBe(1)
        expect(output).toContain(
            'Fixture names must start with truncha- and end with .lua.'
        )
        expect(existsSync(join(PACKAGE_DIR, 'fixtures/export.lua'))).toBe(false)
    })

    test("replaces other players' names and GUIDs and writes owner.json", () => {
        const { source } = handoff()
        const out = tempDir('add-fixture-out-')
        const { exitCode, output } = run([
            process.execPath,
            SCRIPT,
            source,
            'truncha-test.lua',
            '--out',
            out,
        ])
        if (exitCode !== 0) console.error(output)
        expect(exitCode).toBe(0)

        const written = readFileSync(join(out, 'truncha-test.lua'), 'utf8')
        expect(written).not.toContain('Somebody')
        expect(written).not.toContain(OTHER_GUID)
        expect(written).toContain('"Player1"')
        expect(written).toContain(PLACEHOLDER_GUID)
        expect(written).toContain('"Truncha"')
        expect(written).toContain(OWNER_GUID)

        const owner = JSON.parse(readFileSync(join(out, 'owner.json'), 'utf8'))
        expect(owner).toEqual({ name: 'Truncha', guid: OWNER_GUID })
    })

    test('writes nothing that holds the source path', () => {
        const { source, folder } = handoff()
        const out = tempDir('add-fixture-out-')
        const { exitCode } = run([
            process.execPath,
            SCRIPT,
            source,
            'truncha-test.lua',
            '--out',
            out,
        ])
        expect(exitCode).toBe(0)
        const files = readdirSync(out, { recursive: true, encoding: 'utf8' })
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            expect(file).not.toContain('private-handoff-zq7')
            const text = readFileSync(join(out, file), 'utf8')
            expect(text).not.toContain(source)
            expect(text).not.toContain(folder)
            expect(text).not.toContain('private-handoff-zq7')
        }
    })
})
