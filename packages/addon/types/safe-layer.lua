---@meta
-- The safe-layer contract: what Turbo's safe layer (Turbo/core/safe-layer.lua)
-- offers the rest of the addon, and what the fake game
-- (tests/fake-game/fake-game.lua) offers in tests. Change all three together;
-- tests/turbo-seam.test.ts checks the real and fake offer the same functions.

---@class TurboSafeLayer
local TurboSafeLayer = {}

---The game clock in seconds (`GetTime()`).
---@return number
function TurboSafeLayer.now() end

---Subscribes to a game event. The handler gets the event name, then its payload.
---@param event string
---@param handler fun(event: string, ...: any)
function TurboSafeLayer.on(event, handler) end

---Unsubscribes a handler added with `on`.
---@param event string
---@param handler fun(event: string, ...: any)
function TurboSafeLayer.off(event, handler) end

---Runs a callback once, after a delay (`C_Timer.After`).
---@param delay number seconds
---@param callback fun()
function TurboSafeLayer.after(delay, callback) end

---Runs a callback every interval until cancelled (`C_Timer.NewTicker`).
---@param interval number seconds
---@param callback fun()
---@return { Cancel: fun(self) }
function TurboSafeLayer.every(interval, callback) end

---Reads a named game value. May return secret values: pass those straight to
---a widget, never read, compare or compute them.
---@param name string
---@param ... any
---@return any ...
function TurboSafeLayer.read(name, ...) end

---Creates a frame (`CreateFrame`). Its widget calls are the addon's output.
---@param frameType string
---@param name string?
---@param parent any?
---@param template string?
---@return any
function TurboSafeLayer.createFrame(frameType, name, parent, template) end

---Prints a line to the chat frame.
---@param message string
function TurboSafeLayer.print(message) end

---Whether a value is secret (`issecretvalue`). Checking never reads it.
---@param value any
---@return boolean
function TurboSafeLayer.isSecret(value) end
