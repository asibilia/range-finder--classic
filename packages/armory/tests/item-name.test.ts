/** The names and short sources the page shows (the mockup's wording). */
import { describe, expect, test } from 'bun:test'

import { itemName, shortSource } from '../src/item-name'

describe('itemName', () => {
    test("the runner's `Item <id>` placeholder reads Unnamed <slot word> (<id>)", () => {
        const item = { item_id: 279848, name: 'Item 279848' }
        expect(itemName(item, 'back', 'Shaman')).toBe('Unnamed cloak (279848)')
        expect(
            itemName({ item_id: 6748, name: 'Item 6748' }, 'finger_2', 'Shaman')
        ).toBe('Unnamed ring (6748)')
        expect(
            itemName({ item_id: 1, name: 'Item 1' }, 'relic', 'Shaman')
        ).toBe('Unnamed totem (1)')
        expect(
            itemName({ item_id: 1, name: 'Item 1' }, 'relic', 'Warrior')
        ).toBe('Unnamed relic (1)')
    })

    test('a real name, or an `Item` name with another id, is kept', () => {
        expect(
            itemName({ item_id: 5, name: 'Ferine Leggings' }, 'legs', 'Shaman')
        ).toBe('Ferine Leggings')
        expect(itemName({ item_id: 5, name: 'Item 6' }, 'legs', 'Shaman')).toBe(
            'Item 6'
        )
    })
})

describe('shortSource', () => {
    test('drops the kind from each part', () => {
        expect(shortSource('Crafted: Leatherworking')).toBe('Leatherworking')
        expect(shortSource('Drop: Blind Hunter, Razorfen Kraul')).toBe(
            'Blind Hunter, Razorfen Kraul'
        )
        expect(shortSource('Crafted: Leatherworking; Drop: World Drop')).toBe(
            'Leatherworking; World Drop'
        )
        expect(shortSource('Reputation reward; Vendor: Rutherford Twing')).toBe(
            'Reputation reward; Vendor: Rutherford Twing'
        )
    })
})
