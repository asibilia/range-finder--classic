-- The Shaman class kit: every v1 module, all on from the start (there's no
-- spec detection), and the attack spells /turbo macros makes macros for.
local _, ns = ...

ns.classKits.SHAMAN = {
	modules = {
		"rangeFinder",
		"swingTimer",
		"totemTimers",
		"weaponImbue",
		"lightningShield",
		"keyCooldowns",
		"manaBar",
		"maelstromWeapon",
		"reminders",
	},
	-- By rank-1 spell ID. The macros cast by name, so they cast the top rank.
	attackSpells = {
		8042, -- Earth Shock
		8050, -- Flame Shock
		8056, -- Frost Shock
		403, -- Lightning Bolt
		421, -- Chain Lightning
	},
}
