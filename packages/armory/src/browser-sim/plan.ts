/**
 * The gear lists and the max damage plan, ranked from given stat weights.
 * Armor and jewellery: each alternative's EP minus the worn item's.
 * Weapons: simmed on the long dungeon fight and ranked by DPS gain. For each
 * slot the plan takes the best alternative the character can wear now (not
 * the item `finger_1` or `trinket_1` already took), else the worn item.
 */
import { SLOTS, type ResultsFile, type Slot, type Stat } from '../results-file'
import { wornGear, type Character, type Gear } from './character'
import { DEFAULT_FIGHT } from './scenarios'
import type { StatWeights } from './weights'
import {
    canWearWeapon,
    fileItem,
    gameDbItem,
    gameFileItem,
    isTwoHander,
    itemEp,
    leftOutReason,
    requiredLevel,
    slotsFor,
    type DbItem,
    type FileItem,
    type ItemDb,
} from './gear'

/** Alternatives kept per slot. */
const ALTERNATIVES = 8
/** Alternatives may need up to this many levels more than the character. */
const SOON_LEVELS = 5
/** Weapons simmed: the best by the runner's pre-rank (`weaponList`'s `simTop`). */
export const WEAPON_SIMS = 12
/** Weapon candidates may need up to this many levels more (`weaponList`'s `horizon`). */
const WEAPON_LEVELS = 3

type Alternative = ResultsFile['slots'][number]['alternatives'][number]
type LeftOut = NonNullable<ResultsFile['left_out_items']>[number]

export type GearPlan = {
    slots: ResultsFile['slots']
    plan: ResultsFile['plans'][number]
    /** The plan's gear, by `Gear`'s rule: a kept item the sim lacks is in it. */
    gear: Gear
    bag_upgrades: ResultsFile['bag_upgrades']
    left_out_items: LeftOut[]
}

const round = (value: number) => Math.round(value * 10) / 10

/** A weapon's simmed DPS gain in EP, using only its own fight's AP weight. */
export function weaponGainEp(
    gainDps: number | null | undefined,
    weights: StatWeights | undefined,
    fightId: string
): number | null {
    if (gainDps === null || gainDps === undefined || !Number.isFinite(gainDps))
        return null
    const ap = weights
        ?.find((fight) => fight.fight_id === fightId)
        ?.weights.find((weight) => weight.stat === 'attack_power')?.ep
    if (ap === undefined || !Number.isFinite(ap) || ap <= 0) return null
    return Math.round((gainDps / ap) * 100) / 100
}

/** The items a character could put in each slot, by the left-out rule. */
export function candidates(character: Character, db: ItemDb) {
    const bySlot = new Map<Slot, DbItem[]>(SLOTS.map((slot) => [slot, []]))
    const leftOut = new Map<Slot, DbItem[]>(SLOTS.map((slot) => [slot, []]))
    // An item already worn, in any slot, is never an alternative: the ring
    // worn in finger_2 must not move to finger_1 and leave finger_2 empty.
    const worn = new Set(
        SLOTS.map((slot) => character.gear[slot]?.id).filter(
            (id): id is number => id !== undefined
        )
    )
    for (const item of db.items.values()) {
        if (requiredLevel(item) > character.level + SOON_LEVELS) continue
        if (worn.has(item.id)) continue
        for (const slot of slotsFor(character, item)) {
            const into = leftOutReason(character, item) ? leftOut : bySlot
            into.get(slot)!.push(item)
        }
    }
    return { bySlot, leftOut }
}

const byGain = (
    a: { gain: number; item: DbItem },
    b: { gain: number; item: DbItem }
) => b.gain - a.gain || a.item.id - b.item.id

/**
 * The weapons worth simming (the runner's `weaponList`): two-handers of a
 * type in `skills` the character can wear at level + 3 (`canWearWeapon`),
 * by their EP (stats by `epByStat`, weapon DPS by `weaponDpsEp`), the best
 * 12, best first.
 */
export function weaponCandidates(
    character: Character,
    items: Iterable<DbItem>,
    epByStat: ReadonlyMap<Stat, number>,
    weaponDpsEp: number,
    skills: ReadonlySet<number>
): DbItem[] {
    const ep = new Map(epByStat).set('weapon_dps', weaponDpsEp)
    const maxLevel = character.level + WEAPON_LEVELS
    return [...items]
        .filter((item) => canWearWeapon(character, item, maxLevel, skills))
        .map((item) => ({ item, gain: itemEp(item, ep) }))
        .sort(byGain)
        .slice(0, WEAPON_SIMS)
        .map(({ item }) => item)
}

/** The weapon gear for an alternative main hand: a two-hander drops the off hand. */
export function withMainHand(gear: Gear, db: ItemDb, id: number): Gear {
    const swapped: Gear = { ...gear, main_hand: { id } }
    if (isTwoHander(db.items.get(id))) swapped.off_hand = null
    return swapped
}

/**
 * The slots, the plan, bag upgrades and the left-out items. `weaponGains`
 * holds the DPS gain of each simmed weapon over the worn one.
 */
export function planMaxDamage(
    character: Character,
    db: ItemDb,
    ep: ReadonlyMap<Stat, number>,
    weaponGains: ReadonlyMap<number, number>,
    weights?: StatWeights
): GearPlan {
    const { bySlot, leftOut } = candidates(character, db)
    const wornEp = (slot: Slot) => itemEp(wornItem(character, db, slot), ep)
    const wornMain = db.items.get(character.gear.main_hand?.id ?? -1)

    const leftOutItems = new Map<number, LeftOut>()
    const ranked = new Map<Slot, { gain: number; item: DbItem }[]>()
    for (const slot of SLOTS) {
        let list: { gain: number; item: DbItem }[]
        if (slot === 'main_hand') {
            list = bySlot
                .get(slot)!
                .filter((item) => weaponGains.has(item.id))
                .map((item) => ({ item, gain: weaponGains.get(item.id)! }))
        } else if (slot === 'off_hand' && isTwoHander(wornMain)) {
            list = []
        } else {
            list = bySlot.get(slot)!.map((item) => ({
                item,
                gain: itemEp(item, ep) - wornEp(slot),
            }))
        }
        ranked.set(slot, list.filter((entry) => entry.gain > 0).sort(byGain))
        for (const item of leftOut.get(slot)!) {
            const gain = itemEp(item, ep) - wornEp(slot)
            if (gain > 0 && !leftOutItems.has(item.id))
                leftOutItems.set(item.id, {
                    item_id: item.id,
                    name: item.name || `Item ${item.id}`,
                    reason: leftOutReason(character, item)!,
                })
        }
    }

    const wearable = (item: DbItem) => requiredLevel(item) <= character.level
    const wearing = wornGear(character)
    const chosen = new Map<Slot, number | null>()
    const slots: ResultsFile['slots'] = SLOTS.map((slot) => {
        const list = ranked.get(slot)!
        const taken =
            slot === 'finger_2'
                ? chosen.get('finger_1')
                : slot === 'trinket_2'
                  ? chosen.get('trinket_1')
                  : undefined
        const pick = list.find(
            (entry) => wearable(entry.item) && entry.item.id !== taken
        )
        const kept = list.slice(0, ALTERNATIVES)
        if (pick && !kept.includes(pick)) kept.push(pick)
        const wornId = wearing[slot]?.id ?? null
        chosen.set(slot, pick ? pick.item.id : wornId === taken ? null : wornId)
        const weapon = slot === 'main_hand'
        const alternatives: Alternative[] = kept.map(({ item, gain }) => ({
            item: fileItem(db, item.id),
            gain_ep: weapon
                ? weaponGainEp(gain, weights, DEFAULT_FIGHT)
                : round(gain),
            gain_dps: weapon ? round(gain) : null,
        }))
        const piece = character.gear[slot]
        const unknown = character.unknown_gear?.[slot]
        let worn: FileItem | null = null
        if (piece) worn = fileItem(db, piece.id)
        else if (unknown) worn = gameFileItem(unknown)
        return {
            slot,
            worn,
            ...(slot === 'main_hand' && character.imbue
                ? { imbue: spaced(character.imbue) }
                : {}),
            alternatives,
        }
    })
    if (isTwoHander(db.items.get(chosen.get('main_hand') ?? -1)))
        chosen.set('off_hand', null)

    // A kept item the sim lacks stays in its slot, as `{ id }`: the request
    // adds its game stats (the `Gear` rule).
    const gear: Gear = {}
    for (const slot of SLOTS) {
        const id = chosen.get(slot) ?? null
        const worn = wearing[slot]
        gear[slot] = id === null ? null : worn?.id === id ? worn : { id }
    }

    return {
        slots,
        plan: {
            plan_id: 'max-damage',
            label: 'Max damage',
            mix: { damage: 100, survival: 0, healing: 0, utility: 0 },
            gear: Object.fromEntries(
                SLOTS.map((slot) => [slot, chosen.get(slot) ?? null])
            ) as ResultsFile['plans'][number]['gear'],
        },
        gear,
        bag_upgrades: bagUpgrades(character, db, ep),
        left_out_items: [...leftOutItems.values()],
    }
}

/**
 * The item worn in a slot, as the item data has it: a worn item the sim
 * lacks is read from its game stats (the runner's `wornEP`).
 */
function wornItem(
    character: Character,
    db: ItemDb,
    slot: Slot
): DbItem | undefined {
    const piece = character.gear[slot]
    if (piece) return db.items.get(piece.id)
    const unknown = character.unknown_gear?.[slot]
    return unknown ? gameDbItem(unknown) : undefined
}

/**
 * Bag items that beat what's worn, by EP, in the best slot for each. A bag
 * item the sim lacks is compared by its game stats.
 */
function bagUpgrades(
    character: Character,
    db: ItemDb,
    ep: ReadonlyMap<Stat, number>
): ResultsFile['bag_upgrades'] {
    const upgrades: ResultsFile['bag_upgrades'] = []
    const seen = new Set<number>()
    for (const bag of character.bags ?? []) {
        if (seen.has(bag.id)) continue
        seen.add(bag.id)
        const known = db.items.get(bag.id)
        const item = known ?? gameDbItem(bag)
        if (requiredLevel(item) > character.level) continue
        let best: { slot: Slot; gain: number } | null = null
        for (const slot of slotsFor(character, item)) {
            if (slot === 'main_hand' || slot === 'off_hand') continue
            const worn = wornItem(character, db, slot)
            const gain = itemEp(item, ep) - itemEp(worn, ep)
            if (gain > 0 && (!best || gain > best.gain)) best = { slot, gain }
        }
        if (best)
            upgrades.push({
                slot: best.slot,
                item: known ? fileItem(db, bag.id) : gameFileItem(bag),
                gain_ep: round(best.gain),
            })
    }
    return upgrades.sort((a, b) => b.gain_ep - a.gain_ep)
}

/** `WindfuryWeapon` as the game writes it: `Windfury Weapon`. */
function spaced(name: string): string {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** True when two sets hold the same item in every slot (absent is empty). */
export function sameGear(a: Gear, b: Gear): boolean {
    return SLOTS.every(
        (slot) => (a[slot]?.id ?? null) === (b[slot]?.id ?? null)
    )
}
