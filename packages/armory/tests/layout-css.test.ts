import { describe, expect, test } from 'bun:test'

const css = await Bun.file(new URL('../src/styles.css', import.meta.url)).text()

describe('the page layout (approved C2 layout: gear on the left, the card on the right)', () => {
    test('at desktop width the gear and the card sit side by side in two columns', () => {
        const desktop = css.match(
            /@media \(min-width: 64rem\) \{([\s\S]*?)\n\}/
        )
        expect(desktop).not.toBeNull()
        expect(desktop![1]).toMatch(
            /\.planner-body \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) 26rem;/
        )
    })
})
