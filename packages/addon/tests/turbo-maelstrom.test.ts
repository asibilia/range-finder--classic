/**
 * The Maelstrom Weapon module under the fake game: it shows the player's
 * stacks as five pips on the card, glowing at 5, but only once the game has
 * shown it lets addons read the aura in combat. Otherwise it stays off and
 * invisible, and debug mode says why.
 *
 * The game, as these tests script it (see turbo-card.test.ts for the rest):
 *
 * - The reading `maelstromWeapon` is the player's Maelstrom Weapon stacks: a
 *   plain number 0-5 (0 with no aura), a secret value when the game hides the
 *   aura, or nothing (nil) when the wrapped aura read failed. `UNIT_AURA` with
 *   `'player'` says it may have changed.
 * - Out of combat auras are always readable, so only a read in combat tells
 *   whether the module can work.
 * - The pips live in the card's small-icons row (`TurboCardIcons`): the frame
 *   `TurboMaelstrom` holds `TurboMaelstromPip1` to `TurboMaelstromPip5` and
 *   the glow, `TurboMaelstromGlow`. A lit pip is on screen at full strength;
 *   an unlit one is hidden, dimmed (alpha at most 0.5) or desaturated.
 * - `/turbo debug` turns debug mode on; while it's on, Turbo logs to chat.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { loadTurbo, type FakeGame } from './fake-game/fake-game'

let game: FakeGame | undefined

afterEach(() => {
    game?.close()
    game = undefined
})

const ICONS_ROW = 'TurboCardIcons'
const MAELSTROM = 'TurboMaelstrom'
const PIPS = [1, 2, 3, 4, 5].map((i) => `TurboMaelstromPip${i}`)
const GLOW = 'TurboMaelstromGlow'

/** How a debug line may say the aura can't be read in combat. */
const UNREADABLE =
    /secret|unreadable|not readable|hidden|can['’]?t (be )?read|cannot (be )?read/i

/** Loads Turbo as a Shaman on Forever, out of combat with no target. */
function start(): FakeGame {
    const g = loadTurbo()
    g.setReading('interface', 16001)
    g.setReading('flavor', 'forever')
    g.setReading('playerClass', 'Shaman', 'SHAMAN', 7)
    g.setReading('inCombat', false)
    g.setReading('targetAttackable', false)
    // The range finder checks a targeted enemy's range; nothing to report.
    g.setReading('spellInRange', null)
    g.setReading('itemInRange', null)
    // The weapon imbue and reminders read these once they start.
    g.setReading('mainHandEnchant', null)
    g.setReading('resting', false)
    g.setReading('mounted', false)
    g.setReading('onTaxi', false)
    g.setReading('maelstromWeapon', 0)
    // Key cooldowns and the mana bar (turbo-key-cooldowns / turbo-mana-bar).
    g.setReading('spellKnown', true)
    g.setReading('spellTexture', 136026)
    g.setReading('spellCooldown', { isActive: false, isOnGCD: false })
    g.setReading('spellCooldownDuration', g.secret('cooldown', 'userdata'))
    g.setReading('spellUsable', true, false)
    g.setReading('manaMax', 1000)
    g.setReading('mana', g.secret('mana'))
    g.setReading('manaColor', g.secret('r'), g.secret('g'), g.secret('b'))
    return g
}

/** The login events, in the order WoW fires them. */
function login(g: FakeGame) {
    g.fire('ADDON_LOADED', 'Turbo')
    g.fire('PLAYER_LOGIN')
    g.fire('PLAYER_ENTERING_WORLD', true, false)
}

function target(g: FakeGame, attackable: boolean) {
    g.setReading('targetAttackable', attackable)
    g.fire('PLAYER_TARGET_CHANGED')
}

/** Sets the Maelstrom Weapon reading and tells Turbo the auras changed. */
function stacks(g: FakeGame, value: unknown) {
    g.setReading('maelstromWeapon', value)
    g.fire('UNIT_AURA', 'player', { isFullUpdate: true })
}

/** Enters combat with the aura reading as given, and lets the card fade in. */
function fight(g: FakeGame, value: unknown) {
    g.setReading('maelstromWeapon', value)
    g.setReading('inCombat', true)
    g.fire('PLAYER_REGEN_DISABLED')
    stacks(g, value)
    g.advance(0.4)
}

function leaveCombat(g: FakeGame) {
    g.setReading('inCombat', false)
    g.fire('PLAYER_REGEN_ENABLED')
}

/** Whether a frame is on screen: it and every parent shown, none faded out. */
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

/** Whether a frame sits inside another, at any depth. */
function inside(g: FakeGame, id: string, ancestor: string): boolean {
    let current = g.frame(id)?.parent as string | null | undefined
    for (let depth = 0; current && depth < 20; depth++) {
        if (current === ancestor) return true
        current = g.frame(current)?.parent as string | null | undefined
    }
    return false
}

function lit(g: FakeGame, id: string): boolean {
    const state = g.frame(id)
    return (
        visible(g, id) &&
        Number(state?.alpha) > 0.5 &&
        state?.Desaturated !== true
    )
}

/** Which of the five pips are lit, first to last. */
function pips(g: FakeGame): boolean[] {
    return PIPS.map((id) => lit(g, id))
}

/** Whether any part of the Maelstrom Weapon display is on screen. */
function anythingShown(g: FakeGame): boolean {
    return (
        visible(g, MAELSTROM) ||
        visible(g, GLOW) ||
        PIPS.some((id) => visible(g, id))
    )
}

/** Whether Turbo has checked the Maelstrom Weapon aura at all. */
function checkedAura(g: FakeGame): boolean {
    return g.reads().some((r) => r.name === 'maelstromWeapon')
}

/** Chat lines that talk about Maelstrom Weapon. */
function maelstromLines(g: FakeGame): string[] {
    return g.printed().filter((line) => /maelstrom/i.test(line))
}

describe('when the game hides Maelstrom Weapon in combat', () => {
    test('a secret aura in combat keeps the module off: nothing of it shows on the card', () => {
        game = start()
        login(game)
        target(game, true)

        fight(game, game.secret('maelstromWeapon'))

        expect(checkedAura(game)).toBe(true)
        expect(visible(game, 'TurboCard')).toBe(true)
        expect(anythingShown(game)).toBe(false)
    })

    test('an aura read that fails in combat also keeps the module off', () => {
        game = start()
        login(game)
        target(game, true)

        fight(game, null)

        expect(checkedAura(game)).toBe(true)
        expect(visible(game, 'TurboCard')).toBe(true)
        expect(anythingShown(game)).toBe(false)
    })

    test('once found unreadable, the module stays off after combat, even when the aura reads plainly again', () => {
        game = start()
        login(game)
        target(game, true)
        fight(game, game.secret('maelstromWeapon'))

        leaveCombat(game)
        stacks(game, 5)
        game.advance(1)

        expect(checkedAura(game)).toBe(true)
        expect(visible(game, 'TurboCard')).toBe(true)
        expect(anythingShown(game)).toBe(false)
    })

    test('debug mode reports that Maelstrom Weapon is off because the game hides it in combat', () => {
        game = start()
        login(game)
        game.slash('/turbo debug')

        fight(game, game.secret('maelstromWeapon'))

        const reasons = maelstromLines(game).filter((line) =>
            UNREADABLE.test(line)
        )
        expect(reasons.length).toBeGreaterThan(0)
    })

    test('outside debug mode the module stays off silently', () => {
        game = start()
        login(game)

        fight(game, game.secret('maelstromWeapon'))

        expect(checkedAura(game)).toBe(true)
        expect(maelstromLines(game)).toEqual([])
    })
})

describe('when Maelstrom Weapon is readable in combat', () => {
    test('nothing shows until the aura has been read in combat, then the stacks appear', () => {
        game = start()
        login(game)
        target(game, true)
        stacks(game, 3)
        game.advance(0.4)

        expect(visible(game, 'TurboCard')).toBe(true)
        expect(anythingShown(game)).toBe(false)

        fight(game, 3)

        expect(visible(game, MAELSTROM)).toBe(true)
        expect(pips(game)).toEqual([true, true, true, false, false])
    })

    test('the pips sit in the small-icons row of the card', () => {
        game = start()
        login(game)
        fight(game, 2)

        expect(inside(game, MAELSTROM, ICONS_ROW)).toBe(true)
        for (const id of PIPS) expect(inside(game, id, MAELSTROM)).toBe(true)
    })

    test('stacks from 0 to 5 light that many pips, first to last', () => {
        game = start()
        login(game)
        fight(game, 0)

        const expected = [
            [false, false, false, false, false],
            [true, false, false, false, false],
            [true, true, false, false, false],
            [true, true, true, false, false],
            [true, true, true, true, false],
            [true, true, true, true, true],
        ]
        for (let n = 0; n <= 5; n++) {
            stacks(game, n)
            expect(pips(game)).toEqual(expected[n]!)
        }
        stacks(game, 1)
        expect(pips(game)).toEqual(expected[1]!)
    })

    test('the pips glow at 5 stacks, and stop glowing once the stacks are spent', () => {
        game = start()
        login(game)
        fight(game, 4)
        expect(visible(game, GLOW)).toBe(false)

        stacks(game, 5)
        expect(visible(game, GLOW)).toBe(true)

        stacks(game, 0)
        expect(visible(game, GLOW)).toBe(false)
        expect(pips(game)).toEqual([false, false, false, false, false])
    })

    test('after a readable fight, the pips keep following the stacks out of combat', () => {
        game = start()
        login(game)
        target(game, true)
        fight(game, 5)

        leaveCombat(game)
        stacks(game, 2)
        game.advance(1)

        expect(visible(game, 'TurboCard')).toBe(true)
        expect(pips(game)).toEqual([true, true, false, false, false])
        expect(visible(game, GLOW)).toBe(false)
    })

    test('turning the module off takes the pips and glow off the card', () => {
        game = start()
        login(game)
        fight(game, 5)
        expect(visible(game, GLOW)).toBe(true)

        game.run('ns.modules.disable("maelstromWeapon")')
        stacks(game, 5)

        expect(anythingShown(game)).toBe(false)
    })
})
