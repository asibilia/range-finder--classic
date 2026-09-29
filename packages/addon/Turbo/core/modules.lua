-- The module registry. Each feature is a module that registers here and is
-- switched on or off on its own. A class kit (kits/) lists the modules one
-- class gets; they start on unless the player turned them off.
local _, ns = ...

local settings = ns.settings

local modules = {}
ns.modules = modules

---Class kits, by class token ("SHAMAN"). A class without one isn't supported.
---@type table<string, { modules: string[] }>
ns.classKits = {}

---@class TurboModule
---@field onEnable fun()?
---@field onDisable fun()?

---@type table<string, { definition: TurboModule, enabled: boolean }>
local registry = {}
---@type string[]
local order = {}
---@type table<string, boolean>?
local inKit

-- On by default: its class kit lists it.
local function defaultOn(id)
	return inKit ~= nil and inKit[id] == true
end

local function wanted(id)
	return inKit ~= nil and settings.moduleOn(id, defaultOn(id))
end

local function switch(id, on)
	local entry = registry[id]
	if not entry or entry.enabled == on then
		return
	end
	entry.enabled = on
	local handler = on and entry.definition.onEnable or entry.definition.onDisable
	if handler then
		handler()
	end
end

---Registers a module. Once Turbo has started, a module its class kit lists
---starts on right away.
---@param id string
---@param definition TurboModule
function modules.register(id, definition)
	assert(not registry[id], "Turbo: module '" .. tostring(id) .. "' is already registered")
	registry[id] = { definition = definition, enabled = false }
	table.insert(order, id)
	if wanted(id) then
		switch(id, true)
	end
end

---@param id string
---@return boolean
function modules.isEnabled(id)
	local entry = registry[id]
	return entry ~= nil and entry.enabled
end

---Turns a module on and remembers it for the player's class.
---@param id string
function modules.enable(id)
	if not inKit then
		return
	end
	settings.setModule(id, true, defaultOn(id))
	switch(id, true)
end

---Turns a module off and remembers it for the player's class.
---@param id string
function modules.disable(id)
	if not inKit then
		return
	end
	settings.setModule(id, false, defaultOn(id))
	switch(id, false)
end

---Starts the modules for one class kit.
---@param kit { modules: string[] }
function modules.start(kit)
	inKit = {}
	for _, id in ipairs(kit.modules) do
		inKit[id] = true
	end
	for _, id in ipairs(order) do
		if wanted(id) then
			switch(id, true)
		end
	end
end
