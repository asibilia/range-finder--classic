-- Saved data: one account-wide table, TurboDB, split by class.
--
--   TurboDB = {
--     schemaVersion = 1,
--     classes = { [CLASS_TOKEN] = { <only the player's changes> } },
--     position = { point, x, y },   -- the HUD card, once moved
--   }
--
-- Defaults live here and nowhere else (a module's on/off default is whether
-- its class kit lists it, and a module's own options default to what it
-- declares). The saved table stores only what differs from them.
--
-- A change sends the "Turbo.SettingChanged" message with the key and value.
local _, ns = ...

local events = ns.events

local settings = {}
ns.settings = settings

local SCHEMA_VERSION = 1

---Every setting's default, per class. Modules' declared options join these
---when the modules register.
settings.defaults = {
	alwaysShow = false,
	-- /turbo debug: log which values modules see as readable or secret.
	debug = false,
	-- The weapon imbue's reminder: out of combat, under this many minutes
	-- left; in combat, under this many (0: only once it's gone).
	imbueWarnMinutes = 5,
	imbueCombatWarnMinutes = 0,
}

---Upgrades, by the schema version they upgrade to. Each gets the saved table
---at the version before it.
---@type table<number, fun(db: table)>
local migrations = {}

---@type string?
local classToken

---Loads TurboDB (on ADDON_LOADED), upgrading it to the current schema.
function settings.load()
	if type(TurboDB) ~= "table" then
		TurboDB = {}
	end
	local version = TurboDB.schemaVersion or 0
	if version < SCHEMA_VERSION then
		for target = version + 1, SCHEMA_VERSION do
			if migrations[target] then
				migrations[target](TurboDB)
			end
		end
		TurboDB.schemaVersion = SCHEMA_VERSION
	end
end

---Picks the class whose settings `get` and `set` use.
---@param token string "SHAMAN"
function settings.useClass(token)
	classToken = token
end

-- Walks (and with `create`, builds) the tables along a path in TurboDB.
local function tableAt(path, create)
	local t = TurboDB
	for _, key in ipairs(path) do
		if type(t[key]) ~= "table" then
			if not create then
				return nil
			end
			t[key] = {}
		end
		t = t[key]
	end
	return t
end

-- The path to the current class's changes, or to one group of them.
local function classPath(group)
	if group then
		return { "classes", classToken, group }
	end
	return { "classes", classToken }
end

-- Drops the tables along a path that a removed change left empty.
local function prune(path)
	for depth = #path, 1, -1 do
		local parent = tableAt({ unpack(path, 1, depth - 1) }, false)
		local key = path[depth]
		if not parent or type(parent[key]) ~= "table" or next(parent[key]) ~= nil then
			return
		end
		parent[key] = nil
	end
end

-- A stored change under the current class, or nil.
local function changed(group, key)
	local t = tableAt(classPath(group), false)
	return t and t[key]
end

-- Stores a value under the current class, or removes it when it's the default.
local function store(group, key, value, default)
	local path = classPath(group)
	if value ~= default then
		tableAt(path, true)[key] = value
		return
	end
	local t = tableAt(path, false)
	if t then
		t[key] = nil
		prune(path)
	end
end

---A setting for the current class: the player's change, or the default.
---@param key string
---@return any
function settings.get(key)
	local value = changed(nil, key)
	if value == nil then
		return settings.defaults[key]
	end
	return value
end

---Changes a setting for the current class. Setting it back to its default
---removes it from the saved data.
---@param key string
---@param value any
function settings.set(key, value)
	store(nil, key, value, settings.defaults[key])
	events.send("Turbo.SettingChanged", key, value)
end

---Adds a module's declared option to the defaults.
---@param key string
---@param default any
function settings.declare(key, default)
	settings.defaults[key] = default
end

---Whether a module is on for the current class.
---@param id string
---@param default boolean on unless the player turned it off
---@return boolean
function settings.moduleOn(id, default)
	local value = changed("modules", id)
	if value == nil then
		return default
	end
	return value
end

---Turns a module on or off for the current class.
---@param id string
---@param on boolean
---@param default boolean
function settings.setModule(id, on, default)
	store("modules", id, on, default)
end

---The HUD card's saved position, shared by every class and Edit Mode layout.
---@return string? point
---@return number? x
---@return number? y
function settings.position()
	local position = TurboDB.position
	if type(position) == "table" and position.point then
		return position.point, position.x or 0, position.y or 0
	end
end

---@param point string
---@param x number
---@param y number
function settings.setPosition(point, x, y)
	TurboDB.position = { point = point, x = x, y = y }
end
