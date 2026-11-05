/**
 * Turbo's Shaman Cooldown Manager layout, as a save-format version 5 table.
 *
 * Field numbers follow `CooldownViewerSettingsDataStoreSerialization.lua`:
 *   [1] save-format version (5)
 *   [2] previously active layout per class/spec tag (empty for an export)
 *   [3] class/spec tag -> layoutID -> layout
 *         layout[1] ordered cooldownIDs (one list; each category keeps
 *                   the relative order of its own IDs)
 *         layout[2] category -> cooldownIDs moved into it
 *         layout[3] cooldownID -> alerts, each { type, event, payload }
 *   [4] layoutID -> layout name (required: the reader indexes it). The
 *       import dialog blanks it and asks the player for a name anyway.
 */

import type { LuaValue } from './codec'
import {
    Category,
    findCooldown,
    SHAMAN_COOLDOWNS,
    type CooldownEntry,
} from './shaman-cooldowns'

export const SAVE_FORMAT_VERSION = 5
/** classID 7 (Shaman) * 10 + spec index 1; Forever has one spec per class. */
export const SHAMAN_SPEC_TAG = 71
export const LAYOUT_ID = 1
export const LAYOUT_NAME = 'Turbo'

/** Enum.CooldownViewerAlertType / AlertEventType / CooldownViewerSound. */
export const Alert = {
    TypeSound: 1,
    EventOnAuraRemoved: 6,
    SoundTextToSpeech: 0,
} as const

const { Essential, Utility, TrackedBuff } = Category

export const ESSENTIAL = [
    findCooldown('Stormstrike', Essential),
    findCooldown('Earth Shock', Essential),
    findCooldown('Chain Lightning', Essential),
]

/** Earth, Fire, Water, Air. */
export const UTILITY = [
    findCooldown('Strength of Earth Totem', Essential),
    findCooldown('Searing Totem', Essential),
    findCooldown('Mana Spring Totem', Utility),
    findCooldown('Windfury Totem', Essential),
]

export const TRACKED_BUFFS = [
    findCooldown('Lightning Shield', TrackedBuff),
    findCooldown('Flurry', TrackedBuff),
]

export const LIGHTNING_SHIELD_BUFF = TRACKED_BUFFS[0]

const hiddenCategoryFor = (entry: CooldownEntry) =>
    entry.category === TrackedBuff
        ? Category.HiddenPassive
        : Category.HiddenActive

/** The category every Shaman entry ends up in. */
export const finalCategory = (entry: CooldownEntry): number => {
    if (ESSENTIAL.includes(entry)) return Essential
    if (UTILITY.includes(entry)) return Utility
    if (TRACKED_BUFFS.includes(entry)) return TrackedBuff
    return hiddenCategoryFor(entry)
}

/** Build the layout's data table (see the field map at the top). */
export const buildTurboLayout = (): LuaValue => {
    const chosen = [...ESSENTIAL, ...UTILITY, ...TRACKED_BUFFS]
    const order = [
        ...chosen,
        ...SHAMAN_COOLDOWNS.filter((e) => !chosen.includes(e)),
    ].map((e) => e.cooldownID)

    // Every entry gets an explicit category, so a hotfix to a default
    // can't move one of ours. The game accepts default-valued entries.
    const categories = new Map<number, LuaValue>()
    SHAMAN_COOLDOWNS.forEach((entry) => {
        const category = finalCategory(entry)
        const ids = (categories.get(category) as number[]) ?? []
        categories.set(category, [...ids, entry.cooldownID])
    })

    const alerts = new Map<number, LuaValue>([
        [
            LIGHTNING_SHIELD_BUFF.cooldownID,
            [
                [
                    Alert.TypeSound,
                    Alert.EventOnAuraRemoved,
                    Alert.SoundTextToSpeech,
                ],
            ],
        ],
    ])

    const layout: LuaValue = [order, categories, alerts]

    return [
        SAVE_FORMAT_VERSION,
        [],
        new Map([[SHAMAN_SPEC_TAG, new Map([[LAYOUT_ID, layout]])]]),
        new Map([[LAYOUT_ID, LAYOUT_NAME]]),
    ]
}
