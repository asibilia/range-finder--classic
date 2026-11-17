/**
 * The leak guard: technical details of the owner's computer (home paths,
 * the game's folders, temporary folders, `Config.wtf`, the computer's user
 * and host names, words from the untracked machine-words file) and other
 * players' GUIDs must never get into the repo. The owner's own character
 * data may. Results name the file and the kind of leak, never the value.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { basename, join, relative, sep } from 'node:path'

export type Leak = { file: string; kind: string }

export type Owner = { name: string; guid: string }

export type ScanOptions = {
    /** The owner's identity. Defaults to `fixtures/owner.json` when it exists. */
    owner?: Owner
    /** Where to read the owner from when `owner` isn't given. Defaults to `fixtures/owner.json`. */
    ownerFile?: string
    /** The machine-words file. Defaults to `packages/sim/.machine-words`. */
    machineWordsFile?: string
    /** The computer's names. Defaults to its user name and host name. */
    machineNames?: string[]
}

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const OWNER_JSON = join(PACKAGE_DIR, 'fixtures/owner.json')
const MACHINE_WORDS = join(PACKAGE_DIR, '.machine-words')
const LEAK_ALLOW = join(PACKAGE_DIR, 'leak-allow.txt')

/** Everyday names that would match innocent text (CI's user is `runner`). */
const COMMON_NAMES = ['runner', 'root', 'user', 'admin', 'ubuntu', 'localhost']
/** Files the guard never reads as text. */
const BINARY_EXTENSIONS = ['.bin', '.wasm', '.gz']
/** The guard's own files, which hold leak-shaped strings on purpose. */
const OWN_FILES = ['src/leak-scan.ts', 'tests/leak-guard.test.ts']

const PATTERNS: { kind: string; pattern: RegExp }[] = [
    {
        kind: 'home path',
        pattern: /(\/Users\/|\/home\/|[A-Za-z]:[\\/]Users[\\/])[^/\\\s]+/,
    },
    {
        kind: 'game folder',
        pattern:
            /World of Warcraft[\\/]_|_forever_[\\/]|_retail_[\\/]|_classic_[\\/]|WTF[\\/]Account[\\/]|[\\/]SavedVariables[\\/]/,
    },
    {
        kind: 'temporary folder',
        pattern:
            /[\\/]tmp[\\/]|[\\/]private[\\/]var[\\/]|[\\/]var[\\/]folders[\\/]|AppData[\\/]Local[\\/]Temp/,
    },
    { kind: 'Config.wtf', pattern: /^SET \w+ "/m },
    // The export addon keys a unit with no creature GUID by its name, which
    // can be another player's pet: those entries must not be committed.
    { kind: 'named unit', pattern: /\["name:[^"]*"\]\s*=/ },
]

const PLAYER_GUID = /Player-(\d+)-[0-9A-Fa-f]{8}/g

function escapeRegExp(text: string): RegExp {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'i')
}

function readOwner(options: ScanOptions): Owner | undefined {
    if (options.owner) return options.owner
    const file = options.ownerFile ?? OWNER_JSON
    if (!existsSync(file)) return undefined
    return JSON.parse(readFileSync(file, 'utf8')) as Owner
}

function readMachineWords(file: string): string[] | undefined {
    if (!existsSync(file)) return undefined
    return readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function machineNames(options: ScanOptions): string[] {
    const names = options.machineNames ?? [userInfo().username, hostname()]
    return names.filter(
        (name) => name.length >= 4 && !COMMON_NAMES.includes(name.toLowerCase())
    )
}

/** `<path>\t<kind>` keys from `leak-allow.txt`, repo-relative. */
function readAllowed(): Set<string> {
    if (!existsSync(LEAK_ALLOW)) return new Set()
    const allowed = new Set<string>()
    for (const line of readFileSync(LEAK_ALLOW, 'utf8').split(/\r?\n/)) {
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue
        const [path, kind] = line.split('\t')
        if (path && kind) allowed.add(`${path}\t${kind}`)
    }
    return allowed
}

/** Every file under `root` (or `root` itself), as [absolute, relative]. */
function listFiles(root: string): [string, string][] {
    if (!statSync(root).isDirectory()) return [[root, basename(root)]]
    const files: [string, string][] = []
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue
            const path = join(dir, entry.name)
            if (entry.isDirectory()) walk(path)
            else if (entry.isFile())
                files.push([path, relative(root, path).split(sep).join('/')])
        }
    }
    walk(root)
    return files
}

function isOwnFile(rel: string): boolean {
    if (basename(rel) === '.machine-words') return true
    return OWN_FILES.some((own) => rel === own || rel.endsWith(`/${own}`))
}

function displayPath(path: string): string {
    const rel = relative(REPO_ROOT, path)
    if (rel.startsWith('..')) return path
    return rel.split(sep).join('/')
}

/**
 * Scans the text files under `roots` (names and contents) for leaks.
 * Skips `node_modules`, binary files and the guard's own files.
 */
export function scanForLeaks(
    roots: string[],
    options: ScanOptions = {}
): Leak[] {
    const owner = readOwner(options)
    if (!owner)
        console.log(
            'No owner given and no packages/sim/fixtures/owner.json: skipped the other player check.'
        )
    const words = readMachineWords(options.machineWordsFile ?? MACHINE_WORDS)
    if (!words)
        console.log(
            'No packages/sim/.machine-words: skipped the machine-word check.'
        )
    const names = machineNames(options).map(escapeRegExp)
    const wordPatterns = (words ?? []).map(escapeRegExp)
    const allowed = readAllowed()
    const leaks: Leak[] = []

    for (const root of roots) {
        for (const [path, rel] of listFiles(root)) {
            if (isOwnFile(rel)) continue
            const file = displayPath(path)
            const kinds = new Set<string>()
            const check = (text: string) => {
                for (const { kind, pattern } of PATTERNS)
                    if (pattern.test(text)) kinds.add(kind)
                if (names.some((name) => name.test(text)))
                    kinds.add('machine name')
                if (wordPatterns.some((word) => word.test(text)))
                    kinds.add('machine word')
            }

            check(rel)
            const name = basename(rel)
            if (name === 'Config.wtf' || name.endsWith('.bak'))
                kinds.add('Config.wtf')

            if (!BINARY_EXTENSIONS.some((ext) => name.endsWith(ext))) {
                const bytes = readFileSync(path)
                if (!bytes.subarray(0, 8000).includes(0)) {
                    const text = bytes.toString('utf8')
                    check(text)
                    if (owner && hasOtherPlayer(text, owner))
                        kinds.add('other player')
                }
            }

            for (const kind of kinds)
                if (!allowed.has(`${file}\t${kind}`)) leaks.push({ file, kind })
        }
    }
    return leaks
}

/** A player GUID that is neither the owner's nor a fixture placeholder. */
function hasOtherPlayer(text: string, owner: Owner): boolean {
    const own = owner.guid.toLowerCase()
    for (const match of text.matchAll(PLAYER_GUID)) {
        if (match[1] === '0') continue
        if (match[0].toLowerCase() !== own) return true
    }
    return false
}
