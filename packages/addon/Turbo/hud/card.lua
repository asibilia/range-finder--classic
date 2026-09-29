-- The HUD card: one compact card, shown while the player is engaged (in
-- combat, or an attackable enemy targeted) and faded away otherwise.
--
-- Rows, top to bottom: range band, swing timer, totems, small icons, mana.
-- Modules fill them in; `ns.card.rows` holds them by key.
--
-- It sits just above Blizzard's swing bar, between the centred unit frames,
-- until the player moves it in Edit Mode. One saved position applies to every
-- Edit Mode layout.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local settings = ns.settings
local restrictions = ns.restrictions

local card = {}
ns.card = card

local WIDTH = 220
local PADDING = 4
local SPACING = 4
local ROWS = {
	{ key = "range", name = "TurboCardRange", height = 18 },
	{ key = "swing", name = "TurboCardSwing", height = 14 },
	{ key = "totems", name = "TurboCardTotems", height = 36 },
	{ key = "icons", name = "TurboCardIcons", height = 22 },
	{ key = "mana", name = "TurboCardMana", height = 12 },
}
local DEFAULT_POSITION = { point = "CENTER", x = 0, y = -140 }

local FADE_SECONDS = 0.3
local FADE_STEP = 0.03

---The card's rows, by key ("range", "swing", "totems", "icons", "mana").
---@type table<string, table>
card.rows = {}

---The card's frame, once built. Reminders anchor to it.
card.frame = nil

---How wide every row is: the card, less its padding.
card.ROW_WIDTH = WIDTH - PADDING * 2

local frame
local editMode = false
local targetAttackable = false
local alpha = 0
local goal = 0
local fade
local ticker

local function stepFade()
	local progress = math.min(1, (safe.now() - fade.startedAt) / FADE_SECONDS)
	alpha = fade.from + (fade.to - fade.from) * progress
	frame:SetAlpha(alpha)
	if progress >= 1 then
		ticker:Cancel()
		ticker = nil
		if goal == 0 then
			frame:Hide()
		end
	end
end

local function fadeTo(target)
	if target == goal then
		return
	end
	goal = target
	if target > 0 then
		frame:Show()
	end
	fade = { from = alpha, to = target, startedAt = safe.now() }
	if not ticker then
		ticker = safe.every(FADE_STEP, stepFade)
	end
end

local function engaged()
	return restrictions.inCombat() or targetAttackable
end

local function update()
	local show = editMode or settings.get("alwaysShow") or engaged()
	fadeTo(show and 1 or 0)
end

local function place()
	local point, x, y = settings.position()
	if not point then
		point, x, y = DEFAULT_POSITION.point, DEFAULT_POSITION.x, DEFAULT_POSITION.y
	end
	frame:ClearAllPoints()
	frame:SetPoint(point, x, y)
end

local function build()
	local height = PADDING * 2 - SPACING
	for _, row in ipairs(ROWS) do
		height = height + row.height + SPACING
	end

	frame = safe.createFrame("Frame", "TurboCard")
	card.frame = frame
	frame:SetSize(WIDTH, height)
	frame:SetFrameStrata("MEDIUM")
	frame:SetClampedToScreen(true)
	-- Turbo saves the position itself, once for every Edit Mode layout.
	frame:SetMovable(true)
	frame:SetDontSavePosition(true)
	frame:RegisterForDrag("LeftButton")
	frame:EnableMouse(false)

	local background = frame:CreateTexture(nil, "BACKGROUND")
	background:SetAllPoints()
	background:SetColorTexture(0, 0, 0, 0.5)

	local top = -PADDING
	for _, row in ipairs(ROWS) do
		local rowFrame = safe.createFrame("Frame", row.name, frame)
		rowFrame:SetPoint("TOPLEFT", frame, "TOPLEFT", PADDING, top)
		rowFrame:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -PADDING, top)
		rowFrame:SetHeight(row.height)
		card.rows[row.key] = rowFrame
		top = top - row.height - SPACING
	end

	frame:SetScript("OnDragStart", function(self)
		if editMode then
			self:StartMoving()
		end
	end)
	frame:SetScript("OnDragStop", function(self)
		self:StopMovingOrSizing()
		local point, x, y = safe.framePoint(self)
		if point then
			settings.setPosition(point, x, y)
		end
	end)

	place()
	frame:SetAlpha(0)
	frame:Hide()
end

local function setEditMode(open)
	editMode = open
	frame:EnableMouse(open)
	update()
end

local function readTarget()
	targetAttackable = safe.read("targetAttackable") == true
end

---Builds the card and starts following engaged, always show and Edit Mode.
function card.start()
	build()
	readTarget()
	-- The target can stop being attackable without a target change (it dies,
	-- or turns friendly), so it's also read again when combat starts or ends
	-- and when the target's flags change.
	events.on("Turbo.RestrictionChanged", function(_, kind)
		if kind == "combat" then
			readTarget()
			update()
		end
	end)
	events.on("PLAYER_TARGET_CHANGED", function()
		readTarget()
		update()
	end)
	events.on("UNIT_FLAGS", function(_, unit)
		if unit == "target" then
			readTarget()
			update()
		end
	end)
	events.on("Turbo.SettingChanged", function(_, key)
		if key == "alwaysShow" then
			update()
		end
	end)
	events.on("EditMode.Enter", function()
		setEditMode(true)
	end)
	events.on("EditMode.Exit", function()
		setEditMode(false)
	end)
	update()
end
