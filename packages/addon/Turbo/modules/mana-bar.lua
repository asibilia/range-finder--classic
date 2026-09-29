-- The mana bar: the player's mana and its number, in the card's mana row,
-- red below 20%.
--
-- Max mana is plain; current mana is secret in combat, so it goes straight
-- into the bar and the text widget. The colour comes from a Step curve the
-- game evaluates on the mana percent (0–1), and goes straight into the bar.
local _, ns = ...

local safe = ns.safe
local events = ns.events

local LOW_MANA = 0.2
-- Red below LOW_MANA, mana blue from it up.
local COLOR_CURVE = {
	type = "Step",
	points = {
		{ x = 0, r = 0.9, g = 0.15, b = 0.15 },
		{ x = LOW_MANA, r = 0, g = 0.44, b = 0.87 },
	},
}

local bar
local text

local function build()
	local row = ns.card.rows.mana
	bar = safe.createFrame("StatusBar", nil, row)
	bar:SetAllPoints()
	bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")

	local background = bar:CreateTexture(nil, "BACKGROUND")
	background:SetAllPoints()
	background:SetColorTexture(0, 0, 0, 0.5)

	text = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	text:SetPoint("CENTER")
end

local function updateMax()
	bar:SetMinMaxValues(0, safe.read("manaMax"))
end

local function updateMana()
	local mana = safe.read("mana")
	bar:SetValue(mana)
	text:SetText(mana)
	bar:SetStatusBarColor(safe.read("manaColor", COLOR_CURVE))
end

local function onPower(_, unit, powerType)
	if unit == "player" and powerType == "MANA" then
		updateMana()
	end
end

local function onMaxPower(_, unit, powerType)
	if unit == "player" and powerType == "MANA" then
		updateMax()
		updateMana()
	end
end

ns.modules.register("manaBar", {
	onEnable = function()
		if not bar then
			build()
		end
		bar:Show()
		updateMax()
		updateMana()
		events.on("UNIT_POWER_FREQUENT", onPower)
		events.on("UNIT_MAXPOWER", onMaxPower)
	end,
	onDisable = function()
		events.off("UNIT_POWER_FREQUENT", onPower)
		events.off("UNIT_MAXPOWER", onMaxPower)
		bar:Hide()
	end,
})
