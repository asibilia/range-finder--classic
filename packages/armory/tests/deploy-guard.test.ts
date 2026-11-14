/**
 * Nothing deploys the armory planner. Publishing it is the owner's decision
 * (slice A is local only): no script in the root or armory package.json and
 * no workflow under .github/workflows/ may run `wrangler deploy`,
 * `wrangler versions upload` or `wrangler publish` on it, or be a `deploy`
 * / `deploy:*` script for it.
 *
 * Only the armory is guarded. The release workflows package and upload the
 * addon with the BigWigs packager, and the Turbo site (packages/web) plans
 * its own deploy; a deploy that names neither `armory` nor
 * `packages/armory` is not this test's business.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../..')
const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')

/** Wrangler commands that put a Worker online. */
const DEPLOY_COMMAND = /\bwrangler\s+(deploy|publish|versions\s+upload)\b/
/** A script named deploy or deploy:*, or a run of one. */
const DEPLOY_SCRIPT_NAME = /^deploy(:.*)?$/
const RUNS_DEPLOY_SCRIPT = /\bbun\s+(run\s+)?deploy(:\S*)?\b/
/** Cloudflare's action deploys unless told otherwise. */
const WRANGLER_ACTION = /^cloudflare\/wrangler-action@/

type Step = {
    uses?: string
    run?: string
    'working-directory'?: string
    with?: Record<string, unknown>
}
type Workflow = {
    defaults?: { run?: { 'working-directory'?: string } }
    jobs?: Record<
        string,
        {
            defaults?: { run?: { 'working-directory'?: string } }
            steps?: Step[]
        }
    >
}

const namesArmory = (text: string) => /armory/.test(text)

/**
 * The scripts in a package.json that deploy the armory. In the armory's
 * own package.json every deploy counts; in the root one, a deploy counts
 * when it names the armory.
 *
 * @param scripts - the `scripts` object
 * @param isArmoryPackage - true for packages/armory/package.json
 * @returns `name: script` for each offender
 */
function armoryDeployScripts(
    scripts: Record<string, string>,
    isArmoryPackage: boolean
): string[] {
    return Object.entries(scripts)
        .filter(([name, script]) => {
            const deploys =
                DEPLOY_COMMAND.test(script) ||
                RUNS_DEPLOY_SCRIPT.test(script) ||
                DEPLOY_SCRIPT_NAME.test(name)
            return deploys && (isArmoryPackage || namesArmory(name + script))
        })
        .map(([name, script]) => `${name}: ${script}`)
}

/**
 * The steps of a parsed workflow that deploy the armory: a step that runs
 * a Wrangler deploy command, a deploy script or Cloudflare's Wrangler
 * action, and names the armory in its command, inputs or working
 * directory.
 *
 * @param workflow - the parsed workflow file
 * @returns `job: step` for each offender
 */
function armoryDeploySteps(workflow: Workflow): string[] {
    const offenders: string[] = []
    const workflowDir = workflow.defaults?.run?.['working-directory'] ?? ''
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const jobDir = job.defaults?.run?.['working-directory'] ?? ''
        for (const step of job.steps ?? []) {
            const text = [
                step.run ?? '',
                ...Object.values(step.with ?? {}).map(String),
            ].join('\n')
            const deploys =
                DEPLOY_COMMAND.test(text) ||
                RUNS_DEPLOY_SCRIPT.test(text) ||
                WRANGLER_ACTION.test(step.uses ?? '')
            const where = [
                text,
                step['working-directory'] ?? '',
                jobDir,
                workflowDir,
            ].join('\n')
            if (deploys && namesArmory(where))
                offenders.push(`${jobName}: ${step.run ?? step.uses}`)
        }
    }
    return offenders
}

function scriptsOf(path: string): Record<string, string> {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as {
        scripts?: Record<string, string>
    }
    return pkg.scripts ?? {}
}

describe('the guard itself', () => {
    test('catches armory deploy scripts and leaves others alone', () => {
        expect(
            armoryDeployScripts(
                {
                    build: 'bunx react-router build',
                    ship: 'bunx wrangler deploy',
                    'deploy:preview': 'bunx wrangler versions upload',
                },
                true
            )
        ).toEqual([
            'ship: bunx wrangler deploy',
            'deploy:preview: bunx wrangler versions upload',
        ])
        expect(
            armoryDeployScripts(
                {
                    'deploy:armory': 'cd packages/armory && bun run build',
                    'publish:armory':
                        'cd packages/armory && bunx wrangler publish',
                    'deploy:web': 'cd packages/web && bunx wrangler deploy',
                    'build:armory': 'cd packages/armory && bun run build',
                },
                false
            )
        ).toEqual([
            'deploy:armory: cd packages/armory && bun run build',
            'publish:armory: cd packages/armory && bunx wrangler publish',
        ])
    })

    test('catches armory deploy steps and leaves others alone', () => {
        expect(
            armoryDeploySteps({
                jobs: {
                    a: {
                        steps: [
                            {
                                run: 'bunx wrangler deploy',
                                'working-directory': 'packages/armory',
                            },
                            { run: 'bun run deploy:armory' },
                            {
                                uses: 'cloudflare/wrangler-action@v3',
                                with: { workingDirectory: 'packages/armory' },
                            },
                        ],
                    },
                    b: {
                        defaults: {
                            run: { 'working-directory': 'packages/armory' },
                        },
                        steps: [{ run: 'bunx wrangler versions upload' }],
                    },
                },
            })
        ).toEqual([
            'a: bunx wrangler deploy',
            'a: bun run deploy:armory',
            'a: cloudflare/wrangler-action@v3',
            'b: bunx wrangler versions upload',
        ])
        expect(
            armoryDeploySteps({
                jobs: {
                    web: {
                        steps: [
                            {
                                run: 'bunx wrangler deploy',
                                'working-directory': 'packages/web',
                            },
                            { uses: 'BigWigsMods/packager@v2' },
                            { run: 'bun run build:armory' },
                        ],
                    },
                },
            })
        ).toEqual([])
    })
})

describe('nothing deploys the armory planner', () => {
    test('no script in packages/armory/package.json deploys it', () => {
        expect(
            armoryDeployScripts(scriptsOf('packages/armory/package.json'), true)
        ).toEqual([])
    })

    test('no script in the root package.json deploys it', () => {
        expect(armoryDeployScripts(scriptsOf('package.json'), false)).toEqual(
            []
        )
    })

    test('no workflow under .github/workflows/ deploys it', () => {
        const files = readdirSync(WORKFLOWS_DIR).filter((f) =>
            /\.ya?ml$/.test(f)
        )
        expect(files.length).toBeGreaterThan(0)
        const offenders = files.flatMap((file) =>
            armoryDeploySteps(
                Bun.YAML.parse(
                    readFileSync(join(WORKFLOWS_DIR, file), 'utf8')
                ) as Workflow
            ).map((step) => `${file}: ${step}`)
        )
        expect(offenders).toEqual([])
    })
})
