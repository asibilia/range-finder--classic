-- rf-probe / util.lua
-- Secret-safe helpers shared by every other file. Nothing in here ever compares,
-- concatenates, tostrings, indexes or branches on a value until issecretvalue()
-- has said it is not secret. Every call into the game goes through pcall.

local ADDON_NAME, ns = ...

local type, pairs, pcall, select = type, pairs, pcall, select
local mathHuge = math.huge

-- Guarded secret helpers. On a client without secrets these always answer false.
local rawIsSecret = issecretvalue
local rawIsSecretTable = issecrettable

local isSecret = rawIsSecret and function(v) return rawIsSecret(v) and true or false end
	or function() return false end
local isSecretTable = rawIsSecretTable and function(v) return rawIsSecretTable(v) and true or false end
	or function() return false end

ns.isSecret = isSecret
ns.isSecretTable = isSecretTable
ns.hasSecretApi = rawIsSecret ~= nil

local MAX_DEPTH = 2        -- tables nested deeper than this become "<table>"
local MAX_ENTRIES = 64     -- per described table
local MAX_STRING = 400     -- long strings are clipped
local MAX_ERR = 200

-- Running count of secrets seen by describe(); snapshot.lua resets and reads it.
ns.secretCount = 0

--- Converts any error object into a short, plain string that is safe to store.
-- @param err any  the second return of a failed pcall
-- @return string
function ns.errString(err)
	if isSecret(err) then return "<secret-error>" end
	local t = type(err)
	if t == "string" then
		if #err > MAX_ERR then return err:sub(1, MAX_ERR) end
		return err
	end
	if t == "nil" then return "<nil-error>" end
	return "<" .. t .. "-error>"
end

--- Describes a value so it can be written to SavedVariables without ever
-- storing a secret. nil -> "<nil>", secret -> "<secret>", secret table ->
-- "<secret-table>", tables -> shallow described copy (depth-limited),
-- functions/userdata/threads -> "<type>".
-- @param v any
-- @param depth number|nil  current nesting level (callers omit it)
-- @return any  a plain value that is safe to store
function ns.describe(v, depth)
	if isSecret(v) then
		ns.secretCount = ns.secretCount + 1
		return "<secret>"
	end
	local t = type(v)
	if t == "nil" then return "<nil>" end
	if t == "boolean" then return v end
	if t == "number" then
		if v ~= v then return "<nan>" end
		if v == mathHuge then return "<inf>" end
		if v == -mathHuge then return "<-inf>" end
		return v
	end
	if t == "string" then
		if #v > MAX_STRING then return v:sub(1, MAX_STRING) .. "<clipped>" end
		return v
	end
	if t == "table" then
		if isSecretTable(v) then
			ns.secretCount = ns.secretCount + 1
			return "<secret-table>"
		end
		depth = depth or 0
		if depth >= MAX_DEPTH then return "<table>" end
		local out = {}
		local ok, err = pcall(function()
			local count = 0
			for k, val in pairs(v) do
				if isSecret(k) then
					out["<secret-key-skipped>"] = true
				else
					local kt = type(k)
					if kt == "string" or kt == "number" or kt == "boolean" then
						count = count + 1
						if count > MAX_ENTRIES then
							out["<truncated>"] = true
							break
						end
						out[k] = ns.describe(val, depth + 1)
					end
				end
			end
		end)
		if not ok then out["<iter-error>"] = ns.errString(err) end
		return out
	end
	return "<" .. t .. ">"
end

--- Resolves a dotted global path such as "C_Spell.GetSpellCooldown".
-- @param path string
-- @return any  the value at that path, or nil if any segment is missing
function ns.resolve(path)
	local ok, value = pcall(function()
		local cur = _G
		for part in path:gmatch("[^%.]+") do
			if isSecret(cur) or type(cur) ~= "table" or isSecretTable(cur) then return nil end
			cur = cur[part]
			if isSecret(cur) then return nil end
			if type(cur) == "nil" then return nil end
		end
		return cur
	end)
	if not ok then return nil end
	return value
end

--- Existence check for a dotted global path.
-- @param path string
-- @return boolean
function ns.has(path)
	return type(ns.resolve(path)) ~= "nil"
end

--- Type of whatever lives at a dotted global path, or false when absent.
-- @param path string
-- @return string|false
function ns.kind(path)
	local v = ns.resolve(path)
	local t = type(v)
	if t == "nil" then return false end
	return t
end

-- Turns pcall's results into the stored shape.
local function capture(ok, ...)
	if not ok then
		return { status = "error", err = ns.errString((...)) }
	end
	local n = select("#", ...)
	local r = {}
	for i = 1, n do
		r[i] = ns.describe((select(i, ...)))
	end
	return { status = "ok", n = n, r = r }
end

--- pcalls a function value and returns {status="ok", n=, r={described...}}
-- or {status="error", err=}.
-- @param fn function
-- @return table
function ns.callFn(fn, ...)
	if type(fn) ~= "function" then return { status = "missing" } end
	return capture(pcall(fn, ...))
end

--- Resolves a dotted path and pcalls it.
-- @param path string  e.g. "C_Spell.GetSpellCooldown"
-- @return table  {status="missing"} | {status="ok", n=, r=} | {status="error", err=}
function ns.safeCall(path, ...)
	local fn = ns.resolve(path)
	if type(fn) ~= "function" then return { status = "missing" } end
	return capture(pcall(fn, ...))
end

--- pcalls obj:method(...) without ever indexing a secret.
-- @param obj table|userdata
-- @param method string
-- @return table  same shape as safeCall
function ns.callMethod(obj, method, ...)
	if isSecret(obj) then return { status = "secret-object" } end
	local t = type(obj)
	if t ~= "table" and t ~= "userdata" then return { status = "not-object" } end
	if t == "table" and isSecretTable(obj) then return { status = "secret-object" } end
	local okIdx, m = pcall(function() return obj[method] end)
	if not okIdx then return { status = "error", err = ns.errString(m) } end
	if type(m) ~= "function" then return { status = "missing" } end
	return capture(pcall(m, obj, ...))
end

--- Compact form of a safeCall result, used in the bulky per-spell section:
-- single return -> the described value itself; no returns -> "<none>";
-- several -> array of described values; error -> {err=...}; missing -> "<missing>".
-- @param res table  a safeCall/callFn/callMethod result
-- @return any
function ns.compact(res)
	local s = res.status
	if s == "ok" then
		if res.n == 1 then return res.r[1] end
		if res.n == 0 then return "<none>" end
		return res.r
	end
	if s == "error" then return { err = res.err } end
	return "<" .. s .. ">"
end

--- Appends to an array, dropping the oldest entries beyond cap.
-- @param list table
-- @param item any
-- @param cap number
function ns.pushCapped(list, item, cap)
	list[#list + 1] = item
	while #list > cap do
		table.remove(list, 1)
	end
end

--- Plain boolean for "are we in combat lockdown", never secret, never throws.
-- @return boolean
function ns.inCombat()
	local ok, v = pcall(InCombatLockdown)
	if not ok or isSecret(v) then return false end
	return v and true or false
end

--- Records an internal failure without ever throwing.
-- @param where string
-- @param err any
function ns.recordError(where, err)
	local db = ns.db
	if type(db) ~= "table" then return end
	if type(db.internalErrors) ~= "table" then db.internalErrors = {} end
	local okT, t = pcall(GetTime)
	ns.pushCapped(db.internalErrors, {
		where = where,
		err = ns.errString(err),
		t = (okT and not isSecret(t)) and t or 0,
	}, 30)
end

--- Runs fn in pcall and records any failure under `where`.
-- @param where string
-- @param fn function
function ns.guard(where, fn, ...)
	local ok, err = pcall(fn, ...)
	if not ok then ns.recordError(where, err) end
	return ok
end

--- Schedules fn after `delay` seconds via C_Timer.After; the callback runs
-- inside ns.guard(where, ...). Never throws; failures go to internalErrors.
-- @param delay number  seconds
-- @param where string  label for recorded errors
-- @param fn function
-- @return boolean  true if the timer was scheduled
function ns.after(delay, where, fn)
	local after = ns.resolve("C_Timer.After")
	if type(after) ~= "function" then
		ns.recordError(where, "C_Timer.After missing")
		return false
	end
	local ok, err = pcall(after, delay, function() ns.guard(where, fn) end)
	if not ok then ns.recordError(where, err) end
	return ok
end

--- Prints one short chat line with the addon prefix. Only pass plain strings.
-- @param msg string
function ns.say(msg)
	pcall(print, "|cff66ccffRF Probe:|r " .. msg)
end

--- Plain, non-secret number or nil.
-- @param v any
-- @return number|nil
function ns.plainNumber(v)
	if isSecret(v) then return nil end
	if type(v) ~= "number" then return nil end
	if v ~= v then return nil end
	return v
end

--- Plain, non-secret boolean-ish truth: true only for a non-secret truthy value.
-- @param v any
-- @return boolean
function ns.plainTrue(v)
	if isSecret(v) then return false end
	return v and true or false
end

-- ------------------------------------------------------------ round 2+ helpers

--- Plain GetTime() or 0; never secret, never throws.
-- @return number
function ns.now()
	local ok, t = pcall(GetTime)
	if ok and not isSecret(t) and type(t) == "number" then return t end
	return 0
end

--- Lightweight call for the high-frequency samplers: returns the described
-- FIRST return of a dotted-path function, "<missing>" or "<err>". Errors are
-- aggregated once per path into RFProbeDB.quickErrors[path] = {n=, err=}
-- instead of being repeated in every sample.
-- @param path string
-- @return any  a plain, storable value
function ns.quick(path, ...)
	local fn = ns.resolve(path)
	if type(fn) ~= "function" then return "<missing>" end
	local ok, v = pcall(fn, ...)
	if ok then return ns.describe(v) end
	local db = ns.db
	if type(db) == "table" then
		if type(db.quickErrors) ~= "table" then db.quickErrors = {} end
		local rec = db.quickErrors[path]
		if type(rec) ~= "table" then
			rec = { n = 0, err = ns.errString(v) }
			db.quickErrors[path] = rec
		end
		rec.n = (ns.plainNumber(rec.n) or 0) + 1
	end
	return "<err>"
end

--- Compact instance tag: false when not in an instance, "<instanceType>:<difficultyID>"
-- (e.g. "party:1") when in one, "<secret>"/"<err>" otherwise. Round 4 added the
-- difficulty (third return of GetInstanceInfo; the ":?" suffix means unreadable).
-- @return boolean|string
function ns.instanceTag()
	local ok, inInst, instType = pcall(IsInInstance)
	if not ok then return "<err>" end
	if isSecret(inInst) or isSecret(instType) then return "<secret>" end
	if not inInst then return false end
	local tag = (type(instType) == "string") and instType or "?"
	local okI, _, _, diff = pcall(GetInstanceInfo)
	if okI and not isSecret(diff) and type(diff) == "number" then
		return tag .. ":" .. diff
	end
	return tag .. ":?"
end

--- Plain boolean or nil (nil for secret, nil or non-boolean values).
-- @param v any
-- @return boolean|nil
function ns.plainBool(v)
	if isSecret(v) then return nil end
	if type(v) ~= "boolean" then return nil end
	return v
end

--- Type name of a value without touching a secret: "<secret>" for secrets,
-- "secret-table" for secret tables, otherwise type(v).
-- @param v any
-- @return string
function ns.kindOf(v)
	if isSecret(v) then return "<secret>" end
	local t = type(v)
	if t == "table" and isSecretTable(v) then return "secret-table" end
	return t
end

--- Increments a plain counter field on a table (creating it at 0).
-- @param t table
-- @param key string
function ns.bump(t, key)
	if type(t) ~= "table" then return end
	t[key] = (ns.plainNumber(t[key]) or 0) + 1
end

--- Rounds a plain number to milliseconds (nil stays nil).
-- @param v number|nil
-- @return number|nil
function ns.ms(v)
	local n = ns.plainNumber(v)
	if not n then return nil end
	return math.floor(n * 1000 + 0.5) / 1000
end

--- Reverse-maps an enum value to its key name, e.g. (Enum.AddOnRestrictionType, 1) -> "Encounter".
-- @param enumPath string  dotted path such as "Enum.AddOnRestrictionType"
-- @param value any
-- @return string  the key, "<secret>", "<unknown>" or "<no-enum>"
function ns.enumName(enumPath, value)
	if isSecret(value) then return "<secret>" end
	local e = ns.resolve(enumPath)
	if type(e) ~= "table" or isSecretTable(e) then return "<no-enum>" end
	local found = "<unknown>"
	pcall(function()
		for k, v in pairs(e) do
			if not isSecret(k) and not isSecret(v) and type(k) == "string" and v == value then
				found = k
				return
			end
		end
	end)
	return found
end

--- True only when the target exists, is plainly attackable and not plainly dead.
-- @return boolean
function ns.hostileTarget()
	local okE, exists = pcall(UnitExists, "target")
	if not okE or not ns.plainTrue(exists) then return false end
	local okA, can = pcall(UnitCanAttack, "player", "target")
	if not okA or not ns.plainTrue(can) then return false end
	local okD, dead = pcall(UnitIsDead, "target")
	if okD and ns.plainTrue(dead) then return false end
	return true
end
