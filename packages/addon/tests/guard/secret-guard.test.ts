/**
 * The secret-read guard: fails any secret-returning game call made outside
 * the safe layer, using Forever's own API documentation to know which calls
 * return secrets.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { TOOL_PATHS } from '../../scripts/fetch-tools'
import {
    loadSecretApis,
    runGuard,
    scanSource,
    type SecretApi,
} from '../../scripts/secret-guard'
import { TURBO_DIR } from '../fake-game/fake-game'

const FIXTURES = join(import.meta.dir, '../fixtures/guard')
const FIXTURE_DOCS = join(FIXTURES, 'api-docs')
const VIOLATING_ADDON = join(FIXTURES, 'violating-addon')

describe('reading the API documentation', () => {
    test('finds every function flagged as returning secrets, and only those', () => {
        const apis = loadSecretApis(FIXTURE_DOCS)
        const names = apis.map((a) => a.display).sort()
        expect(names).toEqual([
            ':GetValue',
            'C_Spell.GetSpellCooldown',
            'UnitHealth',
            'UnitPowerType',
        ])
        expect(apis.find((a) => a.display === 'UnitHealth')?.flags).toEqual([
            'SecretReturns',
        ])
        expect(apis.find((a) => a.display === 'UnitPowerType')?.flags).toEqual([
            'SecretValue return',
        ])
    })
})

describe('scanning Lua source', () => {
    const apis: SecretApi[] = loadSecretApis(FIXTURE_DOCS)
    const scan = (source: string) =>
        scanSource(source, apis, 'module.lua').map((f) => `${f.line}:${f.api}`)

    test('flags direct, namespaced and method calls', () => {
        expect(
            scan(
                [
                    'local h = UnitHealth("player")',
                    'local c = C_Spell.GetSpellCooldown(8042)',
                    'local v = bar:GetValue()',
                ].join('\n')
            )
        ).toEqual(['1:UnitHealth', '2:C_Spell.GetSpellCooldown', '3::GetValue'])
    })

    test('flags a reference without a call, since it can be called later', () => {
        expect(scan('local read = UnitHealth')).toEqual(['1:UnitHealth'])
    })

    test('flags indirect global access, which could reach any of them', () => {
        expect(
            scan('local f = _G["UnitHealth"]\nlocal g = getglobal("x")')
        ).toEqual(['1:_G', '2:getglobal'])
    })

    test('ignores comments, strings, other fields and look-alike names', () => {
        expect(
            scan(
                [
                    '-- UnitHealth("player")',
                    '--[[ C_Spell.GetSpellCooldown ]]',
                    'local s = "UnitHealth" .. [[UnitHealth]] .. \'UnitHealth\'',
                    'local t = { UnitHealthMax = 1 }',
                    'local n = ns.UnitHealth',
                    'local x = C_Spell.GetSpellName(1)',
                    'local y = bar:SetValue(1)',
                    'local z = C_Other.GetSpellCooldown(1)',
                ].join('\n')
            )
        ).toEqual([])
    })

    test('keeps line numbers right across multi-line comments and strings', () => {
        expect(
            scan(
                '--[[\none\ntwo\n]]\nlocal s = [[\n\n]]\nlocal h = UnitHealth("player")'
            )
        ).toEqual(['8:UnitHealth'])
    })
})

describe('the guard over an addon folder', () => {
    test('passes the safe layer and fails the deliberately violating module', () => {
        const findings = runGuard({
            addonDir: VIOLATING_ADDON,
            docsDir: FIXTURE_DOCS,
        })
        expect(findings.map((f) => `${f.file}:${f.line}:${f.api}`)).toEqual([
            'modules/bad-module.lua:10:UnitHealth',
            'modules/bad-module.lua:11:C_Spell.GetSpellCooldown',
            'modules/bad-module.lua:12::GetValue',
            'modules/bad-module.lua:13:_G',
        ])
    })

    // These two read Forever's real docs, which `bun run tools:fetch` downloads
    // (the repo's prepare step). Without them they fail, naming that command.
    test("Forever's real docs flag the violating fixture too", () => {
        const findings = runGuard({
            addonDir: VIOLATING_ADDON,
            docsDir: TOOL_PATHS.foreverApiDocs,
        })
        expect(findings.map((f) => f.api)).toEqual(
            expect.arrayContaining(['UnitHealth', '_G'])
        )
    })

    test("Turbo's own addon folder is clean", () => {
        expect(
            runGuard({
                addonDir: TURBO_DIR,
                docsDir: TOOL_PATHS.foreverApiDocs,
            })
        ).toEqual([])
    })

    test('fails loudly when the docs are missing', () => {
        expect(() =>
            runGuard({ addonDir: VIOLATING_ADDON, docsDir: '/nonexistent' })
        ).toThrow(/bun run tools:fetch/)
    })
})
