/**
 * Writes `build/spell-names.json`: each spell's name by its id, so the
 * page's damage split can name every line, as the offline runner's spell
 * index did. `{ [spell_id]: name }`.
 *
 * The names come from the vendored spell data (`spells_auto_gen.go`). A
 * few spells the sim adds itself (racials such as Blood Fury) aren't in
 * it: those take their name from the sim's own name table
 * (`sim/siml/names.json`, `blood_fury` read as `Blood Fury`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const SPELLS = join(
    PACKAGE_DIR,
    'upstream/sim/core/spelldata/spells_auto_gen.go'
)
const SIML_NAMES = join(PACKAGE_DIR, 'upstream/sim/siml/names.json')

/** A spell's entry: `{ID: 439440, Name: "Windfury Weapon", ...`. */
const SPELL = /^\s*\{ID: (\d+), Name: "((?:[^"\\]|\\.)*)"/

/** A Go string literal's text, or the raw text when it won't parse. */
function unquote(text: string): string {
    try {
        return JSON.parse(`"${text}"`) as string
    } catch {
        return text
    }
}

/** The spells in the spell data's Go source: id to name. */
export function spellNamesFrom(source: string): Record<string, string> {
    const names: Record<string, string> = {}
    for (const line of source.split('\n')) {
        const spell = line.match(SPELL)
        if (!spell) continue
        const [, id, raw] = spell
        const name = unquote(raw!).trim()
        if (name && !(id! in names)) names[id!] = name
    }
    return names
}

/** `battle_shout_25289` as `Battle Shout`. */
function titleOf(key: string): string {
    return key
        .replace(/_\d+$/, '')
        .split('_')
        .filter(Boolean)
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(' ')
}

/** The sim's own name table: every `{ spellId }` entry, id to name. */
export function simlNamesFrom(table: unknown): Record<string, string> {
    const names: Record<string, string> = {}
    const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        for (const [key, value] of Object.entries(node)) {
            const spellId = (value as { spellId?: unknown } | null)?.spellId
            if (typeof spellId === 'number' && spellId > 0) {
                const name = titleOf(key)
                if (name && !(String(spellId) in names))
                    names[String(spellId)] = name
            }
            walk(value)
        }
    }
    walk(table)
    return names
}

/** Writes `spell-names.json` into `buildDir`. */
export function writeSpellNames(buildDir: string): void {
    const names = {
        ...simlNamesFrom(JSON.parse(readFileSync(SIML_NAMES, 'utf8'))),
        ...spellNamesFrom(readFileSync(SPELLS, 'utf8')),
    }
    writeFileSync(
        join(buildDir, 'spell-names.json'),
        JSON.stringify(names) + '\n'
    )
}

if (import.meta.main) writeSpellNames(join(PACKAGE_DIR, 'build'))
