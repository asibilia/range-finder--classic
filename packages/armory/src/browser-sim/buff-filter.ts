import { BONUS_STAT_COUNT, STAT } from '@goturbo/sim'

import type { ResultsFile } from '../results-file'
import type { SavedValue } from './saved-variables'

export type KnownBuffs = Record<string, { stats: number[] }>
export type FilteredBuff = NonNullable<ResultsFile['filtered_buffs']>[number]
export type BuffNumbers = NonNullable<FilteredBuff['numbers']>
export type BuffSource = FilteredBuff['source']

type Table = { [key: string]: SavedValue }

export type ExportBuff = {
    name: string
    spellID: number
    source: BuffSource
    points: Record<string, number>
    description: string | null
    pointsSeen?: number
    secretValues?: number
    descriptionMissing?: string
    malformed: boolean
}

export type ClassifiedBuff = {
    buff: ExportBuff
    filtered: FilteredBuff
    simStats?: number[]
    kings?: boolean
    crossCheck?: BuffNumbers
}

const table = (value: SavedValue | undefined): Table =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}
const int = (value: SavedValue | undefined): number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value)
        ? value || 0
        : 0
const str = (value: SavedValue | undefined): string =>
    typeof value === 'string' ? value : ''

const SOURCES: Record<number, readonly string[]> = {
    7: [],
    8: ['self', 'other', 'none'],
    9: ['self', 'other', 'none'],
    10: ['self', 'other player', 'not a player', 'unknown'],
}

function validPoints(value: SavedValue | undefined): boolean {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false
    return Object.entries(value).every(
        ([key, point]) =>
            /^\d+$/.test(key) &&
            typeof point === 'number' &&
            Number.isFinite(point)
    )
}

function optionalCount(value: SavedValue | undefined): boolean {
    return (
        value === undefined ||
        (typeof value === 'number' &&
            Number.isFinite(value) &&
            Number.isInteger(value) &&
            value >= 0)
    )
}

export function readBuff(raw: SavedValue, format: number): ExportBuff {
    const row = table(raw)
    const name = str(row.name)
    const spellID = int(row.spellID)
    if (format === 7)
        return {
            name,
            spellID,
            source: null,
            points: {},
            description: null,
            malformed: false,
        }

    const malformed =
        (row.source !== undefined &&
            row.source !== null &&
            typeof row.source !== 'string') ||
        (row.points !== undefined && !validPoints(row.points)) ||
        (row.description !== undefined &&
            row.description !== null &&
            typeof row.description !== 'string') ||
        !optionalCount(row.pointsSeen) ||
        !optionalCount(row.secretValues) ||
        (row.descriptionMissing !== undefined &&
            typeof row.descriptionMissing !== 'string')
    if (malformed)
        return {
            name,
            spellID,
            source: null,
            points: {},
            description: null,
            malformed: true,
        }

    const source = str(row.source)
    const points = Object.fromEntries(
        Object.entries(table(row.points)).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number'
        )
    )
    return {
        name,
        spellID,
        source: SOURCES[format]?.includes(source)
            ? source === 'unknown'
                ? null
                : (source as BuffSource)
            : null,
        points,
        description:
            row.descriptionMissing === 'not loaded'
                ? null
                : typeof row.description === 'string'
                  ? row.description
                  : null,
        ...(typeof row.pointsSeen === 'number'
            ? { pointsSeen: row.pointsSeen }
            : {}),
        ...(typeof row.secretValues === 'number'
            ? { secretValues: row.secretValues }
            : {}),
        ...(typeof row.descriptionMissing === 'string'
            ? { descriptionMissing: row.descriptionMissing }
            : {}),
        malformed: false,
    }
}

const KINGS = [20217, 25898]
const NO_EFFECT_NAMES = [
    'Lightning Shield',
    'Water Shield',
    'Well-Rested',
    'Ghost Wolf',
    'Resting',
    'Travel Form',
    'Aquatic Form',
    'Flight Form',
    'Swift Flight Form',
]
const MOUNT_NAME =
    /\b(?:mount|felsteed|dreadsteed|warhorse|mechanostrider|hawkstrider|kodo|talbuk|elekk|skeletal horse|deathcharger|nightsaber|frostsaber|mistsaber|battle tank)\b/i

type AllowListEntry = {
    numbers: BuffNumbers
    fromPoints?: Record<string, number>
}

const ALLOW_LIST: Record<number, AllowListEntry> = {
    16609: { numbers: { health: 300, mp5: 10, haste_pct: 15 } },
    19850: { numbers: { mp5: 18 } },
    782: { numbers: { damage_shield: 6 } },
    1248406: { numbers: { stamina: 1 }, fromPoints: { stamina: 1 } },
}

const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/

function expandedDescription(description: string): string {
    return description.replace(
        /(-?\d+(?:\.\d+)?)\s*\|4([^:|]+):([^;]+);/g,
        (_all, count: string, singular: string, plural: string) =>
            `${count} ${Number(count) === 1 ? singular : plural}`
    )
}

function amount(text: string, patterns: RegExp[]): number | undefined {
    for (const pattern of patterns) {
        const match = pattern.exec(text)
        if (match?.[1] !== undefined) return Number(match[1])
    }
    return undefined
}

function forwardAndBackward(words: string, suffix = ''): RegExp[] {
    return [
        new RegExp(`\\b(?:${words})\\b[^0-9-]*${NUMBER}${suffix}`, 'i'),
        new RegExp(`${NUMBER}${suffix}[^0-9]*\\b(?:${words})\\b`, 'i'),
    ]
}

function readDescription(description: string): {
    numbers: BuffNumbers
    values: number[]
} | null {
    const numbers: BuffNumbers = {}
    const values: number[] = []
    const sentences = expandedDescription(description)
        .split(/\.\s+|\.$/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    for (const sentence of sentences) {
        if (!NUMBER_PATTERN.test(sentence) || /^Lasts\b/.test(sentence))
            continue
        const found: [keyof BuffNumbers, number | undefined][] = []
        const perFive =
            /(?:every|per)\s*(?:5|five)\s*(?:seconds?|secs?)\b/i.test(sentence)
        found.push([
            'health',
            amount(
                sentence,
                forwardAndBackward(
                    'health|hit\\s*points|hitpoints|maximum health'
                )
            ),
        ])
        if (
            !perFive &&
            !/\brestor(?:e|es|ing)\b/i.test(sentence) &&
            !/\bregen(?:eration)?\b/i.test(sentence)
        )
            found.push([
                'mana',
                amount(sentence, forwardAndBackward('maximum mana|mana')),
            ])
        found.push(
            [
                'attack_power',
                amount(sentence, forwardAndBackward('attack power')),
            ],
            ['armor', amount(sentence, forwardAndBackward('armor'))]
        )
        for (const stat of [
            'strength',
            'agility',
            'stamina',
            'intellect',
            'spirit',
        ] as const)
            found.push([stat, amount(sentence, forwardAndBackward(stat))])
        if (perFive && /mana/i.test(sentence)) {
            const mp5 = amount(sentence, [
                new RegExp(`${NUMBER}\\s+mana`, 'i'),
                new RegExp(`mana[^0-9-]*${NUMBER}`, 'i'),
            ])
            found.push(['mp5', mp5])
        }
        found.push(
            [
                'haste_pct',
                amount(sentence, [
                    new RegExp(`${NUMBER}\\s*%\\s*(?:haste|attack speed)`, 'i'),
                    new RegExp(
                        `\\b(?:haste|attack speed)\\b[^0-9-]*${NUMBER}\\s*%`,
                        'i'
                    ),
                ]),
            ],
            [
                'run_speed_pct',
                amount(sentence, [
                    new RegExp(
                        `${NUMBER}\\s*%\\s*(?:(?:movement|run) speed|speed)`,
                        'i'
                    ),
                    new RegExp(
                        `\\b(?:(?:movement|run) speed)\\b[^0-9-]*${NUMBER}\\s*%`,
                        'i'
                    ),
                ]),
            ],
            [
                'damage_shield',
                amount(sentence, [
                    new RegExp(
                        `${NUMBER}(?:\\s+[A-Za-z]+){0,3}\\s+damage to attackers`,
                        'i'
                    ),
                    new RegExp(`damage to attackers[^0-9-]*${NUMBER}`, 'i'),
                ]),
            ]
        )
        let matched = false
        for (const [key, value] of found) {
            if (value === undefined) continue
            matched = true
            if (numbers[key] !== undefined && numbers[key] !== value)
                return null
            numbers[key] = value
            values.push(value)
        }
        if (!matched) return null
    }
    return { numbers, values }
}

function sameNumbers(actual: BuffNumbers, expected: BuffNumbers): boolean {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
    for (const key of keys) {
        if (
            actual[key as keyof BuffNumbers] !==
            expected[key as keyof BuffNumbers]
        )
            return false
    }
    return true
}

function nonEmptyPoints(buff: ExportBuff): number[] {
    return Object.values(buff.points).filter((point) => point !== 0)
}

const SHEET_STAT_KEYS = [
    'health',
    'mana',
    'attack_power',
    'armor',
    'strength',
    'agility',
    'stamina',
    'intellect',
    'spirit',
]

function fixedAllowList(
    buff: ExportBuff,
    expected: BuffNumbers
): ClassifiedBuff {
    const base = { buff, filtered: filteredOf(buff, 'unknown', 'unknown') }
    const sheetStat = Object.keys(expected).some((key) =>
        SHEET_STAT_KEYS.includes(key)
    )
    if (!buff.description) {
        const expectedValues = new Set(Object.values(expected).map(Math.abs))
        if (
            nonEmptyPoints(buff).some(
                (point) => !expectedValues.has(Math.abs(point))
            )
        )
            return base
        return sheetStat ? { ...base, crossCheck: expected } : base
    }
    const parsed = readDescription(buff.description)
    if (!parsed || !sameNumbers(parsed.numbers, expected)) return base
    if (
        nonEmptyPoints(buff).some(
            (point) => !parsed.values.includes(Math.abs(point))
        )
    )
        return base
    return {
        buff,
        filtered: {
            ...filteredOf(
                buff,
                sheetStat ? 'game_numbers' : 'no_stats',
                'list'
            ),
            numbers: { ...expected },
        },
    }
}

function pointsAllowList(
    buff: ExportBuff,
    selected: Record<string, number>
): ClassifiedBuff {
    const unknown = {
        buff,
        filtered: filteredOf(buff, 'unknown', 'unknown'),
    }
    if (!buff.description) return unknown
    const normalized = buff.description.replace(/_/g, ' ')
    for (const stat of Object.keys(selected)) {
        if (
            !new RegExp(`\\b${stat.replace(/_/g, '\\s+')}\\b`, 'i').test(
                normalized
            )
        )
            return unknown
    }
    const numbers: BuffNumbers = {}
    for (const [stat, index] of Object.entries(selected)) {
        const point = buff.points[String(index)]
        if (typeof point !== 'number' || point <= 0) return unknown
        numbers[stat as keyof BuffNumbers] = point
    }
    const parsed = readDescription(buff.description)
    if (!parsed) return unknown
    for (const [stat, value] of Object.entries(parsed.numbers)) {
        const index = selected[stat]
        if (index === undefined || buff.points[String(index)] !== value)
            return unknown
    }
    return {
        buff,
        filtered: {
            ...filteredOf(
                buff,
                'game_numbers',
                "list (numbers from the game's points)"
            ),
            numbers,
        },
    }
}

function filteredOf(
    buff: ExportBuff,
    how: FilteredBuff['how'],
    howDetail: string
): FilteredBuff {
    return {
        name: buff.name,
        spell_id: buff.spellID,
        source: buff.source,
        how,
        how_detail: howDetail,
    }
}

function modelled(buff: ExportBuff, known: KnownBuffs): ClassifiedBuff | null {
    if (ALLOW_LIST[buff.spellID]?.fromPoints) return null
    const kings = KINGS.includes(buff.spellID)
    const simStats = known[String(buff.spellID)]?.stats
    if (!kings && !simStats) return null
    const statValues = new Set(
        (simStats ?? []).filter((value) => value !== 0).map(Math.abs)
    )
    if (nonEmptyPoints(buff).some((point) => !statValues.has(Math.abs(point))))
        return null
    return {
        buff,
        filtered: filteredOf(buff, 'modelled', 'modelled'),
        ...(simStats ? { simStats } : {}),
        ...(kings ? { kings: true } : {}),
    }
}

export function classifyBuff(
    buff: ExportBuff,
    known: KnownBuffs
): ClassifiedBuff {
    const allow = ALLOW_LIST[buff.spellID]
    if (allow && !buff.malformed) {
        if (allow.fromPoints) return pointsAllowList(buff, allow.fromPoints)
        return fixedAllowList(buff, allow.numbers)
    }
    const fromSim = modelled(buff, known)
    if (fromSim) return fromSim
    if (NO_EFFECT_NAMES.includes(buff.name) || MOUNT_NAME.test(buff.name))
        return {
            buff,
            filtered: filteredOf(buff, 'no_stats', 'no_stats (name rule)'),
        }
    return { buff, filtered: filteredOf(buff, 'unknown', 'unknown') }
}

const GAME_STAT: Partial<Record<keyof BuffNumbers, number>> = {
    strength: STAT.strength,
    agility: STAT.agility,
    stamina: STAT.stamina,
    intellect: STAT.intellect,
    spirit: STAT.spirit,
    attack_power: STAT.attackPower,
    armor: STAT.armor,
    health: STAT.health,
    mana: STAT.mana,
}

export function statsFromNumbers(numbers: BuffNumbers): number[] {
    const stats = new Array<number>(BONUS_STAT_COUNT).fill(0)
    for (const [key, value] of Object.entries(numbers)) {
        const index = GAME_STAT[key as keyof BuffNumbers]
        if (index !== undefined && typeof value === 'number')
            stats[index] = value
    }
    return stats
}

export function unknownBuffs(buffs: FilteredBuff[] | undefined): boolean {
    return buffs?.some((buff) => buff.how === 'unknown') ?? false
}

export function buffCheckDetail(buffs: FilteredBuff[]): string {
    const words = (numbers: BuffNumbers | undefined) =>
        Object.entries(numbers ?? {})
            .map(([key, value]) => `${key} ${value}`)
            .join(', ')
    return buffs
        .map((buff) => {
            const source = buff.source ? ` [${buff.source}]` : ''
            const path = ` (path: ${buff.how_detail})${source}`
            if (buff.how === 'modelled')
                return `${buff.name}: modelled from the sim's spell data${path}`
            if (buff.how === 'unknown') return `unknown: ${buff.name}${path}`
            if (buff.how === 'game_numbers') {
                const action =
                    buff.how_detail === 'list + sheet cross-check'
                        ? "removed using the reviewed list's numbers, confirmed by the sheet"
                        : buff.how_detail ===
                            "list (numbers from the game's points)"
                          ? "removed using the game's own points"
                          : "removed using the game's own numbers"
                return `${buff.name}: ${action} (${words(buff.numbers)})${path}`
            }
            const note = buff.numbers
                ? ` (${words(buff.numbers)}, kept as a note)`
                : ''
            return `${buff.name}: doesn't touch the sheet${note}${path}`
        })
        .join('; ')
}
