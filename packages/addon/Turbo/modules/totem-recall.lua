-- The Recall reminder: Totemic Recall's icon in the reminder row whenever
-- totem mana is about to go to waste. Recall gives back part of each
-- recalled totem's mana, so a totem that runs out on its own, or keeps
-- running far behind the player, leaves mana on the table.
--
-- It shows while either is true:
--
-- 1. A totem is in its last `totemWarningSeconds`: the moment its icon
--    starts pulsing, on totem timers' own timing. A totem whose duration
--    isn't learned yet has no such moment.
-- 2. The player is TOTEM_REACH_YARDS or more from the drop spot of every
--    totem down. Totems land at the player's feet, so a drop spot is where
--    the player stood as the totem dropped. A position that's missing
--    (inside instances), secret or on another map, or a totem whose drop
--    spot Turbo didn't see, is unknown, and unknown never counts as far.
--
-- Part of totem timers: it hears about the totems through `ns.totems` and
-- the "Turbo.TotemChanged" message, so it's off whenever that module is.
-- Only for a player who knows Totemic Recall. The position is checked once a
-- second, and only while a totem is down.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local totems = ns.totems

-- Its readings are logged under totem timers, the module it belongs to.
local read = ns.debug.reader("totemTimers")

local REMINDER = "totemicRecall"
local TOTEMIC_RECALL = 36936
---How far a totem reaches, in yards. To be measured in the beta: walk away
---from Strength of Earth out of combat until its buff drops.
local TOTEM_REACH_YARDS = 20
local POLL_SECONDS = 1

---@class TurboDropSpot
---@field x number
---@field y number
---@field mapID number

---Where each totem down was dropped, by game slot; false when Turbo doesn't
---know (no plain position at the drop, or already down at login).
---@type table<number, TurboDropSpot|false>
local spots = {}
-- While a totem is down Turbo watches for spells being learned, and keeps
-- whether Totemic Recall is known and its icon.
local watching = false
local known = false
local icon
---@type { Cancel: fun(self) }?
local ticker

local refresh

-- The player's position, or nil when the game gives none or hides any part
-- of it. Flat, on x and y only: walking away is across the ground, and
-- leaving out the height keeps a slope or a jump from counting as distance.
---@return TurboDropSpot?
local function position()
	local x, y, _, mapID = read("playerPosition")
	-- Secrecy first: a secret is never compared, not even to nil.
	if safe.isSecret(x) or safe.isSecret(y) or safe.isSecret(mapID) then
		return nil
	end
	if type(x) ~= "number" or type(y) ~= "number" or type(mapID) ~= "number" then
		return nil
	end
	return { x = x, y = y, mapID = mapID }
end

local function readRecall()
	known = read("spellKnown", TOTEMIC_RECALL) == true
	icon = nil
	if known then
		local texture = read("spellTexture", TOTEMIC_RECALL)
		-- The reminder row compares icons; a secret one is never shown.
		if not safe.isSecret(texture) then
			icon = texture
		end
	end
end

local function onSpellsChanged()
	readRecall()
	refresh()
end

local function stopPoll()
	if ticker then
		ticker:Cancel()
		ticker = nil
	end
end

local function watch()
	if watching then
		return
	end
	watching = true
	events.on("SPELLS_CHANGED", onSpellsChanged)
	readRecall()
end

local function unwatch()
	stopPoll()
	ns.reminders.hide(REMINDER)
	if not watching then
		return
	end
	watching = false
	events.off("SPELLS_CHANGED", onSpellsChanged)
	known, icon = false, nil
end

local function anyEndingSoon(down)
	for _, endingSoon in pairs(down) do
		if endingSoon then
			return true
		end
	end
	return false
end

-- Whether the player is out of reach of every totem down.
local function leftBehind(down)
	local here = position()
	if not here then
		return false
	end
	for slot in pairs(down) do
		local spot = spots[slot]
		if not spot or spot.mapID ~= here.mapID then
			return false
		end
		local dx, dy = here.x - spot.x, here.y - spot.y
		if dx * dx + dy * dy < TOTEM_REACH_YARDS * TOTEM_REACH_YARDS then
			return false
		end
	end
	return true
end

refresh = function()
	local down = totems.down()
	if not next(down) then
		unwatch()
		return
	end
	watch()
	if not known then
		stopPoll()
		ns.reminders.hide(REMINDER)
		return
	end
	if not ticker then
		ticker = safe.every(POLL_SECONDS, refresh)
	end
	if anyEndingSoon(down) or leftBehind(down) then
		ns.reminders.show(REMINDER, icon)
	else
		ns.reminders.hide(REMINDER)
	end
end

local function onTotemChanged(_, slot, dropped)
	if totems.down()[slot] == nil then
		spots[slot] = nil
	else
		watch()
		if dropped and known then
			spots[slot] = position() or false
		elseif spots[slot] == nil then
			spots[slot] = false
		end
	end
	refresh()
end

events.on("Turbo.TotemChanged", onTotemChanged)
