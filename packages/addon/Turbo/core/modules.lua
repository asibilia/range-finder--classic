-- The module registry. Each feature is a module that registers here and is
-- switched on or off on its own. A class kit (kits/) lists the modules one
-- class gets; they start on unless the player turned them off.
local _, ns = ...

local settings = ns.settings

local modules = {}
ns.modules = modules

---What Turbo gives one class.
---@class TurboClassKit
---@field modules string[] the modules it turns on
---@field attackSpells number[]? the spells /turbo macros makes attack macros for, by rank-1 spell ID

---Class kits, by class token ("SHAMAN"). A class without one isn't supported.
---@type table<string, TurboClassKit>
ns.classKits = {}

---An option a module declares: the settings page shows it under the module's
---checkbox, and the module reads it with `ns.settings.get(key)`.
---@class TurboModuleOption
---@field key string
---@field label string
---@field kind "slider"|"checkbox"
---@field default any
---@field min number? sliders only
---@field max number? sliders only
---@field step number? sliders only

---@class TurboModule
---@field name string what the player sees, on the settings page and in /turbo
---@field options TurboModuleOption[]?
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
---starts on right away. Registering an id again replaces the module that had
---it (switched off first), keeping its place in the list: that's how a
---stand-in takes a real module's place.
---@param id string
---@param definition TurboModule
function modules.register(id, definition)
	if registry[id] then
		switch(id, false)
		registry[id].definition = definition
	else
		registry[id] = { definition = definition, enabled = false }
		table.insert(order, id)
	end
	for _, option in ipairs(definition.options or {}) do
		settings.declare(option.key, option.default)
	end
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

---The modules the player can turn on and off: the registered ones in their
---class kit, in the order they registered.
---@return { id: string, name: string, options: TurboModuleOption[] }[]
function modules.list()
	local list = {}
	for _, id in ipairs(order) do
		if inKit and inKit[id] then
			local definition = registry[id].definition
			table.insert(list, { id = id, name = definition.name or id, options = definition.options or {} })
		end
	end
	return list
end

---Starts the modules for one class kit.
---@param kit TurboClassKit
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
