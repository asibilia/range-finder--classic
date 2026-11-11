-- The slash commands: /turbo, and /tb for short.
local _, ns = ...

local safe = ns.safe
local spellMacros = ns.spellMacros

local slash = {}
ns.slash = slash

local HELP = {
	"Turbo commands:",
	"  /turbo help - show this help",
	"  /turbo macros - make a macro for every spell on your bars, and put them there",
	"  /tb - short for /turbo",
}

local function printHelp()
	for _, line in ipairs(HELP) do
		safe.print(line)
	end
end

---Registers /turbo and /tb.
function slash.start()
	safe.slash("TURBO", { "/turbo", "/tb" }, function(message)
		local command = (message or ""):match("^%s*(%S*)")
		if command:lower() == "macros" then
			spellMacros.run()
		else
			-- Help, and anything Turbo doesn't know.
			printHelp()
		end
	end)
end
