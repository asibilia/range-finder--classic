-- The safe layer: the only Turbo code that touches the game API.
--
-- In: game reads and events. Out: chat lines, slash commands, macros and
-- action bars. Everything else in Turbo goes through `ns.safe` and never
-- calls the game directly; a guard script in CI fails any secret-returning
-- game call made outside this file.
--
-- It never reads, compares or does math on a secret value: a reading that
-- comes back secret is dropped (`issecretvalue` checks without reading).
--
-- Under `bun test` the fake game (packages/addon/tests/fake-game) replaces
-- this file and offers the same contract (types/safe-layer.lua). A change to
-- the contract changes both; a test checks they offer the same functions.
local _, ns = ...

---@type TurboSafeLayer
local safe = {}
ns.safe = safe

---Named game readings. Turbo asks for a reading by name; each reading is
---the one place its game call lives.
---@type table<string, fun(...: any): ...: any>
local readings = {}

---The client's interface number (16001 on Forever).
function readings.interface()
	return (select(4, GetBuildInfo()))
end

---"forever" on WoW: Forever. Forever's project ID says retail, so this asks
---for Forever's own game rules instead: only Forever has an experience preset.
function readings.flavor()
	local rules = C_GameRules
	if rules and rules.GetForeverExperiencePreset and rules.GetForeverExperiencePreset() ~= nil then
		return "forever"
	end
	return "other"
end

function readings.inCombat()
	return InCombatLockdown()
end

---Whether a spell can be cast on an enemy. Nil when the game hides it.
function readings.spellHarmful(spellID)
	local harmful = C_Spell.IsSpellHarmful(spellID)
	if issecretvalue(harmful) then
		return nil
	end
	return harmful
end

---A spell's name in the player's language, the same for every rank. Nil when
---the game has no such spell, or hides its name.
function readings.spellName(spellID)
	local name = C_Spell.GetSpellName(spellID)
	if issecretvalue(name) then
		return nil
	end
	return name
end

---A spell's subtext (`C_Spell.GetSpellSubtext`), such as its rank line
---("Rank 2"). Forever shows no rank line for a spell whose only known rank is
---1. Nil when the game has no such spell, or hides it.
function readings.spellSubtext(spellID)
	local subtext = C_Spell.GetSpellSubtext(spellID)
	if issecretvalue(subtext) then
		return nil
	end
	return subtext
end

---The spell ID for a spell name, only when the player knows that spell
---(`C_Spell.GetSpellIDForSpellIdentifier`, `C_SpellBook.IsSpellKnown`). Nil
---for a spell they don't know, no such spell, or one the game hides.
function readings.knownSpellID(name)
	local spellID = C_Spell.GetSpellIDForSpellIdentifier(name)
	if issecretvalue(spellID) or spellID == nil then
		return nil
	end
	local known = C_SpellBook.IsSpellKnown(spellID)
	if issecretvalue(known) or known ~= true then
		return nil
	end
	return spellID
end

---@type table<string, fun(event: string, ...: any)[]>
local handlers = {}

local eventFrame = CreateFrame("Frame")

eventFrame:SetScript("OnEvent", function(_, event, ...)
	local list = handlers[event]
	if not list then
		return
	end
	-- A copy, so a handler may unsubscribe while the event is dispatched.
	local snapshot = { unpack(list) }
	for i = 1, #snapshot do
		snapshot[i](event, ...)
	end
end)

function safe.on(event, handler)
	local list = handlers[event]
	if not list then
		list = {}
		handlers[event] = list
		eventFrame:RegisterEvent(event)
	end
	table.insert(list, handler)
end

function safe.off(event, handler)
	local list = handlers[event]
	if not list then
		return
	end
	for i = #list, 1, -1 do
		if list[i] == handler then
			table.remove(list, i)
		end
	end
	if #list == 0 then
		handlers[event] = nil
		eventFrame:UnregisterEvent(event)
	end
end

function safe.read(name, ...)
	local reading = readings[name]
	if not reading then
		error("Turbo: no reading named '" .. name .. "'", 2)
	end
	return reading(...)
end

function safe.print(message)
	print(message)
end

function safe.slash(key, commands, handler)
	for i, command in ipairs(commands) do
		_G["SLASH_" .. key .. i] = command
	end
	SlashCmdList[key] = handler
end

-- Macros and action bars: only for a command the player types, out of combat.

function safe.macros()
	local list = {}
	-- Character macros come after every account slot.
	local accountSlots = Constants.MacroConsts.MAX_ACCOUNT_MACROS
	local accountCount, characterCount = GetNumMacros()
	local function add(index, perCharacter)
		local name, _, body = GetMacroInfo(index)
		if name then
			table.insert(list, { index = index, name = name, body = body or "", perCharacter = perCharacter })
		end
	end
	for index = 1, accountCount do
		add(index, false)
	end
	for index = accountSlots + 1, accountSlots + characterCount do
		add(index, true)
	end
	return list
end

function safe.macroLimits()
	local limits = Constants.MacroConsts
	return limits.MAX_ACCOUNT_MACROS, limits.MAX_CHARACTER_MACROS
end

function safe.createMacro(name, icon, body, perCharacter)
	return CreateMacro(name, icon, body, perCharacter)
end

function safe.editMacro(index, body, newName)
	-- The icon passed back as it is; the name too, unless there's a new one.
	local name, icon = GetMacroInfo(index)
	return EditMacro(index, newName or name, icon, body)
end

function safe.deleteMacro(index)
	DeleteMacro(index)
end

function safe.actionInfo(slot)
	local actionType, id, subType = GetActionInfo(slot)
	if issecretvalue(actionType) or issecretvalue(id) then
		return nil
	end
	return actionType, id, subType
end

function safe.actionText(slot)
	local text = C_ActionBar.GetActionText(slot)
	if issecretvalue(text) then
		return nil
	end
	return text
end

function safe.cursorInfo()
	local kind, id = GetCursorInfo()
	return kind, id
end

function safe.pickupMacro(index)
	PickupMacro(index)
end

function safe.pickupSpell(spellID)
	C_Spell.PickupSpell(spellID)
end

function safe.placeAction(slot)
	PlaceAction(slot)
end

function safe.clearCursor()
	ClearCursor()
end
