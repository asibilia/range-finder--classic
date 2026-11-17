/**
 * The only module of `@goturbo/sim` that fetches. It reads only the files
 * `sim:build` writes, each as `new URL(name, base)`: the gzipped WASM module
 * and the data files (fetched), and Go's `wasm_exec.js` (imported). `base`
 * is `/sim/` in the browser and a `file://` URL of `packages/sim/build/`
 * under Bun (Bun's `fetch` reads those).
 */

/** Go's runtime for a WASM module, from the toolchain's `wasm_exec.js`. */
export type GoRuntime = {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): Promise<void>
}
type GoClass = new () => GoRuntime

/** The files the sim needs to start: its runtime class and its module. */
export type SimFiles = { Go: GoClass; module: WebAssembly.Module }

/** Where the sim's files are when no base is given: `/sim/` on the page. */
export function defaultBase(): URL {
    return new URL('/sim/', globalThis.location?.href)
}

/** A base given as a URL (the DOM's or `node:url`'s) or its text. */
export type Base = string | { readonly href: string }

/** `base` as a URL, or the default when none is given. */
export function toBase(base?: Base): URL {
    const href = typeof base === 'string' ? base : base?.href
    return href === undefined ? defaultBase() : new URL(href)
}

/** Fetches `lib.wasm.gz` and unpacks it: the module's raw bytes. */
export async function loadModuleBytes(base: URL): Promise<ArrayBuffer> {
    const response = await fetch(new URL('lib.wasm.gz', base))
    if (!response.ok || !response.body) {
        throw new Error(
            `Couldn't load the sim's lib.wasm.gz (${response.status} ${response.statusText}).`
        )
    }
    const unpacked = response.body.pipeThrough(new DecompressionStream('gzip'))
    return new Response(unpacked).arrayBuffer()
}

/** Compiled modules by base: each is fetched and compiled once on the page. */
const modules = new Map<string, Promise<WebAssembly.Module>>()

/**
 * Fetches `lib.wasm.gz`, unpacks it and compiles the module, once per base:
 * every pool and `loadSim` on the page shares the compiled module.
 */
export function loadModule(base: URL): Promise<WebAssembly.Module> {
    let module = modules.get(base.href)
    if (!module) {
        module = loadModuleBytes(base).then((bytes) =>
            WebAssembly.compile(bytes)
        )
        modules.set(base.href, module)
        module.catch(() => modules.delete(base.href))
    }
    return module
}

/**
 * Fetches one of the files `sim:build` writes (`name` relative to `base`)
 * and parses it as JSON. With `optional`, a file that isn't there answers
 * `null` instead of failing.
 */
export async function loadJson(
    base: URL,
    name: string,
    { optional = false }: { optional?: boolean } = {}
): Promise<unknown> {
    let body: string
    try {
        const response = await fetch(new URL(name, base))
        if (!response.ok) {
            throw new Error(
                `Couldn't load the sim's ${name} (${response.status} ${response.statusText}).`
            )
        }
        // Bun's file:// responses fail here, not above, when there's no file.
        body = await response.text()
    } catch (error) {
        if (optional) return null
        throw error
    }
    return JSON.parse(body) as unknown
}

/**
 * Go's `wasm_exec.js` defines `globalThis.Go`. It runs once per realm: a
 * later call finds the class already there.
 */
export async function loadGoRuntime(base: URL): Promise<GoClass> {
    const existing = (globalThis as { Go?: GoClass }).Go
    if (existing) return existing
    await import(/* @vite-ignore */ new URL('wasm_exec.js', base).href)
    const Go = (globalThis as { Go?: GoClass }).Go
    if (!Go) throw new Error("The sim's wasm_exec.js defined no Go runtime.")
    return Go
}

/** Fetches and compiles everything the sim needs to start. */
export async function loadSimFiles(base: URL): Promise<SimFiles> {
    const [Go, module] = await Promise.all([
        loadGoRuntime(base),
        loadModule(base),
    ])
    return { Go, module }
}
