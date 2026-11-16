/**
 * `@goturbo/sim`: the browser sim, WoWSims Forever built to WASM. The API to
 * load the sim and run requests comes in a later ticket; for now the package
 * offers the leak guard.
 */
export {
    scanForLeaks,
    type Leak,
    type Owner,
    type ScanOptions,
} from './leak-scan'
