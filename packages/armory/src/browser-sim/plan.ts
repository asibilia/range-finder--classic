/**
 * The gear lists and the max damage plan, ranked from given stat weights.
 * Armor and jewellery: each alternative's EP minus the worn item's.
 * Weapons: simmed on the long dungeon fight and ranked by DPS gain. For each
 * slot the plan takes the best alternative the character can wear now (not
 * the item `finger_1` or `trinket_1` already took), else the worn item.
 */
import { SLOTS, type ResultsFile, type Slot, type Stat } from '../results-file'
import type { Character, Gear } from './character'
import {
    fileItem,
    isTwoHander,
    itemEp,
    leftOutReason,
    requiredLevel,
    slotsFor,
    type DbItem,
    type ItemDb,
} from './gear'

/** Alternatives kept per slot. */
const ALTERNATIVES = 8
/** Alternatives may need up to this many levels more than the character. */
const SOON_LEVELS = 5
/** Weapons simmed: the best by EP. */
export const WEAPON_SIMS = 6

type Alternative = ResultsFile['slots'][number]['alternatives'][number]
type LeftOut = NonNullable<ResultsFile['left_out_items']>[number]

export type GearPlan = {
    slots: ResultsFile['slots']
    plan: ResultsFile['plans'][number]
    /** The plan's gear as the sim takes it. */
    gear: Gear
    bag_upgrades: ResultsFile['bag_upgrades']
    left_out_items: LeftOut[]
}

const round = (value: number) => Math.round(value * 10) / 10

/** The items a character could put in each slot, by the left-out rule. */
export function candidates(character: Character, db: ItemDb) {
    const bySlot = new Map<Slot, DbItem[]>(SLOTS.map((slot) => [slot, []]))
    const leftOut = new Map<Slot, DbItem[]>(SLOTS.map((slot) => [slot, []]))
    const worn = (slot: Slot) => character.gear[slot]?.id
    for (const item of db.items.values()) {
        if (requiredLevel(item) > character.level + SOON_LEVELS) continue
        for (const slot of slotsFor(character, item)) {
            if (item.id === worn(slot)) continue
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

/** The weapons worth simming: the best by EP, never a left-out one. */
export function weaponsToSim(
    character: Character,
    db: ItemDb,
    ep: ReadonlyMap<Stat, number>
): number[] {
    const { bySlot } = candidates(character, db)
    return bySlot
        .get('main_hand')!
        .map((item) => ({ item, gain: itemEp(item, ep) }))
        .sort(byGain)
        .slice(0, WEAPON_SIMS)
        .map(({ item }) => item.id)
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
    weaponGains: ReadonlyMap<number, number>
): GearPlan {
    const { bySlot, leftOut } = candidates(character, db)
    const wornEp = (slot: Slot) =>
        itemEp(db.items.get(character.gear[slot]?.id ?? -1), ep)
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
        const wornId = character.gear[slot]?.id ?? null
        chosen.set(slot, pick ? pick.item.id : wornId === taken ? null : wornId)
        const weapon = slot === 'main_hand'
        const alternatives: Alternative[] = kept.map(({ item, gain }) => ({
            item: fileItem(db, item.id),
            gain_ep: weapon ? null : round(gain),
            gain_dps: weapon ? round(gain) : null,
        }))
        return {
            slot,
            worn: wornId === null ? null : fileItem(db, wornId),
            ...(slot === 'main_hand' && character.imbue
                ? { imbue: spaced(character.imbue) }
                : {}),
            alternatives,
        }
    })
    if (isTwoHander(db.items.get(chosen.get('main_hand') ?? -1)))
        chosen.set('off_hand', null)

    const gear: Gear = {}
    for (const slot of SLOTS) {
        const id = chosen.get(slot) ?? null
        const worn = character.gear[slot]
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

/** Bag items that beat what's worn, by EP, in the best slot for each. */
function bagUpgrades(
    character: Character,
    db: ItemDb,
    ep: ReadonlyMap<Stat, number>
): ResultsFile['bag_upgrades'] {
    const upgrades: ResultsFile['bag_upgrades'] = []
    for (const id of new Set(character.bags ?? [])) {
        const item = db.items.get(id)
        if (!item || requiredLevel(item) > character.level) continue
        let best: { slot: Slot; gain: number } | null = null
        for (const slot of slotsFor(character, item)) {
            if (slot === 'main_hand' || slot === 'off_hand') continue
            const worn = db.items.get(character.gear[slot]?.id ?? -1)
            const gain = itemEp(item, ep) - itemEp(worn, ep)
            if (gain > 0 && (!best || gain > best.gain)) best = { slot, gain }
        }
        if (best)
            upgrades.push({
                slot: best.slot,
                item: fileItem(db, id),
                gain_ep: round(best.gain),
            })
    }
    return upgrades.sort((a, b) => b.gain_ep - a.gain_ep)
}

/** `WindfuryWeapon` as the game writes it: `Windfury Weapon`. */
function spaced(name: string): string {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** Gear by slot, for comparing two sets. */
export function sameGear(a: Gear, b: Gear): boolean {
    return SLOTS.every(
        (slot) => (a[slot]?.id ?? null) === (b[slot]?.id ?? null)
    )
}
