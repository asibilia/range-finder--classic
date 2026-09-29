-- A tiny addon for the fake game's own tests: a card that shows in combat
-- with a mana bar, and fades out 0.3s after combat ends.
local _, ns = ...
local safe = ns.safe

local card = safe.createFrame("Frame", "SampleCard", nil, "BackdropTemplate")
card:SetSize(200, 40)
card:SetPoint("CENTER", nil, "CENTER", 0, -120)
card:Hide()

local bar = safe.createFrame("StatusBar", nil, card)
local label = card:CreateFontString(nil, "OVERLAY")

safe.on("PLAYER_REGEN_DISABLED", function()
	card:Show()
	card:SetAlpha(1)
	bar:SetMinMaxValues(0, safe.read("manaMax"))
	-- Mana is a secret value: it goes straight into the widgets, unread.
	local mana = safe.read("mana")
	bar:SetValue(mana)
	label:SetText(mana)
end)

safe.on("PLAYER_REGEN_ENABLED", function()
	safe.after(0.3, function()
		card:Hide()
	end)
end)

safe.on("PLAYER_SWING", function(_, duration)
	-- A plain value: math on it is fine.
	ns.swingEndsAt = safe.now() + duration
end)

SampleDB = SampleDB or { logins = 0 }
SampleDB.logins = SampleDB.logins + 1
