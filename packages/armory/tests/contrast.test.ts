/**
 * Contrast of the colour pairs the page relies on, worked out from the
 * theme's CSS variables in `src/styles.css`. The page is dark only: one
 * theme, in `:root`. Text at least 4.5:1 (WCAG AA), chart lines and fills
 * at least 3:1. A redesign that changes a token is checked here.
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
    const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '')
    const found = new Map<string, string>()
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
        found.set(m[1]!, m[2]!.trim())
    return found
}

const theme = tokens(':root {')

/** A colour: oklch lightness, chroma, hue and alpha (1 when opaque). */
type Colour = [number, number, number, number]

/** A token's oklch colour, following `var(--x)`. */
function colour(from: Map<string, string>, name: string): Colour {
    let value = from.get(name)
    for (let hops = 0; value?.startsWith('var('); hops++) {
        if (hops > 5) throw new Error(`--${name} loops`)
        value = from.get(value.slice(6, -1))
    }
    const m = value?.match(
        /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)%)?\)$/
    )
    if (!m) throw new Error(`--${name} is not a plain oklch() colour: ${value}`)
    return [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        m[4] === undefined ? 1 : Number(m[4]) / 100,
    ]
}

/** A token's oklch lightness, chroma and hue: an opaque colour only. */
function oklch(
    from: Map<string, string>,
    name: string
): [number, number, number] {
    const [L, C, H, alpha] = colour(from, name)
    if (alpha !== 1) throw new Error(`--${name} has an alpha: ${alpha}`)
    return [L, C, H]
}

/** An oklch colour as gamma-encoded sRGB, each 0 to 1. */
function srgb([L, C, H]: [number, number, number]): [number, number, number] {
    const h = (H * Math.PI) / 180
    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    const encode = (v: number) =>
        v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    return [
        encode(clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
        encode(clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
        encode(clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    ]
}

/** Relative luminance (WCAG) of a gamma-encoded sRGB colour. */
function srgbLuminance([r, g, b]: [number, number, number]): number {
    const linear = (v: number) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** Relative luminance (WCAG) of an oklch colour, via linear sRGB. */
function luminance(colour: [number, number, number]): number {
    return srgbLuminance(srgb(colour))
}

function ratio(from: Map<string, string>, fg: string, bg: string): number {
    const a = luminance(oklch(from, fg))
    const b = luminance(oklch(from, bg))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Text on a see-through surface (`--glass`, `--pill`, which carry an
 * alpha) laid over an opaque one: the surface is blended over `under` as
 * the browser does (in sRGB), then the text is measured on the blend.
 */
function ratioOver(
    from: Map<string, string>,
    fg: string,
    surface: string,
    under: string
): number {
    const [L, C, H, alpha] = colour(from, surface)
    const top = srgb([L, C, H])
    const bottom = srgb(oklch(from, under))
    const blend = top.map((v, i) => v * alpha + bottom[i]! * (1 - alpha)) as [
        number,
        number,
        number,
    ]
    const a = luminance(oklch(from, fg))
    const b = srgbLuminance(blend)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Text on the page and on the cards: 4.5:1. */
const TEXT = [
    'foreground',
    'muted-foreground',
    // Small secondary lines (the owner's design).
    'subtle-foreground',
    // Coloured text: reading deltas, `Plan: out of mana`, the DPS axis
    // title, the coloured times (chart-1-text); the Mana axis title and
    // ticks (chart-2-text); the Needs level chip and outlined pills.
    'chart-1-text',
    'chart-2-text',
    'gain-text',
    // Good changes in the readings and the Copied note.
    'good-text',
    // The green of BIS, the owned icon and the all-best card.
    'owned',
    // The accent (the owner's orange).
    'primary',
]

/**
 * Lines, fills and markers that carry meaning on their own: 3:1. (The
 * gain pill's --gain fill isn't one: its text says the gain, checked
 * against the fill.)
 */
const GRAPHICS = [
    'chart-1',
    'chart-2',
    'muted-foreground',
    // The Simulated Best icon's rings and stars: `best` and `owned`.
    'primary',
    'owned',
    // Item quality: the icon squares' borders.
    'quality-uncommon',
    'quality-rare',
]

describe('the theme (dark only)', () => {
    test('styles.css has no prefers-color-scheme: the page no longer follows the system', () => {
        expect(css).not.toContain('prefers-color-scheme')
    })

    test("its :root holds the owner's design tokens (#0D0D0D, #FFFFFF, #F0782D, #5CCB8A, #3BA3DB)", () => {
        expect(theme.get('background')).toBe('oklch(0.159 0 0)')
        expect(theme.get('foreground')).toBe('oklch(1 0 0)')
        expect(theme.get('primary')).toBe('oklch(0.701 0.17 48.3)')
        expect(theme.get('owned')).toBe('oklch(0.76 0.139 155.3)')
        expect(theme.get('mana')).toBe('oklch(0.68 0.125 236.6)')
    })

    test('the see-through surfaces keep their alpha: glass 70%, pill 85%', () => {
        expect(theme.get('glass')).toBe('oklch(0.213 0 0 / 70%)')
        expect(theme.get('pill')).toBe('oklch(0.967 0 0 / 85%)')
    })

    test('text on the see-through surfaces is at least 4.5:1: the page text on glass (over --background and --card), --pill-foreground on the pill (over --background and --card)', () => {
        const low: string[] = []
        for (const under of ['background', 'card']) {
            for (const fg of [
                'foreground',
                'muted-foreground',
                'subtle-foreground',
                'primary',
                'owned',
            ]) {
                const r = ratioOver(theme, fg, 'glass', under)
                if (r < 4.5)
                    low.push(
                        `--${fg} on --glass over --${under}: ${r.toFixed(2)}`
                    )
            }
            const r = ratioOver(theme, 'pill-foreground', 'pill', under)
            if (r < 4.5)
                low.push(
                    `--pill-foreground on --pill over --${under}: ${r.toFixed(2)}`
                )
        }
        expect(low).toEqual([])
    })

    /*
     * The design's --pill-muted-foreground (#7F7F7F) is about 2.6:1 on the
     * pill over the page, under 4.5:1, so it is kept for marks that aren't
     * text (and asked about) rather than changed here. This pins that: when
     * the design's value changes to pass, move it into the check above.
     */
    test('--pill-muted-foreground on the pill is under 4.5:1 (the design value; not used for text)', () => {
        expect(
            ratioOver(theme, 'pill-muted-foreground', 'pill', 'background')
        ).toBeLessThan(4.5)
    })

    test('--owned on --owned-surface (the BIS badge) is at least 4.5:1', () => {
        expect(ratio(theme, 'owned', 'owned-surface')).toBeGreaterThanOrEqual(
            4.5
        )
    })

    test('every text pair is at least 4.5:1: each text colour (owned and primary included) on --background and --card, --primary-foreground on --primary, --gain-foreground on --gain', () => {
        const pairs: [string, string][] = [
            ['primary-foreground', 'primary'],
            ['gain-foreground', 'gain'],
        ]
        for (const bg of ['background', 'card'])
            for (const fg of TEXT) pairs.push([fg, bg])
        const low = pairs
            .map(([fg, bg]) => [fg, bg, ratio(theme, fg, bg)] as const)
            .filter(([, , r]) => r < 4.5)
            .map(([fg, bg, r]) => `--${fg} on --${bg}: ${r.toFixed(2)}`)
        expect(low).toEqual([])
    })

    test('every chart colour and marker (the icon colours included) on --background and --card is at least 3:1', () => {
        const low: string[] = []
        for (const bg of ['background', 'card'])
            for (const fg of GRAPHICS) {
                const r = ratio(theme, fg, bg)
                if (r < 3) low.push(`--${fg} on --${bg}: ${r.toFixed(2)}`)
            }
        expect(low).toEqual([])
    })
})

/*
 * The per-pair checks, under the names they had when the page had a light
 * and a dark theme. Both now read the one theme, `:root`; the colours
 * added since (owned, primary) are checked above.
 */
const OLD_TEXT = TEXT.filter((name) => name !== 'owned' && name !== 'primary')
const OLD_GRAPHICS = ['chart-1', 'chart-2', 'muted-foreground']

describe.each([
    ['light', theme],
    ['dark', theme],
] as const)('%s theme', (_, one) => {
    for (const bg of ['background', 'card'])
        for (const fg of OLD_TEXT)
            test(`--${fg} text on --${bg} is at least 4.5:1`, () => {
                expect(ratio(one, fg, bg)).toBeGreaterThanOrEqual(4.5)
            })

    test('a filled gain pill: --gain-foreground on --gain is at least 4.5:1', () => {
        expect(ratio(one, 'gain-foreground', 'gain')).toBeGreaterThanOrEqual(
            4.5
        )
    })

    for (const bg of ['background', 'card'])
        for (const fg of OLD_GRAPHICS)
            test(`--${fg} graphics on --${bg} are at least 3:1`, () => {
                expect(ratio(one, fg, bg)).toBeGreaterThanOrEqual(3)
            })
})

test('the checker agrees with known values (black on white is 21:1)', () => {
    const bw = new Map([
        ['black', 'oklch(0 0 0)'],
        ['white', 'oklch(1 0 0)'],
    ])
    expect(ratio(bw, 'black', 'white')).toBeCloseTo(21, 1)
})
