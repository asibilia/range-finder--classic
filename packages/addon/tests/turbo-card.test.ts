/**
 * The HUD card under the fake game: its rows, when it shows and how it fades,
 * where it sits, and moving it with Edit Mode.
 *
 * The game, as these tests script it (see turbo-core.test.ts for the rest):
 *
 * - The card is the frame named `TurboCard`. Its rows, top to bottom, are
 *   `TurboCardRange`, `TurboCardSwing`, `TurboCardTotems`, `TurboCardIcons`
 *   and `TurboCardMana`.
 * - Engaged: `PLAYER_REGEN_DISABLED` / `PLAYER_REGEN_ENABLED` with the
 *   `inCombat` reading, and `PLAYER_TARGET_CHANGED` with `targetAttackable`.
 * - Fades run on the safe layer's clock, so `advance()` drives them.
 * - Edit Mode opens and closes with `EditMode.Enter` and `EditMode.Exit`
 *   (EventRegistry callbacks the safe layer passes on like events); a layout
 *   switch is `EDIT_MODE_LAYOUTS_UPDATED`.
 * - `TurboDB.position = { point, x, y }` is the one saved position, and
 *   `TurboDB.classes[CLASS].alwaysShow` the "always show" setting.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
    loadTurbo,
    type FakeGame,
    type FrameState,
} from './fake-game/fake-game'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const CARD = 'TurboCard'
const ROWS = [
    'TurboCardRange',
    'TurboCardSwing',
    'TurboCardTotems',
    'TurboCardIcons',
    'TurboCardMana',
]

/** Loads Turbo as a Shaman on Forever, out of combat with no target. */
function start(savedVariables?: Record<string, unknown>): FakeGame {
    const g = loadTurbo(savedVariables ? { savedVariables } : {})
    g.setReading('interface', 16001)
    g.setReading('flavor', 'forever')
    g.setReading('playerClass', 'Shaman', 'SHAMAN', 7)
    g.setReading('inCombat', false)
    g.setReading('targetAttackable', false)
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

function enterCombat(g: FakeGame) {
    g.setReading('inCombat', true)
    g.fire('PLAYER_REGEN_DISABLED')
}

function leaveCombat(g: FakeGame) {
    g.setReading('inCombat', false)
    g.fire('PLAYER_REGEN_ENABLED')
}

function target(g: FakeGame, attackable: boolean) {
    g.setReading('targetAttackable', attackable)
    g.fire('PLAYER_TARGET_CHANGED')
}

function card(g: FakeGame): FrameState {
    const state = g.frame(CARD)
    if (!state) throw new Error('no TurboCard frame')
    return state
}

function alpha(g: FakeGame): number {
    return Number(card(g).alpha)
}

/** Whether the card is fully on screen. */
function fullyShown(g: FakeGame): boolean {
    return card(g).shown === true && Math.abs(alpha(g) - 1) < 1e-6
}

type Anchor = {
    point: string
    relativeTo: string | null
    relativePoint: string
    x: number
    y: number
}

/** Reads a recorded `SetPoint` call in any of its WoW forms. */
function anchor(args: unknown[]): Anchor {
    const [point, ...rest] = args as [string, ...unknown[]]
    if (rest.length === 0) {
        return { point, relativeTo: null, relativePoint: point, x: 0, y: 0 }
    }
    if (typeof rest[0] === 'number') {
        return {
            point,
            relativeTo: null,
            relativePoint: point,
            x: rest[0],
            y: Number(rest[1] ?? 0),
        }
    }
    const rel = rest[0] as { $frame?: string } | string | null
    const relativeTo = typeof rel === 'string' ? rel : (rel?.$frame ?? null)
    if (typeof rest[1] === 'number') {
        return {
            point,
            relativeTo,
            relativePoint: point,
            x: rest[1],
            y: Number(rest[2] ?? 0),
        }
    }
    return {
        point,
        relativeTo,
        relativePoint: typeof rest[1] === 'string' ? rest[1] : point,
        x: Number(rest[2] ?? 0),
        y: Number(rest[3] ?? 0),
    }
}

/** Which vertical edge a point names. */
function edge(point: string): 'top' | 'bottom' | 'middle' {
    if (point.startsWith('TOP')) return 'top'
    if (point.startsWith('BOTTOM')) return 'bottom'
    return 'middle'
}

type Extent = { top: number; bottom: number }

/**
 * A frame's top and bottom inside the card, from its anchors and height. The
 * card's top is 0 and its bottom is minus its height.
 */
function extent(g: FakeGame, id: string, depth = 0): Extent {
    if (depth > 10) throw new Error(`anchor loop at ${id}`)
    const state = g.frame(id)
    if (!state) throw new Error(`no frame ${id}`)
    if (id === CARD) return { top: 0, bottom: -Number(state.height) }

    let top: number | undefined
    let bottom: number | undefined
    let middle: number | undefined
    for (const args of state.points) {
        const a = anchor(args)
        const relId = a.relativeTo ?? (state.parent as string | null)
        if (!relId) throw new Error(`${id} is not anchored inside the card`)
        const rel = extent(g, relId, depth + 1)
        const relY =
            edge(a.relativePoint) === 'top'
                ? rel.top
                : edge(a.relativePoint) === 'bottom'
                  ? rel.bottom
                  : (rel.top + rel.bottom) / 2
        const y = relY + a.y
        if (edge(a.point) === 'top') top = y
        else if (edge(a.point) === 'bottom') bottom = y
        else middle = y
    }
    const height = Number(state.height)
    if (top !== undefined && bottom !== undefined) return { top, bottom }
    if (!(height > 0)) throw new Error(`${id} has no height`)
    if (top !== undefined) return { top, bottom: top - height }
    if (bottom !== undefined) return { top: bottom + height, bottom }
    if (middle !== undefined) {
        return { top: middle + height / 2, bottom: middle - height / 2 }
    }
    throw new Error(`${id} has no anchors`)
}

/** The card's one anchor on screen. */
function cardAnchor(g: FakeGame): Anchor {
    const points = card(g).points
    expect(points).toHaveLength(1)
    return anchor(points[0] as unknown[])
}

describe('the card', () => {
    test('is one compact frame with its five rows top to bottom: range band, swing timer, totems, small icons, mana', () => {
        game = start()
        login(game)

        const state = card(game)
        expect(Number(state.width)).toBeGreaterThan(0)
        expect(Number(state.width)).toBeLessThanOrEqual(400)
        expect(Number(state.height)).toBeGreaterThan(0)
        expect(Number(state.height)).toBeLessThanOrEqual(300)

        const extents = ROWS.map((id) => {
            expect(game!.frame(id)?.parent).toBe(CARD)
            return extent(game!, id)
        })
        const eps = 0.5
        expect(extents[0]!.top).toBeLessThanOrEqual(eps)
        for (let i = 0; i < extents.length; i++) {
            const row = extents[i]!
            expect(row.top).toBeGreaterThan(row.bottom)
            const below = extents[i + 1]
            if (below) expect(below.top).toBeLessThanOrEqual(row.bottom + eps)
        }
        expect(extents[extents.length - 1]!.bottom).toBeGreaterThanOrEqual(
            -Number(state.height) - eps
        )
    })

    test("starts hidden at login when the player isn't engaged", () => {
        game = start()
        login(game)
        game.advance(1)

        expect(card(game).shown).toBe(false)
    })
})

describe('engaged visibility', () => {
    test('entering combat fades the card in over about 0.3s', () => {
        game = start()
        login(game)
        game.advance(1)

        enterCombat(game)
        expect(card(game).shown).toBe(true)
        expect(alpha(game)).toBeLessThan(1)

        game.advance(0.15)
        expect(alpha(game)).toBeGreaterThan(0)
        expect(alpha(game)).toBeLessThan(1)

        game.advance(0.25)
        expect(fullyShown(game)).toBe(true)
    })

    test('leaving combat with no enemy targeted fades the card out over about 0.3s, then hides it', () => {
        game = start()
        login(game)
        enterCombat(game)
        game.advance(1)
        expect(fullyShown(game)).toBe(true)

        leaveCombat(game)
        expect(card(game).shown).toBe(true)

        game.advance(0.15)
        expect(card(game).shown).toBe(true)
        expect(alpha(game)).toBeGreaterThan(0)
        expect(alpha(game)).toBeLessThan(1)

        game.advance(0.25)
        expect(card(game).shown).toBe(false)
    })

    test('targeting an attackable enemy out of combat shows the card', () => {
        game = start()
        login(game)
        game.advance(1)

        target(game, true)
        game.advance(0.4)

        expect(fullyShown(game)).toBe(true)
    })

    test('switching to a friendly target out of combat fades the card away', () => {
        game = start()
        login(game)
        target(game, true)
        game.advance(1)
        expect(fullyShown(game)).toBe(true)

        target(game, false)
        game.advance(0.4)

        expect(card(game).shown).toBe(false)
    })

    test('leaving combat with an attackable enemy still targeted keeps the card up', () => {
        game = start()
        login(game)
        target(game, true)
        enterCombat(game)
        game.advance(1)

        leaveCombat(game)
        game.advance(1)

        expect(fullyShown(game)).toBe(true)
    })

    test('a target that dies mid-fight, with no target change, lets the card fade away after combat', () => {
        game = start()
        login(game)
        target(game, true)
        enterCombat(game)
        game.advance(1)
        expect(fullyShown(game)).toBe(true)

        game.setReading('targetAttackable', false)
        leaveCombat(game)
        game.advance(0.4)

        expect(card(game).shown).toBe(false)
    })

    test('a targeted enemy that stops being attackable out of combat fades the card away when its flags change', () => {
        game = start()
        login(game)
        target(game, true)
        game.advance(1)
        expect(fullyShown(game)).toBe(true)

        game.setReading('targetAttackable', false)
        game.fire('UNIT_FLAGS', 'target')
        game.advance(0.4)

        expect(card(game).shown).toBe(false)
    })

    test("another unit's flags changing leaves the card up", () => {
        game = start()
        login(game)
        target(game, true)
        game.advance(1)
        expect(fullyShown(game)).toBe(true)

        game.setReading('targetAttackable', false)
        game.fire('UNIT_FLAGS', 'player')
        game.advance(0.4)

        expect(fullyShown(game)).toBe(true)
    })

    test('a /reload in combat shows the card without waiting for the next fight', () => {
        game = start()
        game.setReading('inCombat', true)
        login(game)
        game.advance(0.4)

        expect(fullyShown(game)).toBe(true)
    })

    test('with always show on, the card stays up while not engaged', () => {
        game = start({
            TurboDB: {
                schemaVersion: 1,
                classes: { SHAMAN: { alwaysShow: true } },
            },
        })
        login(game)
        game.advance(0.4)
        expect(fullyShown(game)).toBe(true)

        enterCombat(game)
        game.advance(1)
        leaveCombat(game)
        game.advance(1)

        expect(fullyShown(game)).toBe(true)
    })

    test("another class's always show does not apply to a Shaman", () => {
        game = start({
            TurboDB: {
                schemaVersion: 1,
                classes: { MAGE: { alwaysShow: true } },
            },
        })
        login(game)
        game.advance(1)

        expect(card(game).shown).toBe(false)
    })
})

describe('position and Edit Mode', () => {
    test('by default the card sits centred below the middle of the screen, between the unit frames', () => {
        game = start()
        login(game)

        const a = cardAnchor(game)
        expect(a.x).toBe(0)
        expect(['CENTER', 'BOTTOM']).toContain(a.point)
        expect(a.relativePoint).toBe(a.point)
        if (a.point === 'CENTER') expect(a.y).toBeLessThan(0)
        else expect(a.y).toBeGreaterThan(0)
    })

    test('a saved position places the card there', () => {
        game = start({
            TurboDB: {
                schemaVersion: 1,
                position: { point: 'CENTER', x: 42, y: -130 },
            },
        })
        login(game)

        const a = cardAnchor(game)
        expect(a).toMatchObject({
            point: 'CENTER',
            relativePoint: 'CENTER',
            x: 42,
            y: -130,
        })
    })

    test('switching Edit Mode layouts never moves the card: one position for every layout', () => {
        game = start({
            TurboDB: {
                schemaVersion: 1,
                position: { point: 'CENTER', x: 42, y: -130 },
            },
        })
        login(game)
        const before = card(game).points

        game.fire('EditMode.Enter')
        game.fire('EDIT_MODE_LAYOUTS_UPDATED')
        game.fire('EditMode.Exit')
        game.fire('EDIT_MODE_LAYOUTS_UPDATED')

        expect(card(game).points).toEqual(before)
    })

    test('the card can be dragged only while Edit Mode is open', () => {
        game = start()
        login(game)
        const moves = () =>
            game!.calls({ frame: CARD, method: 'StartMoving' }).length

        game.runScript(CARD, 'OnDragStart', 'LeftButton')
        expect(moves()).toBe(0)

        game.fire('EditMode.Enter')
        game.runScript(CARD, 'OnDragStart', 'LeftButton')
        expect(moves()).toBe(1)
        game.runScript(CARD, 'OnDragStop')
        expect(
            game.calls({ frame: CARD, method: 'StopMovingOrSizing' })
        ).toHaveLength(1)

        game.fire('EditMode.Exit')
        game.runScript(CARD, 'OnDragStart', 'LeftButton')
        expect(moves()).toBe(1)
    })

    test('the card lets mouse clicks through outside Edit Mode', () => {
        game = start()
        login(game)
        const mouse = () => {
            const calls = game!.calls({ frame: CARD, method: 'EnableMouse' })
            return calls.length ? calls[calls.length - 1]!.args[0] : false
        }

        expect(mouse()).toBe(false)
        game.fire('EditMode.Enter')
        expect(mouse()).toBe(true)
        game.fire('EditMode.Exit')
        expect(mouse()).toBe(false)
    })

    test('opening Edit Mode shows the card so it can be placed, and closing it hides the card again', () => {
        game = start()
        login(game)
        game.advance(1)
        expect(card(game).shown).toBe(false)

        game.fire('EditMode.Enter')
        game.advance(0.4)
        expect(fullyShown(game)).toBe(true)

        game.fire('EditMode.Exit')
        game.advance(0.4)
        expect(card(game).shown).toBe(false)
    })
})
