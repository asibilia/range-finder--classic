/**
 * `bun run sim:add-fixture <export> <fixture name> [--out <dir>]`: copies an
 * export's contents (never its path) into `packages/sim/fixtures/` (or
 * `--out`) under a `truncha-*.lua` name, with other players' names and
 * GUIDs replaced by placeholders (`Player1`, `Player-0-00000001` ...), and
 * writes `owner.json` (`{ name, guid }`) from the export's identity. Then
 * it runs the leak guard on the new file, and deletes it on a leak.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { scanForLeaks } from '../src/leak-scan'

const FIXTURES = join(import.meta.dir, '../fixtures')
const NAME_RULE = /^truncha-[^/\\]+\.lua$/
const GUID = /Player-\d+-[0-9A-Fa-f]{8}/g

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function field(table: string, key: string): string | undefined {
    const match = new RegExp(
        `\\["${escapeRegExp(key)}"\\]\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`
    ).exec(table)
    return match?.[1]
}

/** The owner's name and GUID, from the export's `identity` table. */
function readOwner(text: string): { name: string; guid: string } {
    const identity = /\["identity"\]\s*=\s*\{([^{}]*)\}/.exec(text)?.[1]
    const name = identity && field(identity, 'name')
    const guid = identity && field(identity, 'guid')
    if (!name || !guid) fail('The export has no identity name and GUID.')
    return { name, guid }
}

/**
 * Other players' names: in each innermost table, the name beside one of
 * their GUIDs (`name` beside `guid`, `caster` beside `caster_guid` ...).
 */
function otherNames(
    text: string,
    isOther: (guid: string) => boolean
): Map<string, string> {
    const names = new Map<string, string>()
    for (const [table] of text.matchAll(/\{[^{}]*\}/g)) {
        const pairs = /\["(\w*?)_?guid"\]\s*=\s*"(Player-\d+-[0-9A-Fa-f]{8})"/g
        for (const [, prefix, guid] of table.matchAll(pairs)) {
            if (!isOther(guid)) continue
            const name = prefix
                ? (field(table, prefix) ?? field(table, `${prefix}_name`))
                : field(table, 'name')
            if (name) names.set(name, guid.toLowerCase())
        }
    }
    return names
}

const args = process.argv.slice(2)
const outFlag = args.indexOf('--out')
const out = outFlag >= 0 ? args[outFlag + 1] : FIXTURES
const [source, fixtureName] = args.filter(
    (_, i) => outFlag < 0 || (i !== outFlag && i !== outFlag + 1)
)
if (!source || !fixtureName || !out)
    fail('Usage: bun run sim:add-fixture <export> <fixture name> [--out <dir>]')
if (!NAME_RULE.test(fixtureName))
    fail('Fixture names must start with truncha- and end with .lua.')

let text: string
try {
    text = readFileSync(source, 'utf8')
} catch {
    fail('Could not read the export.')
}

const owner = readOwner(text)
const ownGuid = owner.guid.toLowerCase()
const isOther = (guid: string) => guid.toLowerCase() !== ownGuid

// One placeholder per player, numbered in order of first appearance.
const players = new Map<string, number>()
for (const [guid] of text.matchAll(GUID))
    if (isOther(guid) && !players.has(guid.toLowerCase()))
        players.set(guid.toLowerCase(), players.size + 1)
const names = otherNames(text, isOther)
names.delete(owner.name)

let written = text.replace(GUID, (guid) => {
    const n = players.get(guid.toLowerCase())
    return n === undefined ? guid : `Player-0-${String(n).padStart(8, '0')}`
})
for (const [name, guid] of names) {
    const word = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`,
        'gu'
    )
    written = written.replace(word, `Player${players.get(guid)}`)
}

mkdirSync(out, { recursive: true })
const target = join(out, fixtureName)
writeFileSync(target, written)
writeFileSync(
    join(out, 'owner.json'),
    JSON.stringify({ name: owner.name, guid: owner.guid }, null, 4) + '\n'
)

const leaks = scanForLeaks([target], { owner })
if (leaks.length > 0) {
    rmSync(target)
    for (const leak of leaks) console.error(`${leak.file}: ${leak.kind}`)
    fail(`${fixtureName} would leak, so it was not added.`)
}
console.log(`Added ${fixtureName} and owner.json.`)
