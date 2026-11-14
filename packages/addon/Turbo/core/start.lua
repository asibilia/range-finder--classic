-- Starting up. Turbo reads nothing while its files load: the client check
-- runs on PLAYER_LOGIN.
--
-- Turbo runs only on WoW: Forever, told apart by its interface number and
-- flavor (never the project ID, which says retail), for every class. Anywhere
-- else it stays off and says why, once.
local _, ns = ...

local safe = ns.safe

local FOREVER_INTERFACE = 16001
local FOREVER_FLAVOR = "forever"

local function onLogin(event)
	safe.off(event, onLogin)

	if safe.read("interface") ~= FOREVER_INTERFACE or safe.read("flavor") ~= FOREVER_FLAVOR then
		safe.print("Turbo only runs on WoW: Forever, so it stays off on this client.")
		return
	end

	ns.slash.start()
end

safe.on("PLAYER_LOGIN", onLogin)
