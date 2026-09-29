#!/usr/bin/env bun
/**
 * Downloads the pinned Lua dev tools into the repo's gitignored `.tools/`.
 *
 * - **LuaLS** (`lua-language-server`), the headless lint and type checker, as
 *   a release tarball checked against its sha256.
 * - **Ketho's WoW API annotations** (`Annotations/Core` only), which LuaLS
 *   reads as a library.
 * - **Forever's API documentation** (`Blizzard_APIDocumentationGenerated` from
 *   Gethe/wow-ui-source, `forever` branch), which the secret-read guard reads
 *   to learn which game functions return secret values.
 *
 * The two git sources are fetched sparse and shallow at a pinned commit, so a
 * run downloads a few MB and takes seconds. Each tool folder gets a `.pin`
 * stamp; a folder whose stamp matches its pin is skipped, so re-running is
 * cheap and CI can cache `.tools/`. Change a pin below to move a tool.
 *
 * Needs `git`, `tar` and network access on the first run only.
 *
 * @example
 * ```bash
 * bun run tools:fetch          # from the repo root
 * bun run tools:fetch --force  # re-download everything
 * ```
 */
import { $ } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** The repo root: two levels up from `packages/addon/scripts`. */
export const REPO_ROOT = resolve(import.meta.dir, '../../..')

/** Where every downloaded tool lives (gitignored). */
export const TOOLS_DIR = join(REPO_ROOT, '.tools')

const LUALS_VERSION = '3.19.1'

/** sha256 of each LuaLS release tarball, from the GitHub release's digests. */
const LUALS_SHA256: Record<string, string> = {
    'darwin-arm64':
        '0bc077f4447f076b4c92c14e9fd303f5b569eda2ec74b4dca2b55f75fae2e90c',
    'darwin-x64':
        'eb373c159cbe556711d7cd316315de2dce969bfd54b31edb7eb9cab2937f2cca',
    'linux-x64':
        'e9235d2d72ef55bc41cf8c99cda2ed64777682024b4bb81f5dea425060c5cbb8',
}

type GitSource = {
    /** Folder name under `.tools/`. */
    name: string
    repo: string
    commit: string
    /** The one folder of the repo to check out. */
    path: string
}

/** Ketho/vscode-wow-api `master` (2026-06-24), per the Lua tooling decision. */
const WOW_API: GitSource = {
    name: 'wow-api',
    repo: 'https://github.com/Ketho/vscode-wow-api.git',
    commit: 'd0b5b51fac4c52c493371b9b18e66ce604ea4326',
    path: 'Annotations/Core',
}

/** Gethe/wow-ui-source `forever`, 1.60.1 (70009), 2026-09-24. */
const FOREVER_API: GitSource = {
    name: 'forever-api',
    repo: 'https://github.com/Gethe/wow-ui-source.git',
    commit: 'bd2470aed543f72697a044e989285b6c83e63f73',
    path: 'Interface/AddOns/Blizzard_APIDocumentationGenerated',
}

/** Paths the rest of the tooling reads. */
export const TOOL_PATHS = {
    luals: join(TOOLS_DIR, 'luals', 'bin', 'lua-language-server'),
    wowApi: join(TOOLS_DIR, WOW_API.name, WOW_API.path),
    foreverApiDocs: join(TOOLS_DIR, FOREVER_API.name, FOREVER_API.path),
}

/**
 * Names the LuaLS release asset for this machine.
 *
 * @returns e.g. `darwin-arm64` or `linux-x64`
 * @throws on a platform LuaLS ships no pinned tarball for
 */
function lualsPlatform(): string {
    const os = process.platform === 'darwin' ? 'darwin' : process.platform
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const platform = `${os}-${arch}`
    if (!LUALS_SHA256[platform]) {
        throw new Error(
            `No pinned LuaLS ${LUALS_VERSION} build for ${platform}. Add its sha256 to LUALS_SHA256 in ${import.meta.path}.`
        )
    }
    return platform
}

/**
 * Reports whether a tool folder already holds the pinned version.
 *
 * @param dir - the tool folder under `.tools/`
 * @param pin - the pin string written by a previous successful fetch
 */
async function isCurrent(dir: string, pin: string): Promise<boolean> {
    const stamp = Bun.file(join(dir, '.pin'))
    return (await stamp.exists()) && (await stamp.text()).trim() === pin
}

/** Downloads, verifies and unpacks the pinned LuaLS release. */
async function fetchLuaLs(force: boolean): Promise<void> {
    const platform = lualsPlatform()
    const dir = join(TOOLS_DIR, 'luals')
    const pin = `${LUALS_VERSION} ${platform}`
    if (!force && (await isCurrent(dir, pin))) {
        console.log(`luals ${pin}: up to date`)
        return
    }

    const url = `https://github.com/LuaLS/lua-language-server/releases/download/${LUALS_VERSION}/lua-language-server-${LUALS_VERSION}-${platform}.tar.gz`
    console.log(`luals ${pin}: downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`LuaLS download failed: HTTP ${response.status}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const digest = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
    if (digest !== LUALS_SHA256[platform]) {
        throw new Error(
            `LuaLS tarball sha256 mismatch: expected ${LUALS_SHA256[platform]}, got ${digest}`
        )
    }

    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const tarball = join(dir, 'luals.tar.gz')
    await Bun.write(tarball, bytes)
    await $`tar -xzf ${tarball} -C ${dir}`.quiet()
    await rm(tarball)
    await Bun.write(join(dir, '.pin'), pin)
}

/**
 * Checks out one folder of a git repo at a pinned commit, sparse and shallow.
 *
 * @param source - the repo, commit and folder to fetch
 * @param force - re-fetch even if the stamp matches
 */
async function fetchGitSource(source: GitSource, force: boolean) {
    const dir = join(TOOLS_DIR, source.name)
    const pin = `${source.commit} ${source.path}`
    if (!force && (await isCurrent(dir, pin))) {
        console.log(`${source.name} ${source.commit.slice(0, 7)}: up to date`)
        return
    }

    console.log(
        `${source.name} ${source.commit.slice(0, 7)}: fetching ${source.path} from ${source.repo}`
    )
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const git = (...args: string[]) => $`git -C ${dir} ${args}`.quiet()
    await git('init', '-q')
    await git('remote', 'add', 'origin', source.repo)
    await git('sparse-checkout', 'set', '--no-cone', `/${source.path}/`)
    await git(
        'fetch',
        '-q',
        '--depth',
        '1',
        '--filter=blob:none',
        'origin',
        source.commit
    )
    await git('-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD')
    if (!existsSync(join(dir, source.path))) {
        throw new Error(`${source.name}: ${source.path} missing after checkout`)
    }
    // The checkout is only a download: drop its .git so nothing mistakes it
    // for a nested repo.
    await rm(join(dir, '.git'), { recursive: true, force: true })
    await Bun.write(join(dir, '.pin'), pin)
}

/**
 * Fetches every pinned tool that is missing or stale.
 *
 * @param force - re-download everything
 */
export async function fetchTools(force = false): Promise<void> {
    await mkdir(TOOLS_DIR, { recursive: true })
    await Promise.all([
        fetchLuaLs(force),
        fetchGitSource(WOW_API, force),
        fetchGitSource(FOREVER_API, force),
    ])
}

if (import.meta.main) {
    await fetchTools(process.argv.includes('--force'))
}
