-- Totem timers: four slots in the card's totem row, always Earth, Fire, Water,
-- Air, whatever the game's slot numbers (Fire 1, Earth 2, Water 3, Air 4).
-- An empty slot shows its element's icon, faded.
--
-- Time left and the swirl come from the game's own Cooldown countdown on
-- Turbo's frames, driven by the slot's duration object; the player's
-- countdown CVar is never touched. A slot is empty when its time left reads a
-- plain zero or it has no duration object. The game's have-totem flag says
-- true for empty slots too, so it's never used.
--
-- When the game gives no duration object, the fallback times each totem on
-- its own from the cast: the drop reports the spell ID and the slot, and each
-- totem's duration is learned out of combat, per spell ID (Forever's differ
-- from vanilla's). The same timing starts the pulse in the last
-- `totemWarningSeconds` and tells an early death, which flashes red.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local settings = ns.settings
local timers = ns.timers

local SIZE = 36
local GAP = 8
local EMPTY_ALPHA = 0.35
local FLASH_SECONDS = 0.5
---A totem gone more than this before its time died early.
local EARLY_SECONDS = 1
---Casts that put down several totems at once, so none is learned from them.
local MULTI_TOTEM_SPELLS = {
	[66842] = true, -- Call of the Elements
}

---Display order, left to right, with each element's game slot and icon.
local ELEMENTS = {
	{ name = "Earth", slot = 2, icon = "Interface\\Icons\\Spell_Nature_StoneSkinTotem" },
	{ name = "Fire", slot = 1, icon = "Interface\\Icons\\Spell_Fire_SearingTotem" },
	{ name = "Water", slot = 3, icon = "Interface\\Icons\\Spell_Nature_ManaRegenTotem" },
	{ name = "Air", slot = 4, icon = "Interface\\Icons\\Spell_Nature_Windfury" },
}

---@class TurboTotemSlot
---@field element table
---@field frame table
---@field icon table
---@field cooldown table
---@field pulse table
---@field flash table
---@field filled boolean
---@field endsAt number? when the totem runs out, if Turbo knows
---@field pulseTimer TurboSelfTimer?
---@field flashTimer TurboSelfTimer?

---Slots by the game's slot number.
---@type table<number, TurboTotemSlot>
local slots = {}
---Totem durations learned out of combat, by spell ID.
---@type table<number, number>
local learned = {}
local supported = false
---The player's last cast: its spell ID and when it landed.
local lastCast = { spellID = nil, at = nil }

-- Whether a reading is plain, so Turbo may look at it. Checking never reads it.
local function plain(value)
	return not safe.isSecret(value)
end

local function build()
	local row = ns.card.rows.totems
	for i, element in ipairs(ELEMENTS) do
		local name = "TurboTotem" .. element.name
		local frame = safe.createFrame("Frame", name, row)
		frame:SetSize(SIZE, SIZE)
		frame:SetPoint("CENTER", row, "CENTER", (i - (#ELEMENTS + 1) / 2) * (SIZE + GAP), 0)

		local icon = frame:CreateTexture(name .. "Icon", "ARTWORK")
		icon:SetAllPoints()

		local cooldown = safe.createFrame("Cooldown", nil, frame, "CooldownFrameTemplate")
		cooldown:SetAllPoints()
		cooldown:SetDrawEdge(false)
		cooldown:SetHideCountdownNumbers(false)

		local pulse = icon:CreateAnimationGroup(name .. "Pulse")
		pulse:SetLooping("BOUNCE")
		local fade = pulse:CreateAnimation("Alpha")
		fade:SetFromAlpha(1)
		fade:SetToAlpha(0.3)
		fade:SetDuration(0.4)

		local flash = frame:CreateTexture(name .. "Flash", "OVERLAY")
		flash:SetAllPoints()
		flash:SetColorTexture(1, 0.1, 0.1, 0.6)
		flash:Hide()

		slots[element.slot] = {
			element = element,
			frame = frame,
			icon = icon,
			cooldown = cooldown,
			pulse = pulse,
			flash = flash,
			filled = false,
		}
	end
end

local function stopPulse(s)
	if s.pulseTimer then
		s.pulseTimer:cancel()
		s.pulseTimer = nil
	end
	s.pulse:Stop()
end

-- Pulses the icon from `totemWarningSeconds` before the totem's end.
local function schedulePulse(s)
	stopPulse(s)
	if not s.endsAt then
		return
	end
	local delay = s.endsAt - settings.get("totemWarningSeconds") - safe.now()
	if delay <= 0 then
		s.pulse:Play()
		return
	end
	s.pulseTimer = timers.start(delay, function()
		s.pulseTimer = nil
		s.pulse:Play()
	end)
end

local function hideFlash(s)
	if s.flashTimer then
		s.flashTimer:cancel()
		s.flashTimer = nil
	end
	s.flash:Hide()
end

local function showFlash(s)
	hideFlash(s)
	s.flash:Show()
	s.flashTimer = timers.start(FLASH_SECONDS, function()
		s.flashTimer = nil
		s.flash:Hide()
	end)
end

local function showEmpty(s)
	s.icon:SetTexture(s.element.icon)
	s.icon:SetDesaturated(true)
	s.icon:SetAlpha(EMPTY_ALPHA)
	s.cooldown:Clear()
end

-- Whether a game slot holds a totem, by its time left and duration object.
-- Returns the duration object too.
local function readSlot(slot)
	local timeLeft = safe.read("totemTimeLeft", slot)
	if plain(timeLeft) and (type(timeLeft) ~= "number" or timeLeft <= 0) then
		return false
	end
	if not supported then
		return true
	end
	local duration = safe.read("totemDuration", slot)
	if plain(duration) and duration == nil then
		return false
	end
	return true, duration
end

-- The spell that put this totem down: the player's cast at this moment.
local function castNow()
	if lastCast.at == safe.now() then
		return lastCast.spellID
	end
end

-- When the totem in a game slot started and how long it lasts, if Turbo
-- knows: out of combat from the game's own plain timing (learned per spell
-- ID), in combat from the cast and the learned duration.
local function timing(startTime, length)
	local spellID = castNow()
	if plain(startTime) and plain(length) and type(length) == "number" and length > 0 then
		if spellID and not MULTI_TOTEM_SPELLS[spellID] then
			learned[spellID] = length
		end
		return startTime, length
	end
	if spellID and learned[spellID] then
		return safe.now(), learned[spellID]
	end
end

local function fill(s, slot, duration)
	local _, _, startTime, length, icon = safe.read("totemInfo", slot)
	local startedAt, lasts = timing(startTime, length)
	s.endsAt = startedAt and startedAt + lasts

	if plain(icon) and icon == nil then
		s.icon:SetTexture(s.element.icon)
	else
		s.icon:SetTexture(icon)
	end
	s.icon:SetDesaturated(false)
	s.icon:SetAlpha(1)

	if supported then
		s.cooldown:SetCooldownFromDurationObject(duration)
	elseif startedAt then
		s.cooldown:SetCooldown(startedAt, lasts)
	else
		s.cooldown:Clear()
	end
	s.filled = true
	hideFlash(s)
	schedulePulse(s)
end

local function empty(s)
	local diedEarly = s.filled and s.endsAt ~= nil and s.endsAt - safe.now() > EARLY_SECONDS
	-- A totem the player took down themselves (Totemic Recall) didn't die.
	if diedEarly and castNow() == nil then
		showFlash(s)
	end
	s.filled = false
	s.endsAt = nil
	stopPulse(s)
	showEmpty(s)
end

local function update(slot)
	local s = slots[slot]
	if not s then
		return
	end
	local filled, duration = readSlot(slot)
	if filled then
		fill(s, slot, duration)
	else
		empty(s)
	end
end

local function onTotemUpdate(_, slot)
	update(slot)
end

local function onCast(_, unit, _, spellID)
	if unit == "player" then
		lastCast.spellID = spellID
		lastCast.at = safe.now()
	end
end

ns.modules.register("totemTimers", {
	name = "Totem timers",
	options = {
		{
			key = "totemWarningSeconds",
			label = "Pulse before a totem ends (seconds)",
			kind = "slider",
			default = 5,
			min = 0,
			max = 15,
			step = 1,
		},
	},
	onEnable = function()
		if not next(slots) then
			build()
		end
		supported = safe.read("totemDurationSupported") == true
		events.on("UNIT_SPELLCAST_SUCCEEDED", onCast)
		events.on("PLAYER_TOTEM_UPDATE", onTotemUpdate)
		for slot, s in pairs(slots) do
			s.frame:Show()
			update(slot)
		end
	end,
	onDisable = function()
		events.off("UNIT_SPELLCAST_SUCCEEDED", onCast)
		events.off("PLAYER_TOTEM_UPDATE", onTotemUpdate)
		for _, s in pairs(slots) do
			s.filled = false
			s.endsAt = nil
			hideFlash(s)
			stopPulse(s)
			showEmpty(s)
			s.frame:Hide()
		end
	end,
})
