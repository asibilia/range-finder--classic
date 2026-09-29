-- Reminders: a silent, glowing icon of something missing (the weapon imbue,
-- Lightning Shield), shown just above the HUD card, even while the card is
-- hidden. Any module raises one with `ns.reminders.show(id, icon)` and drops
-- it with `ns.reminders.hide(id)`.
--
-- Reminders stay quiet while resting (in town or an inn), mounted or on a
-- flight path.
local _, ns = ...

local safe = ns.safe
local events = ns.events

local MODULE_ID = "reminders"
local read = ns.debug.reader(MODULE_ID)

local reminders = {}
ns.reminders = reminders

local SIZE = 32
local SPACING = 6
-- Space between the reminders and the card below them.
local GAP = 6
local GLOW_SIZE = SIZE * 1.8
local GLOW_TEXTURE = "Interface\\Buttons\\UI-ActionButton-Border"

-- The game events after which resting, mounted or on a flight path may have
-- changed. A flight path takes and gives back control of the character.
local SUPPRESSION_EVENTS = {
	"PLAYER_UPDATE_RESTING",
	"PLAYER_MOUNT_DISPLAY_CHANGED",
	"PLAYER_CONTROL_LOST",
	"PLAYER_CONTROL_GAINED",
}

---Raised reminders, in the order they were raised.
---@type { id: string, icon: number }[]
local raised = {}
local enabled = false
local suppressed = false
local container
---@type { frame: table, icon: table }[]
local slots = {}

local function build()
	container = safe.createFrame("Frame", "TurboReminders")
	container:SetSize(SIZE, SIZE)
	container:SetFrameStrata("MEDIUM")
	-- Anchored to the card, not inside it: the card fades away when the
	-- player isn't engaged, and reminders don't.
	container:SetPoint("BOTTOM", ns.card.frame, "TOP", 0, GAP)
	container:Hide()
end

local function slotAt(index)
	local slot = slots[index]
	if slot then
		return slot
	end
	local frame = safe.createFrame("Frame", nil, container)
	frame:SetSize(SIZE, SIZE)
	frame:SetPoint("LEFT", container, "LEFT", (index - 1) * (SIZE + SPACING), 0)
	local icon = frame:CreateTexture(nil, "ARTWORK")
	icon:SetAllPoints()
	local glow = frame:CreateTexture(nil, "OVERLAY")
	glow:SetTexture(GLOW_TEXTURE)
	glow:SetBlendMode("ADD")
	glow:SetVertexColor(1, 0.82, 0)
	glow:SetSize(GLOW_SIZE, GLOW_SIZE)
	glow:SetPoint("CENTER", frame, "CENTER")
	slot = { frame = frame, icon = icon }
	slots[index] = slot
	return slot
end

local function refresh()
	if not container then
		return
	end
	local count = 0
	if enabled and not suppressed then
		for _, reminder in ipairs(raised) do
			count = count + 1
			local slot = slotAt(count)
			slot.icon:SetTexture(reminder.icon)
			slot.frame:Show()
		end
	end
	for index = count + 1, #slots do
		slots[index].frame:Hide()
	end
	if count == 0 then
		container:Hide()
		return
	end
	container:SetWidth(count * SIZE + (count - 1) * SPACING)
	container:Show()
end

local function readSuppressed()
	suppressed = read("resting") == true or read("mounted") == true or read("onTaxi") == true
end

local function onSuppressionChanged()
	readSuppressed()
	refresh()
end

---Raises a reminder, or changes the icon of one already raised.
---@param id string the module's own key ("lightningShield")
---@param icon number the missing thing's icon (file ID)
function reminders.show(id, icon)
	for _, reminder in ipairs(raised) do
		if reminder.id == id then
			if reminder.icon ~= icon then
				reminder.icon = icon
				refresh()
			end
			return
		end
	end
	table.insert(raised, { id = id, icon = icon })
	refresh()
end

---Drops a reminder raised with `show`.
---@param id string
function reminders.hide(id)
	for index = #raised, 1, -1 do
		if raised[index].id == id then
			table.remove(raised, index)
			refresh()
		end
	end
end

ns.modules.register(MODULE_ID, {
	name = "Reminders",
	onEnable = function()
		if not container then
			build()
		end
		enabled = true
		for _, event in ipairs(SUPPRESSION_EVENTS) do
			events.on(event, onSuppressionChanged)
		end
		onSuppressionChanged()
	end,
	onDisable = function()
		enabled = false
		for _, event in ipairs(SUPPRESSION_EVENTS) do
			events.off(event, onSuppressionChanged)
		end
		refresh()
	end,
})
