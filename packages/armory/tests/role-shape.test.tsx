/** C2a Shape and its shared planner state. The DOM helper must be first. */
import './dom'
import {
    description,
    openFile,
    openSample,
    readingValue,
    variant,
} from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

import {
    clampRoleValue,
    rolePoint,
    rolePolygon,
    roleValueAtPoint,
} from '../src/components/role-shape-geometry'

afterEach(() => {
    cleanup()
})

function controlRadio(name: 'Shape' | 'Sliders'): HTMLInputElement {
    const group = screen.getByRole('group', { name: 'Role control' })
    return within(group).getByRole('radio', { name }) as HTMLInputElement
}

function viewRadio(name: 'Current' | 'BIS'): HTMLInputElement {
    const group = screen.getByRole('group', { name: 'View' })
    return within(group).getByRole('radio', { name }) as HTMLInputElement
}

function handle(name: string): SVGGElement {
    return screen.getByRole('slider', {
        name,
    }) as unknown as SVGGElement
}

function value(name: string): number {
    return Number(handle(name).getAttribute('aria-valuenow'))
}

function picksLine(): string {
    return (
        screen.getByText('Your mix picks the', { exact: false }).textContent ??
        ''
    )
}

function mockBounds(shape: SVGGElement): void {
    const svg = shape.ownerSVGElement
    if (!svg) throw new Error('shape handle has no SVG')
    Object.defineProperty(svg, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
            ({
                x: 0,
                y: 0,
                left: 0,
                top: 0,
                right: 350,
                bottom: 300,
                width: 350,
                height: 300,
                toJSON: () => ({}),
            }) as DOMRect,
    })
}

describe('Shape geometry', () => {
    test('uses four cardinal axes, keeps zero off the centre, and clamps values and reach', () => {
        expect(rolePoint('damage', 0)).toEqual({ x: 175, y: 134 })
        expect(rolePoint('survival', 100)).toEqual({ x: 275, y: 150 })
        expect(rolePoint('healing', 0)).toEqual({ x: 175, y: 166 })
        expect(rolePoint('utility', 100)).toEqual({ x: 75, y: 150 })
        expect(
            rolePolygon({
                damage: 100,
                survival: 0,
                healing: 100,
                utility: 0,
            })
        ).toBe('M175.0 50.0 L191.0 150.0 L175.0 250.0 L159.0 150.0Z')
        expect(clampRoleValue(-5, null)).toBe(0)
        expect(clampRoleValue(105, null)).toBe(100)
        expect(clampRoleValue(80, 35)).toBe(35)
        expect(roleValueAtPoint('survival', { x: 1000, y: 150 }, 35)).toBe(35)
        expect(roleValueAtPoint('damage', { x: 175, y: 500 }, null)).toBe(0)
    })
})

describe('the Shape / Sliders control', () => {
    test('opens on Shape and switching views preserves mix, picked plan, gear view and readings', async () => {
        const user = await openSample()
        expect(controlRadio('Shape').checked).toBe(true)
        expect(controlRadio('Sliders').checked).toBe(false)
        expect(
            document.querySelector('[data-slot="role-current-polygon"]')
        ).not.toBeNull()

        fireEvent.keyDown(handle('Damage'), { key: 'Home' })
        fireEvent.keyDown(handle('Damage'), { key: 'PageUp' })
        fireEvent.keyDown(handle('Damage'), { key: 'PageUp' })
        fireEvent.keyDown(handle('Damage'), { key: 'ArrowRight' })
        fireEvent.keyDown(handle('Survival'), { key: 'End' })
        fireEvent.keyDown(handle('Survival'), { key: 'PageUp' })
        fireEvent.keyDown(handle('Survival'), { key: 'PageUp' })
        fireEvent.keyDown(handle('Survival'), { key: 'ArrowRight' })
        expect(value('Damage')).toBe(45)
        expect(value('Survival')).toBe(80)
        expect(picksLine()).toBe('Your mix picks the damage and survival set.')
        expect(viewRadio('BIS').checked).toBe(true)
        const planHealth = readingValue('Health')

        await user.click(controlRadio('Sliders'))
        expect(controlRadio('Sliders').checked).toBe(true)
        expect(
            (screen.getByRole('slider', { name: 'Damage' }) as HTMLInputElement)
                .value
        ).toBe('45')
        expect(
            (
                screen.getByRole('slider', {
                    name: 'Survival',
                }) as HTMLInputElement
            ).value
        ).toBe('80')
        expect(picksLine()).toBe('Your mix picks the damage and survival set.')
        expect(viewRadio('BIS').checked).toBe(true)
        expect(readingValue('Health')).toBe(planHealth)

        await user.click(viewRadio('Current'))
        const wornHealth = readingValue('Health')
        await user.click(controlRadio('Shape'))
        expect(value('Damage')).toBe(45)
        expect(value('Survival')).toBe(80)
        expect(picksLine()).toBe('Your mix picks the damage and survival set.')
        expect(viewRadio('Current').checked).toBe(true)
        expect(readingValue('Health')).toBe(wornHealth)
    })

    test('pointer dragging captures the pointer and clamps to 0, 100 and available reach; disabled roles do not drag', async () => {
        await openSample()
        const survival = handle('Survival')
        mockBounds(survival)
        const captured: number[] = []
        survival.setPointerCapture = (pointerId) => captured.push(pointerId)
        survival.hasPointerCapture = (pointerId) => captured.includes(pointerId)
        survival.releasePointerCapture = (pointerId) => {
            const index = captured.indexOf(pointerId)
            if (index >= 0) captured.splice(index, 1)
        }

        fireEvent.pointerDown(survival, {
            pointerId: 7,
            button: 0,
            clientX: 191,
            clientY: 150,
        })
        expect(captured).toEqual([7])
        expect(document.activeElement).toBe(survival)
        fireEvent.pointerMove(survival, {
            pointerId: 7,
            clientX: 1000,
            clientY: 150,
        })
        expect(value('Survival')).toBe(35)
        fireEvent.pointerMove(survival, {
            pointerId: 7,
            clientX: -100,
            clientY: 150,
        })
        expect(value('Survival')).toBe(0)
        fireEvent.pointerUp(survival, { pointerId: 7 })
        expect(captured).toEqual([])
        fireEvent.pointerMove(survival, {
            pointerId: 7,
            clientX: 275,
            clientY: 150,
        })
        expect(value('Survival')).toBe(0)

        const damage = handle('Damage')
        mockBounds(damage)
        damage.setPointerCapture = () => {}
        fireEvent.pointerDown(damage, {
            pointerId: 8,
            button: 0,
            clientX: 175,
            clientY: 34,
        })
        fireEvent.pointerMove(damage, {
            pointerId: 8,
            clientX: 175,
            clientY: -500,
        })
        expect(value('Damage')).toBe(100)
        fireEvent.pointerMove(damage, {
            pointerId: 8,
            clientX: 175,
            clientY: 500,
        })
        expect(value('Damage')).toBe(0)

        const healing = handle('Healing')
        let disabledCapture = false
        healing.setPointerCapture = () => {
            disabledCapture = true
        }
        fireEvent.pointerDown(healing, {
            pointerId: 9,
            button: 0,
            clientX: 175,
            clientY: 250,
        })
        expect(disabledCapture).toBe(false)
        expect(value('Healing')).toBe(0)
        expect(healing.getAttribute('aria-disabled')).toBe('true')
        expect(healing.tabIndex).toBe(-1)
    })

    test('focus, arrows, Shift, Page Up/Down and Home/End follow C2, with accessible values and reach', async () => {
        const user = await openSample()
        const damage = handle('Damage')
        damage.focus()
        expect(document.activeElement).toBe(damage)
        await user.keyboard('{Home}')
        expect(value('Damage')).toBe(0)
        await user.keyboard('{ArrowRight}')
        expect(value('Damage')).toBe(5)
        await user.keyboard('{PageUp}')
        expect(value('Damage')).toBe(25)
        await user.keyboard('{PageDown}')
        expect(value('Damage')).toBe(5)
        await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
        expect(value('Damage')).toBe(25)
        await user.keyboard('{End}')
        expect(value('Damage')).toBe(84)
        await user.keyboard('{ArrowLeft}')
        expect(value('Damage')).toBe(79)
        expect(damage.getAttribute('aria-orientation')).toBe('vertical')

        const survival = handle('Survival')
        survival.focus()
        await user.keyboard('{Home}{End}')
        expect(value('Survival')).toBe(35)
        await user.keyboard('{End}')
        expect(value('Survival')).toBe(88)
        expect(survival.getAttribute('aria-valuetext')).toBe(
            '88, can reach up to 88 with this mix'
        )
        expect(description(survival)).toBe(
            '88, can reach up to 88 with this mix'
        )
        await user.keyboard('{ArrowRight}')
        expect(value('Survival')).toBe(88)
        await user.keyboard('{PageDown}')
        expect(value('Survival')).toBe(68)
        await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
        expect(value('Survival')).toBe(88)

        for (const name of ['Healing', 'Utility']) {
            const disabled = handle(name)
            expect(disabled.getAttribute('aria-valuetext')).toBe(
                `Not simmed yet: no plan includes ${name.toLowerCase()}.`
            )
        }
    })

    test('missing reach draws no reach polygon and invents no visible or spoken caps', async () => {
        const user = await openFile(
            variant((file) => {
                for (const plan of file.plans as Record<string, unknown>[])
                    delete plan.reach
            })
        )
        expect(
            document.querySelector('[data-slot="role-current-polygon"]')
        ).not.toBeNull()
        expect(
            document.querySelector('[data-slot="role-reach-polygon"]')
        ).toBeNull()
        expect(document.body.textContent ?? '').not.toContain('Can reach')
        expect(document.body.textContent ?? '').not.toContain('No limit')
        expect(document.body.textContent ?? '').not.toContain('soft shape')
        expect(handle('Survival').getAttribute('aria-valuetext')).toBe('0')

        handle('Survival').focus()
        await user.keyboard('{End}')
        expect(value('Survival')).toBe(100)
        expect(handle('Survival').getAttribute('aria-valuetext')).toBe('100')
    })
})
