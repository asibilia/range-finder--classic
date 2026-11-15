/**
 * Wrangler, run by the armory's scripts (`wrangler types` in type-check),
 * sends usage metrics to Cloudflare and checks npm for a newer version
 * unless told not to. `WRANGLER_SEND_METRICS=false` turns the metrics off.
 * Wrangler has no switch for the update check alone; it runs it to print
 * its banner, and `WRANGLER_HIDE_BANNER=true` skips both. Every Wrangler
 * command in the armory's scripts sets the two, and CI sets them on the job.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../..')

const QUIET = ['WRANGLER_SEND_METRICS=false', 'WRANGLER_HIDE_BANNER=true']

type Workflow = {
    jobs?: Record<string, { env?: Record<string, unknown> }>
}

function scriptsOf(path: string): Record<string, string> {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as {
        scripts?: Record<string, string>
    }
    return pkg.scripts ?? {}
}

/** Each command of a script line, split on `&&`, `||` and `;`. */
function commands(script: string): string[] {
    return script.split(/&&|\|\||;/).map((c) => c.trim())
}

/** Runs the wrangler bin (`wrangler`, `bunx wrangler`), not `vite`. */
const RUNS_WRANGLER = /(^|\s)(bunx\s+|npx\s+)?wrangler(\s|$)/

describe('Wrangler in the scripts', () => {
    for (const path of ['packages/armory/package.json', 'package.json']) {
        test(`every Wrangler command in ${path} turns off metrics and the update check`, () => {
            const wranglerCommands = Object.entries(scriptsOf(path)).flatMap(
                ([name, script]) =>
                    commands(script)
                        .filter((c) => RUNS_WRANGLER.test(c))
                        .map((c) => ({ name, command: c }))
            )
            if (path.startsWith('packages/armory'))
                expect(wranglerCommands.length).toBeGreaterThan(0)
            for (const { name, command } of wranglerCommands) {
                const env = command.slice(0, command.search(RUNS_WRANGLER))
                for (const assignment of QUIET)
                    expect(`${name}: ${env.trim()}`).toContain(assignment)
            }
        })
    }
})

describe('Wrangler in CI', () => {
    test('ci.yml sets WRANGLER_SEND_METRICS=false and WRANGLER_HIDE_BANNER=true on the check job', () => {
        const ci = Bun.YAML.parse(
            readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
        ) as Workflow
        const env = ci.jobs?.check?.env ?? {}
        expect(String(env['WRANGLER_SEND_METRICS'])).toBe('false')
        expect(String(env['WRANGLER_HIDE_BANNER'])).toBe('true')
    })
})
