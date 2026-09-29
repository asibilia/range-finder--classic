/**
 * Totem timers under the fake game: four slots in the totem row (Earth, Fire,
 * Water, Air), time left from the game's own Cooldown countdown, a pulse near
 * the end, a red flash on early death, the self-timed fallback, and Call of
 * the Elements and Totemic Recall.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - The game's totem slots are Fire 1, Earth 2, Water 3, Air 4.
 * - Readings, per game slot (`safe.read(name, slot)`):
 *   - `totemTimeLeft` (`GetTotemTimeLeft`): a plain 0 when the slot is empty;
 *     plain seconds out of combat; a secret number in combat.
 *   - `totemDuration` (`GetTotemDuration`): the slot's duration object (an
 *     opaque secret stand-in, to be handed straight to a Cooldown), or nil.
 *   - `totemInfo` (`GetTotemInfo`): haveTotem, name, startTime, duration,
 *     icon. Plain out of combat, secret in combat. Its have-totem flag says
 *     true even for an empty slot, as the game's does, so it must never be
 *     used to decide whether a slot is empty.
 * - `totemDurationSupported` (no arguments): whether the game can show a
 *   duration object on a Cooldown. When it's false the slots run on the
 *   fallback: numbers self-timed from the cast, with each totem's duration
 *   learned out of combat per spell ID. There the duration-object rule for
 *   empty slots doesn't apply (the game gives none).
 * - A drop fires `UNIT_SPELLCAST_SUCCEEDED` ('player', castGUID, spellID) and
 *   then `PLAYER_TOTEM_UPDATE` (slot), at the same moment. A totem that runs
 *   out, dies or is recalled fires `PLAYER_TOTEM_UPDATE` (slot) with the slot
 *   empty.
 *
 * What the HUD shows, per element (`Earth`, `Fire`, `Water`, `Air`):
 *
 * - `TurboTotem<Element>`: the slot frame, inside the `TurboCardTotems` row.
 * - `TurboTotem<Element>Icon`: its icon texture. An empty slot shows the
 *   element's own icon, faded; a filled slot shows at full alpha.
 * - A Cooldown inside the slot gets the duration object
 *   (`SetCooldownFromDurationObject`) with countdown numbers turned on
 *   (`SetHideCountdownNumbers(false)`), and is cleared when the slot empties.
 * - Fallback numbers show inside the slot: a FontString's text, or a
 *   Cooldown given plain `SetCooldown(start, duration)` values.
 * - `TurboTotem<Element>Pulse`: an AnimationGroup, playing while the icon
 *   pulses (the last `totemWarningSeconds` seconds, 5 by default).
 * - `TurboTotem<Element>Flash`: a red texture, hidden except for the short
 *   flash when a totem dies early. It hides again on the safe layer's clock.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
    loadTurbo,
    type FakeGame,
    type FrameState,
    type WidgetCall,
} from './fake-game/fake-game'

let world: World | undefined

afterEach(() => {
    world?.g.close()
    world = undefined
})

const ORDER = ['Earth', 'Fire', 'Water', 'Air'] as const
type Element = (typeof ORDER)[number]

/** The game's slot number for each element. */
const GAME_SLOT: Record<Element, number> = {
    Fire: 1,
    Earth: 2,
    Water: 3,
    Air: 4,
}

const SPELL = {
    stoneskin: 8071,
    searing: 3599,
    magma: 8190,
    healingStream: 5394,
    windfury: 8512,
    callOfTheElements: 66842,
    totemicRecall: 36936,
}

/** One totem spell per element. */
const SPELLS: Record<Element, number> = {
    Earth: SPELL.stoneskin,
    Fire: SPELL.searing,
    Water: SPELL.healingStream,
    Air: SPELL.windfury,
}

/** Every v1 module but totem timers, turned off so only it reads the game. */
const OTHER_MODULES = [
    'rangeFinder',
    'swingTimer',
    'weaponImbue',
    'lightningShield',
    'keyCooldowns',
    'manaBar',
    'maelstromWeapon',
    'reminders',
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
    supported: boolean
    slots: Map<number, Totem>
    drops: number
}

type StartOptions = {
    /** Whether the game can show a duration object (else the fallback). */
    supported?: boolean
    /** Whether the player logs in (reloads) in combat. */
    combat?: boolean
    /** Saved changes for the Shaman class. */
    settings?: Record<string, unknown>
    /** Totems already down at login: game slot, spell ID, duration. */
    totems?: [number, number, number][]
}

function elementOf(slot: number): Element {
    const found = ORDER.find((el) => GAME_SLOT[el] === slot)
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
        // The game's have-totem flag says true for an empty slot too.
        g.setReadingFor('totemInfo', [slot], true, '', 0, 0, undefined)
        return
    }
    const duration = w.supported ? g.secret(t.label, 'userdata') : undefined
    g.setReadingFor('totemDuration', [slot], duration)
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

function script(w: World) {
    w.g.setReading('totemDurationSupported', w.supported)
    for (let slot = 1; slot <= 4; slot++) scriptSlot(w, slot)
}

/** Loads Turbo as a Shaman on Forever, with only totem timers on. */
function start(options: StartOptions = {}): World {
    const modules = Object.fromEntries(OTHER_MODULES.map((id) => [id, false]))
    const g = loadTurbo({
        savedVariables: {
            TurboDB: {
                schemaVersion: 1,
                classes: { SHAMAN: { ...options.settings, modules } },
            },
        },
    })
    g.setReading('interface', 16001)
    g.setReading('flavor', 'forever')
    g.setReading('playerClass', 'Shaman', 'SHAMAN', 7)
    g.setReading('inCombat', options.combat ?? false)
    g.setReading('targetAttackable', false)
    const w: World = {
        g,
        clock: 0,
        combat: options.combat ?? false,
        supported: options.supported ?? true,
        slots: new Map(),
        drops: 0,
    }
    for (const [slot, spellID, duration] of options.totems ?? []) {
        w.drops++
        w.slots.set(slot, {
            spellID,
            duration,
            droppedAt: 0,
            label: `${elementOf(slot)} totem #${w.drops}`,
        })
    }
    script(w)
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
    script(w)
    w.g.fire('PLAYER_REGEN_DISABLED')
}

function leaveCombat(w: World) {
    w.combat = false
    w.g.setReading('inCombat', false)
    script(w)
    w.g.fire('PLAYER_REGEN_ENABLED')
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

/** Casts a totem into a game slot. Returns its duration object's label. */
function drop(
    w: World,
    slot: number,
    spellID: number,
    duration: number
): string {
    w.drops++
    const label = `${elementOf(slot)} totem #${w.drops}`
    w.slots.set(slot, { spellID, duration, droppedAt: w.clock, label })
    script(w)
    w.g.fire('UNIT_SPELLCAST_SUCCEEDED', 'player', `Cast-${w.drops}`, spellID)
    w.g.fire('PLAYER_TOTEM_UPDATE', slot)
    return label
}

/** A totem leaves its game slot: it ran out, died or was recalled. */
function remove(w: World, slot: number) {
    w.slots.delete(slot)
    script(w)
    w.g.fire('PLAYER_TOTEM_UPDATE', slot)
}

/** Drops a totem out of combat and lets it run out, so Turbo learns it. */
function learn(w: World, slot: number, spellID: number, duration: number) {
    drop(w, slot, spellID, duration)
    pass(w, duration)
    remove(w, slot)
}

function setting(w: World, key: string): unknown {
    return w.g.run('return ns.settings.get(...)', key)[0]
}

// What the HUD shows --------------------------------------------------------

const slotId = (el: Element) => `TurboTotem${el}`
const iconId = (el: Element) => `TurboTotem${el}Icon`
const pulseId = (el: Element) => `TurboTotem${el}Pulse`
const flashId = (el: Element) => `TurboTotem${el}Flash`

function frameOf(g: FakeGame, id: string): FrameState {
    const state = g.frame(id)
    if (!state) throw new Error(`no frame ${id}`)
    return state
}

/** Whether a frame sits inside another, through its parents. */
function isInside(g: FakeGame, id: string, ancestor: string): boolean {
    let parent = g.frame(id)?.parent
    for (let depth = 0; depth < 20 && typeof parent === 'string'; depth++) {
        if (parent === ancestor) return true
        parent = g.frame(parent)?.parent
    }
    return false
}

/** Every frame of one type inside another, in creation order. */
function inside(g: FakeGame, ancestor: string, type: string): string[] {
    return g
        .frames()
        .filter((id) => g.frame(id)?.type === type && isInside(g, id, ancestor))
}

/** The icon's alpha as the slot shows it: its own times its parents'. */
function iconAlpha(g: FakeGame, el: Element): number {
    let alpha = 1
    let id: string | null = iconId(el)
    for (let depth = 0; depth < 20 && id; depth++) {
        const state = frameOf(g, id)
        if (state.shown === false) return 0
        alpha *= Number(state.alpha ?? 1)
        if (id === slotId(el)) return alpha
        id = typeof state.parent === 'string' ? state.parent : null
    }
    throw new Error(`${iconId(el)} is not inside ${slotId(el)}`)
}

function iconImage(g: FakeGame, el: Element): unknown {
    const state = frameOf(g, iconId(el))
    return state.Texture ?? state.Atlas
}

/** An empty slot: its element's icon, faded. */
function looksEmpty(g: FakeGame, el: Element): boolean {
    const image = iconImage(g, el)
    return image !== undefined && image !== null && iconAlpha(g, el) < 0.75
}

/** A filled slot: the icon at full alpha. */
function looksFilled(g: FakeGame, el: Element): boolean {
    return iconAlpha(g, el) >= 0.99
}

const COOLDOWN_SETTERS = [
    'SetCooldownFromDurationObject',
    'SetCooldown',
    'SetCooldownDuration',
    'Clear',
]

function lastCall(
    g: FakeGame,
    frame: string,
    methods: string[]
): WidgetCall | undefined {
    return g
        .calls({ frame })
        .filter((c) => methods.includes(c.method))
        .at(-1)
}

type Countdown = { object: unknown; numbers: boolean }

/**
 * The duration object a Cooldown in the slot shows now, and whether that
 * Cooldown's own countdown numbers are on. Undefined when none shows one.
 */
function countdown(g: FakeGame, el: Element): Countdown | undefined {
    for (const id of inside(g, slotId(el), 'Cooldown')) {
        if (g.frame(id)?.shown === false) continue
        const set = lastCall(g, id, COOLDOWN_SETTERS)
        if (
            set?.method !== 'SetCooldownFromDurationObject' ||
            set.args[0] === null ||
            set.args[0] === undefined
        ) {
            continue
        }
        const hide = lastCall(g, id, ['SetHideCountdownNumbers'])
        return { object: set.args[0], numbers: hide?.args[0] === false }
    }
    return undefined
}

/** The seconds left the fallback shows in the slot, if any. */
function fallbackSecondsLeft(w: World, el: Element): number | undefined {
    const g = w.g
    for (const id of inside(g, slotId(el), 'FontString')) {
        const state = frameOf(g, id)
        if (state.shown === false) continue
        const text = state.Text
        if (typeof text !== 'string' && typeof text !== 'number') continue
        const match = String(text).match(/\d+(\.\d+)?/)
        if (match) return Number(match[0])
    }
    for (const id of inside(g, slotId(el), 'Cooldown')) {
        if (g.frame(id)?.shown === false) continue
        const set = lastCall(g, id, COOLDOWN_SETTERS)
        if (set?.method !== 'SetCooldown') continue
        const [startedAt, duration] = set.args as number[]
        const left = Number(startedAt) + Number(duration) - w.clock
        if (left > 0) return left
    }
    return undefined
}

/** Whether the slot's pulse animation is playing. */
function pulsing(g: FakeGame, el: Element): boolean {
    return lastCall(g, pulseId(el), ['Play', 'Stop'])?.method === 'Play'
}

/** Whether the slot's red flash is on screen. */
function flashing(g: FakeGame, el: Element): boolean {
    return g.frame(flashId(el))?.shown === true
}

/** Whether the flash turned on at any point since a mark in the changes. */
function flashedSince(g: FakeGame, el: Element, mark: number): boolean {
    return g
        .changes()
        .slice(mark)
        .some(
            (c) =>
                c.frame === flashId(el) && c.key === 'shown' && c.value === true
        )
}

/** The flash's colour, from its last colour call. */
function flashIsRed(g: FakeGame, el: Element): boolean {
    const call = lastCall(g, flashId(el), ['SetColorTexture', 'SetVertexColor'])
    if (!call) return false
    const [r, gr, b] = call.args.map(Number)
    return r! >= 0.7 && gr! <= 0.35 && b! <= 0.35
}

// Layout ----------------------------------------------------------------------

type Anchor = {
    point: string
    relativeTo: string | null
    relativePoint: string
    x: number
}

/** Reads a recorded `SetPoint` call in any of its WoW forms. */
function anchor(args: unknown[]): Anchor {
    const [point, ...rest] = args as [string, ...unknown[]]
    if (rest.length === 0) {
        return { point, relativeTo: null, relativePoint: point, x: 0 }
    }
    if (typeof rest[0] === 'number') {
        return { point, relativeTo: null, relativePoint: point, x: rest[0] }
    }
    const rel = rest[0] as { $frame?: string } | string | null
    const relativeTo = typeof rel === 'string' ? rel : (rel?.$frame ?? null)
    if (typeof rest[1] === 'number') {
        return { point, relativeTo, relativePoint: point, x: rest[1] }
    }
    return {
        point,
        relativeTo,
        relativePoint: typeof rest[1] === 'string' ? rest[1] : point,
        x: Number(rest[2] ?? 0),
    }
}

function side(point: string): 'left' | 'right' | 'center' {
    if (point.endsWith('LEFT')) return 'left'
    if (point.endsWith('RIGHT')) return 'right'
    return 'center'
}

type Span = { left: number; right: number }

/** A frame's left and right inside the card, whose left edge is 0. */
function span(g: FakeGame, id: string, depth = 0): Span {
    if (depth > 10) throw new Error(`anchor loop at ${id}`)
    const state = frameOf(g, id)
    if (id === 'TurboCard') return { left: 0, right: Number(state.width) }

    let left: number | undefined
    let right: number | undefined
    let center: number | undefined
    for (const args of state.points) {
        const a = anchor(args)
        const relId = a.relativeTo ?? (state.parent as string | null)
        if (!relId) throw new Error(`${id} is not anchored inside the card`)
        const rel = span(g, relId, depth + 1)
        const relSide = side(a.relativePoint)
        const relX =
            relSide === 'left'
                ? rel.left
                : relSide === 'right'
                  ? rel.right
                  : (rel.left + rel.right) / 2
        const x = relX + a.x
        if (side(a.point) === 'left') left = x
        else if (side(a.point) === 'right') right = x
        else center = x
    }
    const width = Number(state.width)
    if (left !== undefined && right !== undefined) return { left, right }
    if (!(width > 0)) throw new Error(`${id} has no width`)
    if (left !== undefined) return { left, right: left + width }
    if (right !== undefined) return { left: right - width, right }
    if (center !== undefined) {
        return { left: center - width / 2, right: center + width / 2 }
    }
    throw new Error(`${id} has no anchors`)
}

// The tests -------------------------------------------------------------------

describe('totem slots', () => {
    test('the totem row holds four slots, left to right: Earth, Fire, Water, Air', () => {
        world = start()
        login(world)
        const g = world.g

        const spans = ORDER.map((el) => {
            expect(isInside(g, slotId(el), 'TurboCardTotems')).toBe(true)
            expect(isInside(g, iconId(el), slotId(el))).toBe(true)
            return span(g, slotId(el))
        })
        for (let i = 0; i < spans.length; i++) {
            const here = spans[i]!
            expect(here.right).toBeGreaterThan(here.left)
            const next = spans[i + 1]
            if (next) expect(here.right).toBeLessThanOrEqual(next.left + 0.5)
        }
    })

    test("with no totems down, each slot shows its own element's icon, faded, although the game's have-totem flag says a totem is there", () => {
        world = start()
        login(world)
        const g = world.g

        for (const el of ORDER) {
            expect(looksEmpty(g, el)).toBe(true)
            expect(countdown(g, el)).toBeUndefined()
        }
        const images = ORDER.map((el) => JSON.stringify(iconImage(g, el)))
        expect(new Set(images).size).toBe(4)
    })

    test("each of the game's slots fills its own element: 1 is Fire, 2 Earth, 3 Water and 4 Air", () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        const filled: Element[] = []
        for (let slot = 1; slot <= 4; slot++) {
            const el = elementOf(slot)
            const label = drop(world, slot, SPELLS[el], 60)
            filled.push(el)

            expect(looksFilled(g, el)).toBe(true)
            expect(countdown(g, el)?.object).toEqual({ $secret: label })
            for (const other of ORDER.filter((o) => !filled.includes(o))) {
                expect(looksEmpty(g, other)).toBe(true)
                expect(countdown(g, other)).toBeUndefined()
            }
        }
    })

    test('after a /reload, totems already down fill their slots at login', () => {
        world = start({ combat: true, totems: [[3, SPELL.healingStream, 60]] })
        login(world)
        const g = world.g

        expect(looksFilled(g, 'Water')).toBe(true)
        expect(countdown(g, 'Water')).toEqual({
            object: { $secret: 'Water totem #1' },
            numbers: true,
        })
        for (const el of ['Earth', 'Fire', 'Air'] as const) {
            expect(looksEmpty(g, el)).toBe(true)
        }
    })
})

describe('time left and swirl', () => {
    test("a totem dropped in combat shows its time left through its slot's Cooldown, driven by the slot's duration object with countdown numbers on", () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g

        const label = drop(world, GAME_SLOT.Fire, SPELL.searing, 30)

        expect(looksFilled(g, 'Fire')).toBe(true)
        expect(countdown(g, 'Fire')).toEqual({
            object: { $secret: label },
            numbers: true,
        })
        for (const el of ['Earth', 'Water', 'Air'] as const) {
            expect(looksEmpty(g, el)).toBe(true)
        }
    })

    test('out of combat the countdown works the same, and a new totem hands the Cooldown its own duration object', () => {
        world = start()
        login(world)
        const g = world.g

        const first = drop(world, GAME_SLOT.Earth, SPELL.stoneskin, 60)
        expect(countdown(g, 'Earth')).toEqual({
            object: { $secret: first },
            numbers: true,
        })

        pass(world, 10)
        const second = drop(world, GAME_SLOT.Earth, SPELL.stoneskin, 60)
        expect(countdown(g, 'Earth')).toEqual({
            object: { $secret: second },
            numbers: true,
        })
        expect(looksFilled(g, 'Earth')).toBe(true)
    })

    test("the countdown numbers never depend on the player's countdown CVar: Turbo never reads it", () => {
        world = start()
        login(world)
        enterCombat(world)
        const label = drop(world, GAME_SLOT.Air, SPELL.windfury, 60)
        pass(world, 5)
        leaveCombat(world)

        const g = world.g
        expect(countdown(g, 'Air')?.object).toEqual({ $secret: label })
        const cvarReads = g
            .reads()
            .filter((r) => /cvar|countdown/i.test(r.name))
        expect(cvarReads).toEqual([])
    })
})

describe('empty slots', () => {
    test('a totem that runs out empties its slot back to the faded icon and clears its countdown', () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        drop(world, GAME_SLOT.Water, SPELL.healingStream, 30)

        pass(world, 30)
        remove(world, GAME_SLOT.Water)

        expect(looksEmpty(g, 'Water')).toBe(true)
        expect(countdown(g, 'Water')).toBeUndefined()
    })

    test('a slot whose time left reads a plain zero is empty, even with a duration object', () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        const label = drop(world, GAME_SLOT.Fire, SPELL.searing, 30)

        pass(world, 10)
        g.setReadingFor('totemTimeLeft', [GAME_SLOT.Fire], 0)
        g.setReadingFor(
            'totemDuration',
            [GAME_SLOT.Fire],
            g.secret(label, 'userdata')
        )
        g.fire('PLAYER_TOTEM_UPDATE', GAME_SLOT.Fire)

        expect(looksEmpty(g, 'Fire')).toBe(true)
        expect(countdown(g, 'Fire')).toBeUndefined()
    })

    test('a slot with no duration object is empty, even while its time left reads a secret', () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        const label = drop(world, GAME_SLOT.Fire, SPELL.searing, 30)

        pass(world, 10)
        g.setReadingFor('totemTimeLeft', [GAME_SLOT.Fire], g.secret(label))
        g.setReadingFor('totemDuration', [GAME_SLOT.Fire], undefined)
        g.fire('PLAYER_TOTEM_UPDATE', GAME_SLOT.Fire)

        expect(looksEmpty(g, 'Fire')).toBe(true)
        expect(countdown(g, 'Fire')).toBeUndefined()
    })
})

describe('pulse near the end', () => {
    test("out of combat, a totem's icon pulses for its last 5 seconds and stops when it runs out", () => {
        world = start()
        login(world)
        const g = world.g
        expect(setting(world, 'totemWarningSeconds')).toBe(5)

        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        pass(world, 24.5)
        expect(pulsing(g, 'Fire')).toBe(false)

        pass(world, 1)
        expect(isInside(g, pulseId('Fire'), slotId('Fire'))).toBe(true)
        expect(pulsing(g, 'Fire')).toBe(true)
        expect(pulsing(g, 'Earth')).toBe(false)

        pass(world, 4.5)
        remove(world, GAME_SLOT.Fire)
        expect(pulsing(g, 'Fire')).toBe(false)
        expect(looksEmpty(g, 'Fire')).toBe(true)
    })

    test('in combat, the pulse starts 5 seconds before the end, timed from the cast with the duration learned out of combat', () => {
        world = start()
        login(world)
        const g = world.g
        learn(world, GAME_SLOT.Earth, SPELL.stoneskin, 30)
        enterCombat(world)

        drop(world, GAME_SLOT.Earth, SPELL.stoneskin, 30)
        pass(world, 24.5)
        expect(pulsing(g, 'Earth')).toBe(false)

        pass(world, 1)
        expect(pulsing(g, 'Earth')).toBe(true)

        pass(world, 4.5)
        remove(world, GAME_SLOT.Earth)
        expect(pulsing(g, 'Earth')).toBe(false)
    })

    test('the pulse time is an option: a saved change to 8 seconds starts the pulse 8 seconds before the end', () => {
        world = start({ settings: { totemWarningSeconds: 8 } })
        login(world)
        const g = world.g
        expect(setting(world, 'totemWarningSeconds')).toBe(8)

        drop(world, GAME_SLOT.Water, SPELL.healingStream, 30)
        pass(world, 21.5)
        expect(pulsing(g, 'Water')).toBe(false)

        pass(world, 1)
        expect(pulsing(g, 'Water')).toBe(true)
    })

    test("a totem replaced before its last seconds pulses on the new totem's schedule, not the old one's", () => {
        world = start()
        login(world)
        const g = world.g

        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        pass(world, 20)
        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)

        pass(world, 6)
        expect(pulsing(g, 'Fire')).toBe(false)

        pass(world, 18.5)
        expect(pulsing(g, 'Fire')).toBe(false)

        pass(world, 1)
        expect(pulsing(g, 'Fire')).toBe(true)
    })
})

describe('early death flash', () => {
    test('a totem destroyed early in combat empties its slot right away with a short red flash', () => {
        world = start()
        login(world)
        const g = world.g
        learn(world, GAME_SLOT.Fire, SPELL.searing, 30)
        enterCombat(world)
        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        pass(world, 10)
        expect(flashing(g, 'Fire')).toBe(false)

        remove(world, GAME_SLOT.Fire)

        expect(looksEmpty(g, 'Fire')).toBe(true)
        expect(countdown(g, 'Fire')).toBeUndefined()
        expect(flashing(g, 'Fire')).toBe(true)
        expect(isInside(g, flashId('Fire'), slotId('Fire'))).toBe(true)
        expect(flashIsRed(g, 'Fire')).toBe(true)
        expect(flashing(g, 'Earth')).toBe(false)

        pass(world, 1.5)
        expect(flashing(g, 'Fire')).toBe(false)
        expect(looksEmpty(g, 'Fire')).toBe(true)
    })

    test('a totem that runs out on time empties without a flash', () => {
        world = start()
        login(world)
        const g = world.g
        learn(world, GAME_SLOT.Earth, SPELL.stoneskin, 30)
        enterCombat(world)
        drop(world, GAME_SLOT.Earth, SPELL.stoneskin, 30)
        const mark = g.changes().length

        pass(world, 30)
        remove(world, GAME_SLOT.Earth)
        pass(world, 1)

        expect(looksEmpty(g, 'Earth')).toBe(true)
        expect(flashedSince(g, 'Earth', mark)).toBe(false)
    })

    test('a new totem dropped over the old one refills the slot without a flash', () => {
        world = start()
        login(world)
        const g = world.g
        learn(world, GAME_SLOT.Fire, SPELL.searing, 30)
        enterCombat(world)
        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        pass(world, 10)
        const mark = g.changes().length

        const label = drop(world, GAME_SLOT.Fire, SPELL.magma, 20)
        pass(world, 1)

        expect(looksFilled(g, 'Fire')).toBe(true)
        expect(countdown(g, 'Fire')?.object).toEqual({ $secret: label })
        expect(flashedSince(g, 'Fire', mark)).toBe(false)
    })
})

describe('fallback: self-timed numbers', () => {
    test("when the game can't show a duration object, a totem counts down on Turbo's own clock from the cast, with its duration learned out of combat", () => {
        world = start({ supported: false })
        login(world)
        const g = world.g
        learn(world, GAME_SLOT.Fire, SPELL.searing, 30)
        enterCombat(world)

        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        expect(looksFilled(g, 'Fire')).toBe(true)

        pass(world, 5.5)
        const early = fallbackSecondsLeft(world, 'Fire')
        expect(early).toBeGreaterThanOrEqual(24)
        expect(early).toBeLessThanOrEqual(25)

        pass(world, 15)
        const late = fallbackSecondsLeft(world, 'Fire')
        expect(late).toBeGreaterThanOrEqual(9)
        expect(late).toBeLessThanOrEqual(10)

        pass(world, 9.5)
        remove(world, GAME_SLOT.Fire)
        expect(fallbackSecondsLeft(world, 'Fire') ?? 0).toBeLessThanOrEqual(0)
        expect(looksEmpty(g, 'Fire')).toBe(true)
    })

    test('fallback durations are learned per spell ID: two Fire totems each count down from their own', () => {
        world = start({ supported: false })
        login(world)
        learn(world, GAME_SLOT.Fire, SPELL.searing, 30)
        learn(world, GAME_SLOT.Fire, SPELL.magma, 20)
        enterCombat(world)

        drop(world, GAME_SLOT.Fire, SPELL.magma, 20)
        pass(world, 5.5)
        const magma = fallbackSecondsLeft(world, 'Fire')
        expect(magma).toBeGreaterThanOrEqual(14)
        expect(magma).toBeLessThanOrEqual(15)

        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        pass(world, 5.5)
        const searing = fallbackSecondsLeft(world, 'Fire')
        expect(searing).toBeGreaterThanOrEqual(24)
        expect(searing).toBeLessThanOrEqual(25)
    })
})

describe('Call of the Elements and Totemic Recall', () => {
    test('Call of the Elements fills all four slots at once, each with its own duration object', () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        const labels = {} as Record<Element, string>
        for (const el of ORDER) {
            world.drops++
            labels[el] = `${el} totem #${world.drops}`
            world.slots.set(GAME_SLOT[el], {
                spellID: SPELLS[el],
                duration: 60,
                droppedAt: world.clock,
                label: labels[el],
            })
        }
        script(world)

        g.fire(
            'UNIT_SPELLCAST_SUCCEEDED',
            'player',
            'Cast-cote',
            SPELL.callOfTheElements
        )
        for (const el of ORDER) g.fire('PLAYER_TOTEM_UPDATE', GAME_SLOT[el])

        for (const el of ORDER) {
            expect(looksFilled(g, el)).toBe(true)
            expect(countdown(g, el)).toEqual({
                object: { $secret: labels[el] },
                numbers: true,
            })
        }
    })

    test('Totemic Recall empties all four slots at once', () => {
        world = start()
        login(world)
        learn(world, GAME_SLOT.Fire, SPELL.searing, 30)
        enterCombat(world)
        const g = world.g
        drop(world, GAME_SLOT.Earth, SPELL.stoneskin, 60)
        drop(world, GAME_SLOT.Fire, SPELL.searing, 30)
        drop(world, GAME_SLOT.Water, SPELL.healingStream, 60)
        drop(world, GAME_SLOT.Air, SPELL.windfury, 60)
        pass(world, 26)
        expect(pulsing(g, 'Fire')).toBe(true)

        world.slots.clear()
        script(world)
        g.fire(
            'UNIT_SPELLCAST_SUCCEEDED',
            'player',
            'Cast-recall',
            SPELL.totemicRecall
        )
        for (let slot = 1; slot <= 4; slot++) {
            g.fire('PLAYER_TOTEM_UPDATE', slot)
        }

        for (const el of ORDER) {
            expect(looksEmpty(g, el)).toBe(true)
            expect(countdown(g, el)).toBeUndefined()
            expect(pulsing(g, el)).toBe(false)
        }
    })
})

describe('turning totem timers off and on', () => {
    test('turning the module off hides all four slots, and turning it back on shows them again with the totem still down', () => {
        world = start()
        login(world)
        enterCombat(world)
        const g = world.g
        const label = drop(world, GAME_SLOT.Water, SPELL.healingStream, 60)
        for (const el of ORDER) {
            expect(g.frame(slotId(el))?.shown).not.toBe(false)
        }

        g.run('ns.modules.disable("totemTimers")')

        for (const el of ORDER) {
            expect(frameOf(g, slotId(el)).shown).toBe(false)
        }

        pass(world, 5)
        g.run('ns.modules.enable("totemTimers")')

        for (const el of ORDER) {
            expect(frameOf(g, slotId(el)).shown).toBe(true)
        }
        expect(looksFilled(g, 'Water')).toBe(true)
        expect(countdown(g, 'Water')).toEqual({
            object: { $secret: label },
            numbers: true,
        })
        for (const el of ['Earth', 'Fire', 'Air'] as const) {
            expect(looksEmpty(g, el)).toBe(true)
            expect(countdown(g, el)).toBeUndefined()
        }
    })
})
