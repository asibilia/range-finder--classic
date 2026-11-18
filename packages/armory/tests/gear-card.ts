/**
 * The gear card in a test: results files built from the sample's slots and
 * plans, and what the card shows. Import it right after `./dom`.
 */
import './dom'

import { screen, within } from '@testing-library/react'

import type { Json, User } from './open-app'

/** An item, as the results file has it. */
export type Item = {
    item_id: number
    name: string
    quality: string
    item_level: number | null
    required_level: number
    source: { kind: string; text: string }
    data: string
}

/** An alternative in a slot. */
export type Alt = {
    item: Item
    gain_ep: number | null
    gain_dps: number | null
}

/** A slot's entry. */
export type Entry = { slot: string; worn: Item | null; alternatives: Alt[] }

/** A plan, its gear only. */
export type PlanJson = { gear: Record<string, number | null> }

/** Text with every space taken out, so `↓ 16.7` and `↓16.7` compare equal. */
export function squeeze(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, '')
}

/** The gear card. Throws when there is none. */
export function gearPane(): HTMLElement {
    const pane = document.querySelector<HTMLElement>('[data-slot="gear-pane"]')
    if (!pane) throw new Error('no gear card')
    return pane
}

/**
 * The innermost element in the gear card whose text holds `text` (spaces
 * aside) and that isn't hidden, or null.
 */
export function lineWith(text: string): HTMLElement | null {
    const wanted = squeeze(text)
    const holds = (element: Element) =>
        squeeze(element.textContent).includes(wanted)
    const found = [...gearPane().querySelectorAll<HTMLElement>('*')].filter(
        (element) =>
            holds(element) &&
            ![...element.children].some(holds) &&
            !element.closest('[hidden]')
    )
    return found[0] ?? null
}

/** Whether the gear card shows a line holding `text`. */
export function shows(text: string): boolean {
    return lineWith(text) !== null
}

/** The button named `name`; a short error when there is none. */
export function button(name: string): HTMLElement {
    const found = screen.queryByRole('button', { name })
    if (!found) throw new Error(`no button named ${name}`)
    return found
}

/** Whether a button named `name` is on the page. */
export function hasButton(name: string | RegExp): boolean {
    return screen.queryByRole('button', { name }) !== null
}

/** Chooses `BIS` in the gear card's `View` switch. */
export async function showBis(user: User): Promise<void> {
    const group = within(gearPane()).getByRole('group', { name: 'View' })
    await user.click(within(group).getByRole('radio', { name: 'BIS' }))
}

/** A file's slot entries. */
export function entries(file: Json): Entry[] {
    return file.slots as Entry[]
}

/** A file's entry for the slot `name` (`head`). Throws when there is none. */
export function entry(file: Json, name: string): Entry {
    const found = entries(file).find((candidate) => candidate.slot === name)
    if (!found) throw new Error(`the file has no ${name} slot`)
    return found
}

/** The alternative `itemId` in the slot `slotName`. Throws when there is none. */
export function alternative(file: Json, slotName: string, itemId: number): Alt {
    const found = entry(file, slotName).alternatives.find(
        (candidate) => candidate.item.item_id === itemId
    )
    if (!found) throw new Error(`no alternative ${itemId} in ${slotName}`)
    return found
}

/** The default plan (Max damage, the highest damage mix). */
export function maxDamage(file: Json): PlanJson {
    const plan = (file.plans as PlanJson[])[0]
    if (!plan) throw new Error('the file has no plans')
    return plan
}

/** Makes the default plan keep what you wear in every slot (no gaps). */
export function keepAllWorn(file: Json): void {
    const gear = maxDamage(file).gear
    for (const slotName of Object.keys(gear)) gear[slotName] = null
    for (const each of entries(file))
        gear[each.slot] = each.worn?.item_id ?? null
}

/** Puts an alternative in the plan for `slotName`, changed by `change`. */
export function planGap(
    file: Json,
    slotName: string,
    itemId: number,
    change: (alt: Alt) => void
): void {
    maxDamage(file).gear[slotName] = itemId
    change(alternative(file, slotName, itemId))
}

/** A made-up item of unknown source. */
export function item(itemId: number, name: string): Item {
    return {
        item_id: itemId,
        name,
        quality: 'uncommon',
        item_level: null,
        required_level: 25,
        source: { kind: 'unknown', text: 'Source unknown' },
        data: 'classic',
    }
}

/** The plan's Legs item becomes `Hunting Pants`, from a vendor, `gainEp` EP. */
export function huntingPants(file: Json, gainEp = 5): void {
    planGap(file, 'legs', 6690, (alt) => {
        alt.item.name = 'Hunting Pants'
        alt.item.source = {
            kind: 'vendor',
            text: 'Vendor: Harggan, The Hinterlands',
        }
        alt.gain_ep = gainEp
        alt.gain_dps = null
    })
}
