-- The Turbo page in Options → AddOns: "always show", then a checkbox per
-- module with the options it declares under it. Every control reads and
-- writes the live setting, so a change made with /turbo shows here too.
local _, ns = ...

local safe = ns.safe
local settings = ns.settings
local modules = ns.modules

local settingsPage = {}
ns.settingsPage = settingsPage

local PAGE_NAME = "Turbo"

local function settingControl(option)
	return {
		kind = option.kind,
		label = option.label,
		key = option.key,
		default = settings.defaults[option.key],
		min = option.min,
		max = option.max,
		step = option.step,
		get = function()
			return settings.get(option.key)
		end,
		set = function(value)
			settings.set(option.key, value)
		end,
	}
end

local function moduleControl(entry)
	return {
		kind = "checkbox",
		label = entry.name,
		key = "module_" .. entry.id,
		default = true,
		get = function()
			return modules.isEnabled(entry.id)
		end,
		set = function(on)
			if on then
				modules.enable(entry.id)
			else
				modules.disable(entry.id)
			end
		end,
	}
end

---Registers the page for a supported class, once its modules have started.
function settingsPage.start()
	local controls = {
		settingControl({ key = "alwaysShow", label = "Always show the card", kind = "checkbox" }),
	}
	for _, entry in ipairs(modules.list()) do
		table.insert(controls, moduleControl(entry))
		for _, option in ipairs(entry.options) do
			table.insert(controls, settingControl(option))
		end
	end
	safe.settingsPage(PAGE_NAME, controls)
end

---Registers a page that only says why Turbo is off for this class.
---@param message string
function settingsPage.unsupported(message)
	safe.settingsPage(PAGE_NAME, { { kind = "text", label = message } })
end
