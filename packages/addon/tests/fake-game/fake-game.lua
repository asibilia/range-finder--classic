-- The fake game: stands in for Turbo's safe layer under `bun test`.
--
-- Turbo's real safe layer (Turbo/core/safe-layer.lua) is the only code that
-- touches the game API. In tests this file replaces it. It gives the addon the
-- same contract (see types/safe-layer.lua) and lets a test drive it:
--
-- * scripted events and readings, and a clock that only moves when told to;
-- * opaque secret stand-ins that fail loudly when addon code reads, compares,
--   does math on, concatenates, stringifies or keys a table with them;
-- * a recorder of every widget call and frame state change;
-- * the settings pages registered in Options → AddOns, which a test reads and
--   changes as the player would;
-- * the player's macros, action slots and cursor, which a test sets up and
--   reads back after the addon changes them.
--
-- Addon files run in a sandbox that holds Lua's and WoW's plain helpers and
-- nothing of the game: any other global read fails loudly, because only the
-- safe layer may touch the game.
--
-- The TypeScript side (fake-game.ts) drives this through `FakeGame.new` and
-- the methods on the game object, and reads results back as JSON.

local FakeGame = {}

local rawType = type
local rawToString = tostring
local rawToNumber = tonumber
local rawRawEqual = rawequal
local rawRawSet = rawset

-- JSON ---------------------------------------------------------------------

local function jsonString(s)
	return '"'
		.. s:gsub('[%c"\\]', function(c)
			local named = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
			return named[c] or string.format("\\u%04x", c:byte())
		end)
		.. '"'
end

-- Secret stand-ins --------------------------------------------------------

local function describeKey(game, k)
	if game.secrets[k] then
		return "<secret " .. game.secrets[k].label .. ">"
	end
	if rawType(k) == "string" then
		return k
	end
	return "[" .. rawToString(k) .. "]"
end

local function violation(game, label, what, level)
	local message = string.format(
		"secret value '%s' was %s. Turbo must never read, compare or compute a secret value; hand it straight to a widget.",
		label,
		what
	)
	table.insert(game.violations, message)
	error(message, level or 3)
end

-- Finds the secret stand-in among a metamethod's operands.
local function secretOperand(game, ...)
	for i = 1, select("#", ...) do
		local info = game.secrets[(select(i, ...))]
		if info then
			return info
		end
	end
end

-- All stand-ins share one metatable: Lua 5.1 only calls __eq and the order
-- metamethods when both operands share them.
local function secretMetatable(game)
	local mt = {}
	local function fail(what)
		return function(...)
			local info = secretOperand(game, ...)
			violation(game, info and info.label or "?", what)
		end
	end
	mt.__index = fail("read")
	mt.__newindex = fail("written to")
	mt.__call = fail("called")
	mt.__eq = fail("compared")
	mt.__lt = fail("compared")
	mt.__le = fail("compared")
	for _, event in ipairs({ "__add", "__sub", "__mul", "__div", "__mod", "__pow", "__unm" }) do
		mt[event] = fail("used in math")
	end
	mt.__concat = fail("concatenated")
	mt.__tostring = fail("converted to a string")
	mt.__len = fail("measured")
	mt.__metatable = "secret"
	return mt
end

local function makeSecret(game, label, kind)
	if not game.secretTemplate then
		game.secretTemplate = newproxy(true)
		local mt = getmetatable(game.secretTemplate)
		for k, v in pairs(secretMetatable(game)) do
			mt[k] = v
		end
	end
	local secret = newproxy(game.secretTemplate)
	game.secrets[secret] = { label = label, kind = kind or "number" }
	return secret
end

-- Library functions are C functions: a secret passed to one would fail with
-- Lua's own message ("number expected, got userdata") or, worse, not at all.
-- Wrap them so the misuse is named.
local function guardLibrary(game, lib, what, only, skip)
	for name, fn in pairs(lib) do
		if rawType(fn) == "function" and (not only or only[name]) and not (skip and skip[name]) then
			lib[name] = function(...)
				local info = secretOperand(game, ...)
				if info then
					violation(game, info.label, what)
				end
				return fn(...)
			end
		end
	end
end

-- JSON encoding of any value the test reads back.
local function encode(game, value, seen)
	seen = seen or {}
	local t = rawType(value)
	if value == nil or rawRawEqual(value, game.null) then
		return "null"
	elseif game.secrets[value] then
		return '{"$secret":' .. jsonString(game.secrets[value].label) .. "}"
	elseif game.frameInfo[value] then
		return '{"$frame":' .. jsonString(game.frameInfo[value].id) .. "}"
	elseif t == "boolean" then
		return rawToString(value)
	elseif t == "number" then
		if value ~= value or value == math.huge or value == -math.huge then
			return jsonString(rawToString(value))
		end
		if value == math.floor(value) and math.abs(value) < 2 ^ 53 then
			return string.format("%d", value)
		end
		return string.format("%.17g", value)
	elseif t == "string" then
		return jsonString(value)
	elseif t == "function" then
		return '{"$function":true}'
	elseif t == "table" then
		if seen[value] then
			return '"$cycle"'
		end
		seen[value] = true
		local n = 0
		for _ in next, value do
			n = n + 1
		end
		local parts = {}
		if n > 0 and n == #value then
			for i = 1, n do
				parts[i] = encode(game, value[i], seen)
			end
			seen[value] = nil
			return "[" .. table.concat(parts, ",") .. "]"
		end
		if n == 0 then
			seen[value] = nil
			return "[]"
		end
		for k, v in next, value do
			table.insert(parts, jsonString(describeKey(game, k)) .. ":" .. encode(game, v, seen))
		end
		table.sort(parts)
		seen[value] = nil
		return "{" .. table.concat(parts, ",") .. "}"
	end
	return jsonString("<" .. t .. ">")
end

-- Widgets ------------------------------------------------------------------

local CHILD_TYPES = {
	CreateTexture = "Texture",
	CreateFontString = "FontString",
	CreateMaskTexture = "MaskTexture",
	CreateLine = "Line",
	CreateAnimationGroup = "AnimationGroup",
	CreateAnimation = "Animation",
}

local createFrame

local function record(game, frame, method, args)
	local info = game.frameInfo[frame]
	table.insert(game.calls, { frame = info.id, method = method, args = args })
end

local function setState(game, frame, key, value)
	local info = game.frameInfo[frame]
	if info.state[key] == nil and value == nil then
		return
	end
	if rawRawEqual(info.state[key], value) and rawType(value) ~= "table" then
		return
	end
	info.state[key] = value
	table.insert(game.changes, { frame = info.id, key = key, value = value })
end

local function pack(...)
	return { n = select("#", ...), ... }
end

-- One method on a fake widget: record it, apply its state change, and
-- return what the real method would.
local function callMethod(game, frame, method, ...)
	local args = pack(...)
	local recorded = {}
	for i = 1, args.n do
		recorded[i] = args[i] == nil and game.null or args[i]
	end
	record(game, frame, method, recorded)
	local info = game.frameInfo[frame]
	local state = info.state

	if CHILD_TYPES[method] then
		return createFrame(game, CHILD_TYPES[method], args[1], frame)
	elseif method == "Show" then
		setState(game, frame, "shown", true)
	elseif method == "Hide" then
		setState(game, frame, "shown", false)
	elseif method == "SetShown" then
		setState(game, frame, "shown", args[1])
	elseif method == "SetAlpha" then
		setState(game, frame, "alpha", args[1])
	elseif method == "SetSize" then
		setState(game, frame, "width", args[1])
		setState(game, frame, "height", args[2])
	elseif method == "SetWidth" then
		setState(game, frame, "width", args[1])
	elseif method == "SetHeight" then
		setState(game, frame, "height", args[1])
	elseif method == "SetPoint" then
		local point = {}
		for i = 1, args.n do
			point[i] = args[i] == nil and game.null or args[i]
		end
		local points = {}
		for i, p in ipairs(state.points or {}) do
			points[i] = p
		end
		table.insert(points, point)
		setState(game, frame, "points", points)
	elseif method == "ClearAllPoints" then
		setState(game, frame, "points", {})
	elseif method == "SetScript" then
		info.scripts[args[1]] = args[2]
	elseif method == "HookScript" then
		info.hooks[args[1]] = info.hooks[args[1]] or {}
		table.insert(info.hooks[args[1]], args[2])
	elseif method == "GetScript" then
		return info.scripts[args[1]]
	elseif method == "IsShown" or method == "IsVisible" then
		return state.shown
	elseif method == "GetAlpha" then
		return state.alpha
	elseif method == "GetWidth" then
		return state.width
	elseif method == "GetHeight" then
		return state.height
	elseif method == "GetName" then
		return info.name
	elseif method == "GetParent" then
		return info.parent
	elseif method == "GetObjectType" then
		return info.type
	elseif method:match("^Set%u") then
		local key = method:sub(4)
		setState(game, frame, key, args.n > 1 and recorded or args[1])
	elseif method:match("^Get%u") then
		return state[method:sub(4)]
	elseif method:match("^Is%u") then
		return state[method:sub(3)]
	end
end

createFrame = function(game, frameType, name, parent, template)
	local frame = setmetatable({}, game.frameMeta)
	local parentInfo = parent and game.frameInfo[parent]
	game.childCount[frameType] = (game.childCount[frameType] or 0) + 1
	local id = name or ((parentInfo and parentInfo.id .. "." or "") .. frameType .. "#" .. game.childCount[frameType])
	game.frameInfo[frame] = {
		id = id,
		name = name,
		type = frameType,
		parent = parent,
		template = template,
		state = {
			type = frameType,
			parent = parentInfo and parentInfo.id or game.null,
			shown = true,
			alpha = 1,
			points = {},
		},
		scripts = {},
		hooks = {},
	}
	game.frames[id] = frame
	table.insert(game.frameOrder, id)
	local args = { frameType, name == nil and game.null or name, parent or game.null, template or game.null }
	if CHILD_TYPES["Create" .. frameType] and parent then
		-- Children made through a widget method were recorded on the parent.
		return frame
	end
	record(game, frame, "CreateFrame", args)
	return frame
end

-- Macros, action slots and the cursor ------------------------------------
--
-- Forever's limits: 120 account macros and 30 per character
-- (MacroConstantsDocumentation), and 180 action slots (15 pages of 12; the
-- last bar, MultiBar7, is page 15). The game keeps each macro list in name
-- order, so a new macro can move others to a new index; a macro's index is its
-- place in the account list, or 120 plus its place in the character list.
-- An action slot or the cursor holds `{ type = "spell"|"item", id }` or
-- `{ type = "macro", macro }`; a macro on a bar follows it when the list
-- reorders, as in the game.

local MAX_ACCOUNT_MACROS = 120
local MAX_CHARACTER_MACROS = 30
local ACTION_SLOTS = 180

local function macroList(game, perCharacter)
	return perCharacter and game.characterMacros or game.accountMacros
end

local function macroIndex(game, macro)
	for i, m in ipairs(macroList(game, macro.perCharacter)) do
		if m == macro then
			return (macro.perCharacter and MAX_ACCOUNT_MACROS or 0) + i
		end
	end
end

local function macroAt(game, index)
	if rawType(index) ~= "number" then
		return nil
	end
	if index > MAX_ACCOUNT_MACROS then
		return game.characterMacros[index - MAX_ACCOUNT_MACROS]
	end
	return game.accountMacros[index]
end

-- Adds a macro in name order and returns its index; fails when its list is full.
local function addMacro(game, name, icon, body, perCharacter)
	local list = macroList(game, perCharacter)
	local limit = perCharacter and MAX_CHARACTER_MACROS or MAX_ACCOUNT_MACROS
	if #list >= limit then
		error(
			string.format(
				"fake game: no room for another %s macro (%d of %d used).",
				perCharacter and "character" or "account",
				#list,
				limit
			),
			0
		)
	end
	local macro = { name = name, icon = icon, body = body or "", perCharacter = perCharacter }
	local at = #list + 1
	for i, m in ipairs(list) do
		if name:lower() < m.name:lower() then
			at = i
			break
		end
	end
	table.insert(list, at, macro)
	return macroIndex(game, macro)
end

local function checkSlot(slot)
	if rawType(slot) ~= "number" or slot < 1 or slot > ACTION_SLOTS or slot ~= math.floor(slot) then
		error(
			string.format("fake game: no action slot %s; the client has 1 to %d.", rawToString(slot), ACTION_SLOTS),
			0
		)
	end
end

-- What the game says an action is: its type and ID (a macro's is its index).
local function describeForGame(game, action)
	if action.type == "macro" then
		return "macro", macroIndex(game, action.macro)
	end
	return action.type, action.id
end

-- An action as a test reads it back.
local function describeForTest(action)
	if action.type == "macro" then
		return { type = "macro", name = action.macro.name, perCharacter = action.macro.perCharacter }
	end
	return { type = action.type, id = action.id }
end

-- An action from a test: `{ type, id }`, or `{ type = "macro", name,
-- perCharacter? }` for the first macro with that name, in index order.
local function actionFromTest(game, spec)
	if spec == nil then
		return nil
	end
	if spec.type ~= "macro" then
		return { type = spec.type, id = spec.id }
	end
	for _, perCharacter in ipairs({ false, true }) do
		if spec.perCharacter == nil or spec.perCharacter == perCharacter then
			for _, macro in ipairs(macroList(game, perCharacter)) do
				if macro.name == spec.name then
					return { type = "macro", macro = macro }
				end
			end
		end
	end
	error("fake game: no macro named '" .. rawToString(spec.name) .. "' to put there", 0)
end

-- The sandbox the addon runs in -----------------------------------------

local function buildEnv(game)
	local function secretInfo(v)
		return game.secrets[v]
	end
	local function checked(name, what)
		return function(...)
			local args = pack(...)
			for i = 1, args.n do
				local info = secretInfo(args[i])
				if info then
					violation(game, info.label, what)
				end
			end
			return _G[name](...)
		end
	end

	local lib = {
		-- Lua 5.1 as WoW has it (no io, os, debug, package, loadfile...).
		assert = assert,
		error = error,
		getmetatable = getmetatable,
		ipairs = ipairs,
		next = next,
		pairs = pairs,
		pcall = pcall,
		rawget = rawget,
		select = select,
		setmetatable = setmetatable,
		unpack = unpack,
		xpcall = xpcall,
		tostring = tostring,
		tonumber = checked("tonumber", "converted to a number"),
		rawequal = checked("rawequal", "compared"),
		rawset = function(t, k, v)
			local info = secretInfo(k)
			if info then
				violation(game, info.label, "used as a table key")
			end
			return rawRawSet(t, k, v)
		end,
		type = function(v)
			local info = secretInfo(v)
			if info then
				return info.kind
			end
			return rawType(v)
		end,
		string = string,
		table = table,
		math = math,
		bit = {},
		-- WoW's global Lua helpers.
		strsplit = function(delimiter, text, pieces)
			local out = {}
			local start = 1
			while true do
				if pieces and #out == pieces - 1 then
					table.insert(out, text:sub(start))
					break
				end
				local i, j = text:find(delimiter, start, true)
				if not i then
					table.insert(out, text:sub(start))
					break
				end
				table.insert(out, text:sub(start, i - 1))
				start = j + 1
			end
			return unpack(out)
		end,
		strjoin = function(delimiter, ...)
			return table.concat({ ... }, delimiter)
		end,
		strtrim = function(text)
			return (text:gsub("^%s+", ""):gsub("%s+$", ""))
		end,
		wipe = function(t)
			for k in pairs(t) do
				t[k] = nil
			end
			return t
		end,
		tinsert = table.insert,
		tremove = table.remove,
		sort = table.sort,
		format = string.format,
		strlower = string.lower,
		strupper = string.upper,
		strsub = string.sub,
		strlen = string.len,
		strfind = string.find,
		strmatch = string.match,
		gsub = string.gsub,
		abs = math.abs,
		ceil = math.ceil,
		floor = math.floor,
		max = math.max,
		min = math.min,
		mod = math.fmod,
	}

	local env = {}
	for k, v in pairs(lib) do
		env[k] = v
	end
	for name in pairs(game.savedVariables) do
		game.allowedGlobals[name] = true
	end
	setmetatable(env, {
		__index = function(_, key)
			if game.allowedGlobals[key] then
				return nil
			end
			error(
				string.format(
					"Turbo code touched the game global '%s' outside the safe layer. Add a reading or an event to the safe layer instead.",
					rawToString(key)
				),
				2
			)
		end,
		__newindex = function(t, key, value)
			game.allowedGlobals[key] = true
			rawRawSet(t, key, value)
		end,
	})
	return env
end

-- The safe layer the fake hands the addon ---------------------------------

local function buildSafe(game)
	local safe = {}

	function safe.now()
		return game.clock
	end

	function safe.on(event, handler)
		game.handlers[event] = game.handlers[event] or {}
		table.insert(game.handlers[event], handler)
	end

	function safe.off(event, handler)
		local list = game.handlers[event] or {}
		for i = #list, 1, -1 do
			if list[i] == handler then
				table.remove(list, i)
			end
		end
	end

	local function schedule(delay, callback, interval)
		game.timerSeq = game.timerSeq + 1
		local timer = { due = game.clock + delay, seq = game.timerSeq, callback = callback, interval = interval }
		table.insert(game.timers, timer)
		return timer
	end

	function safe.after(delay, callback)
		schedule(delay, callback)
	end

	function safe.every(interval, callback)
		local timer = schedule(interval, callback, interval)
		return {
			Cancel = function()
				timer.cancelled = true
			end,
		}
	end

	function safe.read(name, ...)
		local args = pack(...)
		local logged = {}
		for i = 1, args.n do
			logged[i] = args[i] == nil and game.null or args[i]
		end
		table.insert(game.reads, { name = name, args = logged })
		local reading = game.readings[name]
		if not reading then
			error(string.format("fake game: no scripted reading '%s'. Script it with setReading() first.", name), 2)
		end
		if reading.queue then
			local nextValues = table.remove(reading.queue, 1)
			if not nextValues then
				error(string.format("fake game: scripted reading '%s' ran out of values.", name), 2)
			end
			return unpack(nextValues, 1, nextValues.n or #nextValues)
		end
		local key = encode(game, logged)
		local values = reading.byArgs[key] or reading.default
		if not values then
			error(string.format("fake game: no scripted reading '%s' for arguments %s.", name, key), 2)
		end
		return unpack(values, 1, values.n)
	end

	function safe.createFrame(frameType, name, parent, template)
		return createFrame(game, frameType, name, parent, template)
	end

	function safe.print(message)
		table.insert(game.printed, message)
	end

	-- The first recorded anchor: SetPoint(point, x, y) or
	-- SetPoint(point, relativeTo, relativePoint, x, y).
	function safe.framePoint(frame)
		local point = (game.frameInfo[frame].state.points or {})[1]
		if not point then
			return nil
		end
		local function offset(v)
			return rawType(v) == "number" and v or 0
		end
		if rawType(point[2]) == "number" then
			return point[1], offset(point[2]), offset(point[3])
		end
		return point[1], offset(point[4]), offset(point[5])
	end

	function safe.slash(_, commands, handler)
		for _, command in ipairs(commands) do
			game.slashCommands[string.lower(command)] = handler
		end
	end

	function safe.isSecret(value)
		return game.secrets[value] ~= nil
	end

	function safe.settingsPage(name, controls)
		table.insert(game.settingsPages, { name = name, controls = controls })
	end

	function safe.macros()
		local list = {}
		for _, perCharacter in ipairs({ false, true }) do
			for _, macro in ipairs(macroList(game, perCharacter)) do
				table.insert(list, {
					index = macroIndex(game, macro),
					name = macro.name,
					body = macro.body,
					perCharacter = perCharacter,
				})
			end
		end
		return list
	end

	function safe.macroLimits()
		return MAX_ACCOUNT_MACROS, MAX_CHARACTER_MACROS
	end

	function safe.createMacro(name, icon, body, perCharacter)
		return addMacro(game, name, icon, body, perCharacter == true)
	end

	function safe.actionInfo(slot)
		checkSlot(slot)
		local action = game.actionSlots[slot]
		if not action then
			return
		end
		local kind, id = describeForGame(game, action)
		return kind, id, kind == "spell" and "spell" or ""
	end

	function safe.cursorInfo()
		if game.cursor then
			return describeForGame(game, game.cursor)
		end
	end

	function safe.pickupMacro(index)
		local macro = macroAt(game, index)
		if not macro then
			error("fake game: no macro at index " .. rawToString(index) .. ".", 0)
		end
		game.cursor = { type = "macro", macro = macro }
	end

	function safe.placeAction(slot)
		checkSlot(slot)
		if game.cursor then
			game.actionSlots[slot], game.cursor = game.cursor, game.actionSlots[slot]
		end
	end

	function safe.clearCursor()
		game.cursor = nil
	end

	return safe
end

-- Checks after every step -------------------------------------------------

-- Walks everything the addon can still reach and fails on any secret
-- stand-in used as a table key. A plain `t[secret] = x` triggers no
-- metamethod in Lua 5.1, so this is how the fake catches it.
local function scanForSecretKeys(game, extraRoots)
	local seen = {}
	for internal in pairs(game.internal) do
		seen[internal] = true
	end
	local function visit(value, path)
		local t = rawType(value)
		if t == "table" then
			if seen[value] then
				return
			end
			seen[value] = true
			for k, v in next, value do
				local info = game.secrets[k]
				if info then
					violation(game, info.label, "used as a table key (at " .. path .. ")", 0)
				end
				visit(k, path .. "[key]")
				visit(v, path .. "." .. describeKey(game, k))
			end
			local mt = debug.getmetatable(value)
			if mt and not seen[mt] then
				visit(mt, path .. "<metatable>")
			end
		elseif t == "function" then
			if seen[value] then
				return
			end
			seen[value] = true
			local i = 1
			while true do
				local name, upvalue = debug.getupvalue(value, i)
				if not name then
					break
				end
				visit(upvalue, path .. "<upvalue " .. name .. ">")
				i = i + 1
			end
		end
	end
	visit(game.ns, "ns")
	visit(game.env, "_G")
	for event, handlers in pairs(game.handlers) do
		visit(handlers, "handlers." .. event)
	end
	for _, timer in ipairs(game.timers) do
		visit(timer.callback, "timer")
	end
	for _, id in ipairs(game.frameOrder) do
		local frame = game.frames[id]
		local info = game.frameInfo[frame]
		visit(frame, id)
		visit(info.scripts, id .. ".scripts")
		visit(info.hooks, id .. ".hooks")
	end
	for i, root in ipairs(extraRoots or {}) do
		visit(root, "result" .. i)
	end
end

-- Runs one step of the test (loading a file, firing an event, advancing the
-- clock...) and fails it if any secret was misused along the way, even when
-- the addon swallowed the error with pcall.
local function step(game, fn, ...)
	local results = pack(fn(...))
	local roots = {}
	for i = 1, results.n do
		roots[i] = results[i]
	end
	scanForSecretKeys(game, roots)
	if #game.violations > 0 then
		local first = game.violations[1]
		game.violations = {}
		error(first, 0)
	end
	return results
end

-- The game object ---------------------------------------------------------

local Game = {}
Game.__index = Game

--- Creates a fake game for one addon.
---@param options { addonName: string, startTime: number?, savedVariables: table? }
function FakeGame.new(options)
	local game = setmetatable({
		addonName = options.addonName,
		clock = options.startTime or 0,
		handlers = {},
		timers = {},
		timerSeq = 0,
		readings = {},
		reads = {},
		calls = {},
		changes = {},
		frames = {},
		frameInfo = setmetatable({}, { __mode = "k" }),
		frameOrder = {},
		childCount = {},
		printed = {},
		slashCommands = {},
		settingsPages = {},
		accountMacros = {},
		characterMacros = {},
		actionSlots = {},
		cursor = nil,
		secrets = setmetatable({}, { __mode = "k" }),
		violations = {},
		loadedFiles = {},
		allowedGlobals = {},
		savedVariables = options.savedVariables or {},
		ns = {},
		-- JSON null, for recorded nil arguments.
		null = setmetatable({}, {
			__tostring = function()
				return "null"
			end,
		}),
	}, Game)
	game.frameMeta = {
		__index = function(frame, method)
			return function(self, ...)
				if self ~= frame then
					error("fake game: call widget methods with ':' (" .. rawToString(method) .. ")", 2)
				end
				return callMethod(game, frame, method, ...)
			end
		end,
	}
	-- One fake game per VM: guard the VM's own library tables once.
	if not string.__turboGuarded then
		guardLibrary(game, string, "converted to a string", { format = true, rep = true })
		guardLibrary(game, string, "used in a string function", nil, { format = true, rep = true })
		guardLibrary(game, table, "concatenated", { concat = true })
		guardLibrary(game, math, "used in math")
		rawRawSet(string, "__turboGuarded", true)
	end
	game.env = buildEnv(game)
	game.safe = buildSafe(game)
	game.ns.safe = game.safe
	for name, value in pairs(game.savedVariables) do
		rawRawSet(game.env, name, value)
	end
	game.internal = { [game] = true, [game.safe] = true, [game.null] = true, [game.frameMeta] = true }
	for _, fn in pairs(game.safe) do
		game.internal[fn] = true
	end
	for _, v in pairs(game.env) do
		if rawType(v) == "table" or rawType(v) == "function" then
			game.internal[v] = true
		end
	end
	game.internal[getmetatable(game.env)] = true
	return game
end

--- Loads one addon file (its source already read by the harness).
function Game:loadFile(path, source)
	local chunk, err = loadstring(source, "@" .. path)
	if not chunk then
		error(err, 0)
	end
	setfenv(chunk, self.env)
	step(self, chunk, self.addonName, self.ns)
	table.insert(self.loadedFiles, path)
end

--- Runs test code inside the addon's sandbox. `ns` is readable as a global.
function Game:run(source, ...)
	local chunk, err = loadstring(source, "@test")
	if not chunk then
		error(err, 0)
	end
	local ns = self.ns
	local env = self.env
	setfenv(
		chunk,
		setmetatable({}, {
			__index = function(_, key)
				if key == "ns" then
					return ns
				end
				return env[key]
			end,
			__newindex = env,
		})
	)
	return step(self, chunk, ...)
end

function Game:secret(label, kind)
	return makeSecret(self, label, kind)
end

function Game:fire(event, ...)
	local args = pack(...)
	step(self, function()
		local list = {}
		for i, handler in ipairs(self.handlers[event] or {}) do
			list[i] = handler
		end
		for _, handler in ipairs(list) do
			handler(event, unpack(args, 1, args.n))
		end
	end)
end

function Game:advance(seconds)
	local target = self.clock + seconds
	step(self, function()
		while true do
			local nextTimer, index
			for i, timer in ipairs(self.timers) do
				if
					not timer.cancelled
					and timer.due <= target + 1e-9
					and (
						not nextTimer
						or timer.due < nextTimer.due
						or (timer.due == nextTimer.due and timer.seq < nextTimer.seq)
					)
				then
					nextTimer, index = timer, i
				end
			end
			if not nextTimer then
				break
			end
			self.clock = nextTimer.due
			if nextTimer.interval then
				self.timerSeq = self.timerSeq + 1
				nextTimer.due = nextTimer.due + nextTimer.interval
				nextTimer.seq = self.timerSeq
			else
				table.remove(self.timers, index)
			end
			nextTimer.callback()
		end
		for i = #self.timers, 1, -1 do
			if self.timers[i].cancelled then
				table.remove(self.timers, i)
			end
		end
		self.clock = target
	end)
end

function Game:runScript(frameId, script, ...)
	local frame = self.frames[frameId]
	if not frame then
		error("fake game: no frame '" .. rawToString(frameId) .. "'", 0)
	end
	local info = self.frameInfo[frame]
	local args = pack(...)
	step(self, function()
		local handler = info.scripts[script]
		if handler then
			handler(frame, unpack(args, 1, args.n))
		end
		for _, hook in ipairs(info.hooks[script] or {}) do
			hook(frame, unpack(args, 1, args.n))
		end
	end)
end

--- Types a slash command into chat: the handler gets the text after it.
function Game:slash(line)
	local command, rest = line:match("^%s*(%S+)%s*(.-)%s*$")
	local handler = command and self.slashCommands[string.lower(command)]
	if not handler then
		error("fake game: no slash command '" .. rawToString(command) .. "' is registered", 0)
	end
	step(self, handler, rest)
end

--- The settings pages as the player would see them now: each control with
--- the value it shows.
function Game:settingsSnapshot()
	local pages = {}
	step(self, function()
		for i, page in ipairs(self.settingsPages) do
			local controls = {}
			for j, control in ipairs(page.controls) do
				controls[j] = {
					kind = control.kind,
					label = control.label,
					value = control.get and control.get(),
					min = control.min,
					max = control.max,
					step = control.step,
				}
			end
			pages[i] = { name = page.name, controls = controls }
		end
	end)
	return pages
end

--- The player changes a checkbox or slider on a settings page.
function Game:changeSetting(pageName, label, value)
	for _, page in ipairs(self.settingsPages) do
		if page.name == pageName then
			for _, control in ipairs(page.controls) do
				if control.label == label and control.set then
					step(self, control.set, value)
					return
				end
			end
		end
	end
	error("fake game: no setting '" .. rawToString(label) .. "' on the page '" .. rawToString(pageName) .. "'", 0)
end

--- Adds a macro to the player's account or character list, as if they made it.
function Game:addMacro(spec)
	addMacro(self, spec.name, spec.icon, spec.body, spec.perCharacter == true)
end

--- Both macro lists, account first, each in name order, with their indexes.
function Game:macroSnapshot()
	local list = {}
	for _, perCharacter in ipairs({ false, true }) do
		for _, macro in ipairs(macroList(self, perCharacter)) do
			table.insert(list, {
				index = macroIndex(self, macro),
				name = macro.name,
				icon = macro.icon == nil and self.null or macro.icon,
				body = macro.body,
				perCharacter = perCharacter,
			})
		end
	end
	return list
end

--- Puts an action in a slot, or empties it with nil.
function Game:setAction(slot, spec)
	checkSlot(slot)
	self.actionSlots[slot] = actionFromTest(self, spec)
end

--- Every non-empty action slot, in slot order: `{ slot, action }`.
function Game:actionSnapshot()
	local list = {}
	for slot = 1, ACTION_SLOTS do
		local action = self.actionSlots[slot]
		if action then
			table.insert(list, { slot = slot, action = describeForTest(action) })
		end
	end
	return list
end

--- Puts something on the cursor, or clears it with nil.
function Game:setCursor(spec)
	self.cursor = actionFromTest(self, spec)
end

function Game:cursorSnapshot()
	return self.cursor and describeForTest(self.cursor)
end

function Game:setReading(name, values)
	self.readings[name] = self.readings[name] or { byArgs = {} }
	self.readings[name].queue = nil
	self.readings[name].default = values
end

function Game:setReadingFor(name, args, values)
	self.readings[name] = self.readings[name] or { byArgs = {} }
	self.readings[name].queue = nil
	self.readings[name].byArgs[encode(self, args)] = values
end

function Game:scriptReadings(name, sequence)
	self.readings[name] = { byArgs = {}, queue = sequence }
end

function Game:frameState(id)
	local frame = self.frames[id]
	return frame and self.frameInfo[frame].state
end

function Game:global(name)
	return rawget(self.env, name)
end

function Game:encode(value)
	return encode(self, value)
end

-- Encodes a packed list of results as a JSON array.
function Game:encodeResults(results)
	local parts = {}
	for i = 1, results.n do
		parts[i] = encode(self, results[i])
	end
	return "[" .. table.concat(parts, ",") .. "]"
end

return FakeGame
