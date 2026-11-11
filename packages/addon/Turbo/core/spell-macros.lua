-- Spell macros (/turbo macros): a per-character macro for every spell on the
-- player's action bars, swapped onto every action slot holding that spell, at
-- any rank. An offensive spell's macro is the attack variant, which also starts
-- melee:
--
--   #showtooltip              #showtooltip
--   /startattack              /cast <spell name>
--   /cast <spell name>
--
-- With no rank in the name the game casts the top rank. Spell names come from
-- the game, so it works in any language and for every class. Every spell
-- qualifies, ranks or not: Forever shows no rank line for a spell whose only
-- known rank is 1, so a spell can't be told to have ranks.
--
-- This is the one place Turbo changes macros and action bars, and only
-- because the player typed the command. Turbo's macro for a spell is a
-- per-character macro named for the spell (cut to the game's 16-letter limit:
-- the name is only a label, the body casts the full name) with exactly one of
-- the two bodies for the full name;
-- any other macro is the player's, and Turbo never edits or deletes it. When
-- Turbo's macro has the other body (the game now reads the spell's
-- offensiveness differently), Turbo edits its body in place. Running it again
-- finds Turbo's macros and makes no duplicates.
--
-- It changes nothing in combat (the game blocks it), while the cursor holds
-- something (a swap would drop it), or without room for every new macro.
local _, ns = ...

local safe = ns.safe

local spellMacros = {}
ns.spellMacros = spellMacros

-- The question mark: with #showtooltip, the button shows the spell's icon.
local QUESTION_MARK_ICON = 134400
-- The game's macro name box takes 16 letters (IconSelectorPopupFrameTemplate).
local MAX_NAME_LETTERS = 16
-- Every action slot: 15 pages of 12 (the last bar, MultiBar7, is page 15).
local ACTION_SLOTS = 180

local function attackBody(name)
	return "#showtooltip\n/startattack\n/cast " .. name
end

local function castBody(name)
	return "#showtooltip\n/cast " .. name
end

local function bodyFor(name, offensive)
	return offensive and attackBody(name) or castBody(name)
end

---The macro name for a spell: its first 16 letters, trailing spaces trimmed.
---Letters, not bytes: other languages' names have multibyte letters, each a
---byte that doesn't continue a UTF-8 letter plus the bytes that do.
---@param spellName string
---@return string
local function macroName(spellName)
	local kept, count = {}, 0
	for letter in spellName:gmatch("[^\128-\191][\128-\191]*") do
		if count == MAX_NAME_LETTERS then
			break
		end
		count = count + 1
		kept[count] = letter
	end
	return (table.concat(kept):gsub(" +$", ""))
end

local function counted(count, one, many)
	return count .. " " .. (count == 1 and one or many)
end

---Turbo's macro for a spell (its macro name, either body for the full spell
---name), or nil.
---@param macros TurboMacro[]
---@param entry TurboBarSpell
---@return TurboMacro?
local function turbosMacro(macros, entry)
	local name = entry.name
	for _, macro in ipairs(macros) do
		if
			macro.perCharacter
			and macro.name == entry.macroName
			and (macro.body == attackBody(name) or macro.body == castBody(name))
		then
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

---A spell on the bars that gets a macro.
---@class TurboBarSpell
---@field name string
---@field macroName string
---@field offensive boolean
---@field slots number[]

---Every spell on the action bars, by name, in the order its first slot
---comes.
---@return TurboBarSpell[]
local function barSpells()
	local list, byName = {}, {}
	-- What each spell ID gets, read once: its name and offensiveness, or false.
	local byID = {}
	for slot = 1, ACTION_SLOTS do
		local actionType, id = safe.actionInfo(slot)
		if actionType == "spell" and type(id) == "number" then
			if byID[id] == nil then
				byID[id] = false
				local name = safe.read("spellName", id)
				if type(name) == "string" and name ~= "" then
					byID[id] = { name = name, offensive = safe.read("spellHarmful", id) == true }
				end
			end
			local info = byID[id]
			if info then
				local entry = byName[info.name]
				if not entry then
					entry = { name = info.name, macroName = macroName(info.name), offensive = false, slots = {} }
					byName[info.name] = entry
					table.insert(list, entry)
				end
				-- Every rank of a spell reads the same; any offensive one decides.
				entry.offensive = entry.offensive or info.offensive
				table.insert(entry.slots, slot)
			end
		end
	end
	return list
end

---Sorts the bar spells: those that get a macro (`use`), the new macros to
---make, Turbo's macros to edit (with their bar spell), and the skipped (with
---why).
---@param macros TurboMacro[]
---@param spells TurboBarSpell[]
local function plan(macros, spells)
	local use, new, edits, skipped = {}, {}, {}, {}
	-- Which spell each macro name went to: two long names can cut the same.
	local claimedBy = {}
	for _, entry in ipairs(spells) do
		local macro = turbosMacro(macros, entry)
		local other = claimedBy[entry.macroName]
		if other then
			table.insert(skipped, "Skipped " .. entry.name .. ": its short macro name clashes with " .. other .. ".")
		elseif macro then
			claimedBy[entry.macroName] = entry.name
			table.insert(use, entry)
			if macro.body ~= bodyFor(entry.name, entry.offensive) then
				table.insert(edits, { index = macro.index, entry = entry })
			end
		elseif nameTaken(macros, entry.macroName) then
			table.insert(skipped, "Skipped " .. entry.name .. ": you already have a macro with that name.")
		else
			claimedBy[entry.macroName] = entry.name
			table.insert(use, entry)
			table.insert(new, entry)
		end
	end
	return use, new, edits, skipped
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

---Puts each spell's macro in every action slot that held that spell.
---@param use TurboBarSpell[]
---@return number swapped
local function swapButtons(use)
	-- A new macro can move others to a new index: look them all up again.
	local macros = safe.macros()
	local swapped = 0
	for _, entry in ipairs(use) do
		local macro = turbosMacro(macros, entry)
		if macro then
			for _, slot in ipairs(entry.slots) do
				safe.pickupMacro(macro.index)
				safe.placeAction(slot)
				-- Placing picks up the spell that was there.
				safe.clearCursor()
				swapped = swapped + 1
			end
		end
	end
	return swapped
end

---Makes the spell macros, swaps them onto the action bars and prints what it
---did. /turbo macros runs it.
function spellMacros.run()
	if safe.read("inCombat") == true then
		safe.print("Turbo: Try again after combat.")
		return
	end
	if safe.cursorInfo() ~= nil then
		safe.print("Turbo: Drop what's on your cursor first.")
		return
	end

	local macros = safe.macros()
	local use, new, edits, skipped = plan(macros, barSpells())
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

	-- Edits keep each macro's name, so its index: edit before creating.
	for _, edit in ipairs(edits) do
		safe.editMacro(edit.index, bodyFor(edit.entry.name, edit.entry.offensive))
	end
	for _, entry in ipairs(new) do
		safe.createMacro(entry.macroName, QUESTION_MARK_ICON, bodyFor(entry.name, entry.offensive), true)
	end
	local swapped = swapButtons(use)

	local updated = #edits > 0 and (", updated " .. #edits) or ""
	safe.print(
		"Turbo made "
			.. counted(#new, "macro", "macros")
			.. updated
			.. " and swapped "
			.. counted(swapped, "button", "buttons")
			.. "."
	)
	for _, line in ipairs(skipped) do
		safe.print(line)
	end
end
