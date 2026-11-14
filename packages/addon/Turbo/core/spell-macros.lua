-- Spell macros (/turbo macros): a macro for every spell on the player's
-- action bars that has more than one rank, swapped onto every action slot
-- holding that spell, at any rank. With no rank in the name the game casts
-- the top rank, so a new rank needs no new button. An attacking spell's macro
-- is the attack variant, which also starts melee:
--
--   #showtooltip              #showtooltip
--   /startattack              /cast <spell name>
--   /cast <spell name>
--
-- except a crowd-control spell that breaks on damage (BREAKS_ON_DAMAGE): a
-- swing would break it, so it gets the plain macro. Spell names come from the
-- game, so it works in any language and for every class.
--
-- Ranks: Forever shows a rank line ("Rank 2") only once the player knows more
-- than one rank of a spell, so a spell with a rank line gets a macro and one
-- without (Ghost Wolf, or a spell whose only known rank is 1) doesn't, until
-- it gains a second rank.
--
-- This is the one place Turbo changes macros and action bars, and only
-- because the player typed the command. Turbo's macro for a spell is named
-- for the spell (cut to the game's 16-letter limit: the name is only a label,
-- the body casts the full name) with exactly one of the two bodies for the
-- full name; any other macro is the player's, and Turbo never edits or
-- deletes it. Running it again finds Turbo's macros and makes no duplicates.
--
-- Room: Turbo first reuses its own macros (editing a body in place when the
-- spell's attack variant changed), then recycles its character macros that
-- nothing needs any more (on no bar, or for a spell with one rank, whose
-- buttons get the spell back), then takes free character slots, then free
-- general (account) slots. A general macro is named for the spell and casts
-- it by name, so it does the same on every character: Turbo shares it, and
-- never recycles or deletes one, since another character's bars may hold it.
--
-- It changes nothing in combat (the game blocks it), while the cursor holds
-- something (a swap would drop it), or without room for every new macro; then
-- it says how many slots are missing and which of the player's macros aren't
-- on this character's bars.
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
-- How many of the player's macros a "you could delete" line names.
local MAX_LISTED = 10

-- Crowd control that damage breaks, so its macro never starts auto-attack: a
-- swing would break it. One spell ID each (any rank): the game gives the name
-- in the player's language, and every rank shares it. A spell the game
-- doesn't have is skipped. Checked against Wowhead's Classic spell data
-- (2026-11-11); "may" means its tooltip says damage may break it.
local BREAKS_ON_DAMAGE = {
	1776, -- Gouge (Rogue)
	6770, -- Sap (Rogue)
	2094, -- Blind (Rogue)
	118, -- Polymorph (Mage)
	28272, -- Polymorph: Pig (Mage)
	28271, -- Polymorph: Turtle (Mage)
	122, -- Frost Nova (Mage; may)
	2637, -- Hibernate (Druid)
	339, -- Entangling Roots (Druid; may)
	1499, -- Freezing Trap (Hunter; the trap on the bar, not its effect)
	19503, -- Scatter Shot (Hunter)
	19386, -- Wyvern Sting (Hunter)
	1513, -- Scare Beast (Hunter; may)
	20066, -- Repentance (Paladin)
	2878, -- Turn Undead (Paladin; may)
	9484, -- Shackle Undead (Priest)
	8122, -- Psychic Scream (Priest; may)
	5782, -- Fear (Warlock; may)
	5484, -- Howl of Terror (Warlock; may)
	6358, -- Seduction (Warlock's Succubus)
	5246, -- Intimidating Shout (Warrior; a fear, tooltip silent on damage)
	51514, -- Hex (Shaman; not in Classic's data, kept in case Forever adds it)
}

local function attackBody(name)
	return "#showtooltip\n/startattack\n/cast " .. name
end

local function castBody(name)
	return "#showtooltip\n/cast " .. name
end

local function bodyFor(name, attack)
	return attack and attackBody(name) or castBody(name)
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

---A macro body as Turbo wrote it: the game can give a body back (after a
---reload) with Windows line breaks or a line break or spaces at the end.
---@param body string
---@return string
local function asWritten(body)
	return (body:gsub("\r\n?", "\n"):gsub("%s+$", ""))
end

---The spell a macro is Turbo's macro for, or nil when it's the player's: its
---body is one of Turbo's two for a spell name, and its name is that spell's
---macro name. Every Turbo build so far wrote these bodies.
---@param macro TurboMacro
---@return string?
local function turbosSpell(macro)
	local body = asWritten(macro.body)
	local name = body:match("^#showtooltip\n/startattack\n/cast ([^\n]+)$")
		or body:match("^#showtooltip\n/cast ([^\n]+)$")
	if name and macro.name == macroName(name) then
		return name
	end
end

---Whether the player knows more than one rank of a spell: its subtext is a
---rank line. A rank line has its number in every language; other subtexts
---("Passive", "Racial", "Shapeshift") have none.
---@param spellID number
local function ranked(spellID)
	local subtext = safe.read("spellSubtext", spellID)
	return type(subtext) == "string" and subtext:find("%d") ~= nil
end

---The names, in the player's language, of the crowd control that damage
---breaks.
---@return table<string, true>
local function breaksOnDamage()
	local names = {}
	for _, spellID in ipairs(BREAKS_ON_DAMAGE) do
		local name = safe.read("spellName", spellID)
		if type(name) == "string" and name ~= "" then
			names[name] = true
		end
	end
	return names
end

---A spell on the bars that gets a macro.
---@class TurboBarSpell
---@field name string
---@field macroName string
---@field attack boolean
---@field slots number[]

---Every spell on the action bars that has more than one rank, by name, in
---the order its first slot comes.
---@return TurboBarSpell[]
local function barSpells()
	local list, byName = {}, {}
	local noAttack = breaksOnDamage()
	-- What each spell ID gets, read once: its name, ranks and attack, or false.
	local byID = {}
	for slot = 1, ACTION_SLOTS do
		local actionType, id = safe.actionInfo(slot)
		if actionType == "spell" and type(id) == "number" then
			if byID[id] == nil then
				byID[id] = false
				local name = safe.read("spellName", id)
				if type(name) == "string" and name ~= "" then
					byID[id] = {
						name = name,
						ranked = ranked(id),
						attack = safe.read("spellHarmful", id) == true and not noAttack[name],
					}
				end
			end
			local info = byID[id]
			if info and info.ranked then
				local entry = byName[info.name]
				if not entry then
					entry = { name = info.name, macroName = macroName(info.name), attack = false, slots = {} }
					byName[info.name] = entry
					table.insert(list, entry)
				end
				-- Every rank of a spell reads the same; any attacking one decides.
				entry.attack = entry.attack or info.attack
				table.insert(entry.slots, slot)
			end
		end
	end
	return list
end

---The action slots holding each macro, by the macro's name.
---@return table<string, number[]>
local function barMacros()
	local slotsByName = {}
	for slot = 1, ACTION_SLOTS do
		if safe.actionInfo(slot) == "macro" then
			local name = safe.actionText(slot)
			if type(name) == "string" and name ~= "" then
				slotsByName[name] = slotsByName[name] or {}
				table.insert(slotsByName[name], slot)
			end
		end
	end
	return slotsByName
end

---Turbo's macro for a spell, its character macro first, or nil.
---@param turbos {macro: TurboMacro, spell: string}[]
---@param name string
---@return TurboMacro?
local function turbosMacroFor(turbos, name)
	local found
	for _, turbo in ipairs(turbos) do
		if turbo.spell == name then
			if turbo.macro.perCharacter then
				return turbo.macro
			end
			found = found or turbo.macro
		end
	end
	return found
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

---Every macro Turbo made, with its spell.
---@param macros TurboMacro[]
---@return {macro: TurboMacro, spell: string}[]
local function turbosMacros(macros)
	local turbos = {}
	for _, macro in ipairs(macros) do
		local spell = turbosSpell(macro)
		if spell then
			table.insert(turbos, { macro = macro, spell = spell })
		end
	end
	return turbos
end

---What /turbo macros will do, worked out before changing anything.
---@class TurboMacroPlan
---@field use TurboBarSpell[] spells that get a macro, to swap onto the bars
---@field new TurboBarSpell[] spells whose macro has to be made
---@field edits {macro: TurboMacro, entry: TurboBarSpell}[] Turbo's macros whose body changes
---@field retire {macro: TurboMacro, spellID: number, slots: number[]}[] Turbo's macros on the bars for a spell with one rank
---@field recyclable TurboMacro[] Turbo's character macros nothing needs
---@field skipped string[] lines saying why a spell was skipped

---@param macros TurboMacro[]
---@param spells TurboBarSpell[]
---@param onBars table<string, number[]>
---@return TurboMacroPlan
local function plan(macros, spells, onBars)
	local turbos = turbosMacros(macros)
	local result = { use = {}, new = {}, edits = {}, retire = {}, recyclable = {}, skipped = {} }
	local used = {}
	-- Which spell each macro name went to: two long names can cut the same.
	local claimedBy = {}
	for _, entry in ipairs(spells) do
		local macro = turbosMacroFor(turbos, entry.name)
		local other = claimedBy[entry.macroName]
		if other then
			table.insert(
				result.skipped,
				"Skipped " .. entry.name .. ": its short macro name clashes with " .. other .. "."
			)
		elseif macro then
			claimedBy[entry.macroName] = entry.name
			used[macro] = true
			table.insert(result.use, entry)
			if asWritten(macro.body) ~= bodyFor(entry.name, entry.attack) then
				table.insert(result.edits, { macro = macro, entry = entry })
			end
		elseif nameTaken(macros, entry.macroName) then
			table.insert(result.skipped, "Skipped " .. entry.name .. ": you already have a macro with that name.")
		else
			claimedBy[entry.macroName] = entry.name
			table.insert(result.use, entry)
			table.insert(result.new, entry)
		end
	end

	for _, turbo in ipairs(turbos) do
		local macro = turbo.macro
		if not used[macro] then
			local slots = onBars[macro.name]
			local retired = false
			if slots then
				-- On the bars: only a spell the player knows with one rank goes.
				local spellID = safe.read("knownSpellID", turbo.spell)
				if type(spellID) == "number" and not ranked(spellID) then
					table.insert(result.retire, { macro = macro, spellID = spellID, slots = slots })
					retired = true
				end
			end
			if macro.perCharacter and (retired or not slots) then
				table.insert(result.recyclable, macro)
			end
		end
	end
	return result
end

---The index a macro has now: making, renaming and deleting macros moves
---others.
---@param name string
---@param body string
---@param perCharacter boolean
---@return number?
local function indexNow(name, body, perCharacter)
	for _, macro in ipairs(safe.macros()) do
		if macro.name == name and macro.body == body and macro.perCharacter == perCharacter then
			return macro.index
		end
	end
end

---Free slots in each macro list.
---@param macros TurboMacro[]
---@return number character
---@return number general
local function freeSlots(macros)
	local account, perCharacter = safe.macroLimits()
	local usedCharacter, usedGeneral = 0, 0
	for _, macro in ipairs(macros) do
		if macro.perCharacter then
			usedCharacter = usedCharacter + 1
		else
			usedGeneral = usedGeneral + 1
		end
	end
	return perCharacter - usedCharacter, account - usedGeneral
end

---Says how many macro slots are missing, and which of the player's macros
---aren't on this character's bars (character macros first).
---@param macros TurboMacro[]
---@param onBars table<string, number[]>
---@param needed number
---@param room number
local function printNoRoom(macros, onBars, needed, room)
	safe.print(
		"Turbo needs "
			.. counted(needed, "free macro slot", "free macro slots")
			.. " and you have "
			.. room
			.. ". Free up "
			.. (needed - room)
			.. " more. Nothing was changed."
	)
	local names = {}
	for _, perCharacter in ipairs({ true, false }) do
		for _, macro in ipairs(macros) do
			if macro.perCharacter == perCharacter and not turbosSpell(macro) and not onBars[macro.name] then
				table.insert(names, perCharacter and macro.name or (macro.name .. " (general)"))
			end
		end
	end
	if #names == 0 then
		safe.print("Every macro you have is on your bars or Turbo's. Delete some in the macro window (/macro).")
		return
	end
	local listed = { unpack(names, 1, math.min(#names, MAX_LISTED)) }
	local more = #names > MAX_LISTED and (" and " .. (#names - MAX_LISTED) .. " more") or ""
	safe.print("Not on your bars, so you could delete: " .. table.concat(listed, ", ") .. more .. ".")
	for _, macro in ipairs(macros) do
		if not macro.perCharacter and not turbosSpell(macro) and not onBars[macro.name] then
			-- A general macro may be on another character's bars.
			safe.print("General macros are shared: check your other characters first.")
			return
		end
	end
end

---Puts each spell's macro in every action slot that held that spell.
---@param use TurboBarSpell[]
---@return number swapped
local function swapButtons(use)
	-- New, renamed and deleted macros move others: look them all up again.
	local turbos = turbosMacros(safe.macros())
	local swapped = 0
	for _, entry in ipairs(use) do
		local macro = turbosMacroFor(turbos, entry.name)
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
	local onBars = barMacros()
	local todo = plan(macros, barSpells(), onBars)
	local freeCharacter, freeGeneral = freeSlots(macros)
	local room = #todo.recyclable + freeCharacter + freeGeneral
	if #todo.new > room then
		printNoRoom(macros, onBars, #todo.new, room)
		return
	end

	-- Edits keep each macro's name, so its index: edit before anything moves.
	for _, edit in ipairs(todo.edits) do
		safe.editMacro(edit.macro.index, bodyFor(edit.entry.name, edit.entry.attack))
	end
	-- Give a one-rank spell's buttons the spell back, off Turbo's macro.
	local restored = {}
	for _, retire in ipairs(todo.retire) do
		for _, slot in ipairs(retire.slots) do
			safe.pickupSpell(retire.spellID)
			safe.placeAction(slot)
			-- Placing picks up the macro that was there.
			safe.clearCursor()
		end
		table.insert(restored, turbosSpell(retire.macro))
	end
	-- New macros: recycled character macros, then free character slots, then
	-- free general slots.
	local recycled, general = 0, 0
	for i, entry in ipairs(todo.new) do
		local body = bodyFor(entry.name, entry.attack)
		local old = todo.recyclable[i]
		if old then
			local index = indexNow(old.name, old.body, true)
			if index then
				safe.editMacro(index, body, entry.macroName)
				recycled = recycled + 1
			end
		elseif i - #todo.recyclable <= freeCharacter then
			safe.createMacro(entry.macroName, QUESTION_MARK_ICON, body, true)
		else
			safe.createMacro(entry.macroName, QUESTION_MARK_ICON, body, false)
			general = general + 1
		end
	end
	-- The rest of Turbo's unneeded character macros go.
	local deleted = 0
	for i = #todo.new + 1, #todo.recyclable do
		local old = todo.recyclable[i]
		local index = indexNow(old.name, old.body, true)
		if index then
			safe.deleteMacro(index)
			deleted = deleted + 1
		end
	end
	local swapped = swapButtons(todo.use)

	local updated = #todo.edits > 0 and (", updated " .. #todo.edits) or ""
	local removed = (recycled + deleted) > 0 and (", removed " .. (recycled + deleted)) or ""
	safe.print(
		"Turbo made "
			.. counted(#todo.new, "macro", "macros")
			.. updated
			.. removed
			.. " and swapped "
			.. counted(swapped, "button", "buttons")
			.. "."
	)
	if general > 0 then
		safe.print(
			"Your character macros are full, so Turbo put "
				.. general
				.. " in general macro slots, shared by your characters."
		)
	end
	if #restored > 0 then
		safe.print(
			"Put "
				.. table.concat(restored, ", ")
				.. " back on your bars: "
				.. (#restored == 1 and "it has" or "they have")
				.. " one rank, so no macro."
		)
	end
	for _, line in ipairs(todo.skipped) do
		safe.print(line)
	end
end
