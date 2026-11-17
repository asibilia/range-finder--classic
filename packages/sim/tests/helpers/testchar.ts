/**
 * Testchar as a character (the runner's `Character`), until the owner's
 * reference character replaces it (#83). `testchar-l30.json` holds a
 * profile, requests and outputs: gear, talents and imbue come from its
 * dungeon-long request, level and known spells from its profile, and the
 * sheet from `pool.sheet`, so the sheet gate passes by construction.
 */
import { join } from 'node:path'

import {
    BONUS_STAT_COUNT,
    sheetFromSim,
    type LevelProfile,
    type RaidSimRequest,
    type Sheet,
    type SimPool,
} from '../../src'

const FIXTURE = join(import.meta.dir, '../../fixtures/testchar-l30.json')

/** The item slots in the sim's order, by the results file's names. */
const SLOTS = [
    'head',
    'neck',
    'shoulder',
    'back',
    'chest',
    'wrist',
    'hands',
    'waist',
    'legs',
    'feet',
    'finger_1',
    'finger_2',
    'trinket_1',
    'trinket_2',
    'main_hand',
    'off_hand',
    'relic',
] as const

type Slot = (typeof SLOTS)[number]
type GearPiece = { id: number; enchant?: number; randomSuffix?: number }
/** One bag item, as the armory's `Character` keeps it. */
type BagItem = {
    id: number
    name: string
    quality: number
    item_level: number
    required_level: number
    equip_loc: string
    stats: Record<string, number>
}

export type TestcharCharacter = {
    name: string
    level: number
    race: string
    class: string
    talents: string
    gear: Partial<Record<Slot, GearPiece | null>>
    /** No worn item the sim lacks: 40 zeros. */
    bonus_stats: number[]
    bags: BagItem[]
    imbue: string | null
    known_spells: number[]
    /** No weapon-skill rows: 0, as the export reader gives it. */
    weapon_skill_deficit: number
    /** No `manaRegen` in the fixture: 0, as the export reader gives it. */
    ooc_mana_regen: number
    profile: LevelProfile
    sheet: Sheet
    export_saved_at: string
    game_build: string
}

type Fixture = {
    profile: LevelProfile
    fights: { fight_id: string; request: RaidSimRequest }[]
}

type Player = {
    name: string
    equipment: { items: Partial<GearPiece>[] }
    talentsString: string
    enhancementShaman?: { options?: { classOptions?: { imbueMh?: string } } }
}

/** Testchar, with the sheet the sim gives its gear. */
export async function testcharCharacter(
    pool: SimPool
): Promise<TestcharCharacter> {
    const fixture = (await Bun.file(FIXTURE).json()) as Fixture
    const fight = fixture.fights.find((f) => f.fight_id === 'dungeon-long')
    if (!fight) throw new Error('testchar-l30.json has no dungeon-long fight')
    const raid = fight.request.raid as {
        parties: { players: Player[] }[]
    }
    const player = raid.parties[0]!.players[0]!
    const gear: TestcharCharacter['gear'] = {}
    SLOTS.forEach((slot, i) => {
        const item = player.equipment.items[i]
        gear[slot] = item?.id ? (item as GearPiece) : null
    })
    const profile = fixture.profile
    const sheet = sheetFromSim(await pool.sheet(fight.request, profile))
    return {
        name: player.name,
        level: profile.level,
        race: profile.race.replace(/^Race/, ''),
        class: profile.class.replace(/^Class/, ''),
        talents: player.talentsString,
        gear,
        bonus_stats: new Array<number>(BONUS_STAT_COUNT).fill(0),
        bags: [],
        imbue: player.enhancementShaman?.options?.classOptions?.imbueMh ?? null,
        known_spells: profile.knownSpells ?? [],
        weapon_skill_deficit: 0,
        ooc_mana_regen: 0,
        profile,
        sheet,
        export_saved_at: '2026-11-15T00:00:00Z',
        game_build: 'testchar',
    }
}
