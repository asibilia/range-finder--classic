/**
 * The packaged-zip check: CI runs it on the zip the BigWigs packager builds,
 * and it fails if anything outside the addon folder got in, so a monorepo
 * accident never ships dev files.
 *
 * `checkPackage({ zip, addonDir })` returns the problems it found, each naming
 * the offending entry; `bun packages/addon/scripts/check-package.ts <zip>`
 * checks against the shipped `Turbo` folder and exits non-zero on any problem.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { checkPackage } from '../../scripts/check-package'
import { TURBO_DIR, TURBO_TOC } from '../fake-game/fake-game'

const SCRIPT = join(import.meta.dir, '../../scripts/check-package.ts')

let scratch: string | undefined

afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
})

function scratchDir(): string {
    scratch ??= mkdtempSync(join(tmpdir(), 'turbo-check-package-'))
    return scratch
}

/** Writes a valid zip (stored, uncompressed) holding the given entries. */
function writeZip(path: string, entries: Record<string, string>): string {
    const locals: Uint8Array[] = []
    const centrals: Uint8Array[] = []
    let offset = 0
    for (const [name, content] of Object.entries(entries)) {
        const nameBytes = new TextEncoder().encode(name)
        const data = new TextEncoder().encode(content)
        const crc = Bun.hash.crc32(data) >>> 0

        const local = new DataView(new ArrayBuffer(30))
        local.setUint32(0, 0x04034b50, true)
        local.setUint16(4, 20, true)
        local.setUint32(14, crc, true)
        local.setUint32(18, data.length, true)
        local.setUint32(22, data.length, true)
        local.setUint16(26, nameBytes.length, true)
        locals.push(new Uint8Array(local.buffer), nameBytes, data)

        const central = new DataView(new ArrayBuffer(46))
        central.setUint32(0, 0x02014b50, true)
        central.setUint16(4, 20, true)
        central.setUint16(6, 20, true)
        central.setUint32(16, crc, true)
        central.setUint32(20, data.length, true)
        central.setUint32(24, data.length, true)
        central.setUint16(28, nameBytes.length, true)
        central.setUint32(42, offset, true)
        centrals.push(new Uint8Array(central.buffer), nameBytes)

        offset += 30 + nameBytes.length + data.length
    }
    const centralSize = centrals.reduce((n, b) => n + b.length, 0)
    const count = Object.keys(entries).length
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, count, true)
    end.setUint16(10, count, true)
    end.setUint32(12, centralSize, true)
    end.setUint32(16, offset, true)

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
        path,
        Buffer.concat([...locals, ...centrals, new Uint8Array(end.buffer)])
    )
    return path
}

/** A small addon folder named Turbo, with a TOC and a Lua file. */
function addonFixture(): string {
    const addonDir = join(scratchDir(), 'src', 'Turbo')
    mkdirSync(join(addonDir, 'core'), { recursive: true })
    writeFileSync(join(addonDir, 'Turbo_Camelot.toc'), '## Interface: 16001\n')
    writeFileSync(join(addonDir, 'core', 'boot.lua'), 'local _ = 1\n')
    return addonDir
}

/** The zip the packager should build from that fixture. */
function cleanEntries(): Record<string, string> {
    return {
        'Turbo/': '',
        'Turbo/Turbo_Camelot.toc': '## Interface: 16001\n',
        'Turbo/core/': '',
        'Turbo/core/boot.lua': 'local _ = 1\n',
    }
}

/** Every file of the real shipped Turbo folder, as zip entries. */
function realTurboEntries(): Record<string, string> {
    return Object.fromEntries(
        readdirSync(TURBO_DIR, { recursive: true, encoding: 'utf8' })
            .filter((f) => statSync(join(TURBO_DIR, f)).isFile())
            .map((f) => [`Turbo/${f.split('\\').join('/')}`, 'x'])
    )
}

function runCli(zip: string) {
    const result = Bun.spawnSync(['bun', SCRIPT, zip], {
        stdout: 'pipe',
        stderr: 'pipe',
    })
    return {
        exitCode: result.exitCode,
        output: `${result.stdout.toString()}${result.stderr.toString()}`,
    }
}

describe('checkPackage', () => {
    test('passes a zip that holds only the addon folder', () => {
        const addonDir = addonFixture()
        const zip = writeZip(
            join(scratchDir(), 'Turbo-v0.1.0-beta.0.zip'),
            cleanEntries()
        )

        expect(checkPackage({ zip, addonDir })).toEqual([])
    })

    test('fails a zip with files beside the addon folder, naming each one', () => {
        const addonDir = addonFixture()
        const zip = writeZip(join(scratchDir(), 'Turbo.zip'), {
            ...cleanEntries(),
            'packages/web/package.json': '{}',
            'README.md': '# Turbo',
        })

        const problems: string[] = checkPackage({ zip, addonDir })

        expect(problems.length).toBeGreaterThanOrEqual(2)
        expect(
            problems.some((p) => p.includes('packages/web/package.json'))
        ).toBe(true)
        expect(problems.some((p) => p.includes('README.md'))).toBe(true)
        expect(problems.some((p) => p.includes('boot.lua'))).toBe(false)
    })

    test('fails dev-only files packaged inside the Turbo folder, since they come from outside the addon folder', () => {
        const addonDir = addonFixture()
        const zip = writeZip(join(scratchDir(), 'Turbo.zip'), {
            ...cleanEntries(),
            'Turbo/packages/addon/tests/turbo-core.test.ts': 'test',
            'Turbo/packages/web/src/site.ts': 'export {}',
        })

        const problems: string[] = checkPackage({ zip, addonDir })

        expect(
            problems.some((p) =>
                p.includes('Turbo/packages/addon/tests/turbo-core.test.ts')
            )
        ).toBe(true)
        expect(
            problems.some((p) => p.includes('Turbo/packages/web/src/site.ts'))
        ).toBe(true)
    })

    test("fails a zip without the addon's TOC, so an empty package never passes", () => {
        const addonDir = addonFixture()
        const zip = writeZip(join(scratchDir(), 'Turbo.zip'), {
            'Turbo/': '',
            'Turbo/core/boot.lua': 'local _ = 1\n',
        })

        const problems: string[] = checkPackage({ zip, addonDir })

        expect(problems.some((p) => p.includes('Turbo_Camelot.toc'))).toBe(true)
    })
})

describe('bun packages/addon/scripts/check-package.ts', () => {
    test('exits 0 for a zip of the shipped Turbo folder', () => {
        const zip = writeZip(
            join(scratchDir(), 'Turbo.zip'),
            realTurboEntries()
        )

        const { exitCode, output } = runCli(zip)

        expect(Object.keys(realTurboEntries())).toContain(`Turbo/${TURBO_TOC}`)
        expect(exitCode, output).toBe(0)
    })

    test('exits non-zero and names what leaked in', () => {
        const zip = writeZip(join(scratchDir(), 'Turbo.zip'), {
            ...realTurboEntries(),
            'packages/web/package.json': '{}',
        })

        const { exitCode, output } = runCli(zip)

        expect(exitCode).not.toBe(0)
        expect(output).toContain('packages/web/package.json')
    })
})
