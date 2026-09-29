-- rf-probe / checks.lua
-- Round 4 checks (level-20 Shaman):
--   1. Shared shock cooldown: 0.3s and 1.5s after a player UNIT_SPELLCAST_SUCCEEDED
--      of any shock, every known Earth/Flame/Frost Shock rank is sampled
--      (C_Spell.GetSpellCooldown described + the plain NeverSecret flags, and the
--      C_Spell.GetSpellCooldownDuration object's HasSecretValues/IsZero)
--      -> RFProbeDB.shockSamples (ring 80), legend in RFProbeDB.shockLegend.
--   2/3. Swing vs cast timeline: every PLAYER_SWING and every player
--      UNIT_SPELLCAST_* (START/SUCCEEDED/STOP/INTERRUPTED/FAILED/FAILED_QUIET/
--      DELAYED/CHANNEL_*), plus auto-attack and regen toggles, with all args
--      (castGUID included) and GetTime -> RFProbeDB.timeline (ring 800, no
--      per-fight cap). Repeated FAILED/FAILED_QUIET of one spell within 0.5s
--      merge into one entry (x = count, tl = last time).
--   4. "/tb" built in? SLASH_* string globals equal to "/tb", the chat hash
--      tables and IsSecureCmd -> RFProbeDB.slashTB.login / .logout. We never
--      register /tb ourselves.
-- Everything stored is described or plain; every game call is pcall'd.

local ADDON_NAME, ns = ...

local type, ipairs, pairs, pcall, select = type, ipairs, pairs, pcall, select
local isSecret, isSecretTable = ns.isSecret, ns.isSecretTable
local describe = ns.describe

-- ================================================================ timeline

local MAX_TIMELINE = 800
local MERGE_WINDOW = 0.5

-- event -> short kind stored in RFProbeDB.timeline[i].k
local TIMELINE_KIND = {
	PLAYER_SWING = "swing",
	UNIT_SPELLCAST_START = "start",
	UNIT_SPELLCAST_SUCCEEDED = "ok",
	UNIT_SPELLCAST_STOP = "stop",
	UNIT_SPELLCAST_INTERRUPTED = "int",
	UNIT_SPELLCAST_FAILED = "fail",
	UNIT_SPELLCAST_FAILED_QUIET = "failq",
	UNIT_SPELLCAST_DELAYED = "delay",
	UNIT_SPELLCAST_CHANNEL_START = "chstart",
	UNIT_SPELLCAST_CHANNEL_STOP = "chstop",
	PLAYER_ENTER_COMBAT = "atkon",
	PLAYER_LEAVE_COMBAT = "atkoff",
	PLAYER_REGEN_DISABLED = "combat+",
	PLAYER_REGEN_ENABLED = "combat-",
}
ns.TIMELINE_KIND = TIMELINE_KIND

local MERGEABLE = { fail = true, failq = true }
-- kinds whose 3rd arg is the spellID (unitTarget, castGUID, spellID, ...)
local CAST_KIND = {
	start = true, ok = true, stop = true, int = true, fail = true, failq = true,
	delay = true, chstart = true, chstop = true,
}

local function timelineList()
	local db = ns.db
	if type(db.timeline) ~= "table" then db.timeline = {} end
	return db.timeline
end

--- Appends one timeline entry: {t, k, c, a={n, described args...}, id, nm, i, dur}.
-- @param event string  a TIMELINE_KIND key
function ns.timelineLog(event, ...)
	local kind = TIMELINE_KIND[event]
	if not kind then return end
	local list = timelineList()
	local t = ns.now()
	local n = select("#", ...)
	local a = { n = n }
	for i = 1, n do a[i] = describe((select(i, ...))) end
	if MERGEABLE[kind] then
		local last = list[#list]
		-- a[3] / last.a[3] are described (plain) values; safe to compare
		if type(last) == "table" and last.k == kind and type(last.a) == "table" and last.a[3] == a[3]
			and type(last.t) == "number" and t - last.t < MERGE_WINDOW then
			last.x = (ns.plainNumber(last.x) or 1) + 1
			last.tl = t
			return
		end
	end
	local e = { t = t, k = kind, c = ns.inCombat(), a = a }
	if CAST_KIND[kind] then
		local id = ns.plainNumber((select(3, ...)))
		if id then
			e.id = id
			e.nm = ns.spellNameCached(id)
		end
	end
	if kind == "delay" then e.dur = ns.durationLite("UnitCastingDuration", "player") end
	local tag = ns.instanceTag()
	if tag then e.i = tag end
	ns.pushCapped(list, e, MAX_TIMELINE)
end

-- ================================================================ shock cooldowns

local MAX_SHOCK_SAMPLES = 80
local SHOCK_DELAYS = { 0.3, 1.5 }

-- Vanilla shock ranks. Only those in the spellbook (or matched by name) are sampled.
local SHOCK_FAMILIES = {
	{ key = "earth", label = "E", ranks = { 8042, 8044, 8045, 8046, 10412, 10413, 10414 } },
	{ key = "flame", label = "F", ranks = { 8050, 8052, 8053, 10447, 10448, 29228 } },
	{ key = "frost", label = "Fr", ranks = { 8056, 8058, 10472, 10473 } },
}
ns.SHOCK_FAMILIES = SHOCK_FAMILIES

-- shocks.ids: every known shock ID (plain); shocks.family[id] = family key;
-- shocks.top[key] = highest known rank (or rank 1 when none is known).
local shocks = { ids = nil, family = {}, top = {}, byName = {} }

-- Static rank -> family map (used before/without a spellbook pick).
local RANK_FAMILY = {}
for _, fam in ipairs(SHOCK_FAMILIES) do
	for _, id in ipairs(fam.ranks) do RANK_FAMILY[id] = fam.key end
end

--- Picks the known Earth/Flame/Frost Shock ranks (IsSpellInSpellBook for the
-- vanilla ranks, plus any book spell whose plain name equals a rank-1 shock
-- name) and writes RFProbeDB.shockLegend.
function ns.pickShocks()
	local ids, seen, family, top, byName = {}, {}, {}, {}, {}
	local function add(id, key)
		if seen[id] then return end
		seen[id] = true
		ids[#ids + 1] = id
		family[id] = key
	end
	for _, fam in ipairs(SHOCK_FAMILIES) do
		for _, id in ipairs(fam.ranks) do
			if ns.isInBook(id) then
				add(id, fam.key)
				top[fam.key] = id   -- ranks are listed low -> high
			end
		end
		local nm = ns.spellNameCached(fam.ranks[1])
		if nm then byName[nm] = fam.key end
	end
	local okB, book = pcall(ns.readSpellbook)
	if okB and type(book) == "table" then
		for _, s in ipairs(book) do
			local key = s.name and byName[s.name]
			if key and not seen[s.id] then
				add(s.id, key)
				if not top[key] then top[key] = s.id end
			end
		end
	end
	for _, fam in ipairs(SHOCK_FAMILIES) do
		if not top[fam.key] then top[fam.key] = fam.ranks[1] end
	end
	shocks.ids, shocks.family, shocks.top, shocks.byName = ids, family, top, byName
	ns.db.shockLegend = {
		shockIDs = ids,
		family = family,
		top = top,
		delays = SHOCK_DELAYS,
		fields = "t=sample time t0=SUCCEEDED time dt=delay c=InCombatLockdown fight i=instance trig=cast spellID trigFam=family "
			.. "s[id]={cd=C_Spell.GetSpellCooldown described, act=isActive, gcd=isOnGCD (both NeverSecret), "
			.. "start/dur/rem (only when plain), dur2=durationLite(C_Spell.GetSpellCooldownDuration)} "
			.. "sharedFlags=other-family IDs with act=true and gcd=false (works in combat) "
			.. "gcdOnly=other-family IDs with act=true and gcd=true | sharedTime=other-family IDs with plain duration > 1.6s",
	}
end

--- Highest known rank of a shock family ("earth" | "flame" | "frost").
-- @param key string
-- @return number
function ns.shockTop(key)
	if not shocks.ids then ns.guard("pickShocks", ns.pickShocks) end
	return shocks.top[key]
end

local function shockFamilyOf(id)
	local key = shocks.family[id] or RANK_FAMILY[id]
	if key then return key end
	local nm = ns.spellNameCached(id)
	if nm then return shocks.byName[nm] end
	return nil
end

-- One shock's cooldown state. Only plain values are compared.
local function shockEntry(id, now)
	local e = {}
	local fn = ns.resolve("C_Spell.GetSpellCooldown")
	if type(fn) ~= "function" then
		e.cd = "<missing>"
	else
		local ok, info = pcall(fn, id)
		if not ok then
			e.cd = { err = ns.errString(info) }
		else
			e.cd = describe(info)
			if not isSecret(info) and type(info) == "table" and not isSecretTable(info) then
				local okF, st, du, act, gcd = pcall(function()
					return info.startTime, info.duration, info.isActive, info.isOnGCD
				end)
				if okF then
					e.act = ns.plainBool(act)
					e.gcd = ns.plainBool(gcd)
					local s, d = ns.plainNumber(st), ns.plainNumber(du)
					if s and d then
						e.start, e.dur = ns.ms(s), ns.ms(d)
						e.rem = (d > 0) and ns.ms(s + d - now) or 0
						e.real = d > 1.6
					end
				end
			end
		end
	end
	e.dur2 = ns.durationLite("C_Spell.GetSpellCooldownDuration", id)
	return e
end

local function takeShockSample(t0, dt, trig, trigFam, ids)
	local db = ns.db
	if type(db.shockSamples) ~= "table" then db.shockSamples = {} end
	local now = ns.now()
	local s = {
		t = now, t0 = t0, dt = dt, c = ns.inCombat(), fight = ns.fightId or 0, i = ns.instanceTag(),
		trig = trig, trigFam = trigFam or "<unknown>", s = {},
		sharedFlags = {}, gcdOnly = {}, sharedTime = {},
	}
	for _, id in ipairs(ids) do
		local e = shockEntry(id, now)
		s.s[id] = e
		local fam = shocks.family[id] or RANK_FAMILY[id]
		if fam and fam ~= trigFam then
			if e.act == true and e.gcd == false then s.sharedFlags[#s.sharedFlags + 1] = id end
			if e.act == true and e.gcd == true then s.gcdOnly[#s.gcdOnly + 1] = id end
			if e.real == true then s.sharedTime[#s.sharedTime + 1] = id end
		end
	end
	ns.pushCapped(db.shockSamples, s, MAX_SHOCK_SAMPLES)
end

--- On a player UNIT_SPELLCAST_SUCCEEDED: when the spell is a shock (plain ID in
-- a shock family, by rank list or by name) or the spellID is secret, schedules
-- samples of every known shock 0.3s and 1.5s later.
function ns.scheduleShockSamples(_, _, spellID)
	local secretId = isSecret(spellID)
	local plainId = ns.plainNumber(spellID)
	local fam = plainId and shockFamilyOf(plainId) or nil
	if not fam and not secretId then return end
	if not shocks.ids or (#shocks.ids == 0 and not ns.inCombat()) then ns.guard("pickShocks", ns.pickShocks) end
	local ids, seen = {}, {}
	if plainId then
		ids[1] = plainId
		seen[plainId] = true
	end
	for _, id in ipairs(shocks.ids or {}) do
		if not seen[id] then
			seen[id] = true
			ids[#ids + 1] = id
		end
	end
	local t0 = ns.now()
	local trig = describe(spellID)
	for _, dt in ipairs(SHOCK_DELAYS) do
		ns.after(dt, "shockSample", function() takeShockSample(t0, dt, trig, fam, ids) end)
	end
end

--- Count of shock samples that saw another family on a real (non-GCD) cooldown.
-- @return number samples, number sharedHits
function ns.shockSummary()
	local db = ns.db
	local list = type(db.shockSamples) == "table" and db.shockSamples or {}
	local hits = 0
	for _, s in ipairs(list) do
		if type(s.sharedFlags) == "table" and #s.sharedFlags > 0 then hits = hits + 1 end
	end
	return #list, hits
end

-- ================================================================ /tb scan

-- Type of hashTable[key] without touching secrets; "<no-table>" if the table is missing.
local function typeAt(path, key)
	local tbl = ns.resolve(path)
	if type(tbl) ~= "table" or isSecretTable(tbl) then return "<no-table>", nil end
	local ok, v = pcall(function() return tbl[key] end)
	if not ok then return { err = ns.errString(v) }, nil end
	return ns.kindOf(v), v
end

local function countEntries(path)
	local tbl = ns.resolve(path)
	if type(tbl) ~= "table" or isSecretTable(tbl) then return "<no-table>" end
	local n = 0
	pcall(function() for _ in pairs(tbl) do n = n + 1 end end)
	return n
end

-- Finds the SlashCmdList key (own entries or the metatable __index proxy that
-- ImportListToHash moves them into) whose handler is `fn`.
local function slashOwner(fn)
	local found
	pcall(function()
		local list = SlashCmdList
		if type(list) ~= "table" then return end
		local function scan(t)
			for k, v in pairs(t) do
				if not isSecret(k) and not isSecret(v) and type(k) == "string" and v == fn then
					found = k
					return true
				end
			end
			return false
		end
		if scan(list) then return end
		local mt = getmetatable(list)
		local proxy = (type(mt) == "table" and not isSecretTable(mt)) and mt.__index or nil
		if type(proxy) == "table" and not isSecretTable(proxy) then scan(proxy) end
	end)
	return found
end

--- Scans for a built-in "/tb": every SLASH_* global whose (plain string) value
-- equals "/tb" case-insensitively, plus totem-ish slash strings, the chat hash
-- tables and IsSecureCmd. Stored in RFProbeDB.slashTB[why].
-- @param why string  "login" | "logout"
function ns.scanSlashTB(why)
	local db = ns.db
	if type(db) ~= "table" then return end
	if type(db.slashTB) ~= "table" then db.slashTB = {} end
	local out = { t = ns.now(), matches = {}, totemish = {}, slashGlobals = 0 }
	local okScan, errScan = pcall(function()
		for k, v in pairs(_G) do
			if not isSecret(k) and type(k) == "string" and k:sub(1, 6) == "SLASH_" then
				out.slashGlobals = out.slashGlobals + 1
				if not isSecret(v) and type(v) == "string" then
					local lv = v:lower()
					if lv == "/tb" then out.matches[#out.matches + 1] = { key = k, value = v } end
					if #out.totemish < 20 and (lv:find("totem", 1, true) or lv:sub(1, 3) == "/tb") then
						out.totemish[#out.totemish + 1] = k .. "=" .. v
					end
				end
			end
		end
	end)
	if not okScan then out.scanErr = ns.errString(errScan) end
	local hashType, hashFn = typeAt("hash_SlashCmdList", "/TB")
	out.hashSlashCmdList = hashType
	if type(hashFn) == "function" then out.hashOwner = slashOwner(hashFn) or "<not found>" end
	out.hashChatTypeInfoList = describe((select(2, typeAt("hash_ChatTypeInfoList", "/TB"))))
	out.hashEmoteTokenList = (typeAt("hash_EmoteTokenList", "/TB"))
	out.hashSlashCount = countEntries("hash_SlashCmdList")
	out.isSecureCmd = ns.compact(ns.safeCall("IsSecureCmd", "/tb"))
	db.slashTB[why] = out
end

--- Read-only CVar values of interest (never set). -> RFProbeDB.cvars
function ns.readCVars()
	local db = ns.db
	db.cvars = {
		t = ns.now(),
		countdownForCooldowns = ns.compact(ns.safeCall("C_CVar.GetCVar", "countdownForCooldowns")),
	}
end

-- ================================================================ dispatch

--- Round-4 event hook, called from events.lua's sampler dispatch.
-- @param event string
function ns.checksOnEvent(event, ...)
	if TIMELINE_KIND[event] then
		ns.guard("timeline:" .. event, ns.timelineLog, event, ...)
	end
	if event == "UNIT_SPELLCAST_SUCCEEDED" then
		ns.guard("shockSchedule", ns.scheduleShockSamples, ...)
	end
end
