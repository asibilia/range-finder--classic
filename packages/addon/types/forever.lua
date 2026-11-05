---@meta
-- Game APIs that Ketho's WoW annotations (pinned in scripts/fetch-tools.ts)
-- don't cover yet. LuaLS reads this file as a library; it never ships.
-- Signatures come from Forever's own API documentation
-- (Blizzard_APIDocumentationGenerated, 1.60.1.70009): GameRulesDocumentation
-- and MacroConstantsDocumentation. Drop anything the annotations gain.

-- Slash commands ------------------------------------------------------------
-- Not Forever-only, but missing from the annotations at the pinned commit.

---Slash command handlers, by key; `SLASH_<key>1`, `SLASH_<key>2`... name the
---commands.
---@type table<string, fun(message: string, editBox: table)>
SlashCmdList = {}

-- Game rules ------------------------------------------------------------------

---Forever's experience preset (Enum.ForeverExperiencePreset: Classic 0,
---Modern 1). Nil off Forever.
---@return number? preset
function C_GameRules.GetForeverExperiencePreset() end

-- The macro limits ---------------------------------------------------------
-- MacroConstantsDocumentation: 120 account macros and 30 per character.
-- Character macros' indexes start after the last account slot.

---@class MacroConsts
---@field MAX_ACCOUNT_MACROS number
---@field MAX_CHARACTER_MACROS number

---@type MacroConsts
Constants.MacroConsts = {
	MAX_ACCOUNT_MACROS = 120,
	MAX_CHARACTER_MACROS = 30,
}
