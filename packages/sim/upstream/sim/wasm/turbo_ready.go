//go:build js && wasm

package main

import "syscall/js"

// Upstream's main calls the page's global wasmready once its functions are
// registered. Hosts other than upstream's site (Bun, the pool's workers)
// don't define one, so this sets a do-nothing one when it's missing.
func init() {
	if js.Global().Get("wasmready").Type() != js.TypeFunction {
		js.Global().Set("wasmready", js.FuncOf(func(js.Value, []js.Value) any {
			return nil
		}))
	}
}
