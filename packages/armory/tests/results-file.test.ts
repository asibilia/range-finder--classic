/**
 * The results file contract: the schema the page reads files with
 * (`readResultsFile`), the JSON Schema generated from it, and the two
 * hand-made Truncha samples beside it. Tests read only the reader's outcome
 * and the committed files' contents.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Loaded by a computed path, so the package type-checks before the module exists.
const MODULE_PATH: string = '../src/results-file'
type Outcome = { ok: boolean } & Record<string, unknown>
const { readResultsFile } = (await import(MODULE_PATH)) as {
    readResultsFile: (input: unknown) => Outcome
}

const SRC = join(import.meta.dir, '../src')
const REPO_ROOT = join(import.meta.dir, '../../..')
const SCHEMA_PATH = join(SRC, 'results-file.schema.json')

/** A fresh, mutable copy of a committed sample. */
function sample(name = 'sample-truncha.json'): any {
    return JSON.parse(readFileSync(join(SRC, name), 'utf8'))
}

function problemsOf(input: unknown): string[] {
    const outcome = readResultsFile(input) as any
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('invalid')
    return outcome.problems as string[]
}

/** Every key used anywhere in a JSON value. */
function allKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
    if (Array.isArray(value)) {
        for (const v of value) allKeys(v, into)
    } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            into.add(k)
            allKeys(v, into)
        }
    }
    return into
}

type Breakage = { rule: string; message: string; breakIt: (f: any) => void }

function resultIndex(f: any, gear: string, fight: string): number {
    const at = f.results.findIndex(
        (r: any) => r.gear === gear && r.fight_id === fight
    )
    expect(at).toBeGreaterThanOrEqual(0)
    return at
}

/** Runs each breakage on a fresh sample; returns the ones not refused right. */
function unmet(breakages: Breakage[]): string[] {
    const missing: string[] = []
    for (const { rule, message, breakIt } of breakages) {
        const f = sample()
        breakIt(f)
        const outcome = readResultsFile(f) as any
        const problems: string[] =
            outcome.ok === false && outcome.reason === 'invalid'
                ? outcome.problems
                : []
        if (!problems.some((p) => p.endsWith(message))) {
            missing.push(`${rule}: got ${JSON.stringify(outcome)}`)
        }
    }
    return missing
}

describe('the Truncha sample', () => {
    test('parses with the schema', () => {
        const outcome = readResultsFile(sample()) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        expect(outcome.file.character.name).toBe('Truncha')
        expect(outcome.file.sample).toBe(true)
        expect(outcome.file.provisional).toBe(true)
    })

    test('has 17 slots, 4 fights, 3 plans, 14 results, 18 talents, and a best build with Flurry 5 and Anticipation 0', () => {
        const outcome = readResultsFile(sample()) as any
        expect(outcome.ok).toBe(true)
        const file = outcome.file
        expect(file.slots).toHaveLength(17)
        expect(file.fights).toHaveLength(4)
        expect(file.plans).toHaveLength(3)
        expect(file.results).toHaveLength(14)
        expect(file.talents.yours).toHaveLength(18)
        expect(file.default_fight_id).toBe('dungeon-long')

        const ranks = file.talents.best.ranks as {
            talent_id: number
            rank: number
        }[]
        expect(ranks).toHaveLength(18)
        expect(ranks.find((r) => r.talent_id === 16256)?.rank).toBe(5)
        expect(ranks.find((r) => r.talent_id === 16254)?.rank).toBe(0)
    })
})

describe('the small first-run sample', () => {
    test('parses, has one plan, and has no best build, timeline, pulls or time to die', () => {
        const outcome = readResultsFile(
            sample('sample-truncha-first-run.json')
        ) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        const file = outcome.file
        expect(file.sample).toBe(true)
        expect(file.default_fight_id).toBe('dungeon-long')
        expect(file.plans.map((p: any) => p.plan_id)).toEqual(['max-damage'])
        expect(file.talents.best).toBeNull()
        expect(file.results.length).toBeGreaterThan(0)
        for (const r of file.results) {
            expect(['worn', 'max-damage']).toContain(r.gear)
            expect(r.timeline).toBeNull()
            expect(r.pulls).toBeNull()
            expect(r.time_to_die_s).toBeNull()
        }
    })
})

describe('keys the samples never hold', () => {
    test('no realm, account, guid, path or caps key appears anywhere in either sample', () => {
        for (const name of [
            'sample-truncha.json',
            'sample-truncha-first-run.json',
        ]) {
            const keys = allKeys(sample(name))
            expect(keys.size).toBeGreaterThan(10)
            for (const banned of ['realm', 'account', 'guid', 'path', 'caps'])
                expect(`${name} has ${banned}: ${keys.has(banned)}`).toBe(
                    `${name} has ${banned}: false`
                )
        }
    })
})

describe('strict keys', () => {
    test('a file with schemaVersion in place of schema_version is refused as invalid', () => {
        const f = sample()
        f.schemaVersion = f.schema_version
        delete f.schema_version
        const outcome = readResultsFile(f) as any
        expect(outcome.ok).toBe(false)
        expect(outcome.reason).toBe('invalid')
    })

    test('an extra realm key on character is refused, and so is an extra top-level account key', () => {
        const withRealm = sample()
        withRealm.character.realm = 'Some Realm'
        expect(problemsOf(withRealm).length).toBeGreaterThan(0)

        const withAccount = sample()
        withAccount.account = 'SOMEACCOUNT'
        expect(problemsOf(withAccount).length).toBeGreaterThan(0)
    })

    test('a character_key of k7f3a9 parses, and a character realm is refused', () => {
        const withKey = sample()
        withKey.character.character_key = 'k7f3a9'
        const outcome = readResultsFile(withKey) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        expect(outcome.file.character.character_key).toBe('k7f3a9')

        const withRealm = sample()
        withRealm.character.character_key = 'k7f3a9'
        withRealm.character.realm = 'Some Realm'
        expect(readResultsFile(withRealm).ok).toBe(false)
    })
})

describe('schema_version', () => {
    test('a copy with schema_version 2 gives reason version with version 2', () => {
        const f = sample()
        f.schema_version = 2
        expect(readResultsFile(f)).toEqual({
            ok: false,
            reason: 'version',
            version: 2,
        })
    })

    test('a copy with schema_version removed gives reason invalid', () => {
        const f = sample()
        delete f.schema_version
        const outcome = readResultsFile(f) as any
        expect(outcome.ok).toBe(false)
        expect(outcome.reason).toBe('invalid')
        expect(outcome.problems.length).toBeGreaterThan(0)
    })
})

describe('problem lines', () => {
    test('an extra top-level account key gives a line starting (file): ', () => {
        const f = sample()
        f.account = 'SOMEACCOUNT'
        const problems = problemsOf(f)
        expect(problems.some((p) => p.startsWith('(file): '))).toBe(true)
    })

    test('a fights.0.duration_s given as the text "30" gives a line starting fights.0.duration_s: ', () => {
        const f = sample()
        f.fights[0].duration_s = '30'
        const problems = problemsOf(f)
        expect(
            problems.some((p) => p.startsWith('fights.0.duration_s: '))
        ).toBe(true)
    })
})

describe('the cross-field rules', () => {
    test('refuse a file whose fight or plan names point at nothing, each with its own message', () => {
        const breakages: Breakage[] = [
            {
                rule: 'default_fight_id',
                message: 'default_fight_id names no fight in this file.',
                breakIt: (f) => {
                    f.default_fight_id = 'nowhere'
                },
            },
            {
                rule: 'results fight_id',
                message: 'This names no fight in this file.',
                breakIt: (f) => {
                    const at = resultIndex(f, 'max-damage', 'dungeon-long')
                    f.results[at].fight_id = 'nowhere'
                },
            },
            {
                rule: 'stat_weights fight_id',
                message: 'This names no fight in this file.',
                breakIt: (f) => {
                    f.stat_weights[0].fight_id = 'nowhere'
                },
            },
            {
                rule: 'talents.best fight_id',
                message: 'This names no fight in this file.',
                breakIt: (f) => {
                    f.talents.best.fight_id = 'nowhere'
                },
            },
            {
                rule: 'results gear',
                message: 'This names no plan in this file.',
                breakIt: (f) => {
                    const at = resultIndex(f, 'max-damage', 'dungeon-long')
                    f.results[at].gear = 'no-such-plan'
                },
            },
            {
                rule: 'plan gear item',
                message:
                    'This item is neither worn in this slot nor one of its alternatives.',
                breakIt: (f) => {
                    f.plans[0].gear.head = 999999
                },
            },
        ]
        expect(unmet(breakages)).toEqual([])
    })

    test('refuse a file whose slots, plans, results or best build repeat or miss entries, each with its own message', () => {
        const breakages: Breakage[] = [
            {
                rule: 'slots exactly once',
                message: 'Each slot must appear exactly once.',
                breakIt: (f) => {
                    f.slots.push(structuredClone(f.slots[0]))
                },
            },
            {
                rule: 'a worn result on every fight',
                message: 'Every fight needs a result for worn gear.',
                breakIt: (f) => {
                    f.results.splice(resultIndex(f, 'worn', 'dungeon-short'), 1)
                },
            },
            {
                rule: 'unique plan_id',
                message: 'Each plan_id must be unique.',
                breakIt: (f) => {
                    f.plans.push(structuredClone(f.plans[0]))
                },
            },
            {
                rule: 'one result per gear and fight',
                message: 'Each gear and fight pair needs at most one result.',
                breakIt: (f) => {
                    f.results.push(
                        structuredClone(
                            f.results[resultIndex(f, 'worn', 'solo-hit-short')]
                        )
                    )
                },
            },
            {
                rule: 'best.ranks lists every talent once',
                message:
                    'best.ranks must list every talent in yours exactly once.',
                breakIt: (f) => {
                    f.talents.best.ranks.pop()
                },
            },
        ]
        expect(unmet(breakages)).toEqual([])
    })

    test('refuse a chain fight without a setup, a timeline on a chain result and pulls on a single result, each with its own message', () => {
        const breakages: Breakage[] = [
            {
                rule: 'chain fight setup',
                message: 'A chain fight needs a setup.',
                breakIt: (f) => {
                    const chain = f.fights.find(
                        (x: any) => x.fight_id === 'chain-4'
                    )
                    delete chain.setup
                },
            },
            {
                rule: 'timeline only on a single fight',
                message: 'Only a single fight has a timeline.',
                breakIt: (f) => {
                    f.results[resultIndex(f, 'worn', 'chain-4')].timeline = [
                        { t_s: 0, dps: 100, mana: 1660 },
                    ]
                },
            },
            {
                rule: 'pulls only on a chain fight',
                message: 'Only a chain fight has pulls.',
                breakIt: (f) => {
                    f.results[resultIndex(f, 'worn', 'dungeon-long')].pulls = [
                        { pull: 1, dps: 100, mana_start: 1660, mana_end: 0 },
                    ]
                },
            },
        ]
        expect(unmet(breakages)).toEqual([])
    })
})

describe('the JSON Schema', () => {
    test(
        'bun run armory:schema writes the JSON Schema, and the committed text matches a fresh one',
        () => {
            const committed = readFileSync(SCHEMA_PATH, 'utf8')
            // The file is two-space JSON with a final newline.
            expect(committed).toBe(
                JSON.stringify(JSON.parse(committed), null, 2) + '\n'
            )
            expect(committed).toContain('"schema_version"')

            // Generate a fresh copy in a temp folder; the committed file is
            // only read, never written.
            const dir = mkdtempSync(join(tmpdir(), 'armory-schema-'))
            const out = join(dir, 'results-file.schema.json')
            try {
                const result = Bun.spawnSync(
                    [process.execPath, 'run', 'armory:schema', out],
                    { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
                )
                expect({
                    exitCode: result.exitCode,
                    output: result.stdout.toString() + result.stderr.toString(),
                }).toMatchObject({ exitCode: 0 })
                expect(readFileSync(out, 'utf8')).toBe(committed)
            } finally {
                rmSync(dir, { recursive: true, force: true })
            }
            expect(readFileSync(SCHEMA_PATH, 'utf8')).toBe(committed)
        },
        { timeout: 60_000 }
    )

    test("the committed JSON Schema no longer says the page shows gain_dps in place of gain_ep, or the first alternative as the slot's best upgrade", () => {
        const committed = readFileSync(SCHEMA_PATH, 'utf8')

        expect(committed).not.toContain('in place of gain_ep')
        expect(committed).not.toContain(
            "the page shows the first as the slot's best upgrade"
        )
    })
})

describe('stat_weights source', () => {
    test("a source of { kind: 'precomputed', level_min: 30, level_max: 34 } or { kind: 'yours' } reads, and so does none", () => {
        const precomputed = sample()
        precomputed.stat_weights[0].source = {
            kind: 'precomputed',
            level_min: 30,
            level_max: 34,
        }
        expect((readResultsFile(precomputed) as any).problems).toBeUndefined()
        expect(readResultsFile(precomputed).ok).toBe(true)

        const yours = sample()
        yours.stat_weights[0].source = { kind: 'yours' }
        expect((readResultsFile(yours) as any).problems).toBeUndefined()

        expect(readResultsFile(sample()).ok).toBe(true)
    })

    test("a source of kind 'guess', or with an extra key, is refused with its path and Zod's message", () => {
        const guess = sample()
        guess.stat_weights[0].source = { kind: 'guess' }
        const guessProblems = problemsOf(guess).filter((p) =>
            p.startsWith('stat_weights.0.source')
        )
        expect(guessProblems.length).toBeGreaterThan(0)
        for (const problem of guessProblems)
            expect(problem).toMatch(/^stat_weights\.0\.source[.\w]*: \S/)

        const extra = sample()
        extra.stat_weights[0].source = {
            kind: 'precomputed',
            level_min: 30,
            level_max: 34,
            reference: 'testchar-l30.json',
        }
        const extraProblems = problemsOf(extra)
        expect(
            extraProblems.some(
                (p) =>
                    p.startsWith('stat_weights.0.source') &&
                    p.includes('Unrecognized key')
            )
        ).toBe(true)
    })

    test('the committed JSON Schema describes the source union', () => {
        const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
        const source = schema.properties.stat_weights.items.properties.source
        expect(source).toBeDefined()
        const text = JSON.stringify(source)
        expect(text.includes('"precomputed"')).toBe(true)
        expect(text.includes('"yours"')).toBe(true)
    })
})

/** The descriptions of every property named `key` in the committed JSON Schema. */
function descriptionsOf(key: string): string[] {
    const found: string[] = []
    const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (node === null || typeof node !== 'object') return
        const record = node as Record<string, any>
        const named = record.properties?.[key]
        if (named?.description) found.push(named.description)
        Object.values(record).forEach(walk)
    }
    walk(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')))
    return found
}

describe('what the contract tells the runner', () => {
    test('which pull ran dry comes from out_of_mana_s, not a mana_end of 0', () => {
        const [outOfMana] = descriptionsOf('out_of_mana_s')
        expect(outOfMana).toContain('(k-1)*(duration_s + gap_s)')
        expect(outOfMana).toContain(
            'in the gap after a pull counts as the next pull'
        )
        const [manaEnd] = descriptionsOf('mana_end')
        expect(manaEnd).toContain('can end a little above 0')
        const [pulls] = descriptionsOf('pulls').filter((d) =>
            d.startsWith('DPS and mana per pull')
        )
        expect(pulls).not.toContain('runs dry when its mana_end is 0')
        expect(pulls).toContain('out_of_mana_s')
    })

    test('talents.points is the points spent in the tree', () => {
        const points = descriptionsOf('points')
        expect(points).toHaveLength(1)
        expect(points[0]).toStartWith(
            "The talent points spent in this tree: the sum of the ranks in yours, which this schema doesn't check."
        )
    })

    test('talents.points no longer quotes the old Talents button', () => {
        const [points] = descriptionsOf('points')
        expect(points).not.toContain('Talents:')
        const schema = readFileSync(SCHEMA_PATH, 'utf8')
        expect(schema).not.toContain('Talents: your build')
    })

    test("bag_upgrades[].results names the page's Equip button, not Wear them", () => {
        const [bagResults] = descriptionsOf('results').filter((d) =>
            d.startsWith('What you wear with this bag item put on')
        )
        expect(bagResults).toContain('Equip')
        expect(bagResults).not.toContain('Wear them')
    })

    test("weapon_type is the game's skill name", () => {
        const [weaponType] = descriptionsOf('weapon_type')
        expect(weaponType).toContain('"Two-Handed Axes"')
    })
})

describe('talent bounds', () => {
    /** The problems for a sample whose first talent is changed by `change`. */
    function talentProblems(change: (talent: any) => void): string[] {
        const f = sample()
        change(f.talents.yours[0])
        return problemsOf(f)
    }

    test('a tier of 5000000000 is refused on that talent', () => {
        const problems = talentProblems((t) => {
            t.tier = 5000000000
        })
        expect(
            problems.some((p) => p.startsWith('talents.yours.0.tier: '))
        ).toBe(true)
    })

    test('a tier of 0 is refused', () => {
        const problems = talentProblems((t) => {
            t.tier = 0
        })
        expect(
            problems.some((p) => p.startsWith('talents.yours.0.tier: '))
        ).toBe(true)
    })

    test('a column of 7 is refused', () => {
        const problems = talentProblems((t) => {
            t.column = 7
        })
        expect(
            problems.some((p) => p.startsWith('talents.yours.0.column: '))
        ).toBe(true)
    })

    test('tier 9, column 6 and max rank 10 at rank 10 parse', () => {
        const f = sample()
        Object.assign(f.talents.yours[0], {
            tier: 9,
            column: 6,
            max_rank: 10,
            rank: 10,
        })
        expect((readResultsFile(f) as any).problems).toBeUndefined()
    })

    test('a max rank of 11, or a rank above max rank, is refused', () => {
        expect(
            talentProblems((t) => {
                t.max_rank = 11
            }).some((p) => p.startsWith('talents.yours.0.max_rank: '))
        ).toBe(true)
        expect(
            talentProblems((t) => {
                t.rank = t.max_rank + 1
            }).some((p) => p.startsWith('talents.yours.0.rank: '))
        ).toBe(true)
    })

    test('two talents on the same tier and column are refused on talents.yours', () => {
        const f = sample()
        f.talents.yours[1].tier = f.talents.yours[0].tier
        f.talents.yours[1].column = f.talents.yours[0].column
        expect(problemsOf(f)).toContain(
            "talents.yours: Two talents can't share a tier and column."
        )
    })
})

describe('out_of_mana_s', () => {
    test('takes a number, never or null, and nothing else', () => {
        for (const value of [48, 'never', null]) {
            const f = sample()
            f.results[0].out_of_mana_s = value
            expect((readResultsFile(f) as any).problems).toBeUndefined()
        }
        const f = sample()
        f.results[0].out_of_mana_s = 'always'
        expect(
            problemsOf(f).some((p) => p.startsWith('results.0.out_of_mana_s: '))
        ).toBe(true)
    })

    test('the full sample says never where it never runs dry, and the first-run sample has every one null', () => {
        const full = sample().results.map((r: any) => r.out_of_mana_s)
        expect(full).not.toContain(null)
        expect(full).toContain('never')

        const first = sample('sample-truncha-first-run.json').results
        expect(first.length).toBeGreaterThan(0)
        for (const r of first) expect(r.out_of_mana_s).toBeNull()
    })
})

describe('duplicates', () => {
    test('each duplicate is refused with its own message', () => {
        const breakages: Breakage[] = [
            {
                rule: 'duplicate fight_id',
                message: 'fights: Each fight_id must be unique.',
                breakIt: (f) => {
                    f.fights.push(structuredClone(f.fights[0]))
                },
            },
            {
                rule: 'two sets of stat weights for one fight',
                message:
                    'stat_weights: Each fight needs at most one set of stat weights.',
                breakIt: (f) => {
                    f.stat_weights.push(structuredClone(f.stat_weights[0]))
                },
            },
            {
                rule: 'duplicate Pawn label',
                message: 'pawn: Each Pawn label must be unique.',
                breakIt: (f) => {
                    f.pawn[1].label = f.pawn[0].label
                },
            },
            {
                rule: 'an item left out twice',
                message:
                    'left_out_items: Each left_out_items item_id must be unique.',
                breakIt: (f) => {
                    const items = f.left_out_items
                    items.push(structuredClone(items[0]))
                },
            },
            {
                rule: 'an item twice in one slot',
                message:
                    "slots.0.alternatives: An item can appear only once in a slot's alternatives.",
                breakIt: (f) => {
                    const alternatives = f.slots[0].alternatives
                    alternatives.push(structuredClone(alternatives[0]))
                },
            },
        ]
        expect(unmet(breakages)).toEqual([])
    })

    test('the same item in two different slots is fine', () => {
        // Both fingers list the same rings, as the sample already shows.
        const f = sample()
        const fingers = f.slots.filter((s: any) => s.slot.startsWith('finger'))
        expect(fingers[0].alternatives[0].item.item_id).toBe(
            fingers[1].alternatives[0].item.item_id
        )
        expect((readResultsFile(f) as any).problems).toBeUndefined()
    })
})

describe('left_out_items', () => {
    test('is optional: absent, empty or a list of items all read', () => {
        for (const items of [
            undefined,
            [],
            [{ item_id: 1, name: 'A', reason: 'B' }],
        ]) {
            const f = sample()
            if (items === undefined) delete f.left_out_items
            else f.left_out_items = items
            expect((readResultsFile(f) as any).problems).toBeUndefined()
        }
    })

    test('each item is strict: a positive item_id, a name and a reason', () => {
        const broken: [any, string][] = [
            [
                { item_id: 0, name: 'A', reason: 'B' },
                'left_out_items.0.item_id: ',
            ],
            [{ item_id: 1, name: '', reason: 'B' }, 'left_out_items.0.name: '],
            [
                { item_id: 1, name: 'A', reason: '' },
                'left_out_items.0.reason: ',
            ],
            [
                { item_id: 1, name: 'A', reason: 'B', owned: true },
                'left_out_items.0: ',
            ],
        ]
        for (const [item, prefix] of broken) {
            const f = sample()
            f.left_out_items = [item]
            expect(problemsOf(f).some((p) => p.startsWith(prefix))).toBe(true)
        }
    })

    test('the full sample has one made-up item; the first-run sample has none, and neither lists a left-out item in checks', () => {
        expect(sample().left_out_items).toHaveLength(1)
        expect(
            sample('sample-truncha-first-run.json').left_out_items
        ).toBeUndefined()
        for (const name of [
            'sample-truncha.json',
            'sample-truncha-first-run.json',
        ])
            for (const check of sample(name).checks)
                expect(check.name).not.toMatch(/^left out/i)
    })

    test('the JSON Schema describes it and each of its fields', () => {
        const [list] = descriptionsOf('left_out_items')
        expect(list).toContain('Absent: none recorded.')
        expect(list).toContain('not in checks')
        for (const key of ['item_id', 'name', 'reason'])
            expect(
                descriptionsOf(key).some((d) => d.startsWith('The left-out'))
            ).toBe(true)
    })
})

describe('the optional mockup fields (schema version 1)', () => {
    test('the full sample has all six; the first-run sample has none of them', () => {
        const full = sample()
        expect(full.plans.map((p: any) => p.reach)).toEqual([
            { damage: 100, survival: 35, healing: 20, utility: 40 },
            { damage: 84, survival: 88, healing: 36, utility: 52 },
            { damage: 45, survival: 100, healing: 48, utility: 61 },
        ])
        expect(full.sheet.weapon_skill).toEqual({
            weapon_type: 'Two-Handed Axes',
            current: 148,
            max: 150,
        })
        expect(full.slots.find((s: any) => s.slot === 'main_hand').imbue).toBe(
            'Windfury Weapon'
        )
        expect(full.fights.map((f: any) => f.melee_miss_pct)).toEqual([
            5.5, 6, 8, 8,
        ])
        expect(full.results[0].damage_split.map((p: any) => p.school)).toEqual([
            'physical',
            'physical',
            'fire',
            'nature',
            'nature',
            'nature',
        ])
        expect(full.bag_upgrades[0].results).toHaveLength(4)

        const keys = allKeys(sample('sample-truncha-first-run.json'))
        for (const key of [
            'reach',
            'weapon_skill',
            'imbue',
            'melee_miss_pct',
            'school',
        ])
            expect(keys.has(key)).toBe(false)
        expect(
            sample('sample-truncha-first-run.json').bag_upgrades.every(
                (u: any) => !('results' in u)
            )
        ).toBe(true)
    })

    test('each may be null (not simmed)', () => {
        const f = sample()
        for (const plan of f.plans) plan.reach = null
        f.sheet.weapon_skill = null
        for (const entry of f.slots) entry.imbue = null
        for (const fight of f.fights) fight.melee_miss_pct = null
        for (const result of f.results)
            for (const part of result.damage_split) part.school = null
        for (const upgrade of f.bag_upgrades) upgrade.results = null
        expect((readResultsFile(f) as any).problems).toBeUndefined()
    })

    test('they are checked: a school outside the list, a reach above 100, a skill above its max', () => {
        const school = sample()
        school.results[0].damage_split[0].school = 'lightning'
        expect(problemsOf(school)[0]).toStartWith(
            'results.0.damage_split.0.school:'
        )
        const reach = sample()
        reach.plans[0].reach.survival = 101
        expect(problemsOf(reach)[0]).toStartWith('plans.0.reach.survival:')
        const skill = sample()
        skill.sheet.weapon_skill.current = 151
        expect(problemsOf(skill)).toContain(
            "sheet.weapon_skill.current: A weapon skill can't be above its max."
        )
    })

    test("a bag upgrade's results name the file's fights, once each, with the timeline and pulls rules", () => {
        expect(
            unmet([
                {
                    rule: 'bag result fight_id',
                    message: 'This names no fight in this file.',
                    breakIt: (f) => {
                        f.bag_upgrades[0].results[0].fight_id = 'nowhere'
                    },
                },
                {
                    rule: 'one bag result per fight',
                    message:
                        'Each fight needs at most one result per bag item.',
                    breakIt: (f) => {
                        f.bag_upgrades[0].results.push(
                            structuredClone(f.bag_upgrades[0].results[0])
                        )
                    },
                },
                {
                    rule: 'bag result pulls only on a chain fight',
                    message: 'Only a chain fight has pulls.',
                    breakIt: (f) => {
                        const single = f.bag_upgrades[0].results.find(
                            (r: any) => r.fight_id === 'solo-hit-short'
                        )
                        single.pulls = []
                    },
                },
            ])
        ).toEqual([])
    })
})

describe('character.professions', () => {
    test("a list with Leatherworking 165 of 225 reads, and a skill of 'high' is refused at character.professions.0.skill", () => {
        const f = sample()
        f.character.professions = [
            { name: 'Leatherworking', skill: 165, max: 225 },
        ]
        const outcome = readResultsFile(f) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        expect(outcome.file.character.professions).toEqual([
            { name: 'Leatherworking', skill: 165, max: 225 },
        ])

        const broken = sample()
        broken.character.professions = [
            { name: 'Leatherworking', skill: 'high', max: 225 },
        ]
        expect(
            problemsOf(broken).some((p) =>
                p.startsWith('character.professions.0.skill: ')
            )
        ).toBe(true)
    })
})

describe('quick_fixes', () => {
    const fix = {
        kind: 'imbue',
        slot: 'main_hand',
        dps_gain: 18.2,
        text: "Windfury Weapon wasn't on your weapon at export.",
    }

    test('a missing Windfury imbue worth 18.2 DPS reads', () => {
        const f = sample()
        f.quick_fixes = [{ ...fix }]
        const outcome = readResultsFile(f) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)
        expect(outcome.file.quick_fixes).toEqual([fix])
    })

    test("a kind of 'nap' is refused, and so is a dps_gain of -1", () => {
        const nap = sample()
        nap.quick_fixes = [{ ...fix, kind: 'nap' }]
        expect(
            problemsOf(nap).some((p) => p.startsWith('quick_fixes.0.kind'))
        ).toBe(true)

        const negative = sample()
        negative.quick_fixes = [{ ...fix, dps_gain: -1 }]
        expect(
            problemsOf(negative).some((p) =>
                p.startsWith('quick_fixes.0.dps_gain')
            )
        ).toBe(true)
    })
})

describe('bag_upgrades_all', () => {
    /**
     * The full sample with a second bag upgrade (a copy of the first, moved to
     * the head slot) and every bag upgrade worn together on every fight.
     */
    function withAllBag(): any {
        const f = sample()
        const second = structuredClone(f.bag_upgrades[0])
        second.slot = 'head'
        second.item.item_id = 4252
        second.item.name = 'Made-up Test Cap'
        f.bag_upgrades.push(second)
        f.bag_upgrades_all = {
            results: structuredClone(f.bag_upgrades[0].results),
        }
        return f
    }

    test('one result per fight reads, and missing one fight is refused with its message', () => {
        const good = withAllBag()
        expect(good.bag_upgrades_all.results).toHaveLength(good.fights.length)
        const outcome = readResultsFile(good) as any
        expect(outcome.problems).toBeUndefined()
        expect(outcome.ok).toBe(true)

        const missing = withAllBag()
        missing.bag_upgrades_all.results.pop()
        expect(problemsOf(missing)).toContain(
            'bag_upgrades_all.results: bag_upgrades_all.results needs one result for each fight in fights.'
        )
    })

    test('with one bag upgrade it is refused, and so with two bag upgrades in the same slot', () => {
        const message =
            'bag_upgrades_all: bag_upgrades_all needs two or more bag_upgrades, each in a different slot.'

        const one = withAllBag()
        one.bag_upgrades.pop()
        expect(problemsOf(one)).toContain(message)

        const sameSlot = withAllBag()
        sameSlot.bag_upgrades[1].slot = sameSlot.bag_upgrades[0].slot
        expect(problemsOf(sameSlot)).toContain(message)
    })
})

describe('the new optional fields in the JSON Schema', () => {
    test('the committed JSON Schema describes professions, quick_fixes and bag_upgrades_all', () => {
        for (const key of ['professions', 'quick_fixes', 'bag_upgrades_all']) {
            const descriptions = descriptionsOf(key)
            expect(`${key}: ${descriptions.length}`).toBe(`${key}: 1`)
            expect(descriptions[0]!.length).toBeGreaterThan(20)
        }
        const text = readFileSync(SCHEMA_PATH, 'utf8')
        for (const kind of ['"imbue"', '"empty_slot"', '"weapon_skill"'])
            expect(text).toContain(kind)
    })
})
