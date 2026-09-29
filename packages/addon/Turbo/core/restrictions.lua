-- Restriction-state tracking: which game states that turn values secret are
-- on right now (combat, a restricted map, a boss encounter...). A change
-- sends the "Turbo.RestrictionChanged" message with the kind and whether it
-- is now on.
local _, ns = ...

local safe = ns.safe
local events = ns.events

local restrictions = {}
ns.restrictions = restrictions

-- Enum.AddOnRestrictionType, as ADDON_RESTRICTION_STATE_CHANGED reports it.
local KINDS = {
	[0] = "combat",
	[1] = "encounter",
	[2] = "challengeMode",
	[3] = "pvpMatch",
	[4] = "map",
	[5] = "chat",
}
-- Enum.AddOnRestrictionState.Inactive; Activating and Active both count as on.
local INACTIVE = 0

---@type table<string, boolean>
local active = {}

local function set(kind, on)
	if (active[kind] == true) == on then
		return
	end
	active[kind] = on
	events.send("Turbo.RestrictionChanged", kind, on)
end

---Whether a restriction is on: "combat", "encounter", "map"...
---@param kind string
---@return boolean
function restrictions.isActive(kind)
	return active[kind] == true
end

---@return boolean
function restrictions.inCombat()
	return active.combat == true
end

---Starts tracking. Combat follows the regen events, which fire as combat
---starts and ends; the other kinds follow the game's restriction event.
function restrictions.start()
	set("combat", safe.read("inCombat") == true)
	events.on("PLAYER_REGEN_DISABLED", function()
		set("combat", true)
	end)
	events.on("PLAYER_REGEN_ENABLED", function()
		set("combat", false)
	end)
	events.on("ADDON_RESTRICTION_STATE_CHANGED", function(_, restrictionType, state)
		local kind = KINDS[restrictionType]
		if kind and kind ~= "combat" then
			set(kind, state ~= INACTIVE)
		end
	end)
end
