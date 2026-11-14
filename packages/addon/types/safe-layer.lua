---@meta
-- The safe-layer contract: what Turbo's safe layer (Turbo/core/safe-layer.lua)
-- offers the rest of the addon, and what the fake game
-- (tests/fake-game/fake-game.lua) offers in tests. Change all three together;
-- tests/turbo-seam.test.ts checks the real and fake offer the same functions.

---@class TurboSafeLayer
local TurboSafeLayer = {}

---Subscribes to a game event. The handler gets the event name, then its
---payload.
---@param event string
---@param handler fun(event: string, ...: any)
function TurboSafeLayer.on(event, handler) end

---Unsubscribes a handler added with `on`.
---@param event string
---@param handler fun(event: string, ...: any)
function TurboSafeLayer.off(event, handler) end

---Reads a named game value. Never read, compare or compute a secret value.
---@param name string
---@param ... any
---@return any ...
function TurboSafeLayer.read(name, ...) end

---Prints a line to the chat frame.
---@param message string
function TurboSafeLayer.print(message) end

---Registers slash commands (`SLASH_<key>1...`, `SlashCmdList[key]`). The
---handler gets the text typed after the command.
---@param key string
---@param commands string[] e.g. { "/turbo", "/tb" }
---@param handler fun(message: string)
function TurboSafeLayer.slash(key, commands, handler) end

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

---Changes a macro's body (`EditMacro`), keeping its icon. Without a name it
---keeps its name too, so its index stays the same. With a name it is renamed,
---and the game re-sorts its list: read `macros()` again afterwards.
---@param index number
---@param body string
---@param name? string a new name
---@return number index
function TurboSafeLayer.editMacro(index, body, name) end

---Deletes a macro (`DeleteMacro`). The game also takes it off the action
---bars, and later macros in its list move up one index: read `macros()` again
---afterwards.
---@param index number
function TurboSafeLayer.deleteMacro(index) end

---What an action slot holds (`GetActionInfo`): its type ("spell", "macro",
---"item"...), its ID (a spell ID for a spell, a macro's index for a macro) and
---its subtype. Nothing for an empty slot, or one the game hides.
---@param slot number 1 to 180
---@return string? actionType
---@return any id
---@return string? subType
function TurboSafeLayer.actionInfo(slot) end

---A macro action's name (`C_ActionBar.GetActionText`). Nothing for an empty
---slot, or one the game hides; nothing or a label for anything else.
---@param slot number 1 to 180
---@return string? text
function TurboSafeLayer.actionText(slot) end

---What the cursor holds (`GetCursorInfo`): its type and ID, or nothing.
---@return string? kind
---@return any id
function TurboSafeLayer.cursorInfo() end

---Picks a macro up onto the cursor (`PickupMacro`).
---@param index number
function TurboSafeLayer.pickupMacro(index) end

---Picks a spell up onto the cursor (`C_Spell.PickupSpell`).
---@param spellID number
function TurboSafeLayer.pickupSpell(spellID) end

---Puts what the cursor holds in an action slot (`PlaceAction`), and picks up
---what was there.
---@param slot number 1 to 180
function TurboSafeLayer.placeAction(slot) end

---Empties the cursor (`ClearCursor`).
function TurboSafeLayer.clearCursor() end
