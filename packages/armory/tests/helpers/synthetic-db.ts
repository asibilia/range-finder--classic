/**
 * Made-up item data for the plan's tests: `syntheticDb(items)` holds just
 * `items`, none with a first-seen date, as `loadItemDb` would give them.
 */
import type { DbItem, ItemDb } from '../../src/browser-sim/gear'

export function syntheticDb(items: DbItem[]): ItemDb {
    return {
        items: new Map(items.map((item) => [item.id, item])),
        firstSeen: new Map(),
    }
}
