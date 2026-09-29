-- rf-probe / visual.lua
-- Off by default; /rfprobe visual toggles a compact, movable test frame. It
-- checks "display-only" techniques in combat: values that may be secret are
-- handed straight to Blizzard widget setters without being inspected.
--
-- Round 4 elements (tiny labels on the left so the player can report them):
--   mana#        StatusBar SetMinMaxValues(UnitPowerMax) / SetValue(UnitPower),
--                FontString:SetText(UnitPower) (secret straight in), and low-mana
--                colour from Step curves through UnitPowerPercent(unit, powerType,
--                unmodified, curve):
--                  bar  -> three scalar curves (r, g, b) -> StatusBar:SetStatusBarColor
--                  text -> one colour curve (C_CurveUtil.CreateColorCurve) -> ColorMixin
--                          -> FontString:SetTextColor(color:GetRGBA())
--                  LOW  -> scalar alpha curve -> FontString:SetAlpha
--                Points: 0 -> red, 0.2 -> normal, 1.5 -> purple. Purple can only
--                appear if the percent is on a 0..100 scale (scale check).
--   totem#       4 Cooldowns: GetTotemDuration(slot) -> SetCooldownFromDurationObject,
--                built-in countdown numbers via SetHideCountdownNumbers(false) +
--                SetCountdownFont (no CVar is changed; countdownForCooldowns is
--                only read, see RFProbeDB.cvars). 1.2s after each set, the countdown
--                FontString's IsShown/GetText are described into visualStats.countdownProbes.
--   LS widget    Blizzard's AuraContainer + CustomAuraContainerTemplate, one aura
--                slot filtered to the Lightning Shield ranks. Blizzard's untainted
--                code fills our icon, duration Cooldown, application count, charge
--                bar and duration text. Created out of combat only (deferred).
--                Populated? -> visualStats.lsWidget.samples (child frames shown /
--                hidden / secret, counted without reading secrets).
--   E/F/Fr shock three icons (highest known Earth/Flame/Frost rank), each with its
--                own Cooldown from C_Spell.GetSpellCooldownDuration. A plain
--                isOnGCD == true clears the swirl, so a swirl means a real cooldown.
--   swing        PLAYER_SWING bar (plain swingDuration drives an OnUpdate).
-- Every step is pcall'd. Per-step counts (ok/fail x combat/ooc + first error
-- string of each) -> RFProbeDB.visualStats.steps; what was secret ->
-- visualStats.observed; failures -> RFProbeDB.visualErrors (cap 50, max 3 per step+mode).

local ADDON_NAME, ns = ...

local type, pcall, ipairs, pairs, tostring = type, pcall, ipairs, pairs, tostring
local isSecret, isSecretTable = ns.isSecret, ns.isSecretTable

local V = { enabled = false, built = false }
local L = { container = nil, button = nil, failed = nil, deferred = false, lastSig = nil, lastLogT = 0 }

local FALLBACK_ICON = "Interface\\Icons\\INV_Misc_QuestionMark"
local BAR_TEXTURE = "Interface\\TargetingFrame\\UI-StatusBar"
local FRAME_W, FRAME_H = 290, 188
local COL_X = 76        -- x of the element column; labels sit left of it
local BAR_W = 150
local LS_SIZE = 32
local COUNTDOWN_FONT = "RFProbeCountdownFont"
local SWING_NAMES = { [0] = "MH", [1] = "OH", [2] = "Ranged" }

local MANA_BLUE = { 0.2, 0.45, 1 }
local MANA_RED = { 1, 0.15, 0.15 }
local MANA_PURPLE = { 0.75, 0.3, 1 }
local LOW_AT = 0.2
local SCALE_PROBE_AT = 1.5

-- ------------------------------------------------------------ stats

local function stats()
	local db = ns.db
	if type(db.visualStats) ~= "table" then db.visualStats = {} end
	local vs = db.visualStats
	if type(vs.steps) ~= "table" then vs.steps = {} end
	if type(vs.observed) ~= "table" then vs.observed = {} end
	return vs
end

local function section(key)
	local vs = stats()
	if type(vs[key]) ~= "table" then vs[key] = {} end
	return vs[key]
end

local function observe(key)
	ns.bump(stats().observed, key)
end

--- Runs one pcall'd visual step and records the outcome in
-- visualStats.steps[name] = {okCombat, okOoc, failCombat, failOoc, firstErrCombat, firstErrOoc}.
-- @param name string
-- @param fn function
-- @return boolean ok
-- @return string|nil  plain error string when the step failed
local function step(name, fn)
	local ok, err = pcall(fn)
	local steps = stats().steps
	local st = steps[name]
	if type(st) ~= "table" then
		st = { okCombat = 0, okOoc = 0, failCombat = 0, failOoc = 0 }
		steps[name] = st
	end
	local combat = ns.inCombat()
	local mode = combat and "Combat" or "Ooc"
	if ok then
		ns.bump(st, "ok" .. mode)
		return true, nil
	end
	ns.bump(st, "fail" .. mode)
	local errStr = ns.errString(err)
	if not st["firstErr" .. mode] then st["firstErr" .. mode] = errStr end
	if (ns.plainNumber(st["fail" .. mode]) or 0) <= 3 then
		ns.pushCapped(ns.db.visualErrors, {
			step = name, err = errStr, combat = combat, t = ns.now(), i = ns.instanceTag(),
		}, 50)
	end
	return false, errStr
end

local function manaType()
	return ns.plainNumber(ns.resolve("Enum.PowerType.Mana")) or 0
end

-- ------------------------------------------------------------ build

local function tinyLabel(parent, text, x, y)
	local fs = parent:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	fs:SetJustifyH("LEFT")
	fs:SetText(text)
	return fs
end

local function makeBar(parent, w, h, color)
	local bar = CreateFrame("StatusBar", nil, parent)
	bar:SetSize(w, h)
	bar:SetStatusBarTexture(BAR_TEXTURE)
	bar:SetStatusBarColor(color[1], color[2], color[3])
	bar:SetMinMaxValues(0, 1)
	bar:SetValue(0)
	local bg = bar:CreateTexture(nil, "BACKGROUND")
	bg:SetAllPoints(bar)
	bg:SetColorTexture(0.1, 0.1, 0.1, 0.8)
	return bar
end

local function makeIcon(parent, size, x, y)
	local tex = parent:CreateTexture(nil, "ARTWORK")
	tex:SetSize(size, size)
	tex:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	tex:SetTexture(FALLBACK_ICON)
	local cd = CreateFrame("Cooldown", nil, parent, "CooldownFrameTemplate")
	cd:SetAllPoints(tex)
	return tex, cd
end

local function build()
	if V.built then return true end
	return step("build", function()
		local f = CreateFrame("Frame", "RFProbeVisualFrame", UIParent)
		f:SetSize(FRAME_W, FRAME_H)
		f:SetPoint("CENTER", UIParent, "CENTER", 0, -180)
		f:SetFrameStrata("MEDIUM")
		f:SetClampedToScreen(true)
		f:SetMovable(true)
		f:EnableMouse(true)
		f:RegisterForDrag("LeftButton")
		f:SetScript("OnDragStart", function(self) pcall(self.StartMoving, self) end)
		f:SetScript("OnDragStop", function(self) pcall(self.StopMovingOrSizing, self) end)

		local bg = f:CreateTexture(nil, "BACKGROUND")
		bg:SetAllPoints(f)
		bg:SetColorTexture(0, 0, 0, 0.6)
		tinyLabel(f, "RF Probe r4 (drag to move)", 4, -4)

		-- mana# row
		tinyLabel(f, "mana#", 4, -21)
		local mana = makeBar(f, BAR_W, 14, MANA_BLUE)
		mana:SetPoint("TOPLEFT", f, "TOPLEFT", COL_X, -19)
		local num = mana:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
		num:SetPoint("CENTER", mana, "CENTER", 0, 0)
		num:SetText("-")
		local low = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		low:SetPoint("LEFT", mana, "RIGHT", 4, 0)
		low:SetText("LOW")
		low:SetTextColor(MANA_RED[1], MANA_RED[2], MANA_RED[3])
		low:SetAlpha(0)
		V.mana, V.manaNum, V.manaLow = mana, num, low

		-- totem# row
		tinyLabel(f, "totem#", 4, -46)
		V.totems = {}
		for slot = 1, 4 do
			local tex, cd = makeIcon(f, 26, COL_X + (slot - 1) * 30, -40)
			V.totems[slot] = { icon = tex, cd = cd }
		end

		-- LS widget row (the AuraContainer itself is built out of combat, see buildLSWidget)
		tinyLabel(f, "LS widget", 4, -82)
		local holder = CreateFrame("Frame", nil, f)
		holder:SetSize(LS_SIZE, LS_SIZE)
		holder:SetPoint("TOPLEFT", f, "TOPLEFT", COL_X, -74)
		local hbg = holder:CreateTexture(nil, "BACKGROUND")
		hbg:SetAllPoints(holder)
		hbg:SetColorTexture(0.3, 0.3, 0.3, 0.5)
		local lsState = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		lsState:SetPoint("TOPLEFT", f, "TOPLEFT", COL_X + LS_SIZE + 8, -76)
		lsState:SetText("widget: -")
		local lsCounter = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		lsCounter:SetPoint("TOPLEFT", f, "TOPLEFT", COL_X + LS_SIZE + 8, -92)
		lsCounter:SetText("evt: -")
		V.lsHolder, V.lsState, V.lsCounter = holder, lsState, lsCounter

		-- E/F/Fr shock row
		tinyLabel(f, "E/F/Fr shock", 4, -130)
		V.shocks = {}
		for i, fam in ipairs(ns.SHOCK_FAMILIES) do
			local tex, cd = makeIcon(f, 26, COL_X + (i - 1) * 34, -122)
			local letter = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
			letter:SetPoint("TOP", tex, "BOTTOM", 0, -1)
			letter:SetText(fam.label)
			V.shocks[i] = { key = fam.key, icon = tex, cd = cd }
		end

		-- swing row
		tinyLabel(f, "swing", 4, -169)
		local swing = makeBar(f, BAR_W, 10, { 1, 0.8, 0.2 })
		swing:SetPoint("TOPLEFT", f, "TOPLEFT", COL_X, -170)
		local swingText = f:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
		swingText:SetPoint("LEFT", swing, "RIGHT", 4, 0)
		swingText:SetText("-")
		V.swing, V.swingText = swing, swingText

		f:SetScript("OnUpdate", function()
			if not V.swingStart then return end
			local ok, err = pcall(function()
				local elapsed = GetTime() - V.swingStart
				if elapsed >= V.swingDur then
					V.swing:SetValue(V.swingDur)
					V.swingStart = nil
				else
					V.swing:SetValue(elapsed)
				end
			end)
			if not ok then
				V.swingStart = nil
				step("swingOnUpdate", function() error(err, 0) end)
			end
		end)

		f:Hide()
		V.frame = f
		V.built = true
	end)
end

-- Countdown numbers on a Cooldown the way ShamanForever does it: a font object
-- of our own + SetHideCountdownNumbers(false). No CVar is touched.
local countdownFont   -- font object name, or false when CreateFont failed
local function ensureCountdownFont()
	if countdownFont ~= nil then return countdownFont end
	countdownFont = false
	step("countdownCreateFont", function()
		local font = CreateFont(COUNTDOWN_FONT)
		font:SetFont(STANDARD_TEXT_FONT, 11, "OUTLINE")
		countdownFont = COUNTDOWN_FONT
	end)
	return countdownFont
end

local function enableCountdown(prefix, cd)
	step(prefix .. "SetHideCountdownNumbersFalse", function() cd:SetHideCountdownNumbers(false) end)
	local font = ensureCountdownFont()
	if font then step(prefix .. "SetCountdownFont", function() cd:SetCountdownFont(font) end) end
end

local curves = {}

-- Step curves for the low-mana colour (see the header for the points).
local function buildCurves()
	step("manaCurveBuild", function()
		local stepType = Enum.LuaCurveType.Step
		local function scalar(lowV, normV, probeV)
			local c = C_CurveUtil.CreateCurve()
			c:SetType(stepType)
			c:AddPoint(0, lowV)
			c:AddPoint(LOW_AT, normV)
			c:AddPoint(SCALE_PROBE_AT, probeV)
			return c
		end
		local r = scalar(MANA_RED[1], MANA_BLUE[1], MANA_PURPLE[1])
		local g = scalar(MANA_RED[2], MANA_BLUE[2], MANA_PURPLE[2])
		local b = scalar(MANA_RED[3], MANA_BLUE[3], MANA_PURPLE[3])
		local a = scalar(1, 0, 0)
		curves.r, curves.g, curves.b, curves.alpha = r, g, b, a
	end)
	step("manaColorCurveBuild", function()
		local c = C_CurveUtil.CreateColorCurve()
		c:SetType(Enum.LuaCurveType.Step)
		c:AddPoint(0, CreateColor(MANA_RED[1], MANA_RED[2], MANA_RED[3], 1))
		c:AddPoint(LOW_AT, CreateColor(1, 1, 1, 1))
		c:AddPoint(SCALE_PROBE_AT, CreateColor(MANA_PURPLE[1], MANA_PURPLE[2], MANA_PURPLE[3], 1))
		curves.color = c
	end)
end

-- One-time extras after the frame exists: countdown numbers, curves.
local function buildExtras()
	if V.extrasBuilt or not V.built then return end
	V.extrasBuilt = true
	for slot = 1, 4 do enableCountdown("totem", V.totems[slot].cd) end
	for _, s in ipairs(V.shocks) do enableCountdown("shock", s.cd) end
	buildCurves()
	section("countdown").cvarAtBuild = ns.compact(ns.safeCall("C_CVar.GetCVar", "countdownForCooldowns"))
end

-- ------------------------------------------------------------ mana#

local function refreshMana()
	if not V.enabled or not V.mana then return end
	local mana = manaType()
	local mx, cur, pct
	if step("manaReadMax", function() mx = UnitPowerMax("player", mana) end) then
		observe(isSecret(mx) and "manaMaxSecret" or "manaMaxPlain")
		step("manaSetMinMax", function() V.mana:SetMinMaxValues(0, mx) end)
	end
	if step("manaReadPower", function() cur = UnitPower("player", mana) end) then
		observe(isSecret(cur) and "manaSecret" or "manaPlain")
		-- straight into the setters, never inspected
		step("manaSetValue", function() V.mana:SetValue(cur) end)
		step("manaSetTextNumber", function() V.manaNum:SetText(cur) end)
	end
	if step("manaReadPercent", function() pct = UnitPowerPercent("player", mana) end) then
		if isSecret(pct) then
			observe("manaPctSecret")
		else
			observe("manaPctPlain")
			-- scale evidence (0..1 vs 0..100), only ever from plain values
			local m = section("mana")
			m.pctPlainLast = ns.ms(pct)
			m.powerPlainLast = ns.plainNumber(cur)
			m.maxPlainLast = ns.plainNumber(mx)
		end
	end
	if curves.r and curves.g and curves.b then
		local r, g, b
		if step("manaCurveEvalRGB", function()
			r = UnitPowerPercent("player", mana, false, curves.r)
			g = UnitPowerPercent("player", mana, false, curves.g)
			b = UnitPowerPercent("player", mana, false, curves.b)
		end) then
			observe(isSecret(r) and "manaCurveResultSecret" or "manaCurveResultPlain")
			step("manaBarSetColorFromCurve", function() V.mana:SetStatusBarColor(r, g, b) end)
		end
	end
	if curves.color then
		local col
		if step("manaColorCurveEval", function() col = UnitPowerPercent("player", mana, false, curves.color) end) then
			if isSecret(col) then
				observe("manaColorResultSecret")
			elseif type(col) ~= "table" then
				observe("manaColorResultType_" .. type(col))
			elseif isSecretTable(col) then
				observe("manaColorResultSecretTable")
			else
				observe("manaColorResultTable")
				step("manaTextSetColorFromCurve", function() V.manaNum:SetTextColor(col:GetRGBA()) end)
			end
		end
	end
	if curves.alpha then
		local a
		if step("manaAlphaCurveEval", function() a = UnitPowerPercent("player", mana, false, curves.alpha) end) then
			step("manaLowSetAlpha", function() V.manaLow:SetAlpha(a) end)
		end
	end
end

-- ------------------------------------------------------------ countdown probe

-- 1.2s after a Cooldown was set: is its countdown FontString shown, and what
-- does it say? (Described only; secret text is stored as "<secret>".)
local function probeCountdown(kind, idx, cd)
	ns.after(1.2, "countdownProbe", function()
		if not V.enabled then return end
		local rec = { k = kind, n = idx, c = ns.inCombat(), t = ns.now() }
		local okF, fs = pcall(cd.GetCountdownFontString, cd)
		if not okF then
			rec.err = ns.errString(fs)
		elseif isSecret(fs) or type(fs) ~= "table" then
			rec.fs = ns.kindOf(fs)
		else
			rec.shown = ns.compact(ns.callMethod(fs, "IsShown"))
			rec.visible = ns.compact(ns.callMethod(fs, "IsVisible"))
			rec.text = ns.compact(ns.callMethod(fs, "GetText"))
		end
		rec.hideNumbers = ns.compact(ns.callMethod(cd, "GetHideCountdownNumbers"))
		rec.cdShown = ns.compact(ns.callMethod(cd, "IsShown"))
		local list = section("countdownProbes")
		ns.pushCapped(list, rec, 40)
	end)
end

-- ------------------------------------------------------------ totem#

local function refreshTotem(slot)
	local t = V.totems and V.totems[slot]
	if not t then return end
	local have, icon
	if step("totemGetInfo", function()
		local h, _, _, _, ic = GetTotemInfo(slot)
		have, icon = h, ic
	end) then
		if isSecret(icon) then
			observe("totemIconSecret")
			step("totemSetTextureSecret", function() t.icon:SetTexture(icon) end)
		elseif icon ~= nil and icon ~= 0 and icon ~= "" then
			observe("totemIconPlain")
			step("totemSetTexture", function() t.icon:SetTexture(icon) end)
		else
			step("totemSetTextureFallback", function() t.icon:SetTexture(FALLBACK_ICON) end)
		end
		if isSecret(have) or type(have) == "boolean" then
			observe(isSecret(have) and "totemHaveSecret" or "totemHavePlain")
			-- straight into the setter, never inspected
			step("totemSetAlphaFromBoolean", function() t.icon:SetAlphaFromBoolean(have, 1, 0.25) end)
		end
	end
	local d
	if not step("totemGetDuration", function() d = GetTotemDuration(slot) end) then return end
	if isSecret(d) then
		observe("totemDurationObjectSecret")
		step("totemSetCooldownFromSecretObject", function() t.cd:SetCooldownFromDurationObject(d, true) end)
	elseif d == nil then
		observe("totemDurationNil")
		step("totemCooldownClear", function() t.cd:Clear() end)
		return
	else
		observe("totemDurationObjectPlain")
		step("totemSetCooldownFromDurationObject", function() t.cd:SetCooldownFromDurationObject(d, true) end)
		local hs
		if step("totemDurationHasSecretValues", function() hs = d:HasSecretValues() end) then
			if isSecret(hs) then
				observe("totemHasSecretValuesSecret")
			else
				observe(hs and "totemHasSecretValuesTrue" or "totemHasSecretValuesFalse")
			end
		end
	end
	probeCountdown("totem", slot, t.cd)
end

local function refreshTotems(slot)
	if not V.enabled or not V.totems then return end
	local plain = ns.plainNumber(slot)
	if plain and plain >= 1 and plain <= 4 then
		refreshTotem(plain)
		return
	end
	for s = 1, 4 do refreshTotem(s) end
end

-- ------------------------------------------------------------ E/F/Fr shock

local function setShockIcons()
	for _, s in ipairs(V.shocks or {}) do
		s.id = ns.shockTop(s.key)
		local tex
		if s.id and step("shockGetTexture", function() tex = C_Spell.GetSpellTexture(s.id) end) then
			-- a secret texture goes straight in too; only a plain nil is skipped
			if isSecret(tex) or tex ~= nil then step("shockSetTexture", function() s.icon:SetTexture(tex) end) end
		end
	end
	section("shockIcons").ids = { V.shocks[1] and V.shocks[1].id, V.shocks[2] and V.shocks[2].id, V.shocks[3] and V.shocks[3].id }
end

local function refreshShock(s)
	if not s.id then return end
	local info
	if not step("shockGetCooldown", function() info = C_Spell.GetSpellCooldown(s.id) end) then return end
	local gcd
	if not isSecret(info) and type(info) == "table" and not isSecretTable(info) then
		local okF, g = pcall(function() return info.isOnGCD end)
		if okF then gcd = ns.plainBool(g) end
	end
	if gcd == true then
		-- GCD only: no swirl, so any swirl the player sees is a real cooldown
		observe("shockGcdOnlyCleared")
		step("shockCooldownClear", function() s.cd:Clear() end)
		return
	end
	local d
	if not step("shockGetCooldownDuration", function() d = C_Spell.GetSpellCooldownDuration(s.id) end) then return end
	if isSecret(d) then
		observe("shockDurationObjectSecret")
		step("shockSetCooldownFromSecretObject", function() s.cd:SetCooldownFromDurationObject(d, true) end)
	elseif d == nil then
		observe("shockDurationNil")
		step("shockCooldownClear", function() s.cd:Clear() end)
	else
		step("shockSetCooldownFromDurationObject", function() s.cd:SetCooldownFromDurationObject(d, true) end)
	end
end

local function refreshShocks()
	if not V.enabled or not V.shocks then return end
	for _, s in ipairs(V.shocks) do refreshShock(s) end
end

-- ------------------------------------------------------------ swing

local function onSwing(duration, swingType)
	if not V.enabled then return end
	local typeName = "?"
	if not isSecret(swingType) and type(swingType) == "number" then
		typeName = SWING_NAMES[swingType] or "?"
	elseif isSecret(swingType) then
		observe("swingTypeSecret")
	end
	if isSecret(duration) then
		observe("swingDurationSecret")
		pcall(V.swingText.SetText, V.swingText, typeName .. " <secret>")
		return
	end
	observe("swingDurationPlain")
	if type(duration) ~= "number" or duration <= 0 then return end
	pcall(V.swingText.SetText, V.swingText, ("%s %.2fs"):format(typeName, duration))
	if step("swingBarStart", function()
		V.swing:SetMinMaxValues(0, duration)
		V.swing:SetValue(0)
	end) then
		V.swingStart = GetTime()
		V.swingDur = duration
	end
end

-- ------------------------------------------------------------ LS widget

local function setLSState(text)
	if V.lsState then pcall(V.lsState.SetText, V.lsState, "widget: " .. text) end
end

local function aurasSecretNow()
	local fn = ns.resolve("C_Secrets.ShouldAurasBeSecret")
	if type(fn) ~= "function" then return false end
	local ok, v = pcall(fn)
	if not ok then return false end
	if isSecret(v) then return true end
	return v == true
end

-- Lightning Shield rank IDs (a map, as candidateFilters.includeSpellIDs wants),
-- plus any seen aura ID whose stored name is Lightning Shield's.
local function lsIdMap()
	local map, list = {}, {}
	for _, id in ipairs(ns.LS_RANKS) do
		map[id] = true
		list[#list + 1] = id
	end
	local db = ns.db
	local lsName = ns.spellNameCached(ns.LS_RANKS[1])
	if lsName then
		for id in pairs(db.seenAuraIDs) do
			if type(id) == "number" and not map[id] and db.spellNames[id] == lsName then
				map[id] = true
				list[#list + 1] = id
			end
		end
	end
	return map, list
end

-- Called by Blizzard once, right after it creates the slot button. Every part
-- is set up here (the frame AddAuraSlot returns is restricted afterwards).
-- Fonts are set before registration (Blizzard writes text immediately). No
-- script handler is ever put on the button or its parts.
local function initLSButton(button)
	local w = section("lsWidget")
	ns.bump(w, "initCalls")
	local parts = {}
	w.init = parts
	local function part(name, fn)
		local ok, err = pcall(fn)
		parts[name] = ok and true or ns.errString(err)
	end
	part("size", function() button:SetSize(LS_SIZE, LS_SIZE) end)
	part("point", function()
		button:ClearAllPoints()
		button:SetPoint("TOPLEFT", button:GetParent(), "TOPLEFT", 0, 0)
	end)
	part("mouseOff", function() button:EnableMouse(false) end)
	part("icon", function()
		local tex = button:CreateTexture(nil, "ARTWORK")
		tex:SetAllPoints(button)
		button:SetIcon(tex)
	end)
	local cd
	part("durationCooldown", function()
		cd = CreateFrame("Cooldown", nil, button, "CooldownFrameTemplate")
		cd:SetAllPoints(button)
		cd:SetHideCountdownNumbers(true)   -- time left comes from SetDurationText below
		button:SetDurationCooldown(cd)
	end)
	local overlay = button
	part("overlay", function()
		local o = CreateFrame("Frame", nil, button)
		o:SetAllPoints(button)
		if cd then o:SetFrameLevel(cd:GetFrameLevel() + 2) end
		overlay = o
	end)
	part("applicationCount", function()
		local fs = overlay:CreateFontString(nil, "OVERLAY")
		fs:SetFont(STANDARD_TEXT_FONT, 16, "OUTLINE")
		fs:SetPoint("CENTER", button, "CENTER", 0, 0)
		button:SetApplicationCount(fs)
	end)
	part("applicationBar", function()
		local bar = CreateFrame("StatusBar", nil, overlay)
		bar:SetPoint("BOTTOMLEFT", button, "BOTTOMLEFT", 0, 0)
		bar:SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", 0, 0)
		bar:SetHeight(4)
		bar:SetStatusBarTexture("Interface\\Buttons\\WHITE8x8")
		bar:SetStatusBarColor(0.4, 0.75, 1)
		button:SetApplicationBar(bar, { minApplications = 0, maxApplications = 3 })
	end)
	part("durationText", function()
		local fs = overlay:CreateFontString(nil, "OVERLAY")
		fs:SetFont(STANDARD_TEXT_FONT, 10, "OUTLINE")
		fs:SetPoint("TOP", button, "BOTTOM", 0, -1)
		button:SetDurationText(fs, {})
	end)
	L.button = button
end

--- Builds the AuraContainer (out of combat, auras not secret); otherwise defers.
local function buildLSWidget()
	if L.container or L.failed or not V.lsHolder then return end
	local w = section("lsWidget")
	if ns.inCombat() or aurasSecretNow() then
		if not L.deferred then ns.bump(w, "deferred") end
		L.deferred = true
		setLSState("waits for ooc")
		return
	end
	L.deferred = false
	local okC, errC = step("lsContainerCreate", function()
		local c = CreateFrame("AuraContainer", "RFProbeLSContainer", V.lsHolder, "CustomAuraContainerTemplate")
		L.container = c
		c:SetPoint("TOPLEFT", V.lsHolder, "TOPLEFT", 0, 0)
		c:SetSize(LS_SIZE, LS_SIZE)
		c:SetFrameStrata(V.frame:GetFrameStrata())
		c:SetFrameLevel(V.lsHolder:GetFrameLevel() + 5)
	end)
	if not okC then
		L.failed = errC
		w.createErr = errC
		setLSState("create failed")
		return
	end
	pcall(L.container.EnableMouse, L.container, false)
	step("lsContainerSetUnit", function() L.container:SetUnit("player") end)
	local map, list = lsIdMap()
	w.includeSpellIDs = list
	local okS, errS = step("lsAddAuraSlot", function()
		local frame = L.container:AddAuraSlot("ls", "HELPFUL", {
			candidateFilters = { includeSpellIDs = map },
			initializeFrame = function(button)
				local ok, err = pcall(initLSButton, button)
				if not ok then section("lsWidget").initErr = ns.errString(err) end
			end,
		})
		w.slotFrameKind = ns.kindOf(frame)
	end)
	if not okS then
		L.failed = errS
		w.slotErr = errS
		setLSState("slot failed")
		return
	end
	w.created = true
	w.createdAt = ns.now()
	setLSState("ok")
end

local function sigPart(v)
	if type(v) == "table" then return "tbl" end
	return tostring(v)
end

-- Is the aura slot populated? Counts the container's child frames shown /
-- hidden / secret (IsShown results are only tested with issecretvalue first).
local function sampleLSWidget()
	if not L.container then return end
	local w = section("lsWidget")
	local combat = ns.inCombat()
	local rec = { c = combat }
	local kids, shown, hidden, secret = 0, 0, 0, 0
	local okK, list = pcall(function() return { L.container:GetChildren() } end)
	if okK and type(list) == "table" then
		for _, kid in ipairs(list) do
			kids = kids + 1
			local okS, v = pcall(function() return kid:IsShown() end)
			if not okS then
				rec.kidErr = ns.errString(v)
			elseif isSecret(v) then
				secret = secret + 1
			elseif v then
				shown = shown + 1
			else
				hidden = hidden + 1
			end
		end
	else
		rec.kidsErr = okK and "?" or ns.errString(list)
	end
	rec.kids, rec.shown, rec.hidden, rec.secret = kids, shown, hidden, secret
	if L.button then
		rec.btnShown = ns.compact(ns.callMethod(L.button, "IsShown"))
		rec.btnVisible = ns.compact(ns.callMethod(L.button, "IsVisible"))
	end
	rec.aurasSecret = ns.quick("C_Secrets.ShouldAurasBeSecret")
	local mode = combat and "Combat" or "Ooc"
	ns.bump(w, "samples" .. mode)
	if shown > 0 then ns.bump(w, "anyShown" .. mode) end
	if secret > 0 then ns.bump(w, "anySecret" .. mode) end
	local sig = sigPart(combat) .. "|" .. kids .. "|" .. shown .. "|" .. hidden .. "|" .. secret .. "|"
		.. sigPart(rec.btnShown) .. "|" .. sigPart(rec.btnVisible) .. "|" .. sigPart(rec.kidErr)
	local now = ns.now()
	if sig ~= L.lastSig or now - L.lastLogT >= 15 then
		L.lastSig, L.lastLogT = sig, now
		rec.t = now
		if type(w.samples) ~= "table" then w.samples = {} end
		ns.pushCapped(w.samples, rec, 60)
	end
end

-- ------------------------------------------------------------ public

--- Shows the plain event-based Lightning Shield counter.
-- @param value number|nil
function ns.visualSetLSCounter(value)
	if not V.enabled or not V.lsCounter then return end
	local text = "evt: -"
	local n = ns.plainNumber(value)
	if n then text = "evt: " .. n end
	pcall(V.lsCounter.SetText, V.lsCounter, text)
end

--- 1s tick from events.lua while the visual test is on.
function ns.visualTick()
	refreshMana()
	if L.deferred and not ns.inCombat() then buildLSWidget() end
	sampleLSWidget()
end

--- True while the visual test is on.
function ns.visualIsEnabled()
	return V.enabled
end

--- One-word state of the LS widget for /rfprobe status.
-- @return string
function ns.visualLSState()
	if L.failed then return "failed" end
	if L.container then return L.button and "ok" or "no-button" end
	if L.deferred then return "deferred" end
	return "-"
end

--- /rfprobe visual: toggles the frame.
function ns.visualToggle()
	if V.enabled then
		V.enabled = false
		V.swingStart = nil
		if V.frame then pcall(V.frame.Hide, V.frame) end
		ns.say("visual test OFF.")
		return
	end
	if not build() then
		ns.say("visual test could not be built (see RFProbeDB.visualErrors).")
		return
	end
	buildExtras()
	V.enabled = true
	pcall(V.frame.Show, V.frame)
	setShockIcons()
	refreshMana()
	refreshTotems()
	refreshShocks()
	buildLSWidget()
	ns.visualSetLSCounter(ns.lsCounter())
	ns.say("visual test ON. Drag to move; /rfprobe visual again to hide.")
end

--- Event hook for the visual test (only called while enabled).
-- @param event string
function ns.visualOnEvent(event, ...)
	if not V.enabled then return end
	if event == "SPELL_UPDATE_COOLDOWN" or event == "SPELL_UPDATE_CHARGES" then
		refreshShocks()
	elseif event == "UNIT_POWER_UPDATE" or event == "UNIT_MAXPOWER" then
		refreshMana()
	elseif event == "PLAYER_SWING" then
		onSwing(...)
	elseif event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED" then
		refreshMana()
		refreshTotems()
		refreshShocks()
	elseif event == "PLAYER_TOTEM_UPDATE" then
		refreshTotems((...))
	end
end
