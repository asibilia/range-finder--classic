-- Turbo starts here, once the safe layer is in place.
local addonName, ns = ...

assert(ns.safe, "Turbo: core/safe-layer.lua must load before every other file")

ns.name = addonName
