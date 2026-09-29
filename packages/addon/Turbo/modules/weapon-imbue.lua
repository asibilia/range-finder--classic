-- The weapon imbue: the main-hand imbue's icon and time left in the card's
-- icons row, and a reminder when it's missing or running out.
--
-- Out of combat the reminder shows under `imbueWarnMinutes` left; in combat
-- under `imbueCombatWarnMinutes`, 0 by default: only once it's gone. The
-- enchant query is plain in combat, so the time left is read whenever the
-- game says the imbue changed, and counted down on Turbo's clock in between.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local settings = ns.settings
local restrictions = ns.restrictions

local REMINDER = "weaponImbue"
-- Windfury Weapon's icon, for the reminder before any imbue has been seen.
local DEFAULT_ICON = 136018
local SIZE = 22
local TICK_SECONDS = 1

local frame, icon, text
---When the imbue runs out on Turbo's clock; nil when there's none.
---@type number?
local expiresAt
local lastIcon = DEFAULT_ICON
local ticker

local function timeLeft()
	if not expiresAt then
		return 0
	end
	return math.max(0, expiresAt - safe.now())
end

-- "30m", or "45s" in the last minute.
local function formatTime(seconds)
	if seconds > 60 then
		return math.ceil(seconds / 60) .. "m"
	end
	return math.ceil(seconds) .. "s"
end

local function stopTicker()
	if ticker then
		ticker:Cancel()
		ticker = nil
	end
end

local function wantsReminder(left)
	if left <= 0 then
		return true
	end
	local key = restrictions.inCombat() and "imbueCombatWarnMinutes" or "imbueWarnMinutes"
	return left < settings.get(key) * 60
end

local function update()
	local left = timeLeft()
	if left > 0 then
		text:SetText(formatTime(left))
		frame:Show()
	else
		expiresAt = nil
		stopTicker()
		frame:Hide()
	end
	if wantsReminder(left) then
		ns.reminders.show(REMINDER, lastIcon)
	else
		ns.reminders.hide(REMINDER)
	end
end

local function read()
	local enchant = safe.read("mainHandEnchant")
	if enchant and enchant.timeLeft > 0 then
		expiresAt = safe.now() + enchant.timeLeft
		lastIcon = enchant.icon or lastIcon
		icon:SetTexture(lastIcon)
		if not ticker then
			ticker = safe.every(TICK_SECONDS, update)
		end
	else
		expiresAt = nil
	end
	update()
end

local function onInventoryChanged(_, unit)
	if unit == "player" then
		read()
	end
end

local function onRestrictionChanged(_, kind)
	if kind == "combat" then
		update()
	end
end

local function build()
	local row = ns.card.rows.icons
	frame = safe.createFrame("Frame", "TurboImbue", row)
	frame:SetSize(SIZE, SIZE)
	frame:SetPoint("LEFT", row, "LEFT", 0, 0)
	icon = frame:CreateTexture(nil, "ARTWORK")
	icon:SetAllPoints()
	text = frame:CreateFontString(nil, "OVERLAY", "NumberFontNormalSmall")
	text:SetPoint("BOTTOM", frame, "BOTTOM", 0, 1)
	frame:Hide()
end

ns.modules.register("weaponImbue", {
	onEnable = function()
		if not frame then
			build()
		end
		events.on("UNIT_INVENTORY_CHANGED", onInventoryChanged)
		events.on("WEAPON_ENCHANT_CHANGED", read)
		events.on("Turbo.RestrictionChanged", onRestrictionChanged)
		read()
	end,
	onDisable = function()
		events.off("UNIT_INVENTORY_CHANGED", onInventoryChanged)
		events.off("WEAPON_ENCHANT_CHANGED", read)
		events.off("Turbo.RestrictionChanged", onRestrictionChanged)
		expiresAt = nil
		stopTicker()
		frame:Hide()
		ns.reminders.hide(REMINDER)
	end,
})
