-- The range finder: the range band in the card's header row, while a live
-- enemy is targeted. Melee, Shock range (Earth Shock, 20 yd), Bolt range
-- (Lightning Bolt, 30 yd) or Out of range; hidden otherwise.
--
-- Shock and Bolt follow the game's range-change event. Melee comes from the
-- 5-yard item check, polled 5 times a second only while an enemy is targeted,
-- and is left only after two misses in a row, so it doesn't flicker at the
-- edge. Range is always checked by spell or item ID, never by action slot.
--
-- Other modules ask `ns.range.inMelee()`, or listen for the
-- "Turbo.RangeChanged" message: the band key ("melee", "shock", "bolt",
-- "out"), or nil when the band is hidden.
local _, ns = ...

local safe = ns.safe
local events = ns.events

local range = {}
ns.range = range

local EARTH_SHOCK = 8042
local LIGHTNING_BOLT = 403
---The item whose range check reaches 5 yards.
local MELEE_ITEM = 8149
local POLL_SECONDS = 0.2
local MISSES_TO_LEAVE_MELEE = 2

local BANDS = {
	melee = { text = "Melee", r = 1, g = 0.82, b = 0 },
	shock = { text = "Shock range", r = 0.3, g = 0.9, b = 0.3 },
	bolt = { text = "Bolt range", r = 0.2, g = 0.8, b = 0.8 },
	out = { text = "Out of range", r = 1, g = 0.25, b = 0.25 },
}

local label
local ticker
local targetAttackable = false
local inMelee = false
local misses = 0
local inShock = false
local inBolt = false
---@type string?
local shown

local function show(key)
	if key == shown then
		return
	end
	shown = key
	local band = key and BANDS[key]
	if band then
		label:SetText(band.text)
		label:SetTextColor(band.r, band.g, band.b)
		label:Show()
	else
		label:SetText("")
		label:Hide()
	end
	events.send("Turbo.RangeChanged", key)
end

local function update()
	if not targetAttackable then
		show(nil)
	elseif inMelee then
		show("melee")
	elseif inShock then
		show("shock")
	elseif inBolt then
		show("bolt")
	else
		show("out")
	end
end

local function readSpells()
	inShock = safe.read("spellInRange", EARTH_SHOCK, "target") == true
	inBolt = safe.read("spellInRange", LIGHTNING_BOLT, "target") == true
end

local function readMelee()
	return safe.read("itemInRange", MELEE_ITEM, "target") == true
end

local function poll()
	if readMelee() then
		inMelee = true
		misses = 0
	elseif inMelee then
		misses = misses + 1
		if misses >= MISSES_TO_LEAVE_MELEE then
			inMelee = false
			-- The spell checks may have moved without an event while in melee.
			readSpells()
		end
	end
	update()
end

local function stop()
	if ticker then
		ticker:Cancel()
		ticker = nil
	end
	targetAttackable = false
	inMelee = false
	misses = 0
	update()
end

-- A new enemy: range it right away, with no misses carried over.
local function track()
	targetAttackable = true
	inMelee = readMelee()
	misses = 0
	readSpells()
	if not ticker then
		ticker = safe.every(POLL_SECONDS, poll)
	end
	update()
end

local function onTargetChanged()
	if safe.read("targetAttackable") == true then
		track()
	else
		stop()
	end
end

-- The same target can die, or turn hostile, without a target change.
local function onTargetFlags()
	local attackable = safe.read("targetAttackable") == true
	if attackable and not targetAttackable then
		track()
	elseif not attackable and targetAttackable then
		stop()
	end
end

local function onUnitFlags(_, unit)
	if unit == "target" then
		onTargetFlags()
	end
end

local function onRestrictionChanged(_, kind)
	if kind == "combat" then
		onTargetFlags()
	end
end

local function onSpellRange()
	if targetAttackable then
		readSpells()
		update()
	end
end

---Whether the target is in melee range, two-miss rule applied. False with no
---live enemy targeted.
---@return boolean
function range.inMelee()
	return targetAttackable and inMelee
end

ns.modules.register("rangeFinder", {
	name = "Range finder",
	onEnable = function()
		if not label then
			label = ns.card.rows.range:CreateFontString(nil, "OVERLAY", "GameFontNormal")
			label:SetPoint("CENTER")
			label:Hide()
		end
		events.on("PLAYER_TARGET_CHANGED", onTargetChanged)
		events.on("UNIT_FLAGS", onUnitFlags)
		events.on("SPELL_RANGE_CHECK_UPDATE", onSpellRange)
		events.on("Turbo.RestrictionChanged", onRestrictionChanged)
		onTargetChanged()
	end,
	onDisable = function()
		events.off("PLAYER_TARGET_CHANGED", onTargetChanged)
		events.off("UNIT_FLAGS", onUnitFlags)
		events.off("SPELL_RANGE_CHECK_UPDATE", onSpellRange)
		events.off("Turbo.RestrictionChanged", onRestrictionChanged)
		stop()
	end,
})
