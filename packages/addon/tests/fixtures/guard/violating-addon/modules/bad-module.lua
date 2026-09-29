-- A module that breaks the rule: it calls secret-returning game functions
-- itself instead of going through the safe layer.
-- Mentions in comments are fine: UnitHealth("player")
local _, ns = ...

local label = "UnitHealth is only named in this string"
local now = GetTime() -- never secret: fine

local function update(bar)
	local health = UnitHealth("player")
	local start = C_Spell.GetSpellCooldown(8042)
	local shown = bar:GetValue()
	local sneaky = _G["UnitHealth"]
	return health, start, shown, sneaky, label, now
end

ns.update = update
