-- The safe layer may call secret-returning functions: this is allowed.
local _, ns = ...
ns.safe = {
	health = function()
		return UnitHealth("player")
	end,
}
