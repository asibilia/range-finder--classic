-- A tiny addon for the fake game's own tests: it keeps each swing's duration,
-- holds the player's mana (a secret value) without reading it, and answers
-- /sample in chat.
local _, ns = ...
local safe = ns.safe

safe.on("PLAYER_SWING", function(_, duration)
	-- A plain value: math on it is fine.
	ns.swings = (ns.swings or 0) + 1
	ns.lastSwing = duration * 2
end)

safe.on("UNIT_POWER_UPDATE", function()
	-- Mana is a secret value: it is held, never read.
	ns.mana = safe.read("mana")
end)

safe.slash("SAMPLE", { "/sample", "/sa" }, function(message)
	safe.print("Sample heard '" .. message .. "'")
end)
