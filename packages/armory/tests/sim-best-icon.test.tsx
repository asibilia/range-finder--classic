/**
 * The Simulated Best icon (`SimBestIcon`): a star in a ring, orange with a
 * dashed ring for the sim's best, green with a solid ring once you own it.
 * The DOM helper must be the first import.
 */
import './dom'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import { SimBestIcon } from '../src/components/sim-best-icon'

afterEach(() => {
    cleanup()
})

/** An SVG attribute, set as an attribute or as an inline style. */
function paint(element: Element | null, name: 'fill' | 'stroke-dasharray') {
    if (!element) return null
    const attribute = element.getAttribute(name)
    if (attribute) return attribute
    const style = (element as SVGElement).style?.getPropertyValue(name)
    return style ? style : null
}

describe('SimBestIcon', () => {
    test('best: a dashed ring and a star filled var(--primary)', () => {
        const { container } = render(<SimBestIcon variant="best" />)
        const svg = container.querySelector('svg')
        expect(svg).not.toBeNull()
        expect(
            paint(svg!.querySelector('circle'), 'stroke-dasharray')
        ).not.toBe(null)
        expect(paint(svg!.querySelector('path'), 'fill')).toBe('var(--primary)')
    })

    test('owned: a solid ring and a star filled var(--owned)', () => {
        const { container } = render(<SimBestIcon variant="owned" />)
        const svg = container.querySelector('svg')
        expect(svg).not.toBeNull()
        const circle = svg!.querySelector('circle')
        expect(circle).not.toBeNull()
        expect(paint(circle, 'stroke-dasharray')).toBeNull()
        expect(paint(svg!.querySelector('path'), 'fill')).toBe('var(--owned)')
    })

    test('is hidden from screen readers with no label, and an image named by its label with one', () => {
        const { container } = render(
            <>
                <SimBestIcon variant="best" />
                <SimBestIcon variant="owned" label="You own the sim's best" />
            </>
        )
        const [hidden] = container.querySelectorAll('svg')
        expect(hidden!.getAttribute('aria-hidden')).toBe('true')
        expect(
            screen.getByRole('img', { name: "You own the sim's best" })
        ).toBeDefined()
        expect(screen.getAllByRole('img')).toHaveLength(1)
    })
})
