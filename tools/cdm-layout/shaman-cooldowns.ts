/**
 * The Shaman Cooldown Manager entries on WoW: Forever, build 1.60.1.70790.
 *
 * From the client's `CooldownSetSpell` table (rows with CooldownSetID 5263,
 * the set for Shaman spec 1489 in `CooldownSet`), names from `SpellName`.
 * A cooldownID is the `CooldownSetSpell` row ID. `category` is the row's
 * default category; `hiddenByDefault` is flag 2 (HideByDefault), which puts
 * the entry in "Not Displayed". Group-buff rows (category 4) are left out:
 * they are not part of the ordered cooldown list. See README.md for sources.
 */

export const Category = {
    Essential: 0,
    Utility: 1,
    TrackedBuff: 2,
    TrackedBar: 3,
    /** "Not Displayed" for spells (Essential/Utility). */
    HiddenActive: -1,
    /** "Not Displayed" for auras (Tracked Buffs/Bars). */
    HiddenPassive: -2,
} as const

export type CooldownEntry = {
    cooldownID: number
    spellID: number
    name: string
    category: 0 | 1 | 2
    hiddenByDefault: boolean
}

const row = (
    cooldownID: number,
    spellID: number,
    name: string,
    category: 0 | 1 | 2,
    flags: number
): CooldownEntry => ({
    cooldownID,
    spellID,
    name,
    category,
    hiddenByDefault: (flags & 2) !== 0,
})

/** In the table's OrderIndex order, which is the game's default order. */
export const SHAMAN_COOLDOWNS: readonly CooldownEntry[] = [
    // Essential (category 0)
    row(200367, 3599, 'Searing Totem', 0, 4),
    row(200315, 17364, 'Stormstrike', 0, 1),
    row(200322, 421, 'Chain Lightning', 0, 4),
    row(200324, 8050, 'Flame Shock', 0, 4),
    row(200323, 8042, 'Earth Shock', 0, 4),
    row(200325, 8056, 'Frost Shock', 0, 6),
    row(200520, 408341, 'Fire Nova', 0, 4),
    row(200330, 408490, 'Lava Burst', 0, 4),
    row(200332, 408521, 'Riptide', 0, 6),
    row(200336, 16188, "Nature's Swiftness", 0, 2),
    row(200478, 8190, 'Magma Totem', 0, 6),
    row(200480, 8227, 'Flametongue Totem', 0, 6),
    row(200482, 8835, 'Grace of Air Totem', 0, 6),
    row(200484, 8075, 'Strength of Earth Totem', 0, 6),
    row(200485, 8512, 'Windfury Totem', 0, 6),
    row(200312, 425336, 'Rage of the Farseer', 0, 0),
    row(200504, 16166, 'Lightning Mastery', 0, 0),
    // Utility (category 1)
    row(200502, 324, 'Lightning Shield', 1, 6),
    row(200334, 52127, '', 1, 0), // SpellName has no row for 52127
    row(200501, 437009, 'Totemic Call', 1, 0),
    row(200365, 5730, 'Stoneclaw Totem', 1, 6),
    row(200479, 8184, 'Fire Resistance Totem', 1, 6),
    row(200376, 8170, 'Disease Cleansing Totem', 1, 2),
    row(200481, 8181, 'Frost Resistance Totem', 1, 6),
    row(200483, 8177, 'Grounding Totem', 1, 2),
    row(200486, 15107, 'Windwall Totem', 1, 6),
    row(200487, 8166, 'Poison Cleansing Totem', 1, 2),
    row(200488, 5678, 'Mana Spring Totem', 1, 4),
    row(200489, 8143, 'Tremor Totem', 1, 0),
    row(200490, 2484, 'Earthbind Totem', 1, 0),
    row(200506, 16190, 'Mana Tide Totem', 1, 4),
    // Tracked Buffs (category 2)
    row(200503, 30160, 'Elemental Devastation', 2, 0),
    row(200521, 1222988, 'Earthbound', 2, 2),
    row(200505, 17364, 'Stormstrike', 2, 2),
    row(200264, 2645, 'Ghost Wolf', 2, 6),
    row(200311, 324, 'Lightning Shield', 2, 6),
    row(200313, 425336, 'Rage of the Farseer', 2, 2),
    row(200320, 1223031, 'Improved Stormstrike', 2, 0),
    row(200321, 16256, 'Flurry', 2, 0),
    row(200328, 8056, 'Frost Shock', 2, 6),
    row(200329, 8050, 'Flame Shock', 2, 6),
    row(200331, 16164, 'Elemental Focus', 2, 0),
    row(200333, 408521, 'Riptide', 2, 6),
    row(200335, 408510, 'Water Shield', 2, 2),
    row(200337, 16188, "Nature's Swiftness", 2, 2),
    row(200338, 16176, 'Ancestral Healing', 2, 2),
    row(200491, 5678, 'Mana Spring Totem', 2, 6),
    row(200492, 15107, 'Windwall Totem', 2, 6),
    row(200493, 8177, 'Grounding Totem', 2, 2),
    row(200494, 8181, 'Frost Resistance Totem', 2, 6),
    row(200495, 8184, 'Fire Resistance Totem', 2, 6),
    row(200496, 5730, 'Stoneclaw Totem', 2, 6),
    row(200497, 8512, 'Windfury Totem', 2, 6),
    row(200498, 8075, 'Strength of Earth Totem', 2, 6),
    row(200499, 8835, 'Grace of Air Totem', 2, 6),
    row(200500, 8227, 'Flametongue Totem', 2, 6),
    row(200507, 16190, 'Mana Tide Totem', 2, 6),
]

/** Look up the one entry with this name in a default category. */
export const findCooldown = (name: string, category: 0 | 1 | 2) => {
    const hits = SHAMAN_COOLDOWNS.filter(
        (e) => e.name === name && e.category === category
    )
    if (hits.length !== 1)
        throw new Error(`Expected one "${name}" in category ${category}`)
    return hits[0]
}
