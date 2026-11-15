/**
 * Contrast of the colour pairs the page relies on, worked out from the
 * theme's CSS variables in `src/styles.css`, light and dark: text at least
 * 4.5:1 (WCAG AA), chart lines and fills at least 3:1. A redesign that
 * changes a token is checked here.
 */
import { describe, expect, test } from 'bun:test'

const css = await Bun.file(new URL('../src/styles.css', import.meta.url)).text()

/** The `--name: value` pairs inside the first block that follows `start`. */
function tokens(start: string): Map<string, string> {
    const at = css.indexOf(start)
    if (at < 0) throw new Error(`no ${start} in styles.css`)
    const open = css.indexOf('{', at + start.length - 1)
    let depth = 0
    let end = open
    for (; end < css.length; end++) {
        if (css[end] === '{') depth++
        if (css[end] === '}' && --depth === 0) break
    }
    const body = css
        .slice(open + 1, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // The dark block nests `:root {` inside the media query.
        .replace(/:root\s*\{/, '')
    const found = new Map<string, string>()
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
        found.set(m[1]!, m[2]!.trim())
    return found
}

const light = tokens(':root {')
const dark = new Map([
    ...light,
    ...tokens('@media (prefers-color-scheme: dark) {'),
])

/** A token's oklch lightness, chroma and hue, following `var(--x)`. */
function oklch(
    theme: Map<string, string>,
    name: string
): [number, number, number] {
    let value = theme.get(name)
    for (let hops = 0; value?.startsWith('var('); hops++) {
        if (hops > 5) throw new Error(`--${name} loops`)
        value = theme.get(value.slice(6, -1))
    }
    const m = value?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/)
    if (!m) throw new Error(`--${name} is not a plain oklch() colour: ${value}`)
    return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Relative luminance (WCAG) of an oklch colour, via linear sRGB. */
function luminance([L, C, H]: [number, number, number]): number {
    const h = (H * Math.PI) / 180
    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}

function ratio(theme: Map<string, string>, fg: string, bg: string): number {
    const a = luminance(oklch(theme, fg))
    const b = luminance(oklch(theme, bg))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Text on the page and on the cards: 4.5:1. */
const TEXT = [
    'foreground',
    'muted-foreground',
    // Coloured text: reading deltas, `Plan: out of mana`, the DPS axis
    // title, the coloured times (chart-1-text); the Mana axis title and
    // ticks (chart-2-text); the Needs level chip and outlined pills.
    'chart-1-text',
    'chart-2-text',
    'gain-text',
    // Good changes in the readings and the Copied note.
    'good-text',
]

/**
 * Lines, fills and markers that carry meaning on their own: 3:1. (The
 * gain pill's --gain fill isn't one: its text says the gain, checked
 * above against the fill.)
 */
const GRAPHICS = ['chart-1', 'chart-2', 'muted-foreground']

describe.each([
    ['light', light],
    ['dark', dark],
] as const)('%s theme', (_, theme) => {
    for (const bg of ['background', 'card'])
        for (const fg of TEXT)
            test(`--${fg} text on --${bg} is at least 4.5:1`, () => {
                expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5)
            })

    test('a filled gain pill: --gain-foreground on --gain is at least 4.5:1', () => {
        expect(ratio(theme, 'gain-foreground', 'gain')).toBeGreaterThanOrEqual(
            4.5
        )
    })

    for (const bg of ['background', 'card'])
        for (const fg of GRAPHICS)
            test(`--${fg} graphics on --${bg} are at least 3:1`, () => {
                expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(3)
            })
})

test('the checker agrees with known values (black on white is 21:1)', () => {
    const bw = new Map([
        ['black', 'oklch(0 0 0)'],
        ['white', 'oklch(1 0 0)'],
    ])
    expect(ratio(bw, 'black', 'white')).toBeCloseTo(21, 1)
})
