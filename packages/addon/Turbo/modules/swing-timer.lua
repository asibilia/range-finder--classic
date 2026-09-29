-- The swing timer: a main-hand swing bar in the card's swing row, shown only
-- while auto-attacking. Forever Shamans can't dual-wield, so main hand only.
--
-- The game's per-swing event restarts the bar from empty with the next swing's
-- duration, so parries, stuns, haste and weapon swaps show up on their own.
-- A marker covers the safe window: the first share of each swing (15% by
-- default) in which a hard cast costs little or no swing time.
--
-- The bar greys from a hard cast's start until the stop for that cast ID, with
-- the interrupted and failed events for it as fallbacks. Failures with
-- client-side cast IDs (a key pressed again mid-cast) match no cast, so they
-- change nothing. Instant spells never clip a swing, so they get no warning.
-- Out of melee (the range finder's check) it keeps timing, but dims and says
-- so. Blizzard's own swing bar is left alone.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local settings = ns.settings
local modules = ns.modules

local MAIN_HAND = 0
local DIM_ALPHA = 0.5
local COLOUR = { 1, 0.7, 0 }
local GREY = { 0.5, 0.5, 0.5 }

local bar
local safeWindow
local timeText
local outOfRange

local attacking = false
---The hard cast under way, by its cast ID.
---@type string?
local castID
local swingStart = 0
---@type number?
local swingDuration
local full = true
---@type number?
local shownTenths

local function build()
	bar = safe.createFrame("StatusBar", "TurboSwingBar", ns.card.rows.swing)
	bar:SetPoint("TOPLEFT")
	bar:SetPoint("BOTTOMLEFT")
	bar:SetWidth(ns.card.ROW_WIDTH)
	bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
	bar:SetMinMaxValues(0, 1)
	bar:SetValue(1)
	bar:Hide()

	local background = bar:CreateTexture(nil, "BACKGROUND")
	background:SetAllPoints()
	background:SetColorTexture(0, 0, 0, 0.4)

	safeWindow = bar:CreateTexture("TurboSwingSafeWindow", "OVERLAY")
	safeWindow:SetPoint("TOPLEFT")
	safeWindow:SetPoint("BOTTOMLEFT")
	safeWindow:SetColorTexture(0.3, 1, 0.3, 0.35)

	timeText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	timeText:SetPoint("RIGHT", -2, 0)

	outOfRange = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	outOfRange:SetPoint("CENTER")
	outOfRange:SetText("Out of range")
	outOfRange:Hide()
end

-- The marker covers the same share of every swing, however long it is.
local function sizeSafeWindow()
	local share = settings.get("safeWindow")
	if type(share) ~= "number" then
		share = settings.defaults.safeWindow
	end
	share = math.min(1, math.max(0, share))
	if share > 0 then
		safeWindow:SetWidth(ns.card.ROW_WIDTH * share)
		safeWindow:Show()
	else
		safeWindow:Hide()
	end
end

local function paint()
	local colour = castID and GREY or COLOUR
	bar:SetStatusBarColor(colour[1], colour[2], colour[3])
end

local function showRange()
	local dim = modules.isEnabled("rangeFinder") and not ns.range.inMelee()
	bar:SetAlpha(dim and DIM_ALPHA or 1)
	outOfRange:SetShown(dim)
end

local function onUpdate()
	if not swingDuration or full then
		return
	end
	local elapsed = safe.now() - swingStart
	if elapsed >= swingDuration then
		full = true
		bar:SetValue(swingDuration)
		timeText:SetText("")
		shownTenths = nil
		return
	end
	bar:SetValue(elapsed)
	local tenths = math.ceil((swingDuration - elapsed) * 10)
	if tenths ~= shownTenths then
		shownTenths = tenths
		timeText:SetText(string.format("%.1f", tenths / 10))
	end
end

local function onSwing(_, duration, swingType)
	if swingType ~= MAIN_HAND or type(duration) ~= "number" or duration <= 0 then
		return
	end
	ns.debug.record("swingTimer", "swingDuration", duration)
	swingStart = safe.now()
	swingDuration = duration
	full = false
	bar:SetMinMaxValues(0, duration)
	bar:SetValue(0)
	sizeSafeWindow()
	onUpdate()
end

local function onAttackStart()
	attacking = true
	showRange()
	bar:Show()
end

local function onAttackStop()
	attacking = false
	bar:Hide()
end

local function onCastStart(_, unit, castGUID)
	if unit == "player" then
		castID = castGUID
		paint()
	end
end

-- Stop, and the interrupted and failed fallbacks: only the cast under way.
local function onCastEnd(_, unit, castGUID)
	if unit == "player" and castID ~= nil and castGUID == castID then
		castID = nil
		paint()
	end
end

local CAST_ENDS = { "UNIT_SPELLCAST_STOP", "UNIT_SPELLCAST_INTERRUPTED", "UNIT_SPELLCAST_FAILED" }

modules.register("swingTimer", {
	name = "Swing timer",
	options = {
		-- The share (0-1) of each swing, from its start, in which a hard cast
		-- costs little or no swing time.
		{
			key = "safeWindow",
			label = "Safe window (share of the swing)",
			kind = "slider",
			default = 0.15,
			min = 0,
			max = 0.5,
			step = 0.01,
		},
	},
	onEnable = function()
		if not bar then
			build()
			bar:SetScript("OnUpdate", onUpdate)
		end
		sizeSafeWindow()
		paint()
		showRange()
		bar:SetShown(attacking)
		events.on("PLAYER_SWING", onSwing)
		events.on("PLAYER_ENTER_COMBAT", onAttackStart)
		events.on("PLAYER_LEAVE_COMBAT", onAttackStop)
		events.on("UNIT_SPELLCAST_START", onCastStart)
		for _, event in ipairs(CAST_ENDS) do
			events.on(event, onCastEnd)
		end
		events.on("Turbo.RangeChanged", showRange)
	end,
	onDisable = function()
		events.off("PLAYER_SWING", onSwing)
		events.off("PLAYER_ENTER_COMBAT", onAttackStart)
		events.off("PLAYER_LEAVE_COMBAT", onAttackStop)
		events.off("UNIT_SPELLCAST_START", onCastStart)
		for _, event in ipairs(CAST_ENDS) do
			events.off(event, onCastEnd)
		end
		events.off("Turbo.RangeChanged", showRange)
		attacking = false
		castID = nil
		bar:Hide()
	end,
})
