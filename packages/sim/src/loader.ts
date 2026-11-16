/**
 * The only module of `@goturbo/sim` that fetches. It reads only the files
 * `sim:build` writes, each as `new URL(name, base)`: the gzipped WASM module
 * (fetched) and Go's `wasm_exec.js` (imported). `base` is `/sim/` in the
 * browser and a `file://` URL of `packages/sim/build/` under Bun (Bun's
 * `fetch` reads those).
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

/** Fetches `lib.wasm.gz`, unpacks it and compiles the module. */
export async function loadModule(base: URL): Promise<WebAssembly.Module> {
    const response = await fetch(new URL('lib.wasm.gz', base))
    if (!response.ok || !response.body) {
        throw new Error(
            `Couldn't load the sim's lib.wasm.gz (${response.status} ${response.statusText}).`
        )
    }
    const unpacked = response.body.pipeThrough(new DecompressionStream('gzip'))
    const bytes = await new Response(unpacked).arrayBuffer()
    return WebAssembly.compile(bytes)
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
