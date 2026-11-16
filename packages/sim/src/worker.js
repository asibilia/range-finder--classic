/**
 * One worker of the sim's pool (`src/pool.ts`). A plain script: `sim:build`
 * copies it to `build/`, beside the module, so no bundler rewrites its URL.
 *
 * The pool sends `init` with the base URL of the sim's files and the
 * compiled module. Where a runtime can't post a module, it arrives as
 * something else: the worker then asks for the module's bytes (`need-bytes`)
 * and compiles its own copy. Once Go's main has registered our exports, the
 * worker answers `ready`, then runs each `call` and answers its `reply`: the
 * export's JSON text, or `crash` when the export threw. A failed start
 * answers `failed`.
 */

const EXPORTS = ['turboSim', 'turboSheet', 'turboVersion']

/** Go's runtime class, kept while the worker waits for the bytes. */
let waitingGo = null

/** Loads Go's `wasm_exec.js`, which defines the `Go` class. */
async function loadGoRuntime(base) {
    if (self.Go) return self.Go
    const url = new URL('wasm_exec.js', base).href
    if (typeof importScripts === 'function') importScripts(url)
    else await import(url)
    if (!self.Go)
        throw new Error("The sim's wasm_exec.js defined no Go runtime.")
    return self.Go
}

/** Starts Go's main on `module`: a compiled module, or its bytes. */
async function start(Go, module) {
    const go = new Go()
    const instance =
        module instanceof WebAssembly.Module
            ? await WebAssembly.instantiate(module, go.importObject)
            : (await WebAssembly.instantiate(module, go.importObject)).instance
    // Go's main registers the exports on the worker's global, then waits.
    void go.run(instance)
    for (const name of EXPORTS)
        if (typeof self[name] !== 'function')
            throw new Error(`The sim's module has no ${name}.`)
    self.postMessage({ type: 'ready' })
}

async function init({ base, module }) {
    const Go = await loadGoRuntime(base)
    if (module instanceof WebAssembly.Module) return start(Go, module)
    waitingGo = Go
    self.postMessage({ type: 'need-bytes' })
}

function call({ id, name, input }) {
    try {
        const reply = input === undefined ? self[name]() : self[name](input)
        self.postMessage({ type: 'reply', id, reply })
    } catch (error) {
        self.postMessage({ type: 'reply', id, crash: String(error) })
    }
}

function failed(error) {
    self.postMessage({ type: 'failed', message: String(error) })
}

self.addEventListener('message', (event) => {
    const message = event.data
    if (message.type === 'init') init(message).catch(failed)
    else if (message.type === 'bytes')
        start(waitingGo, message.bytes).catch(failed)
    else if (message.type === 'call') call(message)
})
