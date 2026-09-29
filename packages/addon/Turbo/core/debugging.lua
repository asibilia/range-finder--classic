-- Debug mode (/turbo debug): a log of which values each module sees as
-- readable or secret, and which restrictions were on at the time, so a rule
-- change Blizzard makes during the beta shows up quickly.
--
-- The log keeps only names and a status, never a value: a secret is told
-- apart with the safe layer's check and never read. It holds the newest
-- entries up to a fixed size, and logs a value again only when its status or
-- the restrictions around it change. Each new entry is also printed to chat.
local _, ns = ...

local safe = ns.safe
local settings = ns.settings
local restrictions = ns.restrictions

local debugLog = {}
ns.debug = debugLog

local MAX_ENTRIES = 200

local on = false

---@class TurboDebugEntry
---@field module string
---@field value string
---@field status "readable"|"secret"
---@field restrictions string[]

-- A ring of the newest entries: `first` is the oldest, `count` how many.
---@type TurboDebugEntry[]
local ring = {}
local first, count = 1, 0

-- The newest entry for each module's value, while it's still in the ring.
---@type table<string, { entry: TurboDebugEntry, restrictions: string }>
local latest = {}

local function keyOf(entry)
	return entry.module .. "\0" .. entry.value
end

local function add(entry, restrictionKey)
	if count == MAX_ENTRIES then
		local oldest = ring[first]
		local oldestKey = keyOf(oldest)
		if latest[oldestKey] and latest[oldestKey].entry == oldest then
			latest[oldestKey] = nil
		end
		ring[first] = entry
		first = first % MAX_ENTRIES + 1
	else
		ring[(first + count - 1) % MAX_ENTRIES + 1] = entry
		count = count + 1
	end
	latest[keyOf(entry)] = { entry = entry, restrictions = restrictionKey }
end

---Whether debug mode is on.
---@return boolean
function debugLog.isOn()
	return on
end

---Switches debug mode on or off, and remembers it.
---@param wanted boolean
function debugLog.set(wanted)
	on = wanted
	settings.set("debug", wanted)
end

---Logs that a module got a value, and whether it was readable or secret.
---Does nothing while debug mode is off.
---@param moduleId string "manaBar"
---@param valueName string "mana"
---@param value any what the game returned; only checked for secrecy
function debugLog.record(moduleId, valueName, value)
	if not on then
		return
	end
	local status = safe.isSecret(value) and "secret" or "readable"
	local kinds = restrictions.activeKinds()
	local restrictionKey = table.concat(kinds, ",")
	local entry = { module = moduleId, value = valueName, status = status, restrictions = kinds }
	local previous = latest[keyOf(entry)]
	if previous and previous.entry.status == status and previous.restrictions == restrictionKey then
		return
	end
	add(entry, restrictionKey)
	safe.print(
		string.format(
			"Turbo debug: %s %s is %s (%s)",
			moduleId,
			valueName,
			status,
			restrictionKey ~= "" and restrictionKey or "no restrictions"
		)
	)
end

---The log, oldest first.
---@return TurboDebugEntry[]
function debugLog.entries()
	local list = {}
	for i = 0, count - 1 do
		local entry = ring[(first + i - 1) % MAX_ENTRIES + 1]
		local kinds = {}
		for j, kind in ipairs(entry.restrictions) do
			kinds[j] = kind
		end
		list[i + 1] = {
			module = entry.module,
			value = entry.value,
			status = entry.status,
			restrictions = kinds,
		}
	end
	return list
end

---Picks up the saved state (on PLAYER_LOGIN, once the class is known).
function debugLog.start()
	on = settings.get("debug") == true
end
