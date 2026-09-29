-- rf-probe / snapshot.lua
-- Builds one snapshot table of "what can an addon read right now" and appends it
-- to RFProbeDB.snapshots. Every section is built inside its own pcall so one
-- failure cannot take the rest down. Every stored value passes through
-- ns.describe (or is a literal / own plain counter).

local ADDON_NAME, ns = ...

local type, pairs, ipairs, pcall = type, pairs, ipairs, pcall
local isSecret, isSecretTable = ns.isSecret, ns.isSecretTable
local describe, safeCall, compact = ns.describe, ns.safeCall, ns.compact

local MAX_SNAPSHOTS = 30
local MAX_BOOK_SPELLS = 60     -- non-passive spellbook spells probed per snapshot (round 4: 40 -> 60)
local MAX_AURA_SPELLS = 20     -- seen aura spell IDs probed per snapshot
local MAX_AURAS = 40

-- Seed spell IDs. Forever uses vanilla spell IDs (SealTimersForever ships
-- 21084 Seal of Righteousness etc.). Unknown IDs just come back as "<nil>" names.
ns.ALWAYS_PROBE = {
	[75] = "Auto Shot",
	[61304] = "Global Cooldown",
	[6603] = "Attack",
}
ns.SEED_IDS = {
	-- Hunter (rank 1)
	75, 2973, 2974, 3044, 1978, 1130, 5116, 13165, 13163, 2643, 3045, 19434, 1495, 5384, 1499, 20736,
	-- Shaman (rank 1)
	403, 8042, 8050, 8056, 8017, 8024, 8232, 324, 3599, 8071, 8075, 331, 17364, 5394,
	-- Paladin seals / judgement (from SealTimersForever)
	21084, 20165, 20271,
	-- misc
	61304, 6603, 5019,
}

-- Hostile-target range probe items from LibRangeCheck-3.0 (Era HarmItems table).
ns.RANGE_ITEMS = {
	{ id = 8149, yd = 5 },    -- Voodoo Charm
	{ id = 17626, yd = 10 },  -- Frostwolf Muzzle
	{ id = 10645, yd = 20 },  -- Gnomish Death Ray
	{ id = 13289, yd = 25 },  -- Egan's Blaster
	{ id = 835, yd = 30 },    -- Large Rope Net
	{ id = 18904, yd = 35 },  -- Zorbin's Ultra-Shrinker
	{ id = 4945, yd = 40 },   -- Faintly Glowing Skull
}

ns.API_PATHS = {
	"C_Spell.GetSpellCooldown", "C_Spell.GetSpellCooldownDuration", "C_Spell.GetSpellChargeDuration",
	"C_Spell.GetSpellCharges", "C_Spell.IsSpellInRange", "C_Spell.EnableSpellRangeCheck",
	"C_Spell.SpellHasRange", "C_Spell.IsSpellUsable", "C_Spell.GetSpellInfo", "C_Spell.GetSpellName",
	"C_UnitAuras.GetAuraDataByIndex", "C_UnitAuras.GetPlayerAuraBySpellID", "C_UnitAuras.GetUnitAuraBySpellID",
	"C_UnitAuras.GetAuraDuration", "C_UnitAuras.GetAuraApplicationDisplayCount", "C_UnitAuras.GetUnitAuraInstanceIDs",
	"GetTotemInfo", "GetTotemDuration", "GetTotemTimeLeft",
	"GetWeaponEnchantInfo", "C_Item.GetWeaponEnchantInfo", "C_PaperDollInfo.GetTemporaryEnchantmentInfo",
	"UnitPower", "UnitPowerMax", "UnitPowerPercent", "UnitHealth", "UnitHealthMax", "UnitHealthPercent",
	"UnitAttackSpeed", "UnitRangedDamage", "CheckInteractDistance", "C_Item.IsItemInRange",
	"UnitCastingInfo", "UnitCastingDuration", "UnitChannelInfo", "UnitChannelDuration",
	"GetInstanceInfo", "IsInInstance", "C_Timer.NewTicker",
	"C_SwingTimer", "C_SwingTimer.IsTargetWithinSwingRange", "C_SwingTimer.EnableRangeCheck",
	"C_AssistedCombat", "C_AssistedCombat.IsAvailable", "C_CooldownViewer", "C_CooldownViewer.IsCooldownViewerAvailable",
	"C_DurationUtil.CreateDuration", "C_DurationUtil.CreateDurationTextBinding",
	"C_CurveUtil.CreateCurve", "C_CurveUtil.CreateColorCurve",
	"C_RestrictedActions.IsAddOnRestrictionActive", "C_RestrictedActions.GetAddOnRestrictionState",
	"C_Secrets", "C_Secrets.HasSecretRestrictions", "C_EventUtils.IsEventValid", "C_CombatLog.IsCombatLogRestricted",
	"CombatLogGetCurrentEventInfo", "IsSpellInRange", "GetSpellInfo", "UnitAura",
	"C_SpellBook.GetNumSpellBookSkillLines", "C_SpellBook.GetSpellBookItemInfo", "C_SpellBook.IsSpellInSpellBook",
	"C_Timer.After", "issecretvalue", "issecrettable", "canaccessvalue", "canaccesstable", "hasanysecretvalues",
	"scrubsecretvalues", "secretwrap",
	-- round 4
	"C_Secrets.ShouldAurasBeSecret", "C_CurveUtil.EvaluateColorFromBoolean", "C_CVar.GetCVar", "CreateFont", "CreateColor",
	"hash_SlashCmdList", "hash_ChatTypeInfoList", "hash_EmoteTokenList", "SlashCmdList", "IsSecureCmd",
	"C_AuraContainerUtil", "AuraContainerUtil", "STANDARD_TEXT_FONT",
}

-- widget type -> methods whose existence we record
local WIDGET_METHODS = {
	Frame = { "SetAlphaFromBoolean" },
	Texture = { "SetAlphaFromBoolean", "SetVertexColorFromBoolean" },
	FontString = { "SetAlphaFromBoolean", "SetVertexColorFromBoolean", "SetTextColor" },
	Cooldown = { "SetCooldownFromDurationObject", "SetCooldownDuration", "SetAlphaFromBoolean", "Clear",
		"SetHideCountdownNumbers", "SetCountdownFont", "GetCountdownFontString", "SetCountdownAbbrevThreshold" },
	StatusBar = { "SetTimerDuration", "SetAlphaFromBoolean", "SetStatusBarColor", "GetStatusBarTexture" },
}

local function playerBank()
	local bank = Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player
	if isSecret(bank) or type(bank) ~= "number" then return 0 end
	return bank
end

local function targetExists()
	local ok, v = pcall(UnitExists, "target")
	return ok and ns.plainTrue(v)
end

--- Walks the player's spellbook. Returns an array of {id, name, passive}.
-- @return table
function ns.readSpellbook()
	local out = {}
	local book = C_SpellBook
	if type(book) ~= "table" or type(book.GetNumSpellBookSkillLines) ~= "function" then return out end
	local bank = playerBank()
	local okN, numLines = pcall(book.GetNumSpellBookSkillLines)
	numLines = okN and ns.plainNumber(numLines) or 0
	for line = 1, numLines do
		local okL, info = pcall(book.GetSpellBookSkillLineInfo, line)
		if okL and type(info) == "table" and not isSecretTable(info) then
			local offset = ns.plainNumber(info.itemIndexOffset)
			local count = ns.plainNumber(info.numSpellBookItems)
			if offset and count then
				for slot = offset + 1, offset + count do
					local okI, item = pcall(book.GetSpellBookItemInfo, slot, bank)
					if okI and type(item) == "table" and not isSecretTable(item) then
						local id = ns.plainNumber(item.spellID)
						if id then
							local name = item.name
							if isSecret(name) or type(name) ~= "string" then name = nil end
							out[#out + 1] = { id = id, name = name, passive = ns.plainTrue(item.isPassive) }
						end
					end
				end
			end
		end
	end
	return out
end

local function spellName(id)
	local okN, name = pcall(C_Spell.GetSpellName, id)
	if okN and not isSecret(name) and type(name) == "string" then return name end
	return nil
end

local function isInBook(id)
	if type(C_SpellBook) ~= "table" or type(C_SpellBook.IsSpellInSpellBook) ~= "function" then return false end
	local ok, v = pcall(C_SpellBook.IsSpellInSpellBook, id, playerBank())
	return ok and ns.plainTrue(v)
end
ns.isInBook = isInBook

-- Builds the ordered list of spell IDs to probe this snapshot.
local function buildSpellList(db, book)
	local list, index = {}, {}
	local function add(id, src, probe)
		if isSecret(id) or type(id) ~= "number" then return end
		local e = index[id]
		if e then
			if probe then e.probe = true end
			return
		end
		e = { id = id, src = src, probe = probe }
		index[id] = e
		list[#list + 1] = e
	end
	local active = 0
	for _, s in ipairs(book) do
		if s.passive then
			add(s.id, "book-passive", false)
		else
			active = active + 1
			add(s.id, "book", active <= MAX_BOOK_SPELLS)
		end
	end
	for _, id in ipairs(ns.SEED_IDS) do
		add(id, "seed", ns.ALWAYS_PROBE[id] ~= nil or isInBook(id))
	end
	local n = 0
	for id in pairs(db.seenAuraIDs) do
		n = n + 1
		add(id, "aura", n <= MAX_AURA_SPELLS)
	end
	for id in pairs(db.extraIDs) do
		add(id, "extra", true)
	end
	return list
end

-- Calls an API that returns a LuaDurationObject; describes the object and
-- pcalls HasSecretValues / IsZero on it. Second return: the object itself,
-- only when it is a non-secret table/userdata (for further method calls; never stored).
local function durationProbe(path, ...)
	local fn = ns.resolve(path)
	if type(fn) ~= "function" then return "<missing>", nil end
	local ok, obj = pcall(fn, ...)
	if not ok then return { err = ns.errString(obj) }, nil end
	local out = { obj = describe(obj) }
	if isSecret(obj) then return out, nil end
	local t = type(obj)
	if t ~= "table" and t ~= "userdata" then return out, nil end
	out.hasSecretValues = compact(ns.callMethod(obj, "HasSecretValues"))
	out.isZero = compact(ns.callMethod(obj, "IsZero"))
	return out, obj
end

--- Round-3 lightweight form: duration object described + HasSecretValues + IsZero.
-- @param path string
-- @return any  "<missing>" | {err=} | {obj=, hasSecretValues=, isZero=}
function ns.durationLite(path, ...)
	return (durationProbe(path, ...))
end

--- Calls an API that returns a LuaDurationObject, describes the object and
-- pokes its read methods (each pcall'd, results described).
-- @param path string
-- @return any  "<missing>" | {err=} | {obj=, hasSecretValues=, isZero=, remaining=, total=}
local function durationCall(path, ...)
	local out, obj = durationProbe(path, ...)
	if obj ~= nil then
		out.remaining = compact(ns.callMethod(obj, "GetRemainingDuration"))
		out.total = compact(ns.callMethod(obj, "GetTotalDuration"))
	end
	return out
end
ns.durationCall = durationCall

-- Records a real (non-GCD) cooldown seen out of the secret gate, for the visual picker.
local function noteObservedCooldown(db, id)
	local ok, info = pcall(C_Spell.GetSpellCooldown, id)
	if not ok or isSecret(info) or type(info) ~= "table" or isSecretTable(info) then return end
	local dur = ns.plainNumber(info.duration)
	local onGCD = info.isOnGCD
	if isSecret(onGCD) then return end
	if dur and dur > 1.6 and not onGCD then
		db.observedCooldowns[id] = dur
	end
end

local function probeSpell(db, id, hasTarget)
	local s = {}
	s.cd = compact(safeCall("C_Spell.GetSpellCooldown", id))
	s.cdDur = durationCall("C_Spell.GetSpellCooldownDuration", id)
	s.charges = compact(safeCall("C_Spell.GetSpellCharges", id))
	s.usable = compact(safeCall("C_Spell.IsSpellUsable", id))
	s.hasRange = compact(safeCall("C_Spell.SpellHasRange", id))
	if hasTarget then
		s.inRange = compact(safeCall("C_Spell.IsSpellInRange", id, "target"))
	end
	s.cdSecrecy = compact(safeCall("C_Secrets.GetSpellCooldownSecrecy", id))
	s.cdSecretNow = compact(safeCall("C_Secrets.ShouldSpellCooldownBeSecret", id))
	s.auraSecrecy = compact(safeCall("C_Secrets.GetSpellAuraSecrecy", id))
	s.totemSecret = compact(safeCall("C_Secrets.ShouldTotemSpellBeSecret", id))
	noteObservedCooldown(db, id)
	return s
end

local function buildSpells(db, snap)
	local book = ns.readSpellbook()
	local hasTarget = targetExists()
	for _, s in ipairs(book) do
		if s.name and not db.spellNames[s.id] then db.spellNames[s.id] = s.name end
	end
	local list = buildSpellList(db, book)
	local out, skipped = {}, {}
	for _, e in ipairs(list) do
		if not db.spellNames[e.id] then
			local nm = spellName(e.id)
			if nm then
				db.spellNames[e.id] = nm
			elseif not ns.inCombat() then
				db.spellNames[e.id] = "<nil>"
			end
		end
		if e.probe then
			local rec = probeSpell(db, e.id, hasTarget)
			rec.src = e.src
			rec.name = db.spellNames[e.id]
			out[e.id] = rec
		else
			skipped[#skipped + 1] = e.id
		end
	end
	snap.spells = out
	snap.spellsNotProbed = skipped
	snap.spellbookCount = #book
end

-- Reads unit auras by index; returns entries, and collects plain spell IDs.
local function readAuras(db, unit, filter)
	local entries, instanceIDs = {}, {}
	local fn = ns.resolve("C_UnitAuras.GetAuraDataByIndex")
	if type(fn) ~= "function" then return "<missing>", instanceIDs end
	for i = 1, MAX_AURAS do
		local ok, aura = pcall(fn, unit, i, filter)
		if not ok then
			entries[#entries + 1] = { i = i, err = ns.errString(aura) }
			break
		end
		if isSecret(aura) then
			ns.secretCount = ns.secretCount + 1
			entries[#entries + 1] = { i = i, secret = true }
			break
		end
		if type(aura) == "nil" then break end
		entries[#entries + 1] = { i = i, data = describe(aura) }
		if type(aura) == "table" and not isSecretTable(aura) then
			local okF, sid, inst = pcall(function() return aura.spellId, aura.auraInstanceID end)
			if okF then
				local plainId = ns.plainNumber(sid)
				if plainId then db.seenAuraIDs[plainId] = true end
				local plainInst = ns.plainNumber(inst)
				if plainInst then instanceIDs[#instanceIDs + 1] = plainInst end
			end
		end
	end
	return entries, instanceIDs
end

local function buildAuras(db, snap)
	local a = {}
	local playerInst
	a.player, playerInst = readAuras(db, "player", "HELPFUL")
	a.playerInstanceIDs = compact(safeCall("C_UnitAuras.GetUnitAuraInstanceIDs", "player", "HELPFUL"))
	a.playerAuraDurations = {}
	for i = 1, math.min(3, #playerInst) do
		a.playerAuraDurations[i] = durationCall("C_UnitAuras.GetAuraDuration", "player", playerInst[i])
	end
	if targetExists() then
		a.target = readAuras(db, "target", "HARMFUL")
		a.targetInstanceIDs = compact(safeCall("C_UnitAuras.GetUnitAuraInstanceIDs", "target", "HARMFUL"))
	end
	-- Lookup-by-spellID for auras seen earlier (the in-combat question).
	local bySpell, n = {}, 0
	for id in pairs(db.seenAuraIDs) do
		n = n + 1
		if n > 10 then break end
		bySpell[id] = compact(safeCall("C_UnitAuras.GetPlayerAuraBySpellID", id))
	end
	a.playerBySpellID = bySpell
	snap.auras = a
end

-- duration = GetTotemDuration(slot) described + HasSecretValues/IsZero/
-- GetRemainingDuration/GetTotalDuration on the object (see durationCall).
local function buildTotems(snap)
	local t = {}
	for slot = 1, 4 do
		t[slot] = {
			info = compact(safeCall("GetTotemInfo", slot)),
			timeLeft = compact(safeCall("GetTotemTimeLeft", slot)),
			duration = durationCall("GetTotemDuration", slot),
			slotSecret = compact(safeCall("C_Secrets.ShouldTotemSlotBeSecret", slot)),
		}
	end
	snap.totems = t
end

local function buildWeapon(snap)
	local w = {}
	w.globalGetWeaponEnchantInfo = compact(safeCall("GetWeaponEnchantInfo"))
	local slots = Enum and Enum.WeaponSlot
	if type(slots) == "table" and not isSecretTable(slots) then
		w.itemWeaponEnchant = {}
		for key, val in pairs(slots) do
			if type(key) == "string" and not isSecret(val) then
				w.itemWeaponEnchant[key] = compact(safeCall("C_Item.GetWeaponEnchantInfo", val))
			end
		end
	else
		w.itemWeaponEnchant = "<no Enum.WeaponSlot>"
	end
	w.tempEnchant = {
		mainHand = compact(safeCall("C_PaperDollInfo.GetTemporaryEnchantmentInfo", INVSLOT_MAINHAND or 16)),
		offHand = compact(safeCall("C_PaperDollInfo.GetTemporaryEnchantmentInfo", INVSLOT_OFFHAND or 17)),
		ranged = compact(safeCall("C_PaperDollInfo.GetTemporaryEnchantmentInfo", INVSLOT_RANGED or 18)),
	}
	snap.weapon = w
end

local function manaType()
	local m = Enum and Enum.PowerType and Enum.PowerType.Mana
	if isSecret(m) or type(m) ~= "number" then return 0 end
	return m
end

local function buildResources(snap)
	local r = {}
	local mana = manaType()
	r.powerType = compact(safeCall("UnitPowerType", "player"))
	r.mana = compact(safeCall("UnitPower", "player", mana))
	r.manaMax = compact(safeCall("UnitPowerMax", "player", mana))
	r.power = compact(safeCall("UnitPower", "player"))
	r.powerMax = compact(safeCall("UnitPowerMax", "player"))
	r.powerPercent = compact(safeCall("UnitPowerPercent", "player"))
	r.health = compact(safeCall("UnitHealth", "player"))
	r.healthMax = compact(safeCall("UnitHealthMax", "player"))
	r.attackSpeed = compact(safeCall("UnitAttackSpeed", "player"))
	r.rangedDamage = compact(safeCall("UnitRangedDamage", "player"))
	r.castingInfo = compact(safeCall("UnitCastingInfo", "player"))
	r.castingDuration = durationCall("UnitCastingDuration", "player")
	if targetExists() then
		r.targetHealth = compact(safeCall("UnitHealth", "target"))
		r.targetHealthMax = compact(safeCall("UnitHealthMax", "target"))
		r.targetPower = compact(safeCall("UnitPower", "target"))
	end
	snap.resources = r
end

local function buildRange(snap)
	if not targetExists() then return end
	local r = {}
	local combat = ns.inCombat()
	local okA, canAttack = pcall(UnitCanAttack, "player", "target")
	local hostile = okA and ns.plainTrue(canAttack)
	r.hostile = okA and describe(canAttack) or "<error>"
	-- Retail protects these two in combat for non-attackable units; never trigger a block.
	local allowed = (not combat) or hostile
	if allowed then
		r.interact = {}
		for i = 1, 5 do r.interact[i] = compact(safeCall("CheckInteractDistance", "target", i)) end
		r.items = {}
		for _, it in ipairs(ns.RANGE_ITEMS) do
			r.items[#r.items + 1] = { id = it.id, yd = it.yd, v = compact(safeCall("C_Item.IsItemInRange", it.id, "target")) }
		end
	else
		r.interact = "<skipped: combat + non-hostile target>"
		r.items = "<skipped: combat + non-hostile target>"
	end
	local swing = {}
	local st = C_SwingTimer
	if type(st) == "table" and not isSecretTable(st) then
		local names = {}
		for name, fn in pairs(st) do
			if type(name) == "string" and type(fn) == "function" then names[#names + 1] = name end
		end
		table.sort(names)
		swing.functions = names
		local types = (Enum and type(Enum.PlayerSwingType) == "table") and Enum.PlayerSwingType or { MainHand = 0, OffHand = 1, Ranged = 2 }
		swing.withinRange = {}
		for key, val in pairs(types) do
			if type(key) == "string" and not isSecret(val) then
				swing.withinRange[key] = compact(safeCall("C_SwingTimer.IsTargetWithinSwingRange", val))
			end
		end
		-- zero-arg read-only getters (Is*/Get*/Has*), if any other exist on this build
		swing.zeroArg = {}
		for _, name in ipairs(names) do
			if name ~= "IsTargetWithinSwingRange" and (name:find("^Is") or name:find("^Get") or name:find("^Has")) then
				swing.zeroArg[name] = compact(ns.callFn(st[name]))
			end
		end
	else
		swing = "<missing>"
	end
	r.swingTimer = swing
	snap.range = r
end

local function buildCooldownManager(snap, firstOfSession)
	local c = {}
	c.assistedAvailable = compact(safeCall("C_AssistedCombat.IsAvailable"))
	c.assistedRotation = compact(safeCall("C_AssistedCombat.GetRotationSpells"))
	c.assistedActionSpell = compact(safeCall("C_AssistedCombat.GetActionSpell"))
	c.assistedNextCast = compact(safeCall("C_AssistedCombat.GetNextCastSpell", false))
	c.cdViewerAvailable = compact(safeCall("C_CooldownViewer.IsCooldownViewerAvailable"))
	if firstOfSession then
		local cats = Enum and Enum.CooldownViewerCategory
		if type(cats) == "table" and not isSecretTable(cats) then
			c.categorySets = {}
			for key, val in pairs(cats) do
				if type(key) == "string" and not isSecret(val) then
					c.categorySets[key] = compact(safeCall("C_CooldownViewer.GetCooldownViewerCategorySet", val))
				end
			end
		end
	end
	snap.cooldownManager = c
end

local function unitArgCalls()
	local mana = manaType()
	return {
		{ "ShouldUnitPowerBeSecret(player)", "C_Secrets.ShouldUnitPowerBeSecret", "player" },
		{ "ShouldUnitPowerBeSecret(player,mana)", "C_Secrets.ShouldUnitPowerBeSecret", "player", mana },
		{ "ShouldUnitPowerMaxBeSecret(player)", "C_Secrets.ShouldUnitPowerMaxBeSecret", "player" },
		{ "ShouldUnitHealthMaxBeSecret(player)", "C_Secrets.ShouldUnitHealthMaxBeSecret", "player" },
		{ "ShouldUnitIdentityBeSecret(player)", "C_Secrets.ShouldUnitIdentityBeSecret", "player" },
		{ "ShouldUnitSpellCastingBeSecret(player)", "C_Secrets.ShouldUnitSpellCastingBeSecret", "player" },
		{ "ShouldActionCooldownBeSecret(1)", "C_Secrets.ShouldActionCooldownBeSecret", 1 },
		{ "ShouldUnitAuraIndexBeSecret(player,1,HELPFUL)", "C_Secrets.ShouldUnitAuraIndexBeSecret", "player", 1, "HELPFUL" },
		{ "ShouldUnitPowerBeSecret(target)", "C_Secrets.ShouldUnitPowerBeSecret", "target" },
		{ "ShouldUnitHealthMaxBeSecret(target)", "C_Secrets.ShouldUnitHealthMaxBeSecret", "target" },
		{ "ShouldUnitIdentityBeSecret(target)", "C_Secrets.ShouldUnitIdentityBeSecret", "target" },
		{ "ShouldUnitSpellCastingBeSecret(target)", "C_Secrets.ShouldUnitSpellCastingBeSecret", "target" },
		{ "ShouldUnitAuraIndexBeSecret(target,1,HARMFUL)", "C_Secrets.ShouldUnitAuraIndexBeSecret", "target", 1, "HARMFUL" },
		{ "ShouldUnitThreatStateBeSecret(player,target)", "C_Secrets.ShouldUnitThreatStateBeSecret", "player", "target" },
		{ "ShouldUnitThreatValuesBeSecret(player,target)", "C_Secrets.ShouldUnitThreatValuesBeSecret", "player", "target" },
		{ "ShouldUnitComparisonBeSecret(player,target)", "C_Secrets.ShouldUnitComparisonBeSecret", "player", "target" },
		{ "CanCompareUnitTokens(player,target)", "C_Secrets.CanCompareUnitTokens", "player", "target" },
		{ "GetPowerTypeSecrecy(mana)", "C_Secrets.GetPowerTypeSecrecy", mana },
	}
end

local function buildRestrictions(snap)
	local r = {}
	r.hasSecretRestrictions = compact(safeCall("C_Secrets.HasSecretRestrictions"))
	r.combatLogRestricted = compact(safeCall("C_CombatLog.IsCombatLogRestricted"))
	local types = Enum and Enum.AddOnRestrictionType
	if type(types) == "table" and not isSecretTable(types) then
		r.addOnRestriction = {}
		for key, val in pairs(types) do
			if type(key) == "string" and not isSecret(val) then
				r.addOnRestriction[key] = {
					active = compact(safeCall("C_RestrictedActions.IsAddOnRestrictionActive", val)),
					state = compact(safeCall("C_RestrictedActions.GetAddOnRestrictionState", val)),
				}
			end
		end
	else
		r.addOnRestriction = "<no Enum.AddOnRestrictionType>"
	end
	-- Every C_Secrets.Should* called with no args (arg-taking ones will error; that is recorded).
	local secrets = C_Secrets
	if type(secrets) == "table" and not isSecretTable(secrets) then
		r.shouldNoArgs = {}
		for name, fn in pairs(secrets) do
			if type(name) == "string" and name:sub(1, 6) == "Should" and type(fn) == "function" then
				r.shouldNoArgs[name] = compact(ns.callFn(fn))
			end
		end
		r.withArgs = {}
		for _, c in ipairs(unitArgCalls()) do
			r.withArgs[c[1]] = compact(safeCall(c[2], select(3, unpack(c))))
		end
		r.totemSlotSecret = {}
		for slot = 1, 4 do
			r.totemSlotSecret[slot] = compact(safeCall("C_Secrets.ShouldTotemSlotBeSecret", slot))
		end
		local okP, pt = pcall(UnitPowerType, "player")
		local plainPt = okP and ns.plainNumber(pt)
		if plainPt then
			r.primaryPowerSecrecy = compact(safeCall("C_Secrets.GetPowerTypeSecrecy", plainPt))
		end
	else
		r.cSecrets = "<missing>"
	end
	snap.restrictions = r
end

local function buildMeta(snap, label)
	local m = {}
	m.label = label
	m.session = ns.db.sessions
	m.time = describe(GetTime())
	m.date = describe(date("%H:%M:%S"))
	m.build = safeCall("GetBuildInfo").r
	m.projectId = describe(WOW_PROJECT_ID)
	m.class = compact(safeCall("UnitClass", "player"))
	m.level = compact(safeCall("UnitLevel", "player"))
	m.inCombatLockdown = compact(safeCall("InCombatLockdown"))
	m.affectingCombat = compact(safeCall("UnitAffectingCombat", "player"))
	m.inInstance = compact(safeCall("IsInInstance"))
	m.instanceInfo = compact(safeCall("GetInstanceInfo"))
	m.instanceTag = ns.instanceTag()
	m.aurasSecret = compact(safeCall("C_Secrets.ShouldAurasBeSecret"))
	m.round = ns.db.round
	m.zone = compact(safeCall("GetZoneText"))
	m.realZone = compact(safeCall("GetRealZoneText"))
	m.targetExists = compact(safeCall("UnitExists", "target"))
	if targetExists() then
		m.targetCanAttack = compact(safeCall("UnitCanAttack", "player", "target"))
		m.targetIsDead = compact(safeCall("UnitIsDead", "target"))
		m.targetLevel = compact(safeCall("UnitLevel", "target"))
		local okN, name = pcall(UnitName, "target")
		if okN and not isSecret(name) and type(name) == "string" then
			m.targetName = name
		else
			m.targetName = okN and "<secret-or-nil>" or "<error>"
		end
	end
	snap.meta = m
end

local function probeWidgets()
	local out = {}
	local okF, frame = pcall(CreateFrame, "Frame")
	if not okF then return { err = ns.errString(frame) } end
	local makers = {
		Frame = function() return frame end,
		Texture = function() return frame:CreateTexture() end,
		FontString = function() return frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall") end,
		Cooldown = function() return CreateFrame("Cooldown", nil, frame, "CooldownFrameTemplate") end,
		StatusBar = function() return CreateFrame("StatusBar", nil, frame) end,
	}
	for widget, methods in pairs(WIDGET_METHODS) do
		local okW, obj = pcall(makers[widget])
		if not okW then
			out[widget] = { err = ns.errString(obj) }
		else
			local r = {}
			for _, method in ipairs(methods) do
				local okM, m = pcall(function() return obj[method] end)
				r[method] = okM and type(m) == "function"
			end
			out[widget] = r
		end
	end
	pcall(frame.Hide, frame)
	return out
end

--- Once-per-session existence map for every API we care about + widget methods.
-- @return table
function ns.buildApiMap()
	local map = {}
	for _, path in ipairs(ns.API_PATHS) do map[path] = ns.kind(path) end
	return { paths = map, widgets = probeWidgets() }
end

local SECTIONS = {
	{ "meta", function(snap, label) buildMeta(snap, label) end },
	{ "restrictions", function(snap) buildRestrictions(snap) end },
	{ "spells", function(snap) buildSpells(ns.db, snap) end },
	{ "auras", function(snap) buildAuras(ns.db, snap) end },
	{ "totems", function(snap) buildTotems(snap) end },
	{ "weapon", function(snap) buildWeapon(snap) end },
	{ "resources", function(snap) buildResources(snap) end },
	{ "range", function(snap) buildRange(snap) end },
}

--- Takes a snapshot and appends it to RFProbeDB.snapshots (cap 30).
-- @param label string
-- @return table|nil  small plain summary {index, secrets, spells, errors, combat}
function ns.takeSnapshot(label)
	local db = ns.db
	if type(db) ~= "table" then return nil end
	ns.secretCount = 0
	local snap = { sectionErrors = {} }
	local firstOfSession = not ns.apisDone
	if firstOfSession then
		ns.apisDone = true
		local okA, apis = pcall(ns.buildApiMap)
		if okA then
			snap.apis = apis
			db.apis = { session = db.sessions, map = apis }
		else
			snap.sectionErrors.apis = ns.errString(apis)
		end
	end
	for _, sec in ipairs(SECTIONS) do
		local ok, err = pcall(sec[2], snap, label)
		if not ok then snap.sectionErrors[sec[1]] = ns.errString(err) end
	end
	local okC, errC = pcall(buildCooldownManager, snap, firstOfSession)
	if not okC then snap.sectionErrors.cooldownManager = ns.errString(errC) end
	snap.secretsSeen = ns.secretCount
	ns.pushCapped(db.snapshots, snap, MAX_SNAPSHOTS)
	local spellCount, errCount = 0, 0
	if type(snap.spells) == "table" then for _ in pairs(snap.spells) do spellCount = spellCount + 1 end end
	for _ in pairs(snap.sectionErrors) do errCount = errCount + 1 end
	return {
		index = #db.snapshots,
		secrets = snap.secretsSeen,
		spells = spellCount,
		errors = errCount,
		combat = ns.inCombat(),
	}
end
