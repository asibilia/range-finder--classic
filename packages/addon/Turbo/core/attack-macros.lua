-- Attack macros (/turbo macros): a per-character macro for each attack spell
-- in the class kit that the player knows, swapped onto the action bars
-- wherever that spell sits, at any rank. Each macro is
--
--   #showtooltip
--   /startattack
--   /cast <spell name>
--
-- so casting it also starts melee, and with no rank in the name the game casts
-- the top rank. Spell names come from the game, so it works in any language.
--
-- This is the one place Turbo changes macros and action bars, and only
-- because the player typed the command. Turbo's macro for a spell is a
-- per-character macro named for the spell with exactly the attack body; any
-- other macro is the player's, and Turbo never edits or deletes it. Running
-- it again finds Turbo's macros and makes no duplicates.
--
-- It changes nothing in combat (the game blocks it), while the cursor holds
-- something (a swap would drop it), or without room for every new macro.
local _, ns = ...

local safe = ns.safe

local attackMacros = {}
ns.attackMacros = attackMacros

-- The question mark: with #showtooltip, the button shows the spell's icon.
local QUESTION_MARK_ICON = 134400
-- The game's macro name box takes 16 letters (IconSelectorPopupFrameTemplate).
local MAX_NAME_LETTERS = 16
-- Every action slot: 15 pages of 12 (the last bar, MultiBar7, is page 15).
local ACTION_SLOTS = 180

---@type number[]?
local attackSpells

local function attackBody(name)
	return "#showtooltip\n/startattack\n/cast " .. name
end

-- Letters, not bytes: other languages' names have multibyte letters. Counts
-- every byte that doesn't continue a UTF-8 letter.
local function letters(text)
	return select(2, text:gsub("[^\128-\191]", ""))
end

local function counted(count, one, many)
	return count .. " " .. (count == 1 and one or many)
end

---Turbo's macro for a spell name, or nil.
---@param macros TurboMacro[]
---@param name string
---@return TurboMacro?
local function turbosMacro(macros, name)
	for _, macro in ipairs(macros) do
		if macro.perCharacter and macro.name == name and macro.body == attackBody(name) then
			return macro
		end
	end
end

---Whether any macro, the player's or Turbo's, has this name.
---@param macros TurboMacro[]
---@param name string
local function nameTaken(macros, name)
	for _, macro in ipairs(macros) do
		if macro.name == name then
			return true
		end
	end
	return false
end

---The name of an attack spell the player knows, or nil.
---@param spellID number
---@return string?
local function knownName(spellID)
	if safe.read("spellKnown", spellID) ~= true then
		return nil
	end
	local name = safe.read("spellName", spellID)
	if type(name) == "string" and name ~= "" then
		return name
	end
end

---Which attack spells get a macro, by name: the ones the player knows,
---minus those skipped (with why). `new` lists the macros to make.
---@param macros TurboMacro[]
---@return string[] names
---@return string[] new
---@return string[] skipped
local function plan(macros)
	local names, new, skipped = {}, {}, {}
	for _, spellID in ipairs(attackSpells or {}) do
		local name = knownName(spellID)
		if name then
			if turbosMacro(macros, name) then
				table.insert(names, name)
			elseif letters(name) > MAX_NAME_LETTERS then
				table.insert(skipped, "Skipped " .. name .. ": its name is too long for a macro.")
			elseif nameTaken(macros, name) then
				table.insert(skipped, "Skipped " .. name .. ": you already have a macro with that name.")
			else
				table.insert(names, name)
				table.insert(new, name)
			end
		end
	end
	return names, new, skipped
end

---@param macros TurboMacro[]
local function freeCharacterSlots(macros)
	local _, perCharacter = safe.macroLimits()
	local used = 0
	for _, macro in ipairs(macros) do
		if macro.perCharacter then
			used = used + 1
		end
	end
	return perCharacter - used
end

---Puts each spell's macro in every action slot holding that spell, at any
---rank: a slot matches when its spell has the same name.
---@param indexByName table<string, number> Turbo's macro index, by spell name
---@return number swapped
local function swapButtons(indexByName)
	-- Spell names by ID, read once each; false for a spell without one.
	local names = {}
	local swapped = 0
	for slot = 1, ACTION_SLOTS do
		local actionType, id = safe.actionInfo(slot)
		if actionType == "spell" and type(id) == "number" then
			if names[id] == nil then
				names[id] = safe.read("spellName", id) or false
			end
			local index = names[id] and indexByName[names[id]]
			if index then
				safe.pickupMacro(index)
				safe.placeAction(slot)
				-- Placing picks up the spell that was there.
				safe.clearCursor()
				swapped = swapped + 1
			end
		end
	end
	return swapped
end

---Picks the attack spells from the player's class kit.
---@param kit TurboClassKit
function attackMacros.start(kit)
	attackSpells = kit.attackSpells
end

---Makes the attack macros, swaps them onto the action bars and prints what
---it did. /turbo macros runs it.
function attackMacros.run()
	if not attackSpells or #attackSpells == 0 then
		safe.print("Turbo has no attack macros for your class yet.")
		return
	end
	if safe.read("inCombat") == true then
		safe.print("Turbo: Try again after combat.")
		return
	end
	if safe.cursorInfo() ~= nil then
		safe.print("Turbo: Drop what's on your cursor first.")
		return
	end

	local macros = safe.macros()
	local names, new, skipped = plan(macros)
	local free = freeCharacterSlots(macros)
	if #new > free then
		safe.print(
			"Turbo needs "
				.. counted(#new, "free character macro slot", "free character macro slots")
				.. " and you have "
				.. free
				.. ". Nothing was changed."
		)
		return
	end

	for _, name in ipairs(new) do
		safe.createMacro(name, QUESTION_MARK_ICON, attackBody(name), true)
	end
	-- A new macro can move others to a new index: look them all up again.
	macros = safe.macros()
	local indexByName = {}
	for _, name in ipairs(names) do
		local macro = turbosMacro(macros, name)
		if macro then
			indexByName[name] = macro.index
		end
	end
	local swapped = swapButtons(indexByName)

	safe.print(
		"Turbo made "
			.. counted(#new, "macro", "macros")
			.. " and swapped "
			.. counted(swapped, "button", "buttons")
			.. "."
	)
	for _, line in ipairs(skipped) do
		safe.print(line)
	end
end
