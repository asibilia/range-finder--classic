-- Starting up. Turbo reads nothing while its files load: saved data loads on
-- ADDON_LOADED, and the client and class checks run on PLAYER_LOGIN.
--
-- Turbo runs only on WoW: Forever, told apart by its interface number and
-- flavor (never the project ID, which says retail), and only for a class with
-- a class kit. Anywhere else it stays off and says why, once.
local addonName, ns = ...

local safe = ns.safe

local FOREVER_INTERFACE = 16001
local FOREVER_FLAVOR = "forever"

-- English only in v1: class names for the "not supported yet" message.
local CLASS_PLURALS = {
	WARRIOR = "Warriors",
	PALADIN = "Paladins",
	HUNTER = "Hunters",
	ROGUE = "Rogues",
	PRIEST = "Priests",
	SHAMAN = "Shamans",
	MAGE = "Mages",
	WARLOCK = "Warlocks",
	DRUID = "Druids",
}

local function onAddonLoaded(event, name)
	if name ~= addonName then
		return
	end
	safe.off(event, onAddonLoaded)
	ns.settings.load()
end

local function onLogin(event)
	safe.off(event, onLogin)

	if safe.read("interface") ~= FOREVER_INTERFACE or safe.read("flavor") ~= FOREVER_FLAVOR then
		safe.print("Turbo only runs on WoW: Forever, so it stays off on this client.")
		return
	end

	local className, classToken = safe.read("playerClass")
	local kit = ns.classKits[classToken]
	if not kit then
		local classes = CLASS_PLURALS[classToken] or className or "your class"
		local message = "Turbo doesn't support " .. classes .. " yet."
		safe.print(message)
		ns.settingsPage.unsupported(message)
		return
	end

	ns.settings.useClass(classToken)
	ns.restrictions.start()
	-- The card first, so modules find its rows to fill.
	ns.card.start()
	ns.modules.start(kit)
	-- After the modules' first reads, so a login in debug mode doesn't flood
	-- chat; what they read from here on is logged.
	ns.debug.start()
	ns.slash.start()
	ns.settingsPage.start()
end

safe.on("ADDON_LOADED", onAddonLoaded)
safe.on("PLAYER_LOGIN", onLogin)
