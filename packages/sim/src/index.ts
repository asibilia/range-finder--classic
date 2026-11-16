/**
 * `@goturbo/sim`: the browser sim, WoWSims Forever built to WASM. `loadSim`
 * loads it and runs requests on the calling thread, `createSimPool` runs
 * them in a pool of Web Workers; the leak guard keeps
 * machine details out of the package.
 */
export {
    loadSim,
    SimError,
    type LevelProfile,
    type RaidSimRequest,
    type RaidSimResult,
    type Sim,
    type SimCall,
    type SimSheet,
    type SimVersion,
} from './sim'
export {
    createSimPool,
    SimCancelled,
    type SimPool,
    type SimStats,
} from './pool'
export {
    scanForLeaks,
    type Leak,
    type Owner,
    type ScanOptions,
} from './leak-scan'
