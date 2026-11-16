/**
 * Writes `build/buffs.json`: the stats each buff in the vendored spell data
 * gives, so the page can tell whether a buff up at export can be modelled.
 * Ported from the offline runner's `exportBuffs`, which read the same
 * `spells_auto_gen.go` with a regex.
 *
 * `{ [spell_id]: { stats: number[40] } }`, `stats` indexed by the proto
 * `Stat` enum, for every spell with an `A_MOD_STAT` aura, or an
 * `A_MOD_RESISTANCE` / `A_MOD_ARMOR_NO_MODS` aura on armor.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { BONUS_STAT_COUNT, STAT } from '../src/sheet'

const PACKAGE_DIR = join(import.meta.dir, '..')
const SPELLS = join(
    PACKAGE_DIR,
    'upstream/sim/core/spelldata/spells_auto_gen.go'
)

/** The game's stat index (an `A_MOD_STAT` aura's Misc) as a proto `Stat`. */
const GAME_STAT = [
    STAT.strength,
    STAT.agility,
    STAT.stamina,
    STAT.intellect,
    STAT.spirit,
]
/** The physical school's bit: armor, in a resistance aura's Misc. */
const PHYSICAL = 1

const EFFECT =
    /SpellID: (\d+),.*?Aura: dbcenums\.(A_MOD_STAT|A_MOD_RESISTANCE|A_MOD_ARMOR_NO_MODS),.*?BasePoints: (-?\d+)/

/** The buffs in the spell data's Go source, by spell id. */
export function buffsFrom(source: string): Record<string, { stats: number[] }> {
    const buffs: Record<string, { stats: number[] }> = {}
    for (const line of source.split('\n')) {
        const effect = line.match(EFFECT)
        if (!effect) continue
        const [, spellId, aura, points] = effect
        const misc = Number(line.match(/\bMisc: (-?\d+)/)?.[1] ?? 0)
        const amount = Number(points)
        const targets: number[] = []
        if (aura === 'A_MOD_STAT') {
            if (misc === -1) targets.push(...GAME_STAT)
            else if (GAME_STAT[misc] !== undefined)
                targets.push(GAME_STAT[misc])
        } else if ((misc & PHYSICAL) !== 0) {
            targets.push(STAT.armor)
        }
        if (targets.length === 0 || amount === 0) continue
        const buff = (buffs[spellId!] ??= {
            stats: new Array<number>(BONUS_STAT_COUNT).fill(0),
        })
        for (const target of targets)
            buff.stats[target] = (buff.stats[target] ?? 0) + amount
    }
    return buffs
}

/** Writes `buffs.json` into `buildDir`. */
export function writeBuffs(buildDir: string): void {
    const buffs = buffsFrom(readFileSync(SPELLS, 'utf8'))
    writeFileSync(join(buildDir, 'buffs.json'), JSON.stringify(buffs) + '\n')
}

if (import.meta.main) writeBuffs(join(PACKAGE_DIR, 'build'))
