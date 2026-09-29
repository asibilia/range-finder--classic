-- The slash commands: /turbo, and /tb for short.
local _, ns = ...

local safe = ns.safe

local slash = {}
ns.slash = slash

local HELP = {
	"Turbo commands:",
	"  /turbo help - show this help",
	"  /tb - short for /turbo",
}

local function printHelp()
	for _, line in ipairs(HELP) do
		safe.print(line)
	end
end

---Registers /turbo and /tb.
function slash.start()
	safe.slash("TURBO", { "/turbo", "/tb" }, function()
		-- Help is the only command so far; anything typed after it gets help too.
		printHelp()
	end)
end
