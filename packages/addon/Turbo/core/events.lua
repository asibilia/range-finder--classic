-- The event hub: one way for Turbo's code to hear game events and Turbo's own
-- messages. Game events (and Blizzard callback events) go through the safe
-- layer; messages are Turbo's own, named "Turbo.<Something>", and sent with
-- `events.send`.
local _, ns = ...

local safe = ns.safe

local events = {}
ns.events = events

---@type table<string, fun(name: string, ...: any)[]>
local listeners = {}

local function isMessage(name)
	return name:sub(1, 6) == "Turbo."
end

---Subscribes to a game event or a Turbo message. The handler gets the name,
---then the payload.
---@param name string
---@param handler fun(name: string, ...: any)
function events.on(name, handler)
	if not isMessage(name) then
		safe.on(name, handler)
		return
	end
	listeners[name] = listeners[name] or {}
	table.insert(listeners[name], handler)
end

---Unsubscribes a handler added with `on`.
---@param name string
---@param handler fun(name: string, ...: any)
function events.off(name, handler)
	if not isMessage(name) then
		safe.off(name, handler)
		return
	end
	local list = listeners[name] or {}
	for i = #list, 1, -1 do
		if list[i] == handler then
			table.remove(list, i)
		end
	end
end

---Sends a Turbo message to its listeners.
---@param name string "Turbo.<Something>"
---@param ... any
function events.send(name, ...)
	assert(isMessage(name), "Turbo: messages are named 'Turbo.<Something>'")
	-- A copy, so a listener may unsubscribe while the message is sent.
	local snapshot = { unpack(listeners[name] or {}) }
	for i = 1, #snapshot do
		snapshot[i](name, ...)
	end
end
