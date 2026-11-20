/**
 * Measures the built page in a real browser at several widths and fails if
 * the layout breaks: the gear pane's middle column (the new-visitor card,
 * the character sheet) collapsing, a gain pill hanging past the gear card,
 * a control (a button, a select, a slider) clipped, the chart squeezed, or
 * the page scrolling sideways. Slot names may end in an ellipsis, as the
 * mockup's do: their full name is in the button's name and a tooltip.
 * happy-dom lays nothing out, so the tests can't see any of this.
 *
 * A manual script, not part of `bun run check`: it needs a browser, through
 * the `playwright-cli` command (not a dependency of this repo), and a build.
 *
 *     bun run build:armory
 *     bun run armory:check-widths
 *
 * Without `playwright-cli` on the PATH it says so and exits 0.
 *
 * @example
 * ```sh
 * bun run armory:check-widths            # 390, 1024, 1280, 1366, 1440, 1920
 * bun run armory:check-widths 390 1100   # just these widths
 * ```
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

import { z } from 'zod'

const CLIENT = new URL('../build/client', import.meta.url).pathname
const WIDTHS_DEFAULT = [390, 1024, 1280, 1366, 1440, 1920]

/** The smallest widths that still read well, in CSS pixels. */
const LIMITS = {
    /** The new-visitor card and the sheet's column (236 px in the mockup at 1440). */
    middle: 230,
    sheet: 220,
    chart: 300,
    shape: 240,
} as const

const MeasureSchema = z.object({
    width: z.number(),
    bringIn: z.number(),
    sampleClickable: z.boolean(),
    middle: z.number(),
    sheet: z.number(),
    chart: z.number(),
    shape: z.number(),
    shapeSwitch: z.boolean(),
    shapeClipped: z.boolean(),
    clipped: z.number(),
    pillsOutside: z.number(),
    sideways: z.boolean(),
})
type Measure = z.infer<typeof MeasureSchema>

/** What runs in the browser, as `playwright-cli run-code` code. */
function browserCode(url: string, widths: number[]): string {
    return `async page => {
  const out = [];
  for (const width of ${JSON.stringify(widths)}) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(${JSON.stringify(url)});
    await page.waitForLoadState('networkidle');
    const visitor = await page.evaluate(() => {
      const card = [...document.querySelectorAll('h2')].find(h => h.textContent === 'Bring your character in')?.closest('section');
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Or look at a sample character');
      button?.scrollIntoView({ block: 'center' });
      const r = button?.getBoundingClientRect();
      const hit = r && r.width > 0 ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return { bringIn: Math.round(card?.getBoundingClientRect().width ?? 0), sampleClickable: !!(hit && button.contains(hit)) };
    });
    await page.getByRole('button', { name: 'Or look at a sample character' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-chart-loading]') && document.querySelector('[data-slot="chart"]'));
    const shapeRadio = page.getByRole('radio', { name: 'Shape', exact: true });
    const shapeDefault = await shapeRadio.isChecked();
    await page.getByText('Sliders', { exact: true }).click();
    await page.getByRole('slider', { name: 'Damage', exact: true }).waitFor();
    await page.getByText('Shape', { exact: true }).click();
    await page.locator('[data-slot="role-shape"]').waitFor();
    const shapeSwitch = shapeDefault && await shapeRadio.isChecked();
    const loaded = await page.evaluate(() => {
      const gear = document.querySelector('[data-slot="gear-pane"]');
      const box = gear.getBoundingClientRect();
      const w = (el) => Math.round(el?.getBoundingClientRect().width ?? 0);
      const shape = document.querySelector('[data-slot="role-shape"]');
      const shapeBox = shape?.getBoundingClientRect();
      const shapeHandles = [...document.querySelectorAll('[data-shape-role]')];
      // Slot buttons are left out: their pills sit past their edge on purpose.
      const controls = [...document.querySelectorAll('button, [role="combobox"], [data-slot="slider"], [data-shape-role]')]
        .filter(el => !el.closest('[data-slot^="slots-"]'));
      const pills = [...gear.querySelectorAll('button [data-size]')];
      return {
        middle: w(document.querySelector('[data-slot="doll-middle"]')),
        sheet: w(document.querySelector('[aria-label="Character sheet"]')),
        chart: w(document.querySelector('[data-slot="chart"]')),
        shape: w(shape),
        shapeClipped: !shapeBox || shapeHandles.length !== 4 || shapeBox.left < -0.5 || shapeBox.right > window.innerWidth + 0.5 || shapeHandles.some(h => {
          const r = h.getBoundingClientRect();
          return r.left < shapeBox.left - 0.5 || r.right > shapeBox.right + 0.5 || r.top < shapeBox.top - 0.5 || r.bottom > shapeBox.bottom + 0.5;
        }),
        // A slider's thumb has a wider invisible hit area: its drawn thumb is measured instead.
        clipped: controls.filter(c => {
          const r = c.getBoundingClientRect();
          if (r.right > window.innerWidth + 0.5) return true;
          if (c.matches('[data-slot="slider"]'))
            return [...c.querySelectorAll('[data-slot="slider-thumb"]')].some(t => { const b = t.getBoundingClientRect(); return b.left < r.left - 0.5 || b.right > r.right + 0.5; });
          return c.scrollWidth > c.clientWidth + 1;
        }).length,
        pillsOutside: pills.filter(p => { const r = p.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5; }).length,
        sideways: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    out.push({ width, ...visitor, shapeSwitch, ...loaded });
  }
  return JSON.stringify(out);
}`
}

/** Serves the built page (`build/client`) on a free local port. */
function serve() {
    return Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request) {
            const path = new URL(request.url).pathname
            const where = join(CLIENT, path === '/' ? 'index.html' : path)
            if (!where.startsWith(CLIENT) || !existsSync(where))
                return new Response('Not found', { status: 404 })
            return new Response(Bun.file(where), {
                headers:
                    extname(path) === '.js'
                        ? { 'content-type': 'text/javascript' }
                        : {},
            })
        },
    })
}

/** The problems at one width, in words. */
function problems(measure: Measure): string[] {
    const found: string[] = []
    if (measure.bringIn < LIMITS.middle)
        found.push(`the new-visitor card is ${measure.bringIn} px wide`)
    if (!measure.sampleClickable)
        found.push("'Or look at a sample character' can't be clicked")
    if (measure.middle < LIMITS.middle)
        found.push(`the middle column is ${measure.middle} px wide`)
    if (measure.sheet < LIMITS.sheet)
        found.push(`the sheet is ${measure.sheet} px wide`)
    if (measure.chart < LIMITS.chart)
        found.push(`the chart is ${measure.chart} px wide`)
    if (measure.shape < LIMITS.shape)
        found.push(`Shape is ${measure.shape} px wide`)
    if (!measure.shapeSwitch)
        found.push('Shape was not the default or did not survive a view switch')
    if (measure.shapeClipped)
        found.push('Shape or one of its handles is clipped')
    if (measure.clipped > 0)
        found.push(`${measure.clipped} controls are clipped`)
    if (measure.pillsOutside > 0)
        found.push(`${measure.pillsOutside} gain pills hang past the gear card`)
    if (measure.sideways) found.push('the page scrolls sideways')
    return found
}

async function main() {
    if (!Bun.which('playwright-cli')) {
        console.log(
            'check-widths: playwright-cli is not installed, so nothing was measured.'
        )
        return
    }
    if (!existsSync(join(CLIENT, 'index.html'))) {
        console.error(
            'check-widths: no build. Run `bun run build:armory` first.'
        )
        process.exit(1)
    }
    const args = process.argv.slice(2).map(Number).filter(Number.isFinite)
    const widths = args.length > 0 ? args : WIDTHS_DEFAULT
    const server = serve()
    // playwright-cli writes its logs where it runs: a temporary folder.
    const work = mkdtempSync(join(tmpdir(), 'armory-widths-'))
    const session = '-s=armory-widths'
    try {
        // Async: a blocking spawn would stop this process serving the page.
        const run = async (...command: string[]) => {
            const child = Bun.spawn(['playwright-cli', session, ...command], {
                cwd: work,
                stdout: 'pipe',
                stderr: 'pipe',
            })
            const stdout = await new Response(child.stdout).text()
            await child.exited
            return stdout
        }
        await run('open')
        const output = await run(
            'run-code',
            browserCode(server.url.href, widths)
        )
        await run('close')
        const text = output.trim()
        // The result is the first line after `### Result` (or the whole
        // output with `--raw`): a JSON string holding the measures.
        const line = text.includes('### Result')
            ? (text.split('### Result\n')[1]?.split('\n')[0] ?? '')
            : text
        let measures: unknown = null
        try {
            measures = JSON.parse(JSON.parse(line))
        } catch {
            measures = null
        }
        const parsed = z.array(MeasureSchema).safeParse(measures)
        if (!parsed.success) {
            console.error(
                'check-widths: unexpected output:',
                text.slice(0, 500)
            )
            process.exit(1)
        }
        console.log(
            'width  bring-in  middle  sheet  chart  shape  clip pills-out  sideways  shape-ok'
        )
        let failed = false
        for (const m of parsed.data) {
            console.log(
                `${String(m.width).padEnd(6)} ${String(m.bringIn).padEnd(9)} ${String(m.middle).padEnd(7)} ${String(m.sheet).padEnd(6)} ${String(m.chart).padEnd(6)} ${String(m.shape).padEnd(6)} ${String(m.clipped).padEnd(4)} ${String(m.pillsOutside).padEnd(10)} ${String(m.sideways).padEnd(8)} ${m.shapeSwitch && !m.shapeClipped}`
            )
            for (const problem of problems(m)) {
                failed = true
                console.error(`  at ${m.width} px: ${problem}`)
            }
        }
        if (failed) process.exit(1)
        console.log('check-widths: every width reads well.')
    } finally {
        await server.stop(true)
        rmSync(work, { recursive: true, force: true })
    }
}

await main()
