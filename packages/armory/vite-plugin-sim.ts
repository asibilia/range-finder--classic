import { cpSync, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** What `bun run sim:build` writes: the sim's module, worker and data. */
const SIM_BUILD = fileURLToPath(new URL('../sim/build/', import.meta.url))
/** Where the page finds the sim's files: `@goturbo/sim`'s default base. */
const PREFIX = '/sim/'

const TYPES: Record<string, string> = {
    '.gz': 'application/gzip',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
}

/** The file under `packages/sim/build/` a `/sim/...` path names, if any. */
function simFile(url: string): string | undefined {
    const path = url.split(/[?#]/)[0]!
    if (!path.startsWith(PREFIX)) return undefined
    let name: string
    try {
        name = decodeURIComponent(path.slice(PREFIX.length))
    } catch {
        return undefined
    }
    const file = normalize(join(SIM_BUILD, name))
    // SIM_BUILD ends with a separator: nothing outside it gets through.
    if (!file.startsWith(SIM_BUILD)) return undefined
    return existsSync(file) && statSync(file).isFile() ? file : undefined
}

/**
 * Serves the browser sim's files (`packages/sim/build/`) at `/sim/`: from
 * the folder in dev, and copied to `build/client/sim/` at build. The
 * gzipped module is served as is: the page unpacks it itself.
 */
export function simPlugin(): Plugin {
    return {
        name: 'goturbo-sim',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith(PREFIX)) return next()
                const file = simFile(req.url)
                if (!file) {
                    res.statusCode = 404
                    res.end('Not found')
                    return
                }
                res.statusCode = 200
                res.setHeader(
                    'Content-Type',
                    TYPES[extname(file)] ?? 'application/octet-stream'
                )
                res.end(readFileSync(file))
            })
        },
        writeBundle(options) {
            if (this.environment.name !== 'client' || !options.dir) return
            if (!existsSync(join(SIM_BUILD, 'worker.js')))
                throw new Error(
                    "packages/sim/build/ has no sim: run 'bun run sim:build' first."
                )
            cpSync(SIM_BUILD, join(options.dir, 'sim'), { recursive: true })
        },
    }
}

export default simPlugin
