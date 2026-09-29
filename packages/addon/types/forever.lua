---@meta
-- Forever-only game APIs that Ketho's WoW annotations (pinned in
-- scripts/fetch-tools.ts) don't cover yet. LuaLS reads this file as a library;
-- it never ships. Signatures come from Forever's own API documentation
-- (Blizzard_APIDocumentationGenerated, 1.60.1.70009): SwingTimerDocumentation,
-- ItemDocumentation, LuaDurationObjectAPIDocumentation, DurationUtilDocumentation,
-- and Blizzard_AuraContainer. Recheck against the annotations after Forever
-- launches, and drop anything they gain.

-- The per-swing events -----------------------------------------------------
-- Event names are plain strings to LuaLS; these are documented here only.
--
-- PLAYER_SWING (swingDuration: number, swingType: Enum.PlayerSwingType)
--   Fired on every auto-attack swing. swingDuration is the next swing's
--   duration, a plain value.
-- PLAYER_SWING_RANGE_UPDATE (swingType, isInRange: boolean, checksRange: boolean)
--   Only for swing types with an active range check (C_SwingTimer.EnableRangeCheck).

---@enum Enum.PlayerSwingType
Enum.PlayerSwingType = {
	MainHand = 0,
	OffHand = 1,
	Ranged = 2,
}

-- The swing-timer namespace -----------------------------------------------

C_SwingTimer = {}

---Turns PLAYER_SWING_RANGE_UPDATE on or off for a swing type.
---@param swingType Enum.PlayerSwingType
---@param enable boolean
function C_SwingTimer.EnableRangeCheck(swingType, enable) end

---Whether the current target is in auto-attack range. Nil when no check
---could be made (no target, can't be attacked, no weapon); nil is not "out".
---@param swingType Enum.PlayerSwingType
---@return boolean? isInRange
function C_SwingTimer.IsTargetWithinSwingRange(swingType) end

-- The item weapon-enchant query -------------------------------------------
-- Plain in combat and includes time left. The legacy global
-- GetWeaponEnchantInfo() misreports on Forever: don't use it.

---@enum Enum.ItemEnchantType
Enum.ItemEnchantType = {
	None = 0,
	Permanent = 1,
	Temporary = 2,
	Imbue = 3,
}

---@class WeaponEnchantInfo
---@field hasEnchant boolean
---@field enchantType Enum.ItemEnchantType
---@field timeLeft number milliseconds
---@field charges number
---@field enchantID number
---@field enchantIconID number

---@param weaponSlot Enum.WeaponSlot
---@return WeaponEnchantInfo[] enchants
function C_Item.GetWeaponEnchantInfo(weaponSlot) end

-- Duration objects ----------------------------------------------------------
-- DurationObject is annotated; these methods are Forever additions.

---@alias DurationTimeModifier number Enum.DurationTimeModifier

---@class LuaDurationClock

---@class LuaDurationManualClock : LuaDurationClock

---@class NumericFormatter

---@class DurationTextBinding

---@class DurationObject
local DurationObject = {}

---@param modifier DurationTimeModifier?
---@return boolean hasExpired
function DurationObject:HasExpired(modifier) end

---@param modifier DurationTimeModifier?
---@return boolean hasStarted
function DurationObject:HasStarted(modifier) end

---@param modifier DurationTimeModifier?
---@return boolean isActive
function DurationObject:IsActive(modifier) end

---@param curve LuaCurveObjectBase
---@param modifier DurationTimeModifier?
---@return LuaCurveEvaluatedResult result
function DurationObject:EvaluateTotalDuration(curve, modifier) end

---@param formatter NumericFormatter
---@param modifier DurationTimeModifier?
---@return string formatted
function DurationObject:FormatElapsedDuration(formatter, modifier) end

---@param formatter NumericFormatter
---@param modifier DurationTimeModifier?
---@return string formatted
function DurationObject:FormatRemainingDuration(formatter, modifier) end

---@param formatter NumericFormatter
---@param modifier DurationTimeModifier?
---@return string formatted
function DurationObject:FormatTotalDuration(formatter, modifier) end

---@return LuaDurationClock? clock nil means the default clock (GetTime)
function DurationObject:GetClock() end

---@param clock LuaDurationClock? nil for the default clock (GetTime)
function DurationObject:SetClock(clock) end

---@return DurationTextBinding binding
function C_DurationUtil.CreateDurationTextBinding() end

---@return LuaDurationManualClock clock
function C_DurationUtil.CreateManualClock() end

-- Slash commands ------------------------------------------------------------
-- Not Forever-only, but missing from the annotations at the pinned commit.

---Slash command handlers, by key; `SLASH_<key>1`, `SLASH_<key>2`... name the
---commands.
---@type table<string, fun(message: string, editBox: table)>
SlashCmdList = {}

-- The add-on settings API ---------------------------------------------------
-- Not Forever-only, but missing from the annotations at the pinned commit.
-- Only what Turbo's settings page uses.

---@class SettingsCategory

---@class SettingsLayout
local SettingsLayout = {}

---@param initializer SettingsInitializer
function SettingsLayout:AddInitializer(initializer) end

---@class SettingsInitializer

---@class SettingsSetting

---@class SettingsSliderOptions
local SettingsSliderOptions = {}

---@param labelType number MinimalSliderWithSteppersMixin.Label
---@param formatter (fun(value: number): string)?
function SettingsSliderOptions:SetLabelFormatter(labelType, formatter) end

Settings = {}

---@enum Settings.VarType
Settings.VarType = {
	Boolean = "boolean",
	String = "string",
	Number = "number",
}

---@param name string
---@return SettingsCategory category
---@return SettingsLayout layout
function Settings.RegisterVerticalLayoutCategory(name) end

---Lists a category in Options → AddOns.
---@param category SettingsCategory
function Settings.RegisterAddOnCategory(category) end

---A setting whose value lives with the add-on: the page reads it through
---`getValue` and writes it through `setValue`.
---@param category SettingsCategory
---@param variable string unique among every add-on's settings
---@param variableType Settings.VarType
---@param name string
---@param defaultValue any
---@param getValue fun(): any
---@param setValue fun(value: any)
---@return SettingsSetting setting
function Settings.RegisterProxySetting(category, variable, variableType, name, defaultValue, getValue, setValue) end

---@param category SettingsCategory
---@param setting SettingsSetting
---@param tooltip string?
---@return SettingsInitializer initializer
function Settings.CreateCheckbox(category, setting, tooltip) end

---@param minValue number
---@param maxValue number
---@param rate number the step
---@return SettingsSliderOptions options
function Settings.CreateSliderOptions(minValue, maxValue, rate) end

---@param category SettingsCategory
---@param setting SettingsSetting
---@param options SettingsSliderOptions
---@param tooltip string?
---@return SettingsInitializer initializer
function Settings.CreateSlider(category, setting, options, tooltip) end

---A line of heading text on a settings page.
---@param name string
---@param tooltip string?
---@return SettingsInitializer initializer
function CreateSettingsListSectionHeaderInitializer(name, tooltip) end

MinimalSliderWithSteppersMixin = {
	---Where a slider's number sits.
	Label = { Left = 1, Right = 2, Top = 3, Min = 4, Max = 5 },
}

-- Game rules ------------------------------------------------------------------

---Forever's experience preset (Enum.ForeverExperiencePreset: Classic 0,
---Modern 1). Nil off Forever.
---@return number? preset
function C_GameRules.GetForeverExperiencePreset() end

-- Curve utilities -----------------------------------------------------------
-- C_CurveUtil and the curve objects (CreateCurve, CreateColorCurve,
-- EvaluateColorFromBoolean, UnitPowerPercent's curve argument) are covered
-- by the annotations at the pinned commit; nothing to add yet.

-- The aura container --------------------------------------------------------
-- Blizzard's aura container widget, made with
-- CreateFrame("AuraContainer", name, parent, "CustomAuraContainerTemplate").
-- It shows exact aura data (Lightning Shield charges) in combat. Build it out
-- of combat; its child frames are forbidden objects in combat: never query or
-- touch them there.

---@class CustomAuraContainerSlotOptions
---@field candidateFilters { includeSpellIDs: table<number, boolean>? }?
---@field initializeFrame fun(button: CustomAuraButton)?

---@class CustomAuraContainer : Frame
local CustomAuraContainer = {}

---@param unitToken UnitToken
function CustomAuraContainer:SetUnit(unitToken) end

---@return UnitToken? unitToken
function CustomAuraContainer:GetUnit() end

---@param enabled boolean
function CustomAuraContainer:SetEnabled(enabled) end

---@return boolean enabled
function CustomAuraContainer:IsEnabled() end

function CustomAuraContainer:UpdateAllAuras() end

---Adds a slot that shows one matching aura.
---@param slotKey string
---@param filterString string e.g. "HELPFUL"
---@param options CustomAuraContainerSlotOptions
---@return CustomAuraButton? frame
function CustomAuraContainer:AddAuraSlot(slotKey, filterString, options) end

---@param slotKey string
---@return CustomAuraButton? frame
function CustomAuraContainer:GetAuraSlotFrame(slotKey) end

---@class CustomAuraButton : Button
local CustomAuraButton = {}

---@param texture Texture
function CustomAuraButton:SetIcon(texture) end

---@param cooldown Cooldown
function CustomAuraButton:SetDurationCooldown(cooldown) end

---@param fontString FontString
function CustomAuraButton:SetApplicationCount(fontString) end

---@param bar StatusBar
---@param options { minApplications: number?, maxApplications: number? }?
function CustomAuraButton:SetApplicationBar(bar, options) end

---@param fontString FontString
---@param options table?
function CustomAuraButton:SetDurationText(fontString, options) end
