-- Lightning Shield: the shield's charges (3 / 2 / 1) in the card's icons row,
-- and a reminder once the shield is gone.
--
-- The charges are shown by Blizzard's aura container widget, which shows the
-- exact count in combat. It's built out of combat only, and in combat its
-- child frames are forbidden objects: Turbo never calls anything on it there.
--
-- Turbo also keeps its own count: back to 3 on a successful cast, one off per
-- charge used (the game's proc events within PROC_WINDOW count as one), and
-- resynced from the real aura after every fight, since aura reads throw in
-- combat. The count drives the reminder, and shows the charges itself when
-- the widget is missing.
local _, ns = ...

local safe = ns.safe
local events = ns.events
local restrictions = ns.restrictions
local timers = ns.timers

local MODULE_ID = "lightningShield"
local read = ns.debug.reader(MODULE_ID)

local REMINDER = MODULE_ID
local ICON = 136051
local SIZE = 22
-- Just right of the weapon imbue.
local OFFSET_X = SIZE + 4
local FULL_CHARGES = 3
-- The shield's duration, for a cast in combat where the aura can't be read.
local DURATION = 600
local PROC_WINDOW = 0.3
-- Resync differences smaller than this keep the running expiry timer.
local EXPIRY_TOLERANCE = 1

-- Lightning Shield, every rank. The safe layer keeps the same list.
local RANKS = { 324, 325, 905, 945, 8134, 10431, 10432 }
---@type table<number, boolean>
local IS_RANK = {}
for _, spellID in ipairs(RANKS) do
	IS_RANK[spellID] = true
end
-- The spell IDs the game reports in SPELL_UPDATE_COOLDOWN when a charge is
-- used: 26545 and 26365 together, seen in the beta, and the vanilla per-rank
-- procs.
local IS_PROC = {
	[26545] = true,
	[26365] = true,
	[26363] = true,
	[26364] = true,
	[26366] = true,
	[26367] = true,
	[26369] = true,
	[26370] = true,
}

local frame, count
local container
---Nil until the client is asked, then whether it has the aura container.
---@type boolean?
local widgetSupported
---Charges left; nil while unknown (logged in mid-fight).
---@type number?
local charges
---@type number?
local expiresAt
---@type TurboSelfTimer?
local expiry
---@type number?
local lastProcAt

local function update()
	local known = charges ~= nil and charges > 0
	if known and not container then
		count:SetText(tostring(charges))
		frame:Show()
	else
		frame:Hide()
	end
	if charges == 0 then
		ns.reminders.show(REMINDER, ICON)
	else
		ns.reminders.hide(REMINDER)
	end
end

local function onExpired()
	expiry = nil
	expiresAt = nil
	charges = 0
	update()
end

-- The shield runs out `timeLeft` seconds from now; nil for no shield.
local function expireIn(timeLeft)
	local at = timeLeft and safe.now() + timeLeft
	if at and expiresAt and math.abs(at - expiresAt) < EXPIRY_TOLERANCE then
		return
	end
	if expiry then
		expiry:cancel()
		expiry = nil
	end
	expiresAt = at
	if timeLeft then
		expiry = timers.start(timeLeft, onExpired)
	end
end

local function buildContainer()
	local row = ns.card.rows.icons
	container = safe.createFrame("AuraContainer", "TurboLightningShieldAura", row, "CustomAuraContainerTemplate")
	container:SetSize(SIZE, SIZE)
	container:SetPoint("LEFT", row, "LEFT", OFFSET_X, 0)
	container:EnableMouse(false)
	container:SetUnit("player")
	local includeSpellIDs = {}
	for _, spellID in ipairs(RANKS) do
		includeSpellIDs[spellID] = true
	end
	container:AddAuraSlot("lightningShield", "HELPFUL", {
		candidateFilters = { includeSpellIDs = includeSpellIDs },
		-- Blizzard calls this once, as it makes the slot's button, and fills
		-- in the parts: the icon, the swirl and the charge count.
		initializeFrame = function(button)
			button:SetSize(SIZE, SIZE)
			button:EnableMouse(false)
			local icon = button:CreateTexture(nil, "ARTWORK")
			icon:SetAllPoints(button)
			button:SetIcon(icon)
			local swirl = safe.createFrame("Cooldown", nil, button, "CooldownFrameTemplate")
			swirl:SetAllPoints(button)
			swirl:SetHideCountdownNumbers(true)
			button:SetDurationCooldown(swirl)
			local applications = button:CreateFontString(nil, "OVERLAY", "NumberFontNormal")
			applications:SetPoint("BOTTOMRIGHT", button, "BOTTOMRIGHT", -1, 1)
			button:SetApplicationCount(applications)
		end,
	})
end

-- Builds the widget, out of combat only, once the client says it has one.
local function ensureContainer()
	if container or restrictions.inCombat() then
		return
	end
	if widgetSupported == nil then
		widgetSupported = read("auraContainerSupported") == true
	end
	if widgetSupported then
		buildContainer()
	end
end

-- Resyncs the count from the real aura. Only out of combat: in combat the
-- read throws, and the count is Turbo's own.
local function sync()
	if restrictions.inCombat() then
		return
	end
	local shield = read("lightningShield")
	if shield == nil then
		return
	end
	if shield and shield.charges > 0 and shield.timeLeft > 0 then
		charges = shield.charges
		expireIn(shield.timeLeft)
	else
		charges = 0
		expireIn(nil)
	end
	update()
end

local function onCast(_, unit, _, spellID)
	if unit ~= "player" or safe.isSecret(spellID) or not IS_RANK[spellID] then
		return
	end
	charges = FULL_CHARGES
	expireIn(DURATION)
	lastProcAt = nil
	update()
end

local function onCooldown(_, spellID)
	if safe.isSecret(spellID) or type(spellID) ~= "number" or not IS_PROC[spellID] then
		return
	end
	if not restrictions.inCombat() then
		sync()
		return
	end
	local now = safe.now()
	if lastProcAt and now - lastProcAt < PROC_WINDOW then
		return
	end
	lastProcAt = now
	if charges and charges > 0 then
		charges = charges - 1
		update()
	end
end

local function onAura(_, unit)
	if unit == "player" then
		sync()
	end
end

local function onRestrictionChanged(_, kind, on)
	if kind == "combat" and not on then
		ensureContainer()
		sync()
		update()
	end
end

local function build()
	local row = ns.card.rows.icons
	frame = safe.createFrame("Frame", "TurboLightningShield", row)
	frame:SetSize(SIZE, SIZE)
	frame:SetPoint("LEFT", row, "LEFT", OFFSET_X, 0)
	local icon = frame:CreateTexture(nil, "ARTWORK")
	icon:SetAllPoints()
	icon:SetTexture(ICON)
	count = frame:CreateFontString(nil, "OVERLAY", "NumberFontNormal")
	count:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -1, 1)
	frame:Hide()
end

ns.modules.register(MODULE_ID, {
	name = "Lightning Shield",
	onEnable = function()
		if not frame then
			build()
		end
		ensureContainer()
		if container and not restrictions.inCombat() then
			container:Show()
		end
		events.on("UNIT_SPELLCAST_SUCCEEDED", onCast)
		events.on("SPELL_UPDATE_COOLDOWN", onCooldown)
		events.on("UNIT_AURA", onAura)
		events.on("Turbo.RestrictionChanged", onRestrictionChanged)
		sync()
		update()
	end,
	onDisable = function()
		events.off("UNIT_SPELLCAST_SUCCEEDED", onCast)
		events.off("SPELL_UPDATE_COOLDOWN", onCooldown)
		events.off("UNIT_AURA", onAura)
		events.off("Turbo.RestrictionChanged", onRestrictionChanged)
		expireIn(nil)
		charges = nil
		lastProcAt = nil
		frame:Hide()
		-- In combat the widget can't be touched; it stays until the reload.
		if container and not restrictions.inCombat() then
			container:Hide()
		end
		ns.reminders.hide(REMINDER)
	end,
})
