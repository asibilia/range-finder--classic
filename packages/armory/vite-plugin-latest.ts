import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** The untracked local config: `{ "latest_results_file": "<path>" }`. */
const LOCAL_CONFIG = fileURLToPath(new URL('./.local.json', import.meta.url))
/** The three paths the plugin serves. */
const LATEST_URL = '/local/latest.json'
const STATUS_URL = '/local/latest-status.json'
const EXPORT_URL = '/local/latest-export.lua'
/** The status file's name, beside the latest file. */
const STATUS_NAME = 'latest-status.json'
/**
 * The export's name, beside the latest file: the sim side's private copy
 * of the export the latest file was simmed from (only there when they
 * match). The page's Run Simulator sims it again with other settings.
 */
export const LATEST_EXPORT_NAME = 'latest-export.lua'
/** Hosts a request may name (any port). */
const LOCAL_HOSTS = ['localhost', '127.0.0.1']

export type LatestPluginOptions = {
    /** The local config. Defaults to `packages/armory/.local.json`. */
    configFile?: string
}

/** Why there's no usable latest file, or the file's path. */
type Latest = { file: string } | { missing: string }

function isFile(path: string): boolean {
    return existsSync(path) && statSync(path).isFile()
}

/** Reads the config, now: it can change, or appear, while the server runs. */
function readLatest(configFile: string): Latest {
    const noConfig = { missing: 'no packages/armory/.local.json' }
    if (!isFile(configFile)) return noConfig
    let config: unknown
    try {
        config = JSON.parse(readFileSync(configFile, 'utf8'))
    } catch {
        return noConfig
    }
    const file =
        typeof config === 'object' && config !== null
            ? (config as { latest_results_file?: unknown }).latest_results_file
            : undefined
    if (typeof file !== 'string' || !isAbsolute(file)) return noConfig
    if (!isFile(file)) return { missing: "the latest file doesn't exist" }
    return { file }
}

/** Whether the `Host` header names this computer. */
function isLocalHost(host: string | undefined): boolean {
    if (!host) return false
    const name = host.replace(/:\d+$/, '')
    return LOCAL_HOSTS.includes(name)
}

/**
 * Serves the owner's latest results file in dev, at `/local/latest.json`,
 * the status file beside it at `/local/latest-status.json`, and the export
 * beside it at `/local/latest-export.lua` (404 when there is none). Their
 * path comes from an untracked config, read on each request; no part of a
 * URL reaches the file system. Only when serving: nothing of it reaches a
 * build.
 */
export function latestPlugin(options: LatestPluginOptions = {}): Plugin {
    const configFile = options.configFile ?? LOCAL_CONFIG
    return {
        name: 'goturbo-latest',
        apply: 'serve',
        configureServer(server) {
            const latest = readLatest(configFile)
            if ('missing' in latest)
                server.config.logger.warn(
                    `armory: no local latest file (${latest.missing})`
                )
            server.middlewares.use((req, res, next) => {
                const path = req.url?.split(/[?#]/)[0]
                if (!path?.startsWith('/local/')) return next()
                const notFound = () => {
                    res.statusCode = 404
                    res.end('Not found')
                }
                if (!isLocalHost(req.headers.host)) {
                    res.statusCode = 403
                    res.end('Forbidden')
                    return
                }
                if (req.method !== 'GET' && req.method !== 'HEAD')
                    return notFound()
                if (
                    path !== LATEST_URL &&
                    path !== STATUS_URL &&
                    path !== EXPORT_URL
                )
                    return notFound()
                const found = readLatest(configFile)
                if (!('file' in found)) return notFound()

                // The files beside the latest one: the status and the export.
                const beside =
                    path === STATUS_URL
                        ? { name: STATUS_NAME, type: 'application/json' }
                        : path === EXPORT_URL
                          ? {
                                name: LATEST_EXPORT_NAME,
                                type: 'text/plain; charset=utf-8',
                            }
                          : null
                if (beside) {
                    const near = join(dirname(found.file), beside.name)
                    if (!isFile(near)) return notFound()
                    res.statusCode = 200
                    res.setHeader('Content-Type', beside.type)
                    res.setHeader('Cache-Control', 'no-store')
                    res.end(readFileSync(near))
                    return
                }

                const modified =
                    Math.floor(statSync(found.file).mtimeMs / 1000) * 1000
                res.setHeader('Cache-Control', 'no-store')
                res.setHeader('Last-Modified', new Date(modified).toUTCString())
                const since = Date.parse(
                    String(req.headers['if-modified-since'] ?? '')
                )
                if (!Number.isNaN(since) && modified <= since) {
                    res.statusCode = 304
                    res.end()
                    return
                }
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(readFileSync(found.file))
            })
        },
    }
}

export default latestPlugin
