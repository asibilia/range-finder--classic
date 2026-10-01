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

---Subscribes to a game event, or to a Blizzard callback event such as
---`EditMode.Enter` (any name with a dot, through EventRegistry). The handler
---gets the event name, then its payload.
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
---A frame without a parent gets UIParent.
---@param frameType string
---@param name string?
---@param parent any?
---@param template string?
---@return any
function TurboSafeLayer.createFrame(frameType, name, parent, template) end

---Where one of Turbo's own frames is anchored now (`GetPoint(1)`): its point
---and offsets from the same point of its parent. Nil when it has no anchor.
---@param frame any
---@return string? point
---@return number? x
---@return number? y
function TurboSafeLayer.framePoint(frame) end

---Prints a line to the chat frame.
---@param message string
function TurboSafeLayer.print(message) end

---Registers slash commands (`SLASH_<key>1...`, `SlashCmdList[key]`). The
---handler gets the text typed after the command.
---@param key string
---@param commands string[] e.g. { "/turbo", "/tb" }
---@param handler fun(message: string)
function TurboSafeLayer.slash(key, commands, handler) end

---Whether a value is secret (`issecretvalue`). Checking never reads it.
---@param value any
---@return boolean
function TurboSafeLayer.isSecret(value) end

---One control on a settings page. A checkbox or slider shows what `get`
---returns whenever the page is drawn, and calls `set` when the player changes
---it; a text control is a line of text.
---@class TurboSettingsControl
---@field kind "checkbox"|"slider"|"text"
---@field label string
---@field key string? names the setting; unique on the page (not for text)
---@field default any
---@field min number? sliders only
---@field max number? sliders only
---@field step number? sliders only
---@field get (fun(): any)?
---@field set (fun(value: any))?

---Registers a page in Options → AddOns, on Blizzard's add-on settings API
---(`Settings.RegisterVerticalLayoutCategory`, `Settings.RegisterAddOnCategory`).
---@param name string
---@param controls TurboSettingsControl[] top to bottom
function TurboSafeLayer.settingsPage(name, controls) end

-- Macros and action bars. Only for a command the player types, out of
-- combat: the game blocks these changes in combat.

---A macro in the player's account or character list.
---@class TurboMacro
---@field index number the game's index: account macros, then this character's
---@field name string
---@field body string
---@field perCharacter boolean

---Every macro the player has (`GetNumMacros`, `GetMacroInfo`): the account's
---first, then this character's, each list in the game's order.
---@return TurboMacro[]
function TurboSafeLayer.macros() end

---How many macros the game allows (`Constants.MacroConsts`).
---@return number account
---@return number perCharacter
function TurboSafeLayer.macroLimits() end

---Makes a macro (`CreateMacro`). The game keeps each list in name order, so
---other macros can move to a new index: read `macros()` again afterwards.
---@param name string
---@param icon number a file ID
---@param body string
---@param perCharacter boolean
---@return number index
function TurboSafeLayer.createMacro(name, icon, body, perCharacter) end

---What an action slot holds (`GetActionInfo`): its type ("spell", "macro",
---"item"...), its ID (a spell ID for a spell, a macro's index for a macro) and
---its subtype. Nothing for an empty slot, or one the game hides.
---@param slot number 1 to 180
---@return string? actionType
---@return any id
---@return string? subType
function TurboSafeLayer.actionInfo(slot) end

---What the cursor holds (`GetCursorInfo`): its type and ID, or nothing.
---@return string? kind
---@return any id
function TurboSafeLayer.cursorInfo() end

---Picks a macro up onto the cursor (`PickupMacro`).
---@param index number
function TurboSafeLayer.pickupMacro(index) end

---Puts what the cursor holds in an action slot (`PlaceAction`), and picks up
---what was there.
---@param slot number 1 to 180
function TurboSafeLayer.placeAction(slot) end

---Empties the cursor (`ClearCursor`).
function TurboSafeLayer.clearCursor() end
