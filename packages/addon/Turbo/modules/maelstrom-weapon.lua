-- Maelstrom Weapon: the player's stacks (0-5) as five pips in the card's
-- small-icons row, glowing at 5.
--
-- Only if the game lets addons read the aura in combat. Out of combat auras
-- always read plainly, so the first read in combat decides: a plain number
-- shows the pips, while a secret or a failed read keeps the module off and
-- invisible for the session (debug mode says why).
local _, ns = ...

local safe = ns.safe
local events = ns.events
local restrictions = ns.restrictions

local MODULE_ID = "maelstromWeapon"
local MAX_STACKS = 5
local PIP_SIZE = 8
local PIP_SPACING = 3
local UNLIT_ALPHA = 0.25

local frame
local glow
---@type table[]
local pips = {}
-- Nil until the aura is read in combat, then whether it read plainly there.
---@type boolean?
local readable

local function build()
	local row = ns.card.rows.icons
	frame = safe.createFrame("Frame", "TurboMaelstrom", row)
	frame:SetSize(MAX_STACKS * PIP_SIZE + (MAX_STACKS - 1) * PIP_SPACING, PIP_SIZE)
	frame:SetPoint("RIGHT", row, "RIGHT", -2, 0)

	glow = frame:CreateTexture("TurboMaelstromGlow", "BACKGROUND")
	glow:SetPoint("TOPLEFT", frame, "TOPLEFT", -3, 3)
	glow:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", 3, -3)
	glow:SetColorTexture(1, 0.85, 0.2, 0.7)
	glow:SetBlendMode("ADD")
	glow:Hide()

	for i = 1, MAX_STACKS do
		local pip = frame:CreateTexture("TurboMaelstromPip" .. i, "ARTWORK")
		pip:SetSize(PIP_SIZE, PIP_SIZE)
		pip:SetPoint("LEFT", frame, "LEFT", (i - 1) * (PIP_SIZE + PIP_SPACING), 0)
		pip:SetColorTexture(0.3, 0.6, 1)
		pips[i] = pip
	end

	frame:Hide()
end

local function show(stacks)
	stacks = math.max(0, math.min(MAX_STACKS, stacks))
	for i, pip in ipairs(pips) do
		pip:SetAlpha(i <= stacks and 1 or UNLIT_ALPHA)
	end
	glow:SetShown(stacks >= MAX_STACKS)
	frame:Show()
end

local onAura

local function turnOff(reason)
	readable = false
	frame:Hide()
	events.off("UNIT_AURA", onAura)
	if ns.debug.isOn() then
		safe.print("Turbo debug: Maelstrom Weapon " .. reason .. ", so it stays off.")
	end
end

onAura = function(_, unit)
	if unit ~= "player" then
		return
	end
	local inCombat = restrictions.inCombat()
	if readable == nil and not inCombat then
		return
	end
	local stacks = safe.read("maelstromWeapon")
	-- A failed read has no value to log; turnOff below says why instead.
	if inCombat and stacks ~= nil then
		ns.debug.record(MODULE_ID, "stacks", stacks)
	end
	-- A secret passes for a number to type(), so it's checked first.
	if safe.isSecret(stacks) then
		if inCombat then
			turnOff("is secret in combat")
		end
		return
	end
	if type(stacks) ~= "number" then
		if inCombat then
			turnOff("can't be read in combat (the aura read failed)")
		end
		return
	end
	readable = true
	show(stacks)
end

ns.modules.register(MODULE_ID, {
	onEnable = function()
		if not frame then
			build()
		end
		if readable == false then
			return
		end
		events.on("UNIT_AURA", onAura)
		if readable then
			onAura("UNIT_AURA", "player")
		end
	end,
	onDisable = function()
		events.off("UNIT_AURA", onAura)
		if frame then
			frame:Hide()
		end
	end,
})
