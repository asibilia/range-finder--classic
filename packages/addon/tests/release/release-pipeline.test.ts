/**
 * The release pipeline, read from the repo's own config: changesets in beta
 * pre-release mode keeps a Version PR open, merging it tags `v<version>`, the
 * tag starts the BigWigs packager, and the packaged zip is checked before it
 * ships. GitHub itself can't run here, so these tests read the workflows,
 * the changesets files and the packager's `.pkgmeta` as the contract.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '../../../..')
const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')
const ADDON_FOLDER = 'packages/addon/Turbo'
const ADDON_CHANGELOG = 'packages/addon/CHANGELOG.md'

type Step = {
    id?: string
    name?: string
    uses?: string
    run?: string
    if?: string
    with?: Record<string, unknown>
    env?: Record<string, unknown>
}
type Job = {
    if?: string
    uses?: string
    permissions?: unknown
    steps?: Step[]
}
type Workflow = {
    file: string
    on: Record<string, unknown>
    permissions?: unknown
    jobs: Record<string, Job>
}

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'))
}

/** `on:` as an object, whichever of its three YAML shapes a workflow uses. */
function triggers(raw: Record<string | number, unknown>) {
    const on = raw.on ?? raw['true']
    if (typeof on === 'string') return { [on]: {} }
    if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [e, {}]))
    return (on ?? {}) as Record<string, unknown>
}

function loadWorkflows(): Workflow[] {
    if (!existsSync(WORKFLOWS_DIR)) return []
    return readdirSync(WORKFLOWS_DIR)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((file) => {
            const raw = Bun.YAML.parse(
                readFileSync(join(WORKFLOWS_DIR, file), 'utf8')
            ) as Record<string | number, unknown>
            return {
                file,
                on: triggers(raw),
                permissions: raw.permissions,
                jobs: (raw.jobs ?? {}) as Record<string, Job>,
            }
        })
}

function stepsOf(job: Job): Step[] {
    return job.steps ?? []
}

function isPackager(step: Step): boolean {
    return (step.uses ?? '').startsWith('BigWigsMods/packager')
}

function isChangesetsAction(step: Step): boolean {
    return (step.uses ?? '').startsWith('changesets/action')
}

function argsOf(step: Step): string[] {
    const args = step.with?.args
    return typeof args === 'string' ? args.trim().split(/\s+/) : []
}

/** `-d` alone or bundled (`-dz`): the packager builds but uploads nothing. */
function skipsUpload(step: Step): boolean {
    return argsOf(step).some((a) => /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a))
}

function argValue(step: Step, flag: string): string | undefined {
    const args = argsOf(step)
    const at = args.indexOf(flag)
    return at >= 0 ? args[at + 1] : undefined
}

function pushTags(wf: Workflow): string[] {
    const push = wf.on.push as { tags?: string[] } | null | undefined
    return push?.tags ?? []
}

function changesetsWorkflow(): Workflow {
    const wf = loadWorkflows().find((w) =>
        Object.values(w.jobs).some((j) => stepsOf(j).some(isChangesetsAction))
    )
    if (!wf) throw new Error('No workflow runs changesets/action')
    return wf
}

function releaseWorkflow(): Workflow {
    const wf = loadWorkflows().find(
        (w) =>
            pushTags(w).length > 0 &&
            Object.values(w.jobs).some((j) => stepsOf(j).some(isPackager))
    )
    if (!wf) {
        throw new Error('No workflow runs the BigWigs packager on a tag push')
    }
    return wf
}

/** The job and step in the release workflow that build and upload. */
function uploadStep(): { job: Job; step: Step; index: number } {
    for (const job of Object.values(releaseWorkflow().jobs)) {
        const steps = stepsOf(job)
        const index = steps.findIndex((s) => isPackager(s) && !skipsUpload(s))
        if (index >= 0) return { job, step: steps[index], index }
    }
    throw new Error('The release workflow never runs an uploading packager')
}

function canWrite(wf: Workflow, job: Job, scope: string): boolean {
    const perms = job.permissions ?? wf.permissions
    if (perms === 'write-all') return true
    if (!perms || typeof perms !== 'object') return false
    return (perms as Record<string, string>)[scope] === 'write'
}

/** Runs a `bun run <script>` command down to what the script runs. */
function resolveCommand(command: string): string {
    const scripts = readJson('package.json').scripts as Record<string, string>
    const script = command.match(/^bun(?:x)?\s+(?:run\s+)?([\w:-]+)$/)?.[1]
    return script && scripts[script] ? scripts[script] : command
}

/** The packager's `.pkgmeta`, found the way the uploading step finds it. */
function pkgmeta(): { topdir: string; meta: Record<string, unknown> } {
    const { step } = uploadStep()
    const topdir = posix.normalize(argValue(step, '-t') ?? '.')
    const chosen = argValue(step, '-m')
    const candidates = chosen
        ? [chosen]
        : [posix.join(topdir, '.pkgmeta'), posix.join(topdir, 'pkgmeta.yaml')]
    const found = candidates.find((c) => existsSync(join(REPO_ROOT, c)))
    if (!found) throw new Error(`No packager config at ${candidates}`)
    const meta = Bun.YAML.parse(
        readFileSync(join(REPO_ROOT, found), 'utf8')
    ) as Record<string, unknown>
    return { topdir, meta }
}

/** A bash `[[ path == pattern ]]` match, as the packager's ignore list uses. */
function bashMatch(path: string, pattern: string): boolean {
    const source = pattern
        .split('')
        .map((c) =>
            c === '*'
                ? '.*'
                : c === '?'
                  ? '.'
                  : c.replace(/[.+^${}()|\\[\]]/g, '\\$&')
        )
        .join('')
    return new RegExp(`^${source}$`).test(path)
}

function trackedFiles(): string[] {
    const result = Bun.spawnSync(['git', 'ls-files'], { cwd: REPO_ROOT })
    return result.stdout.toString().split('\n').filter(Boolean)
}

describe('the Version PR', () => {
    test('changesets is in beta pre-release mode, covering the addon', () => {
        const pre = readJson('.changeset/pre.json')

        expect(pre.mode).toBe('pre')
        expect(pre.tag).toBe('beta')
        expect(
            Object.keys(pre.initialVersions as Record<string, string>)
        ).toContain('@goturbo/addon')
    })

    test('every push to main runs changesets/action, which keeps a Version PR open and bumps versions when merged', () => {
        const wf = changesetsWorkflow()
        const push = wf.on.push as { branches?: string[] } | undefined

        expect(push?.branches).toContain('main')
        const [job, step] = Object.values(wf.jobs)
            .map((j) => [j, stepsOf(j).find(isChangesetsAction)] as const)
            .find(([, s]) => s)!
        const version = step!.with?.version
        expect(typeof version).toBe('string')
        expect(resolveCommand(version as string)).toMatch(/changeset version/)
        expect(canWrite(wf, job, 'contents')).toBe(true)
        expect(canWrite(wf, job, 'pull-requests')).toBe(true)

        const config = readJson('.changeset/config.json')
        expect(config.ignore as string[]).not.toContain('@goturbo/addon')
        expect(config.changelog).not.toBe(false)
        expect(
            (config.privatePackages as Record<string, boolean>).version
        ).toBe(true)
    })
})

describe('tagging a release', () => {
    test('once no changesets are pending, a step tags the addon version and pushes the tag', () => {
        const wf = changesetsWorkflow()
        const tagging = Object.values(wf.jobs)
            .map((job) => {
                const steps = stepsOf(job)
                const index = steps.findIndex((s) =>
                    (s.run ?? '').includes('release-tag')
                )
                return { job, steps, index }
            })
            .find((t) => t.index >= 0)

        expect(tagging).toBeDefined()
        const { job, steps, index } = tagging!
        expect(`${steps[index].if ?? ''} ${job.if ?? ''}`).toMatch(
            /hasChangesets/
        )
        expect(
            steps.slice(index).some((s) => /git push/.test(s.run ?? ''))
        ).toBe(true)
    })

    test('pushing a v<version> tag starts the BigWigs packager', () => {
        const wf = releaseWorkflow()

        expect(pushTags(wf).some((t) => t.startsWith('v'))).toBe(true)
        expect(uploadStep().step.uses).toMatch(/^BigWigsMods\/packager@v2/)
    })

    test("the tag reaches the packager even though pushes made with the workflow's own token start no workflows", () => {
        const release = releaseWorkflow()
        const changesets = changesetsWorkflow()
        const jobs = Object.values(changesets.jobs)

        const called =
            'workflow_call' in release.on &&
            jobs.some((j) => (j.uses ?? '').endsWith(release.file))
        const dispatched =
            'workflow_dispatch' in release.on &&
            jobs.some((j) =>
                stepsOf(j).some((s) =>
                    new RegExp(`gh workflow run\\s+\\S*${release.file}`).test(
                        s.run ?? ''
                    )
                )
            )
        const ownToken = jobs.some((j) => {
            const steps = stepsOf(j)
            if (!steps.some((s) => (s.run ?? '').includes('release-tag'))) {
                return false
            }
            return steps.some((s) => {
                const token = String(s.with?.token ?? '')
                return (
                    (s.uses ?? '').startsWith('actions/checkout') &&
                    token !== '' &&
                    !/GITHUB_TOKEN|github\.token/.test(token)
                )
            })
        })

        expect(called || dispatched || ownToken).toBe(true)
    })
})

describe('the packaging config', () => {
    test('packages the addon as Turbo', () => {
        expect(pkgmeta().meta['package-as']).toBe('Turbo')
    })

    test('ships only files from the addon folder', () => {
        const { topdir, meta } = pkgmeta()
        const ignore = (meta.ignore as string[] | undefined) ?? []
        const prefix = topdir === '.' ? '' : `${topdir}/`

        const shipped = trackedFiles()
            .filter((f) => f.startsWith(prefix))
            .map((f) => f.slice(prefix.length))
            .filter((f) => !f.split('/').some((part) => part.startsWith('.')))
            .filter(
                (f) =>
                    !ignore.some(
                        (p) =>
                            bashMatch(f, p) ||
                            bashMatch(f, `${p.replace(/\/$/, '')}/*`)
                    )
            )
            .map((f) => `${prefix}${f}`)

        expect(shipped).toContain(`${ADDON_FOLDER}/Turbo_Camelot.toc`)
        expect(
            shipped.filter((f) => !f.startsWith(`${ADDON_FOLDER}/`))
        ).toEqual([])
    })

    test("the newest entry of the addon's changelog becomes the release notes", () => {
        const manual = pkgmeta().meta['manual-changelog']
        const notesFile =
            typeof manual === 'string'
                ? manual
                : (manual as { filename?: string } | undefined)?.filename
        expect(notesFile).toBeTruthy()

        const { job, index } = uploadStep()
        const notesStep = stepsOf(job)
            .slice(0, index)
            .find((s) => (s.run ?? '').includes('release-notes'))
        expect(notesStep).toBeDefined()
        expect(notesStep!.run).toContain(ADDON_CHANGELOG)
        expect(notesStep!.run).toContain(posix.basename(notesFile!))
    })
})

describe('the packaged-zip check', () => {
    test('every pull request packages the addon without uploading, then checks the zip', () => {
        const pr = loadWorkflows().filter((w) => 'pull_request' in w.on)
        const packagers = pr.flatMap((w) =>
            Object.values(w.jobs).flatMap((j) => stepsOf(j).filter(isPackager))
        )

        expect(packagers.length).toBeGreaterThan(0)
        expect(packagers.every(skipsUpload)).toBe(true)
        const checked = pr.some((w) =>
            Object.values(w.jobs).some((j) => {
                const steps = stepsOf(j)
                const built = steps.findIndex(isPackager)
                return (
                    built >= 0 &&
                    steps
                        .slice(built + 1)
                        .some((s) => (s.run ?? '').includes('check-package'))
                )
            })
        )
        expect(checked).toBe(true)
    })

    test('the release checks the zip it packages', () => {
        const jobs = Object.values(releaseWorkflow().jobs)

        const checked = jobs.some((j) => {
            const steps = stepsOf(j)
            const built = steps.findIndex(isPackager)
            return (
                built >= 0 &&
                steps
                    .slice(built + 1)
                    .some((s) => (s.run ?? '').includes('check-package'))
            )
        })
        expect(checked).toBe(true)
    })
})

describe('publishing', () => {
    test('the release checks out full history, so the packager versions from the tag', () => {
        const { job, index } = uploadStep()
        const checkout = stepsOf(job)
            .slice(0, index)
            .find((s) => (s.uses ?? '').startsWith('actions/checkout'))

        expect(checkout).toBeDefined()
        expect(Number(checkout!.with?.['fetch-depth'])).toBe(0)
    })

    test('store tokens come from repo secrets, so a missing one skips that store, and the GitHub release uses the workflow token', () => {
        const { step } = uploadStep()
        const env = (step.env ?? {}) as Record<string, string>

        expect(env.CF_API_KEY).toMatch(/secrets\.\w+/)
        expect(env.WAGO_API_TOKEN).toMatch(/secrets\.\w+/)
        expect(env.GITHUB_OAUTH).toMatch(/secrets\.GITHUB_TOKEN|github\.token/)
    })

    test('the release job may create GitHub releases', () => {
        const { job } = uploadStep()

        expect(canWrite(releaseWorkflow(), job, 'contents')).toBe(true)
    })
})

describe('no manual release steps', () => {
    test('merging the Version PR is the only step: main pushes run the Version PR workflow, and nothing waits on a manual input', () => {
        const wf = changesetsWorkflow()
        const release = releaseWorkflow()

        expect(Object.keys(wf.on)).toContain('push')
        for (const on of [wf.on, release.on]) {
            type Dispatch = { inputs?: Record<string, { required?: boolean }> }
            const dispatch = (on.workflow_dispatch ?? {}) as Dispatch
            const required = Object.values(dispatch.inputs ?? {}).filter(
                (i) => i.required
            )
            expect(required).toEqual([])
        }
        expect(existsSync(join(REPO_ROOT, 'dev-tools'))).toBe(false)
    })
})
