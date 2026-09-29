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

---@class WeaponEnchantInfo
---@field hasEnchant boolean
---@field enchantType number Enum.ItemEnchantType
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
