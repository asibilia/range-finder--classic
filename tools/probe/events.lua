-- rf-probe / events.lua
-- Registers the probe events (each checked with C_EventUtils.IsEventValid and
-- wrapped in pcall), logs every fire into RFProbeDB.events (ring, cap 800)
-- with described payloads, and runs the round-2/3 samplers (range, cast start,
-- totem, Lightning Shield counter, restriction changes) plus the 1s ticker.
-- Round 4: events that go to RFProbeDB.timeline (checks.lua: PLAYER_SWING, the
-- player's UNIT_SPELLCAST_*, auto-attack and regen toggles) are only counted in
-- eventCounts, not duplicated into the events ring.
--
-- COMBAT_LOG_EVENT / COMBAT_LOG_EVENT_UNFILTERED are NEVER registered: doing so
-- raises ADDON_ACTION_FORBIDDEN on Forever. We only ask IsEventValid about them.

local ADDON_NAME, ns = ...

local type, ipairs, pairs, pcall, select = type, ipairs, pairs, pcall, select
local isSecret, isSecretTable = ns.isSecret, ns.isSecretTable
local describe = ns.describe

local MAX_EVENTS = 800
local DEFAULT_CAP = 150   -- per fight, per event
local NOISY_CAP = 40      -- per fight, per noisy event

-- Every name below was checked against the Forever UI source
-- (Blizzard_APIDocumentationGenerated) / secret-index.txt.
ns.PROBE_EVENTS = {
	"PLAYER_SWING", "PLAYER_SWING_RANGE_UPDATE",
	"SPELL_UPDATE_COOLDOWN", "SPELL_UPDATE_CHARGES", "SPELL_UPDATE_USABLE", "ACTION_USABLE_CHANGED",
	"PLAYER_TOTEM_UPDATE", "WEAPON_ENCHANT_CHANGED",
	"SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", "SPELL_ACTIVATION_OVERLAY_GLOW_HIDE",
	"SPELL_RANGE_CHECK_UPDATE", "START_AUTOREPEAT_SPELL", "STOP_AUTOREPEAT_SPELL",
	"ADDON_RESTRICTION_STATE_CHANGED", "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED",
	"PLAYER_TARGET_CHANGED",
	-- did *we* trip a protected call?
	"ADDON_ACTION_BLOCKED", "ADDON_ACTION_FORBIDDEN",
	-- auto-attack on/off (no payload), to explain swing gaps
	"PLAYER_ENTER_COMBAT", "PLAYER_LEAVE_COMBAT",
}

-- Registered with RegisterUnitEvent(event, "player").
ns.PLAYER_UNIT_EVENTS = {
	"UNIT_ATTACK_SPEED", "UNIT_AURA", "UNIT_POWER_UPDATE", "UNIT_MAXPOWER", "UNIT_COMBAT",
	"UNIT_SPELLCAST_START", "UNIT_SPELLCAST_SUCCEEDED", "UNIT_SPELLCAST_STOP",
	"UNIT_SPELLCAST_CHANNEL_START", "UNIT_SPELLCAST_CHANNEL_STOP",
	-- payload: unitTarget, castGUID, spellID, [interruptedBy], castBarID
	"UNIT_SPELLCAST_INTERRUPTED", "UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_FAILED_QUIET",
	"UNIT_SPELLCAST_DELAYED",
}

-- Validity is recorded, registration is never attempted.
local NEVER_REGISTER = { "COMBAT_LOG_EVENT", "COMBAT_LOG_EVENT_UNFILTERED" }

local NOISY = {
	UNIT_POWER_UPDATE = true, UNIT_MAXPOWER = true, SPELL_UPDATE_COOLDOWN = true, SPELL_UPDATE_USABLE = true,
	UNIT_AURA = true, UNIT_COMBAT = true, ACTION_USABLE_CHANGED = true,
	SPELL_UPDATE_CHARGES = true, SPELL_RANGE_CHECK_UPDATE = true,
}

-- Per-fight counters; reset on PLAYER_REGEN_DISABLED.
local fightCounts = {}
local probeSet = {}

--- Resets the per-fight event caps (called when a fight starts).
function ns.resetFightCounters()
	fightCounts = {}
end

local function isEventValid(name)
	local eu = C_EventUtils
	if type(eu) ~= "table" or type(eu.IsEventValid) ~= "function" then return nil end
	local ok, v = pcall(eu.IsEventValid, name)
	if not ok or isSecret(v) then return nil end
	return v and true or false
end

--- Registers every probe event on the given frame and records the outcome in
-- RFProbeDB.eventRegistration[name] = {valid=, ok=, registered=, err=, unit=}.
-- @param frame Frame
function ns.registerProbeEvents(frame)
	local db = ns.db
	local reg = {}
	db.eventRegistration = reg
	local function doRegister(name, unit)
		local valid = isEventValid(name)
		local rec = { valid = describe(valid), unit = unit }
		if valid == false then
			rec.ok = false
			rec.err = "IsEventValid=false; not registered"
		else
			local ok, res
			if unit then
				ok, res = pcall(frame.RegisterUnitEvent, frame, name, unit)
			else
				ok, res = pcall(frame.RegisterEvent, frame, name)
			end
			rec.ok = ok
			if ok then
				rec.registered = describe(res)
				probeSet[name] = true
			else
				rec.err = ns.errString(res)
			end
		end
		reg[name] = rec
	end
	for _, name in ipairs(ns.PROBE_EVENTS) do doRegister(name, nil) end
	for _, name in ipairs(ns.PLAYER_UNIT_EVENTS) do doRegister(name, "player") end
	for _, name in ipairs(NEVER_REGISTER) do
		reg[name] = { valid = describe(isEventValid(name)), ok = false, err = "deliberately never registered" }
	end
end

--- True if this event is one we log.
-- @param event string
function ns.isProbeEvent(event)
	return probeSet[event] == true
end

--- Counts one event fire and (unless it belongs to the timeline, or the
-- per-fight cap is hit) stores its described payload in the events ring.
-- @param event string
function ns.logEvent(event, ...)
	local db = ns.db
	if type(db) ~= "table" then return end
	local combat = ns.inCombat()
	local counts = db.eventCounts[event]
	if type(counts) ~= "table" then
		counts = { total = 0, inCombat = 0, dropped = 0 }
		db.eventCounts[event] = counts
	end
	counts.total = (ns.plainNumber(counts.total) or 0) + 1
	counts.inCombat = (ns.plainNumber(counts.inCombat) or 0) + (combat and 1 or 0)
	counts.dropped = ns.plainNumber(counts.dropped) or 0
	-- stored (uncapped per fight) by checks.lua instead
	if type(ns.TIMELINE_KIND) == "table" and ns.TIMELINE_KIND[event] then return end
	local cap = NOISY[event] and NOISY_CAP or DEFAULT_CAP
	local seen = (fightCounts[event] or 0) + 1
	fightCounts[event] = seen
	if seen > cap then
		counts.dropped = counts.dropped + 1
		return
	end
	local n = select("#", ...)
	local a = { n = n }
	for i = 1, n do
		a[i] = describe((select(i, ...)))
	end
	ns.pushCapped(db.events, {
		t = ns.now(),
		e = event,
		combat = combat,
		fight = ns.fightId or 0,
		a = a,
	}, MAX_EVENTS)
end


-- =====================================================================
-- Samplers. Everything below runs inside ns.guard / pcall from core.lua's
-- OnEvent or the 1s ticker. Stored values are described or plain.
-- =====================================================================

-- ------------------------------------------------------------ range checks

local RANGE_SPELLS = { 75, 403, 8042 }   -- Auto Shot, Lightning Bolt, Earth Shock (rank 1)
local ES_RANKS = { 8042, 8044, 8045, 8046, 10412, 10413, 10414 }
local LB_RANKS = { 403, 529, 548, 915, 943, 6041, 10391, 10392, 15207, 15208 }
-- melee-range spells to prefer if known: Stormstrike, Raptor Strike, Heroic Strike, Sinister Strike
local MELEE_IDS = { 17364, 2973, 78, 1752 }
local ATTACK_ID = 6603

local rangeSpells = { es = ES_RANKS[1], lb = LB_RANKS[1], m = ATTACK_ID, mSrc = "fallback-attack" }
ns.rangeSpells = rangeSpells

local function firstInBook(list)
	for _, id in ipairs(list) do
		if ns.isInBook(id) then return id end
	end
	return nil
end

-- A known melee ID in the book, else a non-passive book spell whose plain
-- maxRange is 1..5 yd, else Attack (6603).
local function pickMeleeSpell()
	local id = firstInBook(MELEE_IDS)
	if id then return id, "known-id" end
	local getInfo = ns.resolve("C_Spell.GetSpellInfo")
	local okB, book = pcall(ns.readSpellbook)
	if type(getInfo) == "function" and okB and type(book) == "table" then
		for _, s in ipairs(book) do
			if not s.passive and s.id ~= ATTACK_ID then
				local okI, info = pcall(getInfo, s.id)
				if okI and not isSecret(info) and type(info) == "table" and not isSecretTable(info) then
					local mx = ns.plainNumber(info.maxRange)
					if mx and mx > 0 and mx <= 5 then return s.id, "book-maxRange" end
				end
			end
		end
	end
	return ATTACK_ID, "fallback-attack"
end

--- Picks the spells used by the range sampler (Earth Shock / Lightning Bolt
-- ranks from the spellbook, plus a melee-range spell) and writes the legend
-- for RFProbeDB.rangeSamples.
function ns.pickRangeSpells()
	rangeSpells.es = firstInBook(ES_RANKS) or ES_RANKS[1]
	rangeSpells.lb = firstInBook(LB_RANKS) or LB_RANKS[1]
	rangeSpells.m, rangeSpells.mSrc = pickMeleeSpell()
	local items = {}
	for i, it in ipairs(ns.RANGE_ITEMS) do items[i] = it.id .. "=" .. it.yd .. "yd" end
	ns.db.rangeSampleLegend = {
		sr = { es = rangeSpells.es, lb = rangeSpells.lb, m = rangeSpells.m, mSrc = rangeSpells.mSrc },
		cid = "cid[i] = CheckInteractDistance(\"target\", i), i = 1..5",
		it = items,
		sw = "C_SwingTimer.IsTargetWithinSwingRange: mh=MainHand oh=OffHand rg=Ranged",
		fields = "t=GetTime w=triggers(tick|src|swr|tgt) c=InCombatLockdown i=instance(false|type:difficultyID) ev=event args noHostile=no attackable target",
	}
end

local function swingTypes()
	local mh = ns.plainNumber(ns.resolve("Enum.PlayerSwingType.MainHand")) or 0
	local oh = ns.plainNumber(ns.resolve("Enum.PlayerSwingType.OffHand")) or 1
	local rg = ns.plainNumber(ns.resolve("Enum.PlayerSwingType.Ranged")) or 2
	return mh, oh, rg
end

--- Enables PLAYER_SWING_RANGE_UPDATE for MainHand + Ranged. Called on EVERY
-- PLAYER_ENTERING_WORLD. History -> RFProbeDB.rangeCheckHistory (cap 12).
-- @param why string
-- @param extra table|nil  plain fields merged into the history record
-- @return table  the history record
function ns.enableSwingRangeChecks(why, extra)
	local mh, _, rg = swingTypes()
	local rec = {
		t = ns.now(),
		why = why,
		MainHand = ns.compact(ns.safeCall("C_SwingTimer.EnableRangeCheck", mh, true)),
		Ranged = ns.compact(ns.safeCall("C_SwingTimer.EnableRangeCheck", rg, true)),
		i = ns.instanceTag(),
	}
	if type(extra) == "table" then
		for k, v in pairs(extra) do rec[k] = v end
	end
	local db = ns.db
	if type(db.rangeCheckHistory) ~= "table" then db.rangeCheckHistory = {} end
	ns.pushCapped(db.rangeCheckHistory, rec, 12)
	return rec
end

--- Turns on SPELL_RANGE_CHECK_UPDATE for a few ranged spells (+ the range
-- sampler's spells) and PLAYER_SWING_RANGE_UPDATE for main-hand/ranged.
-- Also (re)picks the shock IDs. Results go to RFProbeDB.rangeCheckEnable.
-- @param why string|nil
function ns.enableRangeChecks(why)
	local db = ns.db
	ns.guard("pickRangeSpells", ns.pickRangeSpells)
	ns.guard("pickShocks", ns.pickShocks)
	local out = { spells = {}, why = why or "?", t = ns.now() }
	local ids, seen = {}, {}
	local function addId(id)
		if type(id) == "number" and not seen[id] then
			ids[#ids + 1] = id
			seen[id] = true
		end
	end
	for _, id in ipairs(RANGE_SPELLS) do addId(id) end
	addId(rangeSpells.es)
	addId(rangeSpells.lb)
	addId(rangeSpells.m)
	-- plus up to 5 ranged spells from the spellbook
	local hasRange = ns.resolve("C_Spell.SpellHasRange")
	local okB, book = pcall(ns.readSpellbook)
	if okB and type(book) == "table" and type(hasRange) == "function" then
		local added = 0
		for _, s in ipairs(book) do
			if added >= 5 then break end
			if not s.passive and not seen[s.id] then
				local okR, has = pcall(hasRange, s.id)
				if okR and ns.plainTrue(has) then
					addId(s.id)
					added = added + 1
				end
			end
		end
	end
	for _, id in ipairs(ids) do
		out.spells[id] = ns.compact(ns.safeCall("C_Spell.EnableSpellRangeCheck", id, true))
	end
	out.swing = ns.enableSwingRangeChecks((why or "?") .. "+full")
	db.rangeCheckEnable = out
end

-- ------------------------------------------------------------ range samples

local MAX_RANGE_SAMPLES = 400
local lastRangeSample

local function describeArgs(...)
	local n = select("#", ...)
	local a = { n = n }
	for i = 1, math.min(n, 6) do a[i] = describe((select(i, ...))) end
	return a
end

--- Takes one compact range sample into RFProbeDB.rangeSamples (ring, cap 400).
-- Triggers in the same frame are merged into one sample (w = trigger list).
-- CheckInteractDistance / IsItemInRange are only called for a plainly
-- attackable target (never risk a protected call on a friendly in combat).
-- @param why string  "tick" | "src" | "swr" | "tgt"
function ns.rangeSample(why, ...)
	local db = ns.db
	if type(db) ~= "table" then return end
	if type(db.rangeSamples) ~= "table" then db.rangeSamples = {} end
	local t = ns.now()
	local last = lastRangeSample
	if last and last.t == t then
		if #last.w < 10 then last.w[#last.w + 1] = why end
		return
	end
	local s = { t = t, w = { why }, c = ns.inCombat(), i = ns.instanceTag() }
	if select("#", ...) > 0 then s.ev = describeArgs(...) end
	if not ns.hostileTarget() then
		s.noHostile = true
	else
		s.sr = {
			es = ns.quick("C_Spell.IsSpellInRange", rangeSpells.es, "target"),
			lb = ns.quick("C_Spell.IsSpellInRange", rangeSpells.lb, "target"),
			m = ns.quick("C_Spell.IsSpellInRange", rangeSpells.m, "target"),
		}
		local cid = {}
		for i = 1, 5 do cid[i] = ns.quick("CheckInteractDistance", "target", i) end
		s.cid = cid
		local it = {}
		for i, item in ipairs(ns.RANGE_ITEMS) do it[i] = ns.quick("C_Item.IsItemInRange", item.id, "target") end
		s.it = it
		local mh, oh, rg = swingTypes()
		s.sw = {
			mh = ns.quick("C_SwingTimer.IsTargetWithinSwingRange", mh),
			oh = ns.quick("C_SwingTimer.IsTargetWithinSwingRange", oh),
			rg = ns.quick("C_SwingTimer.IsTargetWithinSwingRange", rg),
		}
	end
	ns.pushCapped(db.rangeSamples, s, MAX_RANGE_SAMPLES)
	lastRangeSample = s
end

-- ------------------------------------------------------------ spell names

local nameCache = {}

--- Plain spell name for a plain ID (cached; nil when unknown or secret).
-- @param id number
-- @return string|nil
function ns.spellNameCached(id)
	local v = nameCache[id]
	if v then return v end
	if v == false then return nil end
	local fn = ns.resolve("C_Spell.GetSpellName")
	if type(fn) ~= "function" then return nil end
	local ok, r = pcall(fn, id)
	if ok and not isSecret(r) and type(r) == "string" then
		nameCache[id] = r
		return r
	end
	if not ns.inCombat() then nameCache[id] = false end
	return nil
end
local spellNameCached = ns.spellNameCached

-- ------------------------------------------------------------ cast samples

local MAX_CAST_SAMPLES = 100

--- Records one player cast/channel start into RFProbeDB.castSamples (cap 100)
-- with Unit*Info and the Unit*Duration object. (Cast ends/fails/interrupts
-- are in RFProbeDB.timeline since round 4.)
-- @param event string  UNIT_SPELLCAST_START | UNIT_SPELLCAST_CHANNEL_START
function ns.castSample(event, _, _, spellID)
	local db = ns.db
	if type(db.castSamples) ~= "table" then db.castSamples = {} end
	local chan = event == "UNIT_SPELLCAST_CHANNEL_START"
	local s = { t = ns.now(), c = ns.inCombat(), e = chan and "channel" or "cast", i = ns.instanceTag() }
	s.spellID = describe(spellID)
	local plainId = ns.plainNumber(spellID)
	if plainId then s.name = spellNameCached(plainId) end
	if chan then
		s.info = ns.compact(ns.safeCall("UnitChannelInfo", "player"))
		s.dur = ns.durationCall("UnitChannelDuration", "player")
	else
		s.info = ns.compact(ns.safeCall("UnitCastingInfo", "player"))
		s.dur = ns.durationCall("UnitCastingDuration", "player")
	end
	s.castSecret = ns.compact(ns.safeCall("C_Secrets.ShouldUnitSpellCastingBeSecret", "player"))
	ns.pushCapped(db.castSamples, s, MAX_CAST_SAMPLES)
end

-- ------------------------------------------------------------ totem samples

local MAX_TOTEM_SAMPLES = 80

local function totemSlotRecord(slot)
	return {
		info = ns.compact(ns.safeCall("GetTotemInfo", slot)),
		timeLeft = ns.compact(ns.safeCall("GetTotemTimeLeft", slot)),
		dur = ns.durationLite("GetTotemDuration", slot),
		shouldSecret = ns.compact(ns.safeCall("C_Secrets.ShouldTotemSlotBeSecret", slot)),
	}
end

--- One lightweight record per PLAYER_TOTEM_UPDATE (in or out of combat) into
-- RFProbeDB.totemSamples (ring, cap 80): {t, combat, fight, i, slot,
-- info=GetTotemInfo all returns, timeLeft, dur=durationLite(GetTotemDuration),
-- shouldSecret}. A non-plain slot payload records all four slots under `slots`.
-- @param slot any  PLAYER_TOTEM_UPDATE payload (totemSlot)
function ns.totemSample(slot)
	local db = ns.db
	if type(db.totemSamples) ~= "table" then db.totemSamples = {} end
	local s = { t = ns.now(), combat = ns.inCombat(), fight = ns.fightId or 0, i = ns.instanceTag(), slot = describe(slot) }
	local plainSlot = ns.plainNumber(slot)
	if plainSlot then
		local r = totemSlotRecord(plainSlot)
		s.info, s.timeLeft, s.dur, s.shouldSecret = r.info, r.timeLeft, r.dur, r.shouldSecret
	else
		s.slots = {}
		for i = 1, 4 do s.slots[i] = totemSlotRecord(i) end
	end
	ns.pushCapped(db.totemSamples, s, MAX_TOTEM_SAMPLES)
end

-- ------------------------------------------------------------ Lightning Shield charges

-- Vanilla Lightning Shield ranks; 324/325 confirmed in the round-1 spellbook.
local LS_RANKS = { 324, 325, 905, 945, 8134, 10431, 10432 }
ns.LS_RANKS = LS_RANKS
local LS_RANK_SET = {}
for _, id in ipairs(LS_RANKS) do LS_RANK_SET[id] = true end
-- Charge-consume IDs seen as SPELL_UPDATE_COOLDOWN. 26545 + 26365 were observed in
-- round 1 (both fire in the same frame per charge). 26363/26364/26366/26367/26369/26370
-- are the vanilla per-rank proc IDs; none of these appear in the Forever UI source.
-- Any other spellID whose plain name equals "Lightning Shield" also counts (logged viaName).
local LS_PROC_SET = {
	[26545] = true, [26365] = true,
	[26363] = true, [26364] = true, [26366] = true, [26367] = true, [26369] = true, [26370] = true,
}
local LS_CHARGES = 3
local MAX_LS_SAMPLES = 60
local DC_LOG_INTERVAL = 3   -- seconds between unchanged display-count log entries

-- auraInstanceID lives only here, never in SavedVariables.
local ls = { instanceID = nil, spellID = nil, counter = nil, lastDecT = nil, lookupTries = 0, lastDcSig = nil, lastDcT = 0 }

local function lsLog(rec)
	local db = ns.db
	if type(db.lsSamples) ~= "table" then db.lsSamples = {} end
	rec.t = ns.now()
	rec.c = ns.inCombat()
	ns.pushCapped(db.lsSamples, rec, MAX_LS_SAMPLES)
end

local function lsStat(key)
	local db = ns.db
	if type(db.lsStats) ~= "table" then db.lsStats = {} end
	ns.bump(db.lsStats, key)
end

--- Current event-based charge counter (plain number or nil).
function ns.lsCounter()
	return ls.counter
end

local function setCounter(value, why, extra)
	local old = ls.counter
	if old == value then return end
	ls.counter = value
	local rec = { k = "ctr", from = old or "<unset>", to = value or "<unset>", why = why }
	if type(extra) == "table" then
		for k, v in pairs(extra) do rec[k] = v end
	end
	lsLog(rec)
	if ns.visualIsEnabled() then ns.guard("visualLSCounter", ns.visualSetLSCounter, value) end
end

-- GetPlayerAuraBySpellID over every rank.
-- @return status "found"|"none"|"secret"|"error"|"missing", then for "found":
--   spellID, instanceID (plain or nil), applications (plain or nil), anyFieldSecret; for "error": errString
local function lsLookup()
	local fn = ns.resolve("C_UnitAuras.GetPlayerAuraBySpellID")
	if type(fn) ~= "function" then return "missing" end
	local sawSecret, sawErr = false, nil
	for _, id in ipairs(LS_RANKS) do
		local ok, aura = pcall(fn, id)
		if not ok then
			sawErr = ns.errString(aura)
		elseif isSecret(aura) or (type(aura) == "table" and isSecretTable(aura)) then
			sawSecret = true
		elseif type(aura) == "table" then
			local okF, inst, apps = pcall(function() return aura.auraInstanceID, aura.applications end)
			if okF then
				return "found", id, ns.plainNumber(inst), ns.plainNumber(apps), (isSecret(inst) or isSecret(apps)) and true or false
			end
			sawErr = "field read failed: " .. ns.errString(inst)
		end
	end
	if sawErr then return "error", sawErr end
	if sawSecret then return "secret" end
	return "none"
end

--- Looks up the Lightning Shield auraInstanceID and keeps it in a local.
-- Out of combat (tick/UNIT_AURA) it logs only on change; post-cast attempts
-- (in combat too) always log their outcome.
-- @param why string
-- @param logAlways boolean
function ns.lsRefreshInstance(why, logAlways)
	local status, a, b, c, d = lsLookup()
	local combat = ns.inCombat()
	if status == "found" then
		local changed = (b ~= ls.instanceID) or (a ~= ls.spellID)
		if changed or logAlways then
			lsLog({ k = logAlways and "lookup" or "id", why = why, status = status, spellID = a,
				inst = b or "<nil-or-secret>", apps = c or "<nil-or-secret>", anySecret = d })
		end
		if b then
			ls.instanceID, ls.spellID = b, a
			ls.lookupTries = 0
		end
		if c and c > 0 and not combat then setCounter(c, "ooc-sync", { spellID = a }) end
		return
	end
	if status == "none" and not combat then
		if ls.instanceID then
			lsLog({ k = "id", why = why, status = "none", note = "Lightning Shield gone; instanceID cleared" })
			ls.instanceID, ls.spellID = nil, nil
		end
		if ls.counter and ls.counter > 0 then setCounter(0, "ooc-gone") end
	end
	if logAlways then
		lsLog({ k = "lookup", why = why, status = status, err = (status == "error") and a or nil })
	end
end

local hiddenFS
local function probeFontString()
	if hiddenFS then return hiddenFS end
	local ok, fs = pcall(function()
		local f = CreateFrame("Frame")
		f:Hide()
		return f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	end)
	if ok then hiddenFS = fs end
	return hiddenFS
end

-- GetAuraApplicationDisplayCount(unit, auraInstanceID, minDisplayCount=1) -> string,
-- passed straight into a hidden FontString:SetText without inspection.
-- Round 3 showed it throws in combat ("Auras cannot be accessed when secret
-- while tainted"), so round 4 only calls it out of combat (the AuraContainer
-- widget in visual.lua is the in-combat test now).
local function lsDisplayCount(trig)
	if not ls.instanceID then return end
	if ns.inCombat() then
		lsStat("dcSkippedCombat")
		return
	end
	lsStat("dcCalls")
	local fn = ns.resolve("C_UnitAuras.GetAuraApplicationDisplayCount")
	if type(fn) ~= "function" then
		lsStat("dcMissing")
		return
	end
	local ok, res = pcall(fn, "player", ls.instanceID, 1)
	local setOk, setErr
	if ok then
		lsStat("dcOk")
		lsStat(isSecret(res) and "dcSecret" or "dcPlain")
		local fs = probeFontString()
		if fs then
			setOk, setErr = pcall(fs.SetText, fs, res)
			lsStat(setOk and "setTextOk" or "setTextFail")
		end
	else
		lsStat("dcErr")
	end
	local v = ok and describe(res) or nil
	local err = (not ok) and ns.errString(res) or nil
	local sig = (ok and "ok" or "err") .. "|" .. tostring(v) .. "|" .. tostring(err) .. "|" .. tostring(setOk)
	local now = ns.now()
	if sig ~= ls.lastDcSig or now - ls.lastDcT >= DC_LOG_INTERVAL then
		ls.lastDcSig, ls.lastDcT = sig, now
		lsLog({ k = "dc", trig = trig, ok = ok, v = v, err = err, setText = setOk,
			setErr = (setOk == false) and ns.errString(setErr) or nil, inst = ls.instanceID })
	end
end

local function lsName()
	return spellNameCached(LS_RANKS[1])
end

local function lsOnCooldownEvent(spellID)
	if isSecret(spellID) or type(spellID) ~= "number" then return end
	if LS_RANK_SET[spellID] then return end
	local isProc, viaName = LS_PROC_SET[spellID] == true, false
	if not isProc then
		local nm, lsN = spellNameCached(spellID), lsName()
		if nm and lsN and nm == lsN then isProc, viaName = true, true end
	end
	if not isProc then return end
	lsStat("procEvents")
	local now = ns.now()
	if ls.lastDecT == now then
		lsStat("procSameFrame")
		return
	end
	ls.lastDecT = now
	if type(ls.counter) == "number" and ls.counter > 0 then
		setCounter(ls.counter - 1, "proc", { spellID = spellID, name = spellNameCached(spellID), viaName = viaName })
	else
		lsLog({ k = "proc-no-counter", spellID = spellID, name = spellNameCached(spellID), viaName = viaName,
			counter = ls.counter or "<unset>" })
	end
end

--- Lightning Shield event hook (event-based charge counter).
-- @param event string
function ns.lsOnEvent(event, ...)
	if event == "UNIT_SPELLCAST_SUCCEEDED" then
		local _, _, spellID = ...
		if not isSecret(spellID) and type(spellID) == "number" and LS_RANK_SET[spellID] then
			lsLog({ k = "cast", spellID = spellID })
			setCounter(LS_CHARGES, "cast", { spellID = spellID })
			ls.lookupTries = 3
			ns.lsRefreshInstance("post-cast", true)
		end
	elseif event == "UNIT_AURA" then
		if ls.lookupTries > 0 then
			ls.lookupTries = ls.lookupTries - 1
			ns.lsRefreshInstance("post-cast-aura", true)
		elseif not ns.inCombat() then
			ns.lsRefreshInstance("aura", false)
		end
		lsDisplayCount("UNIT_AURA")
	elseif event == "SPELL_UPDATE_COOLDOWN" then
		lsOnCooldownEvent((...))
		lsDisplayCount("SPELL_UPDATE_COOLDOWN")
	end
end

--- Drops the in-memory Lightning Shield state (used by /rfprobe clear).
function ns.lsReset()
	ls.instanceID, ls.spellID, ls.counter, ls.lastDecT = nil, nil, nil, nil
	ls.lookupTries, ls.lastDcSig, ls.lastDcT = 0, nil, 0
end

-- ------------------------------------------------------------ restriction changes

--- ADDON_RESTRICTION_STATE_CHANGED(type, state) with enum key names -> RFProbeDB.restrictionChanges (cap 100).
function ns.logRestrictionChange(rtype, state)
	local db = ns.db
	if type(db.restrictionChanges) ~= "table" then db.restrictionChanges = {} end
	ns.pushCapped(db.restrictionChanges, {
		t = ns.now(),
		c = ns.inCombat(),
		type = describe(rtype),
		typeName = ns.enumName("Enum.AddOnRestrictionType", rtype),
		state = describe(state),
		stateName = ns.enumName("Enum.AddOnRestrictionState", state),
		i = ns.instanceTag(),
		zone = ns.quick("GetRealZoneText"),
		instanceInfo = ns.compact(ns.safeCall("GetInstanceInfo")),
		aurasSecret = ns.quick("C_Secrets.ShouldAurasBeSecret"),
	}, 100)
end

-- ------------------------------------------------------------ dispatch + ticker

--- Sampler dispatch, called from core.lua for every event.
-- @param event string
function ns.samplersOnEvent(event, ...)
	if event == "SPELL_RANGE_CHECK_UPDATE" then
		ns.guard("rangeSample:src", ns.rangeSample, "src", ...)
	elseif event == "PLAYER_SWING_RANGE_UPDATE" then
		ns.guard("rangeSample:swr", ns.rangeSample, "swr", ...)
	elseif event == "PLAYER_TARGET_CHANGED" then
		if ns.hostileTarget() then ns.guard("rangeSample:tgt", ns.rangeSample, "tgt") end
	elseif event == "UNIT_SPELLCAST_START" or event == "UNIT_SPELLCAST_CHANNEL_START" then
		ns.guard("castSample", ns.castSample, event, ...)
	elseif event == "PLAYER_TOTEM_UPDATE" then
		ns.guard("totemSample", ns.totemSample, ...)
	elseif event == "ADDON_RESTRICTION_STATE_CHANGED" then
		ns.guard("restrictionChange", ns.logRestrictionChange, ...)
	end
	if event == "UNIT_SPELLCAST_SUCCEEDED" or event == "UNIT_AURA" or event == "SPELL_UPDATE_COOLDOWN" then
		ns.guard("ls:" .. event, ns.lsOnEvent, event, ...)
	end
	ns.guard("checks:" .. event, ns.checksOnEvent, event, ...)
end

--- Runs once per second: range sample while a hostile target exists, the
-- out-of-combat Lightning Shield instance refresh, and the visual refresh.
function ns.tick()
	if ns.hostileTarget() then ns.guard("rangeSample:tick", ns.rangeSample, "tick") end
	if not ns.inCombat() then ns.guard("lsRefresh:tick", ns.lsRefreshInstance, "tick", false) end
	if ns.visualIsEnabled() then ns.guard("visualTick", ns.visualTick) end
end

local ticker

--- Starts the 1s C_Timer.NewTicker (once; call at/after ADDON_LOADED).
function ns.startTicker()
	if ticker then return end
	local fn = ns.resolve("C_Timer.NewTicker")
	if type(fn) ~= "function" then
		ns.recordError("ticker", "C_Timer.NewTicker missing")
		return
	end
	local ok, res = pcall(fn, 1.0, function() ns.guard("tick", ns.tick) end)
	if ok then
		ticker = res
	else
		ns.recordError("ticker", res)
	end
end
