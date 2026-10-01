-- The slash commands: /turbo, and /tb for short.
local _, ns = ...

local safe = ns.safe
local settings = ns.settings
local modules = ns.modules
local attackMacros = ns.attackMacros

local slash = {}
ns.slash = slash

local HELP = {
	"Turbo commands:",
	"  /turbo help - show this help",
	"  /turbo debug - log which values are readable or secret",
	"  /turbo toggle <module> - turn a module on or off",
	"  /turbo always - turn always show on or off",
	"  /turbo macros - make attack macros and put them on your action bars",
	"  /tb - short for /turbo",
}

local function moduleIds()
	local ids = {}
	for _, entry in ipairs(modules.list()) do
		table.insert(ids, entry.id)
	end
	return table.concat(ids, ", ")
end

local function printHelp()
	for _, line in ipairs(HELP) do
		safe.print(line)
	end
	safe.print("Modules: " .. moduleIds())
end

local function onOff(on)
	return on and "on" or "off"
end

local function toggle(typed)
	for _, entry in ipairs(modules.list()) do
		if entry.id:lower() == typed:lower() then
			if modules.isEnabled(entry.id) then
				modules.disable(entry.id)
			else
				modules.enable(entry.id)
			end
			safe.print("Turbo: " .. entry.name .. " is now " .. onOff(modules.isEnabled(entry.id)) .. ".")
			return
		end
	end
	safe.print("Turbo has no module named '" .. typed .. "'. Modules: " .. moduleIds())
end

local function toggleAlwaysShow()
	settings.set("alwaysShow", not settings.get("alwaysShow"))
	safe.print("Turbo: always show is now " .. onOff(settings.get("alwaysShow")) .. ".")
end

local function toggleDebug()
	local on = not ns.debug.isOn()
	ns.debug.set(on)
	safe.print("Turbo debug mode is " .. (on and "on" or "off") .. ".")
end

---Registers /turbo and /tb.
function slash.start()
	safe.slash("TURBO", { "/turbo", "/tb" }, function(message)
		local command, rest = (message or ""):match("^%s*(%S*)%s*(.-)%s*$")
		command = command:lower()
		if command == "debug" then
			toggleDebug()
		elseif command == "toggle" and rest ~= "" then
			toggle(rest)
		elseif command == "always" then
			toggleAlwaysShow()
		elseif command == "macros" then
			attackMacros.run()
		else
			-- Help, and anything Turbo doesn't know.
			printHelp()
		end
	end)
end
