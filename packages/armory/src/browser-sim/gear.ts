/**
 * The item data (`db.json`, `leftover_db.json` and `item_first_seen.json`
 * from the sim's build, through `pool.data()`): what each item is, where it
 * comes from, whether the character can wear it, and the "left out" rule.
 */
import type { SimPool } from '@goturbo/sim'

import type { ResultsFile, Slot, Stat } from '../results-file'
import type { Character, GameStats } from './character'
import { gameStats } from './game-stats'
import { STAT_STEPS } from './weights'

export type DbItem = {
    id: number
    name: string
    type?: number
    armorType?: number
    weaponType?: number
    handType?: number
    rangedWeaponType?: number
    reqLvl?: number
    quality?: number
    classAllowlist?: number[]
    sources?: Record<string, Record<string, unknown>>[]
    scalingOptions?: Record<
        string,
        { stats?: Record<string, number>; ilvl?: number; unroundedDps?: number }
    >
}

export type ItemDb = {
    items: ReadonlyMap<number, DbItem>
    firstSeen: ReadonlyMap<number, number>
}

export type FileItem =
    ResultsFile['slots'][number]['alternatives'][number]['item']

/** When WoWSims first imported the classic items. */
const CLASSIC_IMPORT = 1668901636
/** Item ids from here on are Forever's own. */
const FOREVER_IDS = 200_000

const ITEM_TYPE = {
    head: 1,
    neck: 2,
    shoulder: 3,
    back: 4,
    chest: 5,
    wrist: 6,
    hands: 7,
    waist: 8,
    legs: 9,
    feet: 10,
    finger: 11,
    trinket: 12,
    weapon: 13,
    ranged: 14,
}
const ARMOR = { cloth: 1, leather: 2, mail: 3 }
const WEAPON = {
    axe: 1,
    dagger: 2,
    fist: 3,
    mace: 4,
    offHand: 5,
    shield: 7,
    staff: 8,
}
const HAND = { mainHand: 1, oneHand: 2, offHand: 3, twoHand: 4 }
const TOTEM = 8
const SHAMAN = 7

const QUALITY = [
    'poor',
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
] as const

const PROFESSION: Record<number, string> = {
    1: 'Alchemy',
    2: 'Blacksmithing',
    3: 'Enchanting',
    4: 'Engineering',
    5: 'Herbalism',
    6: 'Inscription',
    8: 'Leatherworking',
    9: 'Mining',
    10: 'Skinning',
    11: 'Tailoring',
}

/** Loads the item data from the sim's build: `db.json` wins on a clash. */
export async function loadItemDb(pool: SimPool): Promise<ItemDb> {
    const [db, leftover, firstSeen] = await Promise.all([
        pool.data('db.json'),
        pool.data('leftover_db.json'),
        pool.data('item_first_seen.json'),
    ])
    const items = new Map<number, DbItem>()
    for (const source of [leftover, db] as { items?: DbItem[] }[])
        for (const item of source?.items ?? []) items.set(item.id, item)
    const seen = new Map<number, number>()
    for (const entry of (firstSeen ?? []) as {
        id: number
        firstSeen: number
    }[])
        seen.set(entry.id, entry.firstSeen)
    return { items, firstSeen: seen }
}

/**
 * An item's required level. The data leaves `reqLvl` out when it is 60
 * (the runner's `reqOf`); an item the data doesn't know needs level 1.
 */
export function requiredLevel(item: DbItem | undefined): number {
    if (!item) return 1
    return Math.max(1, item.reqLvl ?? 60)
}

function sourceOf(item: DbItem | undefined): FileItem['source'] {
    const sources = item?.sources ?? []
    if (sources.length === 0) return { kind: 'unknown', text: 'Source unknown' }
    const parts: string[] = []
    let kind: FileItem['source']['kind'] | undefined
    for (const source of sources) {
        const entry = Object.entries(source)[0]
        if (!entry) continue
        const [key, detail] = entry
        let part: string
        let partKind: FileItem['source']['kind']
        if (key === 'crafted') {
            partKind = 'crafted'
            const name = PROFESSION[Number(detail.profession)]
            part = name ? `Crafted: ${name}` : 'Crafted'
        } else if (key === 'drop') {
            partKind = 'drop'
            part = detail.otherName ? `Drop: ${detail.otherName}` : 'Drop'
        } else if (key === 'quest') {
            partKind = 'quest'
            part = detail.name ? `Quest: ${detail.name}` : 'Quest'
        } else if (key === 'soldBy') {
            partKind = 'vendor'
            part = detail.npcName ? `Vendor: ${detail.npcName}` : 'Vendor'
        } else if (key === 'rep') {
            partKind = 'reputation'
            part = 'Reputation'
        } else if (key === 'pvp') {
            partKind = 'pvp'
            part = 'PvP'
        } else continue
        kind ??= partKind
        if (!parts.includes(part)) parts.push(part)
    }
    if (!kind) return { kind: 'unknown', text: 'Source unknown' }
    return { kind, text: parts.join('; ') }
}

/** An item as the results file has it. */
export function fileItem(db: ItemDb, id: number): FileItem {
    const item = db.items.get(id)
    const seen = db.firstSeen.get(id)
    const forever = id >= FOREVER_IDS || (seen ?? 0) > CLASSIC_IMPORT
    return {
        item_id: id,
        name: item?.name || `Item ${id}`,
        quality: QUALITY[Math.min(item?.quality ?? 1, 5)] ?? 'common',
        item_level: item?.scalingOptions?.['0']?.ilvl ?? null,
        required_level: requiredLevel(item),
        source: sourceOf(item),
        data: forever ? 'forever' : 'classic',
    }
}

/** Worn now, or in the bags: the character has it. */
export function owned(character: Character, id: number): boolean {
    return (
        Object.values(character.gear).some((piece) => piece?.id === id) ||
        Object.values(character.unknown_gear ?? {}).some(
            (piece) => piece.id === id
        ) ||
        (character.bags ?? []).some((item) => item.id === id)
    )
}

/**
 * The "left out" rule: an item with no source and required level 1 or
 * less is suspect, unless worn or in the bags. It's never planned.
 */
export function leftOutReason(
    character: Character,
    item: DbItem
): string | null {
    if (owned(character, item.id)) return null
    if ((item.sources ?? []).length > 0 || requiredLevel(item) > 1) return null
    return 'it has no source and needs level 1'
}

export function isTwoHander(item: DbItem | undefined): boolean {
    return item?.handType === HAND.twoHand
}

/** The slots a Shaman of the character's level can wear an item in. */
export function slotsFor(character: Character, item: DbItem): Slot[] {
    if (item.classAllowlist && !item.classAllowlist.includes(SHAMAN)) return []
    const armor = item.armorType ?? 0
    const armorOk =
        armor === 0 ||
        armor === ARMOR.cloth ||
        armor === ARMOR.leather ||
        (armor === ARMOR.mail && character.level >= 40)
    switch (item.type) {
        case ITEM_TYPE.head:
            return armorOk ? ['head'] : []
        case ITEM_TYPE.neck:
            return ['neck']
        case ITEM_TYPE.shoulder:
            return armorOk ? ['shoulder'] : []
        case ITEM_TYPE.back:
            return ['back']
        case ITEM_TYPE.chest:
            return armorOk ? ['chest'] : []
        case ITEM_TYPE.wrist:
            return armorOk ? ['wrist'] : []
        case ITEM_TYPE.hands:
            return armorOk ? ['hands'] : []
        case ITEM_TYPE.waist:
            return armorOk ? ['waist'] : []
        case ITEM_TYPE.legs:
            return armorOk ? ['legs'] : []
        case ITEM_TYPE.feet:
            return armorOk ? ['feet'] : []
        case ITEM_TYPE.finger:
            return ['finger_1', 'finger_2']
        case ITEM_TYPE.trinket:
            return ['trinket_1', 'trinket_2']
        case ITEM_TYPE.ranged:
            return item.rangedWeaponType === TOTEM ? ['relic'] : []
        case ITEM_TYPE.weapon:
            return weaponSlots(item)
        default:
            return []
    }
}

function weaponSlots(item: DbItem): Slot[] {
    const type = item.weaponType ?? 0
    if (item.handType === HAND.offHand || type === WEAPON.shield)
        return type === WEAPON.shield || type === WEAPON.offHand
            ? ['off_hand']
            : []
    const oneHand = [WEAPON.axe, WEAPON.dagger, WEAPON.fist, WEAPON.mace]
    if (item.handType === HAND.twoHand)
        return [WEAPON.axe, WEAPON.mace, WEAPON.staff].includes(type)
            ? ['main_hand']
            : []
    if (item.handType === HAND.mainHand || item.handType === HAND.oneHand)
        return oneHand.includes(type) ? ['main_hand'] : []
    return []
}

/**
 * The weighed stats an item carries, with the proto `Stat` index each
 * reads, in that index's order. Weapon DPS is the item's own, below.
 */
const ITEM_STATS = STAT_STEPS.filter((step) => step.index >= 0).sort(
    (a, b) => a.index - b.index
)

/** The item types of the armor and jewellery equip locations the game names. */
const EQUIP_LOC_TYPE: Readonly<Record<string, number>> = {
    INVTYPE_HEAD: ITEM_TYPE.head,
    INVTYPE_NECK: ITEM_TYPE.neck,
    INVTYPE_SHOULDER: ITEM_TYPE.shoulder,
    INVTYPE_CLOAK: ITEM_TYPE.back,
    INVTYPE_CHEST: ITEM_TYPE.chest,
    INVTYPE_ROBE: ITEM_TYPE.chest,
    INVTYPE_WRIST: ITEM_TYPE.wrist,
    INVTYPE_HAND: ITEM_TYPE.hands,
    INVTYPE_WAIST: ITEM_TYPE.waist,
    INVTYPE_LEGS: ITEM_TYPE.legs,
    INVTYPE_FEET: ITEM_TYPE.feet,
    INVTYPE_FINGER: ITEM_TYPE.finger,
    INVTYPE_TRINKET: ITEM_TYPE.trinket,
}

/**
 * An item the sim lacks as the item data would have it, from what the game
 * exported: its stats, and its type when it's armor or jewellery.
 */
export function gameDbItem(item: {
    id: number
    name: string
    stats: Readonly<GameStats>
    equip_loc?: string
    required_level?: number
    quality?: number
}): DbItem {
    const stats: Record<string, number> = {}
    gameStats(item.stats).forEach((amount, index) => {
        if (amount !== 0) stats[String(index)] = amount
    })
    const loc = item.equip_loc ?? ''
    const type = Object.hasOwn(EQUIP_LOC_TYPE, loc)
        ? EQUIP_LOC_TYPE[loc]
        : undefined
    return {
        id: item.id,
        name: item.name,
        ...(type !== undefined ? { type } : {}),
        ...(item.required_level !== undefined
            ? { reqLvl: item.required_level }
            : {}),
        ...(item.quality !== undefined ? { quality: item.quality } : {}),
        scalingOptions: { '0': { stats } },
    }
}

/** An item the sim lacks as the results file has it: the game's words. */
export function gameFileItem(item: {
    id: number
    name: string
    quality?: number
    item_level?: number
    required_level?: number
}): FileItem {
    return {
        item_id: item.id,
        name: item.name || `Item ${item.id}`,
        quality:
            QUALITY[Math.max(0, Math.min(item.quality ?? 1, 5))] ?? 'common',
        item_level: item.item_level || null,
        required_level: Math.max(1, item.required_level || 1),
        source: {
            kind: 'unknown',
            text: "Not in the sim's item data: stats as the game showed them",
        },
        data: 'forever',
    }
}

/** An item's EP: its stats (and weapon DPS) by the given EP per stat. */
export function itemEp(
    item: DbItem | undefined,
    ep: ReadonlyMap<Stat, number>
): number {
    if (!item) return 0
    const scaling = item.scalingOptions?.['0']
    let total = 0
    for (const { stat, index } of ITEM_STATS)
        total += (scaling?.stats?.[String(index)] ?? 0) * (ep.get(stat) ?? 0)
    if (item.type === ITEM_TYPE.weapon)
        total += (scaling?.unroundedDps ?? 0) * (ep.get('weapon_dps') ?? 0)
    return total
}
