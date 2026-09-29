-- Key cooldowns: one shock icon for the shared shock cooldown, and a
-- Stormstrike icon once it's learned, in the card's small-icons row.
--
-- Each icon is bright when ready and dim with a swirl while cooling down.
-- Ready or not comes from the never-secret "is active" flag, and the global
-- cooldown is ignored with the never-secret "on GCD" flag; the swirl is the
-- spell's cooldown duration object, passed straight to a Cooldown frame. An
-- icon turns blue when there isn't enough mana to cast it.
local _, ns = ...

local safe = ns.safe
local events = ns.events

local MODULE_ID = "keyCooldowns"
local read = ns.debug.reader(MODULE_ID)

-- Every shock shares one cooldown. Earth Shock's ranks, lowest first: the
-- icon follows the highest one known, so the mana check matches its cost.
local SHOCK_RANKS = { 8042, 8044, 8045, 8046, 10412, 10413, 10414 }
local STORMSTRIKE = 17364

local ICON_SIZE = 20
local ICON_SPACING = 2
local DIM_ALPHA = 0.6
local BLUE = { 0.4, 0.4, 1 }

local container
---@type table[]
local icons = {}

local function highestKnown(ranks)
	for i = #ranks, 1, -1 do
		if read("spellKnown", ranks[i]) == true then
			return ranks[i]
		end
	end
end

local function buildIcon(index)
	local holder = safe.createFrame("Frame", nil, container)
	holder:SetSize(ICON_SIZE, ICON_SIZE)
	holder:SetPoint("LEFT", container, "LEFT", (index - 1) * (ICON_SIZE + ICON_SPACING), 0)

	local texture = holder:CreateTexture(nil, "ARTWORK")
	texture:SetAllPoints()

	local cooldown = safe.createFrame("Cooldown", nil, holder, "CooldownFrameTemplate")
	cooldown:SetAllPoints()
	cooldown:SetDrawEdge(false)

	return { holder = holder, texture = texture, cooldown = cooldown }
end

local function build()
	container = safe.createFrame("Frame", nil, ns.card.rows.icons)
	container:SetSize(ICON_SIZE * 2 + ICON_SPACING, ICON_SIZE)
	container:SetPoint("CENTER")
	icons[1] = buildIcon(1)
	icons[2] = buildIcon(2)
end

local function updateCooldown(icon)
	if not icon.spellID then
		return
	end
	local info = read("spellCooldown", icon.spellID)
	local cooling = info ~= nil and info.isActive == true and info.isOnGCD ~= true
	icon.texture:SetDesaturated(cooling)
	icon.texture:SetAlpha(cooling and DIM_ALPHA or 1)
	if cooling then
		icon.cooldown:SetCooldownFromDurationObject(read("spellCooldownDuration", icon.spellID))
	else
		icon.cooldown:Clear()
	end
end

local function updateUsable(icon)
	if not icon.spellID then
		return
	end
	local _, insufficientPower = read("spellUsable", icon.spellID)
	if insufficientPower == true then
		icon.texture:SetVertexColor(BLUE[1], BLUE[2], BLUE[3])
	else
		icon.texture:SetVertexColor(1, 1, 1)
	end
end

local function updateAll()
	for _, icon in ipairs(icons) do
		updateCooldown(icon)
		updateUsable(icon)
	end
end

-- Which spells the icons show: learning a spell (or a higher shock rank)
-- changes them.
local function updateSpells()
	local spells = { highestKnown(SHOCK_RANKS), highestKnown({ STORMSTRIKE }) }
	for i, icon in ipairs(icons) do
		icon.spellID = spells[i]
		if icon.spellID then
			icon.texture:SetTexture(read("spellTexture", icon.spellID))
			icon.holder:Show()
		else
			icon.holder:Hide()
		end
	end
	updateAll()
end

local function onCooldown()
	for _, icon in ipairs(icons) do
		updateCooldown(icon)
	end
end

local function onUsable()
	for _, icon in ipairs(icons) do
		updateUsable(icon)
	end
end

ns.modules.register(MODULE_ID, {
	name = "Key cooldowns",
	onEnable = function()
		if not container then
			build()
		end
		container:Show()
		updateSpells()
		events.on("SPELLS_CHANGED", updateSpells)
		events.on("SPELL_UPDATE_COOLDOWN", onCooldown)
		events.on("SPELL_UPDATE_USABLE", onUsable)
	end,
	onDisable = function()
		events.off("SPELLS_CHANGED", updateSpells)
		events.off("SPELL_UPDATE_COOLDOWN", onCooldown)
		events.off("SPELL_UPDATE_USABLE", onUsable)
		container:Hide()
	end,
})
