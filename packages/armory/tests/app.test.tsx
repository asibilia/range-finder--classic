/**
 * The armory planner's page, rendered on happy-dom. The DOM helper must be
 * the first import so React DOM and Testing Library see its globals.
 */
import './dom'

import { describe, expect, test } from 'bun:test'
import { render, screen } from '@testing-library/react'

import { App } from '../src/app'

describe('the armory planner page', () => {
    test('shows a level-one heading Armory', () => {
        render(<App />)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Armory' })
        ).toBeDefined()
    })
})
