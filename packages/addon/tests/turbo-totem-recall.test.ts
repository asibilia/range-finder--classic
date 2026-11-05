/**
 * The Recall reminder under the fake game: Totemic Recall's icon, glowing in
 * the reminder row, whenever totem mana is about to go to waste.
 *
 * It shows while either is true:
 *
 * 1. A totem is in its last `totemWarningSeconds` (5 by default), the same
 *    moment its icon starts pulsing. A totem whose duration Turbo hasn't
 *    learned yet (its first drop of the session, mid-fight) doesn't count.
 * 2. The player is 20 yards or more from the drop spot of every totem down.
 *    Totems land at the player's feet, so the drop spot is where the player
 *    stood as the totem dropped.
 *
 * The game, as these tests script it (see turbo-totems.test.ts for the
 * totem readings and events, and turbo-imbue-reminders.test.ts for the
 * reminder row):
 *
 * - Reading `playerPosition` (`UnitPosition("player")`): x, y, z and the map
 *   ID, in yards in world coordinates. Nothing inside instances; the tests
 *   also script it secret, and on another map.
 * - `spellKnown(36936)`: whether the player knows Totemic Recall.
 *   `spellTexture(36936)`: its icon (file ID). Learning a spell fires
 *   `SPELLS_CHANGED`.
 * - A Totemic Recall cast fires `UNIT_SPELLCAST_SUCCEEDED` and then
 *   `PLAYER_TOTEM_UPDATE` for each slot, now empty.
 * - The Recall reminder is a visible texture inside `TurboReminders` set to
 *   Totemic Recall's icon.
 * - Only totem timers and reminders are on; every other v1 module is off.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
    loadTurbo,
    type FakeGame,
    type FrameState,
} from './fake-game/fake-game'
import { scriptShamanOnForever } from './fake-game/idle-shaman.test'

let world: World | undefined

afterEach(() => {
    world?.g.close()
    world = undefined
})

const TOTEMIC_RECALL = 36936
/** Totemic Recall's icon, as the game reports it. */
const RECALL_ICON = 310733
const REMINDERS = 'TurboReminders'

/** The game's slot number for each element. */
const SLOT = { Fire: 1, Earth: 2, Water: 3, Air: 4 } as const
type Element = keyof typeof SLOT

const SPELL = {
    stoneskin: 8071,
    searing: 3599,
    healingStream: 5394,
    windfury: 8512,
}

/** The map the player is on, unless a test moves them to another. */
const MAP = 1415

/** Every v1 module but totem timers and reminders, turned off. */
const OTHER_MODULES = [
    'rangeFinder',
    'swingTimer',
    'weaponImbue',
    'lightningShield',
    'keyCooldowns',
    'manaBar',
    'maelstromWeapon',
]

/** The clock moves in quarter seconds, so out-of-combat time left stays true. */
const STEP = 0.25

type Totem = {
    spellID: number
    duration: number
    droppedAt: number
    label: string
}

/** The fake game plus the totems the test has put down. */
type World = {
    g: FakeGame
    clock: number
    combat: boolean
    slots: Map<number, Totem>
    drops: number
}

type StartOptions = {
    /** Whether the player knows Totemic Recall. */
    knowsRecall?: boolean
    /** Saved changes for the Shaman class. */
    settings?: Record<string, unknown>
    /** Saved module switches, over "only totem timers and reminders on". */
    modules?: Record<string, boolean>
    /** Totems already down at login (a /reload): game slot, spell ID, duration. */
    totems?: [number, number, number][]
}

function elementOf(slot: number): Element {
    const found = (Object.keys(SLOT) as Element[]).find(
        (el) => SLOT[el] === slot
    )
    if (!found) throw new Error(`no element for game slot ${slot}`)
    return found
}

/** Scripts one game slot's readings from the world. */
function scriptSlot(w: World, slot: number) {
    const g = w.g
    const t = w.slots.get(slot)
    if (!t) {
        g.setReadingFor('totemTimeLeft', [slot], 0)
        g.setReadingFor('totemDuration', [slot], undefined)
        g.setReadingFor('totemInfo', [slot], true, '', 0, 0, undefined)
        return
    }
    g.setReadingFor('totemDuration', [slot], g.secret(t.label, 'userdata'))
    if (w.combat) {
        g.setReadingFor('totemTimeLeft', [slot], g.secret(`${t.label} left`))
        g.setReadingFor(
            'totemInfo',
            [slot],
            g.secret(`${t.label} have`, 'boolean'),
            g.secret(`${t.label} name`, 'string'),
            g.secret(`${t.label} start`),
            g.secret(`${t.label} duration`),
            g.secret(`${t.label} icon`)
        )
        return
    }
    g.setReadingFor(
        'totemTimeLeft',
        [slot],
        Math.max(0, t.droppedAt + t.duration - w.clock)
    )
    g.setReadingFor(
        'totemInfo',
        [slot],
        true,
        `Totem ${t.spellID}`,
        t.droppedAt,
        t.duration,
        1000000 + t.spellID
    )
}

function scriptTotems(w: World) {
    w.g.setReading('totemDurationSupported', true)
    for (let slot = 1; slot <= 4; slot++) scriptSlot(w, slot)
}

/** Loads Turbo as a Shaman on Forever, standing at 0, 0 out of combat. */
function start(options: StartOptions = {}): World {
    const modules = {
        ...Object.fromEntries(OTHER_MODULES.map((id) => [id, false])),
        ...options.modules,
    }
    const g = loadTurbo({
        savedVariables: {
            TurboDB: {
                schemaVersion: 1,
                classes: { SHAMAN: { ...options.settings, modules } },
            },
        },
    })
    scriptShamanOnForever(g)
    g.setReading('resting', false)
    g.setReading('mounted', false)
    g.setReading('onTaxi', false)
    g.setReading('spellKnown', false)
    g.setReadingFor('spellKnown', [TOTEMIC_RECALL], options.knowsRecall ?? true)
    g.setReadingFor('spellTexture', [TOTEMIC_RECALL], RECALL_ICON)
    const w: World = { g, clock: 0, combat: false, slots: new Map(), drops: 0 }
    for (const [slot, spellID, duration] of options.totems ?? []) {
        w.drops++
        w.slots.set(slot, {
            spellID,
            duration,
            droppedAt: 0,
            label: `${elementOf(slot)} totem #${w.drops}`,
        })
    }
    scriptTotems(w)
    standAt(w, 0, 0)
    return w
}

/** The login events, in the order WoW fires them. */
function login(w: World) {
    w.g.fire('ADDON_LOADED', 'Turbo')
    w.g.fire('PLAYER_LOGIN')
    w.g.fire('PLAYER_ENTERING_WORLD', true, false)
}

function enterCombat(w: World) {
    w.combat = true
    w.g.setReading('inCombat', true)
    scriptTotems(w)
    w.g.fire('PLAYER_REGEN_DISABLED')
}

/** Moves the clock on, keeping out-of-combat time left current. */
function pass(w: World, seconds: number) {
    const steps = Math.round(seconds / STEP)
    if (Math.abs(steps * STEP - seconds) > 1e-9) {
        throw new Error(`pass() takes quarter seconds, not ${seconds}`)
    }
    for (let i = 0; i < steps; i++) {
        w.g.advance(STEP)
        w.clock += STEP
        if (!w.combat) {
            for (const slot of w.slots.keys()) scriptSlot(w, slot)
        }
    }
}

/** Casts a totem into a game slot, where the player stands. */
function drop(w: World, slot: number, spellID: number, duration: number) {
    w.drops++
    const label = `${elementOf(slot)} totem #${w.drops}`
    w.slots.set(slot, { spellID, duration, droppedAt: w.clock, label })
    scriptTotems(w)
    w.g.fire('UNIT_SPELLCAST_SUCCEEDED', 'player', `Cast-${w.drops}`, spellID)
    w.g.fire('PLAYER_TOTEM_UPDATE', slot)
}

/** A totem leaves its game slot: it ran out or died. */
function remove(w: World, slot: number) {
    w.slots.delete(slot)
    scriptTotems(w)
    w.g.fire('PLAYER_TOTEM_UPDATE', slot)
}

/** The player casts Totemic Recall: every totem leaves at once. */
function recall(w: World) {
    const down = [...w.slots.keys()]
    w.slots.clear()
    scriptTotems(w)
    w.g.fire(
        'UNIT_SPELLCAST_SUCCEEDED',
        'player',
        'Cast-recall',
        TOTEMIC_RECALL
    )
    for (const slot of down) w.g.fire('PLAYER_TOTEM_UPDATE', slot)
}

/** Drops a totem out of combat and lets it run out, so Turbo learns it. */
function learn(w: World, slot: number, spellID: number, duration: number) {
    drop(w, slot, spellID, duration)
    pass(w, duration)
    remove(w, slot)
}

// Where the player is ----------------------------------------------------------

function standAt(w: World, x: number, y: number, map = MAP) {
    w.g.setReading('playerPosition', x, y, 0, map)
}

/** Inside an instance the game gives no position. */
function noPosition(w: World) {
    w.g.setReading('playerPosition')
}

function secretPosition(w: World) {
    const g = w.g
    g.setReading(
        'playerPosition',
        g.secret('x'),
        g.secret('y'),
        g.secret('z'),
        g.secret('map')
    )
}

/** How many times Turbo has read the player's position. */
function positionReads(w: World): number {
    return w.g.reads().filter((r) => r.name === 'playerPosition').length
}

// What the player sees ---------------------------------------------------------

/** Whether a frame and every parent up to the screen are shown and opaque. */
function visible(g: FakeGame, id: string): boolean {
    let current: string | null = id
    for (let depth = 0; current && depth < 20; depth++) {
        const state = g.frame(current)
        if (!state) return false
        if (state.shown !== true || !(Number(state.alpha) > 0)) return false
        current = state.parent as string | null
    }
    return true
}

function inside(g: FakeGame, id: string, ancestor: string): boolean {
    let current: string | null = id
    for (let depth = 0; current && depth < 20; depth++) {
        if (current === ancestor) return true
        current = (g.frame(current)?.parent as string | null) ?? null
    }
    return false
}

function first(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value
}

function visibleReminderTextures(g: FakeGame): FrameState[] {
    return g
        .frames()
        .filter(
            (id) =>
                inside(g, id, REMINDERS) &&
                g.frame(id)?.type === 'Texture' &&
                visible(g, id)
        )
        .map((id) => g.frame(id)!)
}

/** Whether Totemic Recall's icon is on screen in the reminder row. */
function recallShown(w: World): boolean {
    return visibleReminderTextures(w.g).some(
        (t) => first(t.Texture) === RECALL_ICON
    )
}

/** Whether anything at all shows in the reminder row. */
function anyReminderShown(w: World): boolean {
    return visible(w.g, REMINDERS)
}

function reminderGlows(w: World): boolean {
    return visibleReminderTextures(w.g).some(
        (t) => first(t.BlendMode) === 'ADD'
    )
}

/** Whether the slot's pulse animation is playing. */
function pulsing(w: World, el: Element): boolean {
    return (
        w.g
            .calls({ frame: `TurboTotem${el}Pulse` })
            .filter((c) => c.method === 'Play' || c.method === 'Stop')
            .at(-1)?.method === 'Play'
    )
}

// The tests --------------------------------------------------------------------

describe('a totem about to run out', () => {
    test("Totemic Recall's icon glows in the reminder row from the moment a totem's last 5 seconds start, as its icon starts pulsing", () => {
        world = start()
        login(world)

        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 24.5)
        expect(recallShown(world)).toBe(false)
        expect(pulsing(world, 'Fire')).toBe(false)

        pass(world, 1)
        expect(recallShown(world)).toBe(true)
        expect(reminderGlows(world)).toBe(true)
        expect(pulsing(world, 'Fire')).toBe(true)
    })

    test("it shows at the pulse's own moment, not at the next once-a-second position check", () => {
        world = start()
        login(world)
        // The first totem starts the checks on whole seconds; the second
        // one's last 5 seconds start half a second after one of them.
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        pass(world, 0.5)
        drop(world, SLOT.Fire, SPELL.searing, 30)

        pass(world, 24.75)
        expect(recallShown(world)).toBe(false)

        pass(world, 0.25)
        expect(recallShown(world)).toBe(true)
    })

    test('it hides when that totem runs out', () => {
        world = start()
        login(world)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(recallShown(world)).toBe(true)

        pass(world, 4)
        remove(world, SLOT.Fire)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides when that totem dies in its last seconds', () => {
        world = start()
        login(world)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(recallShown(world)).toBe(true)

        remove(world, SLOT.Fire)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides when the player casts Totemic Recall', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(recallShown(world)).toBe(true)

        recall(world)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides when the player drops a fresh totem over the one in its last seconds', () => {
        world = start()
        login(world)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(recallShown(world)).toBe(true)

        drop(world, SLOT.Fire, SPELL.searing, 30)

        expect(recallShown(world)).toBe(false)
    })

    test('another totem with time to spare does not keep it up once the ending one is gone', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(recallShown(world)).toBe(true)

        pass(world, 4)
        remove(world, SLOT.Fire)
        pass(world, 2)

        expect(recallShown(world)).toBe(false)
    })

    test('in combat it shows 5 seconds before the end, timed from the cast with the duration learned out of combat', () => {
        world = start()
        login(world)
        learn(world, SLOT.Earth, SPELL.stoneskin, 30)
        enterCombat(world)

        drop(world, SLOT.Earth, SPELL.stoneskin, 30)
        pass(world, 24.5)
        expect(recallShown(world)).toBe(false)

        pass(world, 1)
        expect(recallShown(world)).toBe(true)
    })

    test("a totem whose duration isn't learned yet (its first drop, mid-fight) never shows it", () => {
        world = start()
        login(world)
        enterCombat(world)

        drop(world, SLOT.Earth, SPELL.stoneskin, 30)
        for (const at of [25.5, 27, 29.75]) {
            pass(world, at - world.clock)
            expect(recallShown(world)).toBe(false)
        }
    })

    test('it follows the pulse option: saved at 8 seconds, it shows 8 seconds before the end', () => {
        world = start({ settings: { totemWarningSeconds: 8 } })
        login(world)

        drop(world, SLOT.Water, SPELL.healingStream, 30)
        pass(world, 21.5)
        expect(recallShown(world)).toBe(false)

        pass(world, 1)
        expect(recallShown(world)).toBe(true)
    })
})

describe('the player left the totems behind', () => {
    test('it shows once the player is 20 yards or more from the drop spot, measured straight across', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)

        // 12 across and 15.9 up is just under 20 yards away.
        standAt(world, 12, 15.9)
        pass(world, 1)
        expect(recallShown(world)).toBe(false)

        // 12 across and 16 up is 20 yards away.
        standAt(world, 12, 16)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)
    })

    test('it waits until the player is out of reach of every totem down', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 30, 0)
        drop(world, SLOT.Fire, SPELL.searing, 120)

        pass(world, 1)
        expect(recallShown(world)).toBe(false)

        // 10 yards from Earth, 20 from Fire: Earth is still within reach.
        standAt(world, 10, 0)
        pass(world, 1)
        expect(recallShown(world)).toBe(false)

        standAt(world, 60, 0)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)
    })

    test('it hides once the player walks back within reach of any one totem', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 30, 0)
        drop(world, SLOT.Fire, SPELL.searing, 120)
        standAt(world, 60, 0)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        standAt(world, 45, 0)
        pass(world, 1)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides right away when the player drops the totem again where they stand', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        drop(world, SLOT.Earth, SPELL.stoneskin, 120)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides when the player casts Totemic Recall', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        drop(world, SLOT.Air, SPELL.windfury, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        recall(world)

        expect(recallShown(world)).toBe(false)
    })

    test('it hides when the last totem ends', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        remove(world, SLOT.Earth)

        expect(recallShown(world)).toBe(false)
    })

    test("a totem already down at login (after a /reload) has no known drop spot, so walking away doesn't show it, though its last seconds still do", () => {
        world = start({ totems: [[SLOT.Fire, SPELL.searing, 60]] })
        login(world)

        standAt(world, 100, 100)
        pass(world, 10)
        expect(recallShown(world)).toBe(false)

        pass(world, 46)
        expect(recallShown(world)).toBe(true)
    })
})

describe('when the position is missing, secret or on another map', () => {
    test('inside an instance, with no position at all, walking away never shows it and nothing breaks', () => {
        world = start()
        login(world)
        noPosition(world)

        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        pass(world, 10)

        expect(recallShown(world)).toBe(false)
    })

    test('a position that goes missing counts as unknown, not far: the reminder hides', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        noPosition(world)
        pass(world, 1)

        expect(recallShown(world)).toBe(false)
    })

    test('a secret position is never read: walking away shows nothing, without an error', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        secretPosition(world)
        pass(world, 3)

        expect(recallShown(world)).toBe(false)
    })

    test('a totem dropped while the position was secret has no known spot', () => {
        world = start()
        login(world)
        secretPosition(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)

        standAt(world, 50, 50)
        pass(world, 3)

        expect(recallShown(world)).toBe(false)
    })

    test('a position on another map than the drop spot never counts as far', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)

        standAt(world, 500, 500, MAP + 1)
        pass(world, 3)

        expect(recallShown(world)).toBe(false)
    })

    test("with no position at all, a totem's last seconds still show it", () => {
        world = start()
        login(world)
        noPosition(world)

        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 25.5)

        expect(recallShown(world)).toBe(true)
    })
})

describe('the once-a-second position check', () => {
    test('with no totem down, the position is never read', () => {
        world = start()
        login(world)

        pass(world, 10)

        expect(positionReads(world)).toBe(0)
    })

    test('while a totem is down, the position is read once a second', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        const before = positionReads(world)

        pass(world, 5)

        expect(positionReads(world) - before).toBe(5)
    })

    test('once the last totem leaves, the position is never read again', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        drop(world, SLOT.Water, SPELL.healingStream, 120)
        pass(world, 2)
        remove(world, SLOT.Earth)
        const oneLeft = positionReads(world)
        pass(world, 2)
        expect(positionReads(world)).toBeGreaterThan(oneLeft)

        remove(world, SLOT.Water)
        const noneLeft = positionReads(world)
        pass(world, 10)

        expect(positionReads(world)).toBe(noneLeft)
    })
})

describe('only for a player who knows Totemic Recall', () => {
    test("a player who doesn't know it never sees it, and Turbo never reads their position", () => {
        world = start({ knowsRecall: false })
        login(world)

        drop(world, SLOT.Fire, SPELL.searing, 30)
        standAt(world, 50, 50)
        pass(world, 26)

        expect(anyReminderShown(world)).toBe(false)
        expect(positionReads(world)).toBe(0)
    })

    test('learning it while a totem is in its last seconds shows it right away, without a reload', () => {
        world = start({ knowsRecall: false })
        login(world)
        drop(world, SLOT.Fire, SPELL.searing, 30)
        pass(world, 26)
        expect(anyReminderShown(world)).toBe(false)

        world.g.setReadingFor('spellKnown', [TOTEMIC_RECALL], true)
        world.g.fire('SPELLS_CHANGED')

        expect(recallShown(world)).toBe(true)
    })
})

describe('turning totem timers off', () => {
    test('with totem timers off, it never shows, and the position is never read', () => {
        world = start({ modules: { totemTimers: false } })
        login(world)

        drop(world, SLOT.Fire, SPELL.searing, 30)
        standAt(world, 50, 50)
        pass(world, 26)

        expect(anyReminderShown(world)).toBe(false)
        expect(positionReads(world)).toBe(0)
    })

    test('turning totem timers off while it shows hides it and stops the position check', () => {
        world = start()
        login(world)
        drop(world, SLOT.Earth, SPELL.stoneskin, 120)
        standAt(world, 50, 50)
        pass(world, 1)
        expect(recallShown(world)).toBe(true)

        world.g.run('ns.modules.disable("totemTimers")')
        expect(recallShown(world)).toBe(false)

        const reads = positionReads(world)
        pass(world, 5)
        expect(recallShown(world)).toBe(false)
        expect(positionReads(world)).toBe(reads)
    })
})
