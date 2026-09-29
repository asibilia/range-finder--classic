-- rf-probe / core.lua
-- SavedVariables init (bound on ADDON_LOADED only, never at file scope), the
-- single event frame, snapshot scheduling, and the /rfprobe slash command.
--
-- Auto snapshots: "login" 3s after the first PLAYER_ENTERING_WORLD;
-- "combat-start" 2s after PLAYER_REGEN_DISABLED, then "combat-1".."combat-3"
-- every 4s while the fight lasts; "combat-end" 1s after PLAYER_REGEN_ENABLED;
-- "totem-<slot>" 1.5s after an in-combat PLAYER_TOTEM_UPDATE (max 3 per fight).
-- 5s after login: the "/tb" scan and the read-only CVar values; the "/tb" scan
-- runs again on PLAYER_LOGOUT (also fired by /reload).
--
-- Round 4: on ADDON_LOADED, a DB whose probeVersion is missing or < 4 is reset:
-- every key is dropped except seenAuraIDs, extraIDs, spellNames and
-- observedCooldowns; probeVersion = 4, round = 4.

local ADDON_NAME, ns = ...

local type, pairs, ipairs, pcall, tostring = type, pairs, ipairs, pcall, tostring
local isSecret = ns.isSecret

local DB_VERSION = 1
local ADDON_VERSION = "0.4.0"
local PROBE_VERSION = 4
local PROBE_ROUND = 4
local MAX_COMBAT_TICKS = 3
local MAX_TOTEM_SNAPS = 3

local frame = CreateFrame("Frame")
ns.frame = frame
ns.fightId = 0

local fight = { active = false, ticks = 0, totemSnaps = 0 }
local firstWorld = true

local LEGEND = {
	describe = "\"<nil>\" nil | \"<secret>\" secret value | \"<secret-table>\" secret table | \"<function>\" etc. non-data types",
	safeCall = "{status=\"ok\", n=<#returns>, r={described returns}} | {status=\"error\", err=} | {status=\"missing\"}",
	compact = "single return -> the value | several -> array | none -> \"<none>\" | error -> {err=} | \"<missing>\"",
	durationCall = "{obj=<described object>, hasSecretValues=, isZero=, remaining=, total=} (each compact)",
	durationLite = "{obj=<described object>, hasSecretValues=, isZero=} (each compact)",
	instanceTag = "i = false (not in an instance) | \"<instanceType>:<difficultyID>\" e.g. \"party:1\" | \"<secret>\" | \"<err>\"",
	events = "{t=GetTime, e=event, combat=InCombatLockdown, fight=fight id, a={n=, described args}}; timeline events are only counted (eventCounts)",
	timeline = "ring 800, every PLAYER_SWING + player UNIT_SPELLCAST_* + auto-attack/regen toggles: {t, k=kind, c=combat, a={n, described args},"
		.. " id=plain spellID, nm=name, i=instance (only when in one), dur=durationLite (delay only), x/tl=merged repeats (fail/failq)}."
		.. " k: swing (a=swingDuration,swingType) start ok stop int fail failq delay chstart chstop (a=unit,castGUID,spellID,[interruptedBy],castBarID)"
		.. " atkon atkoff combat+ combat-",
	shockSamples = "0.3s + 1.5s after a player shock UNIT_SPELLCAST_SUCCEEDED; see shockLegend",
	slashTB = "login/logout: matches = SLASH_* globals equal to \"/tb\", totemish = totem-ish slash strings, hash* = hash_SlashCmdList / "
		.. "hash_ChatTypeInfoList (owner key) / hash_EmoteTokenList entry for \"/TB\", isSecureCmd, slashGlobals = SLASH_* count",
	cvars = "read-only CVar values (never set)",
	rangeSamples = "ring 400; see rangeSampleLegend; values are described (true/false/\"<nil>\"/\"<secret>\"/\"<err>\"); errors aggregated in quickErrors",
	castSamples = "cast/channel starts: {t, c, e=cast|channel, i, spellID, name, info=Unit*Info compact, dur=durationCall of Unit*Duration, castSecret}",
	totemSamples = "every PLAYER_TOTEM_UPDATE: {t, combat, fight, i, slot, info=GetTotemInfo all returns (compact), timeLeft=GetTotemTimeLeft,"
		.. " dur=durationLite(GetTotemDuration), shouldSecret=C_Secrets.ShouldTotemSlotBeSecret}; non-plain slot -> slots[1..4]",
	lsSamples = "k=cast|ctr (counter change from->to)|dc (GetAuraApplicationDisplayCount -> hidden SetText, out of combat only)|id|lookup|proc-no-counter; lsStats = call counters",
	restrictionChanges = "ADDON_RESTRICTION_STATE_CHANGED {type, typeName, state, stateName, i, zone, instanceInfo, aurasSecret}",
	visualStats = "(needs /rfprobe visual) steps[name]={okCombat, okOoc, failCombat, failOoc, firstErrCombat, firstErrOoc}; observed = counters;"
		.. " mana = last plain percent/power/max (scale evidence); countdown.cvarAtBuild; countdownProbes = ring 40 {k=totem, n=slot, c, shown, visible, text,"
		.. " hideNumbers, cdShown} 1.2s after each SetCooldownFromDurationObject; lsWidget = {created, deferred, initCalls, init=parts ok/err,"
		.. " includeSpellIDs, samplesCombat/Ooc, anyShownCombat/Ooc, anySecretCombat/Ooc, samples = ring 60 {t, c, kids, shown, hidden, secret, btnShown, btnVisible}};"
		.. " shockIcons.ids = E/F/Fr spell IDs shown",
}

-- Kept across a round upgrade; everything else in RFProbeDB is dropped.
local KEEP = { seenAuraIDs = true, extraIDs = true, spellNames = true, observedCooldowns = true }

-- Tables every session expects to exist.
local TABLES = {
	"snapshots", "events", "eventCounts", "seenAuraIDs", "extraIDs", "spellNames",
	"observedCooldowns", "visualErrors", "internalErrors", "visualStats",
	"rangeSamples", "castSamples", "lsSamples", "lsStats", "restrictionChanges", "quickErrors",
	"totemSamples", "timeline", "shockSamples", "slashTB",
}

local function initDB()
	if type(RFProbeDB) ~= "table" then RFProbeDB = {} end
	local db = RFProbeDB
	local pv = db.probeVersion
	if isSecret(pv) or type(pv) ~= "number" or pv < PROBE_VERSION then
		local drop = {}
		for k in pairs(db) do
			if not KEEP[k] then drop[#drop + 1] = k end
		end
		for _, k in ipairs(drop) do db[k] = nil end
		db.sessions = 0
		db.probeVersion = PROBE_VERSION
		db.round = PROBE_ROUND
		db.roundStartedAt = date and date("%Y-%m-%d %H:%M:%S") or "?"
	end
	for _, key in ipairs(TABLES) do
		if type(db[key]) ~= "table" then db[key] = {} end
	end
	db.version = DB_VERSION
	db.addonVersion = ADDON_VERSION
	db.sessions = (type(db.sessions) == "number" and db.sessions or 0) + 1
	db.legend = LEGEND
	ns.db = db
end

local function schedule(delay, where, fn)
	ns.after(delay, where, fn)
end

--- Takes a snapshot; optionally prints ONE short summary line.
-- @param label string
-- @param announce boolean
function ns.snap(label, announce)
	local ok, summary = pcall(ns.takeSnapshot, label)
	if not ok then
		ns.recordError("snapshot:" .. label, summary)
		if announce then ns.say("snapshot '" .. label .. "' failed (see RFProbeDB.internalErrors).") end
		return
	end
	if announce and type(summary) == "table" then
		ns.say(("#%d '%s' saved (combat=%s, secrets=%d, sectionErrors=%d)"):format(
			summary.index, label, summary.combat and "yes" or "no", summary.secrets, summary.errors))
	end
end

local function startFight()
	ns.fightId = ns.fightId + 1
	local id = ns.fightId
	fight.active = true
	fight.ticks = 0
	fight.totemSnaps = 0
	ns.resetFightCounters()
	schedule(2, "combat-start", function()
		if ns.fightId ~= id or not fight.active then return end
		ns.snap("combat-start", false)
		local function tick()
			if ns.fightId ~= id or not fight.active or fight.ticks >= MAX_COMBAT_TICKS then return end
			fight.ticks = fight.ticks + 1
			ns.snap("combat-" .. fight.ticks, false)
			if fight.ticks < MAX_COMBAT_TICKS then schedule(4, "combat-tick", tick) end
		end
		schedule(4, "combat-tick", tick)
	end)
end

local function endFight()
	fight.active = false
	schedule(1, "combat-end", function() ns.snap("combat-end", false) end)
end

-- In-combat totem drop -> full snapshot 1.5s later, labelled "totem-<slot>".
local function onTotemUpdate(slot)
	if not ns.inCombat() then return end
	if fight.totemSnaps >= MAX_TOTEM_SNAPS then return end
	fight.totemSnaps = fight.totemSnaps + 1
	local plainSlot = ns.plainNumber(slot)
	local label = plainSlot and ("totem-" .. plainSlot) or "totem-?"
	schedule(1.5, "totem-snap", function() ns.snap(label, false) end)
end

local function requestRangeItems()
	if type(C_Item) ~= "table" or type(C_Item.RequestLoadItemDataByID) ~= "function" then return end
	for _, it in ipairs(ns.RANGE_ITEMS) do
		pcall(C_Item.RequestLoadItemDataByID, it.id)
	end
end

local function onAddonLoaded(name)
	if isSecret(name) or name ~= ADDON_NAME then return end
	initDB()
	pcall(frame.UnregisterEvent, frame, "ADDON_LOADED")
	ns.guard("registerProbeEvents", ns.registerProbeEvents, frame)
	pcall(frame.RegisterEvent, frame, "PLAYER_ENTERING_WORLD")
	pcall(frame.RegisterEvent, frame, "PLAYER_LOGOUT")
	requestRangeItems()
	ns.guard("startTicker", ns.startTicker)
end

local function onEvent(event, ...)
	if event == "ADDON_LOADED" then
		onAddonLoaded(...)
		return
	end
	if type(ns.db) ~= "table" then return end

	if event == "PLAYER_LOGOUT" then
		ns.guard("slashTB:logout", ns.scanSlashTB, "logout")
		return
	end

	-- state first, so the fight id on the logged REGEN_DISABLED is the new fight
	if event == "PLAYER_ENTERING_WORLD" then
		-- every zone-in (not just the first): re-arm the swing range checks now,
		-- and the full spell + swing set once the spellbook is settled
		local isInitialLogin, isReloadingUi = ...
		ns.guard("enableSwingRangeChecks", ns.enableSwingRangeChecks, "pew",
			{ isInitialLogin = ns.describe(isInitialLogin), isReloadingUi = ns.describe(isReloadingUi) })
		schedule(3, "pewRangeChecks", function() ns.enableRangeChecks("pew+3s") end)
		if firstWorld then
			firstWorld = false
			schedule(3, "login", function() ns.snap("login", false) end)
			schedule(5, "loginChecks", function()
				ns.guard("slashTB:login", ns.scanSlashTB, "login")
				ns.guard("readCVars", ns.readCVars)
			end)
		end
	elseif event == "PLAYER_REGEN_DISABLED" then
		startFight()
	elseif event == "PLAYER_REGEN_ENABLED" then
		endFight()
	elseif event == "PLAYER_TOTEM_UPDATE" then
		ns.guard("totemSnap", onTotemUpdate, ...)
	end

	if ns.isProbeEvent(event) then
		ns.guard("log:" .. event, ns.logEvent, event, ...)
	end

	ns.guard("samplers:" .. event, ns.samplersOnEvent, event, ...)

	if ns.visualIsEnabled() then
		ns.guard("visual:" .. event, ns.visualOnEvent, event, ...)
	end
end

frame:SetScript("OnEvent", function(_, event, ...)
	local ok, err = pcall(onEvent, event, ...)
	if not ok then ns.recordError("event", err) end
end)
frame:RegisterEvent("ADDON_LOADED")

-- ---------------------------------------------------------------- slash

local function count(t)
	local n = 0
	if type(t) == "table" then for _ in pairs(t) do n = n + 1 end end
	return n
end

local function len(t)
	return type(t) == "table" and #t or 0
end

local function spellNameOf(id)
	local okN, nm = pcall(C_Spell.GetSpellName, id)
	if okN and not isSecret(nm) and type(nm) == "string" then return nm end
	return nil
end

-- "/tb" scan summary for the status line (plain values only).
local function tbSummary(db)
	local rec = type(db.slashTB) == "table" and db.slashTB.login
	if type(rec) ~= "table" then return "not scanned yet" end
	local m = rec.matches
	local first = type(m) == "table" and m[1]
	if type(first) == "table" and type(first.key) == "string" then return "built-in (" .. first.key .. ")" end
	if rec.hashSlashCmdList == "function" then return "in hash_SlashCmdList" end
	return "none found"
end

local function stepOk(vs, name)
	local st = type(vs) == "table" and type(vs.steps) == "table" and vs.steps[name]
	if type(st) ~= "table" then return "-" end
	return ("%d/%d"):format(ns.plainNumber(st.okCombat) or 0, (ns.plainNumber(st.okCombat) or 0) + (ns.plainNumber(st.failCombat) or 0))
end

local function handleSlash(msg)
	local db = ns.db
	if type(db) ~= "table" then
		ns.say("not initialised yet.")
		return
	end
	if type(msg) ~= "string" then msg = "" end
	local cmd, rest = msg:match("^%s*(%S*)%s*(.-)%s*$")
	cmd = (cmd or ""):lower()
	rest = rest or ""

	if cmd == "add" then
		local id = tonumber(rest)
		if not id or id <= 0 or id ~= math.floor(id) then
			ns.say("usage: /rfprobe add <spellID>")
			return
		end
		db.extraIDs[id] = true
		local nm = spellNameOf(id)
		if nm then db.spellNames[id] = nm end
		ns.say(("added spell %d (%s); probed in every snapshot from now on."):format(id, nm or "unknown name"))
	elseif cmd == "visual" then
		ns.visualToggle()
	elseif cmd == "status" then
		ns.say(("round %d session %d | snapshots %d/30 | events %d/800 | timeline %d/800 | internalErrors %d | visualErrors %d | visual %s"):format(
			ns.plainNumber(db.round) or 0, ns.plainNumber(db.sessions) or 0, len(db.snapshots), len(db.events), len(db.timeline),
			len(db.internalErrors), len(db.visualErrors), ns.visualIsEnabled() and "on" or "off"))
		local ctr = ns.lsCounter()
		ns.say(("rangeSamples %d/400 | castSamples %d/100 | totemSamples %d/80 | lsSamples %d/60 | restrictionChanges %d | LS counter %s"):format(
			len(db.rangeSamples), len(db.castSamples), len(db.totemSamples), len(db.lsSamples), len(db.restrictionChanges),
			type(ctr) == "number" and tostring(ctr) or "-"))
		local nShock, hits = ns.shockSummary()
		local legend = type(db.shockLegend) == "table" and db.shockLegend.shockIDs
		ns.say(("shockSamples %d/80 (shock IDs %d, samples with another family on cooldown %d) | /tb: %s"):format(
			nShock, len(legend), hits, tbSummary(db)))
		local vs = db.visualStats
		local w = type(vs) == "table" and type(vs.lsWidget) == "table" and vs.lsWidget or {}
		ns.say(("in combat ok/tried: mana SetValue %s, mana# SetText %s, bar colour %s | totem swirl %s | LS widget %s (init %d, shown in combat %d) | countdown probes %d"):format(
			stepOk(vs, "manaSetValue"), stepOk(vs, "manaSetTextNumber"), stepOk(vs, "manaBarSetColorFromCurve"),
			stepOk(vs, "totemSetCooldownFromDurationObject"), ns.visualLSState(), ns.plainNumber(w.initCalls) or 0,
			ns.plainNumber(w.anyShownCombat) or 0,
			len(type(vs) == "table" and vs.countdownProbes or nil)))
	elseif cmd == "clear" then
		for _, key in ipairs(TABLES) do
			if not KEEP[key] then db[key] = {} end
		end
		db.apis = nil
		db.shockLegend = nil
		db.cvars = nil
		ns.apisDone = false
		ns.resetFightCounters()
		ns.lsReset()
		ns.say("cleared snapshots, events, samples, counters and error logs (kept extraIDs, seenAuraIDs, spellNames, observedCooldowns).")
	elseif cmd == "help" then
		ns.say("/rfprobe [label] snapshot | add <spellID> | visual | status | clear")
	else
		local label = msg:match("^%s*(.-)%s*$") or ""
		if label == "" then label = "manual" end
		ns.snap(label:sub(1, 40), true)
	end
end

SLASH_RFPROBE1 = "/rfprobe"
SlashCmdList["RFPROBE"] = function(msg)
	local ok, err = pcall(handleSlash, msg)
	if not ok then
		ns.recordError("slash", err)
		ns.say("command failed (logged to RFProbeDB.internalErrors).")
	end
end
