-- The safe layer: the only Turbo code that touches the game API.
--
-- In: game reads and events. Out: widget calls. Everything else in Turbo goes
-- through `ns.safe` and never calls the game directly; a guard script in CI
-- fails any secret-returning game call made outside this file.
--
-- It never reads, compares or does math on a secret value. Secrets are passed
-- straight into Blizzard widgets.
--
-- Under `bun test` the fake game (packages/addon/tests/fake-game) replaces
-- this file and offers the same contract (types/safe-layer.lua). A change to
-- the contract changes both; a test checks they offer the same functions.
local _, ns = ...

---@type TurboSafeLayer
local safe = {}
ns.safe = safe

---Named game readings. Modules ask for a reading by name; each reading is
---the one place its game call lives.
---@type table<string, fun(...: any): ...: any>
local readings = {}

---The client's interface number (16001 on Forever).
function readings.interface()
	return (select(4, GetBuildInfo()))
end

---"forever" on WoW: Forever. Forever's project ID says retail, so this asks
---for Forever's own game rules instead: only Forever has an experience preset.
function readings.flavor()
	local rules = C_GameRules
	if rules and rules.GetForeverExperiencePreset and rules.GetForeverExperiencePreset() ~= nil then
		return "forever"
	end
	return "other"
end

---The player's class: localized name, token ("SHAMAN") and class ID.
function readings.playerClass()
	return UnitClass("player")
end

function readings.inCombat()
	return InCombatLockdown()
end

---Whether the target is an enemy the player can attack, and alive.
function readings.targetAttackable()
	return UnitCanAttack("player", "target") and not UnitIsDead("target")
end

---Spells whose SPELL_RANGE_CHECK_UPDATE is on.
---@type table<number, boolean>
local rangeChecked = {}

---Whether a unit is in a spell's range: true, false, or nil when there's
---nothing to check. Asking about a spell also turns on the game's
---SPELL_RANGE_CHECK_UPDATE for it, so its range changes are reported.
---@param spellID number
---@param unit string
function readings.spellInRange(spellID, unit)
	if not rangeChecked[spellID] then
		rangeChecked[spellID] = true
		C_Spell.EnableSpellRangeCheck(spellID, true)
	end
	return C_Spell.IsSpellInRange(spellID, unit)
end

---Whether a unit is in an item's range: true, false, or nil when there's
---nothing to check.
---@param itemID number
---@param unit string
function readings.itemInRange(itemID, unit)
	return C_Item.IsItemInRange(itemID, unit)
end

-- The Maelstrom Weapon buff. Recheck at the level-gated checks: the beta is
-- capped below the talent.
local MAELSTROM_WEAPON = 53817

---The player's Maelstrom Weapon stacks: 0 with no aura, a secret when the
---game hides the aura, nil when the aura read failed (they throw in combat).
function readings.maelstromWeapon()
	local ok, aura = pcall(C_UnitAuras.GetPlayerAuraBySpellID, MAELSTROM_WEAPON)
	if not ok then
		return nil
	end
	if issecretvalue(aura) then
		return aura
	end
	if aura == nil then
		return 0
	end
	return aura.applications
end

---The main-hand imbue, `{ timeLeft = <seconds>, icon, enchantID }`, or nil
---when there's none. Asks the item namespace, which is plain in combat; the
---legacy global GetWeaponEnchantInfo() misreports on Forever.
function readings.mainHandEnchant()
	local enchants = C_Item.GetWeaponEnchantInfo(Enum.WeaponSlot.MainHand) or {}
	for _, enchant in ipairs(enchants) do
		local kind = enchant.enchantType
		if enchant.hasEnchant and (kind == Enum.ItemEnchantType.Temporary or kind == Enum.ItemEnchantType.Imbue) then
			return {
				timeLeft = enchant.timeLeft / 1000,
				icon = enchant.enchantIconID,
				enchantID = enchant.enchantID,
			}
		end
	end
end

---Whether the player is resting (in town or an inn).
function readings.resting()
	return IsResting()
end

function readings.mounted()
	return IsMounted()
end

---Whether the player is on a flight path.
function readings.onTaxi()
	return UnitOnTaxi("player")
end

---@type table<string, fun(event: string, ...: any)[]>
local handlers = {}

-- Blizzard's callback events ("EditMode.Enter") come through EventRegistry,
-- not the event frame; their names are the ones with a dot.
local function isCallbackEvent(event)
	return event:find(".", 1, true) ~= nil
end

local eventFrame = CreateFrame("Frame")

local function dispatch(event, ...)
	local list = handlers[event]
	if not list then
		return
	end
	-- A copy, so a handler may unsubscribe while the event is dispatched.
	local snapshot = { unpack(list) }
	for i = 1, #snapshot do
		snapshot[i](event, ...)
	end
end

eventFrame:SetScript("OnEvent", function(_, event, ...)
	dispatch(event, ...)
end)

function safe.now()
	return GetTime()
end

function safe.on(event, handler)
	local list = handlers[event]
	if not list then
		list = {}
		handlers[event] = list
		if isCallbackEvent(event) then
			-- EventRegistry keeps the callback once per owner; the owner is
			-- the handler list, so it stays registered while `on` is in use.
			EventRegistry:RegisterCallback(event, function(_, ...)
				dispatch(event, ...)
			end, list)
		else
			eventFrame:RegisterEvent(event)
		end
	end
	table.insert(list, handler)
end

function safe.off(event, handler)
	local list = handlers[event]
	if not list then
		return
	end
	for i = #list, 1, -1 do
		if list[i] == handler then
			table.remove(list, i)
		end
	end
	if #list == 0 then
		handlers[event] = nil
		if isCallbackEvent(event) then
			EventRegistry:UnregisterCallback(event, list)
		else
			eventFrame:UnregisterEvent(event)
		end
	end
end

function safe.after(delay, callback)
	C_Timer.After(delay, callback)
end

function safe.every(interval, callback)
	return C_Timer.NewTicker(interval, callback)
end

function safe.read(name, ...)
	local reading = readings[name]
	if not reading then
		error("Turbo: no reading named '" .. name .. "'", 2)
	end
	return reading(...)
end

function safe.createFrame(frameType, name, parent, template)
	-- A frame without a parent hangs off UIParent, like the rest of the UI.
	return CreateFrame(frameType, name, parent or UIParent, template)
end

function safe.framePoint(frame)
	local point, _, _, x, y = frame:GetPoint(1)
	return point, x, y
end

function safe.print(message)
	print(message)
end

function safe.slash(key, commands, handler)
	for i, command in ipairs(commands) do
		_G["SLASH_" .. key .. i] = command
	end
	SlashCmdList[key] = handler
end

function safe.isSecret(value)
	return issecretvalue(value)
end

-- A slider's number beside it, without float noise (0.15, not 0.1500001).
local function sliderLabel(value)
	return string.format("%g", value)
end

function safe.settingsPage(name, controls)
	local category, layout = Settings.RegisterVerticalLayoutCategory(name)
	for _, control in ipairs(controls) do
		if control.kind == "text" then
			layout:AddInitializer(CreateSettingsListSectionHeaderInitializer(control.label))
		else
			-- Proxy settings keep no value of their own: the page reads and
			-- writes through Turbo, so a change made elsewhere shows here too.
			local variableType = control.kind == "slider" and Settings.VarType.Number or Settings.VarType.Boolean
			local setting = Settings.RegisterProxySetting(
				category,
				"Turbo_" .. control.key,
				variableType,
				control.label,
				control.default,
				control.get,
				control.set
			)
			if control.kind == "slider" then
				local options = Settings.CreateSliderOptions(control.min, control.max, control.step)
				options:SetLabelFormatter(MinimalSliderWithSteppersMixin.Label.Right, sliderLabel)
				Settings.CreateSlider(category, setting, options)
			else
				Settings.CreateCheckbox(category, setting)
			end
		end
	end
	Settings.RegisterAddOnCategory(category)
end
