-- The safe layer: the only Turbo code that touches the game API.
--
-- In: game reads and events. Out: widget calls. Everything else in Turbo goes
-- through `ns.safe` and never calls the game directly; a guard script in CI
-- fails any secret-returning game call made outside this file.
--
-- It never reads, compares or does math on a secret value. Secrets are passed
-- straight into Blizzard widgets.
--
-- Under `bun test` the fake game (packages/addon/tests/fake-game) replaces
-- this file and offers the same contract (types/safe-layer.lua). A change to
-- the contract changes both; a test checks they offer the same functions.
local _, ns = ...

---@type TurboSafeLayer
local safe = {}
ns.safe = safe

---Named game readings. Modules ask for a reading by name; each reading is
---the one place its game call lives.
---@type table<string, fun(...: any): ...: any>
local readings = {}

---@type table<string, fun(event: string, ...: any)[]>
local handlers = {}

local eventFrame = CreateFrame("Frame")
eventFrame:SetScript("OnEvent", function(_, event, ...)
	local list = handlers[event]
	if not list then
		return
	end
	-- A copy, so a handler may unsubscribe while the event is dispatched.
	local snapshot = { unpack(list) }
	for i = 1, #snapshot do
		snapshot[i](event, ...)
	end
end)

function safe.now()
	return GetTime()
end

function safe.on(event, handler)
	local list = handlers[event]
	if not list then
		list = {}
		handlers[event] = list
		eventFrame:RegisterEvent(event)
	end
	table.insert(list, handler)
end

function safe.off(event, handler)
	local list = handlers[event]
	if not list then
		return
	end
	for i = #list, 1, -1 do
		if list[i] == handler then
			table.remove(list, i)
		end
	end
	if #list == 0 then
		handlers[event] = nil
		eventFrame:UnregisterEvent(event)
	end
end

function safe.after(delay, callback)
	C_Timer.After(delay, callback)
end

function safe.every(interval, callback)
	return C_Timer.NewTicker(interval, callback)
end

function safe.read(name, ...)
	local reading = readings[name]
	if not reading then
		error("Turbo: no reading named '" .. name .. "'", 2)
	end
	return reading(...)
end

function safe.createFrame(frameType, name, parent, template)
	return CreateFrame(frameType, name, parent, template)
end

function safe.print(message)
	print(message)
end

function safe.isSecret(value)
	return issecretvalue(value)
end
