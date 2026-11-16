/**
 * `@goturbo/sim`: the browser sim, WoWSims Forever built to WASM. `loadSim`
 * loads it and runs requests on the calling thread, `createSimPool` runs
 * them in a pool of Web Workers; the leak guard keeps
 * machine details out of the package. The page imports
 * `@goturbo/sim/browser`, the same API without the leak guard.
 */
export * from './browser'
export {
    scanForLeaks,
    type Leak,
    type Owner,
    type ScanOptions,
} from './leak-scan'
