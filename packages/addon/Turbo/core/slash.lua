-- The slash commands: /turbo, and /tb for short.
local _, ns = ...

local safe = ns.safe

local slash = {}
ns.slash = slash

local HELP = {
	"Turbo commands:",
	"  /turbo help - show this help",
	"  /turbo debug - log which values are readable or secret",
	"  /tb - short for /turbo",
}

local function printHelp()
	for _, line in ipairs(HELP) do
		safe.print(line)
	end
end

local function toggleDebug()
	local on = not ns.debug.isOn()
	ns.debug.set(on)
	safe.print("Turbo debug mode is " .. (on and "on" or "off") .. ".")
end

---Registers /turbo and /tb.
function slash.start()
	safe.slash("TURBO", { "/turbo", "/tb" }, function(text)
		local command = string.lower(strtrim(text or ""))
		if command == "debug" then
			toggleDebug()
		else
			-- Anything else, "help" included, gets help.
			printHelp()
		end
	end)
end
