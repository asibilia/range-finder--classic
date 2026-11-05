-- Turbo starts here, once the safe layer is in place.
local addonName, ns = ...

assert(ns.safe, "Turbo: core/safe-layer.lua must load before every other file")

ns.name = addonName

---What Turbo gives one class.
---@class TurboClassKit
---@field attackSpells number[]? the spells /turbo macros makes attack macros for, by rank-1 spell ID

---Class kits, by class token ("SHAMAN"). A class without one isn't supported.
---@type table<string, TurboClassKit>
ns.classKits = {}
