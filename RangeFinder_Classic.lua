-- Change to values corresponding to your setup
local WingClip = 8         -- Wing Clip ability slot number
local AutoShot = 11        -- Auto Shot ability slot number
local displayMode = "auto" -- Default to "auto"

local function DelayedLockFrame()
  if RangeFinderClassicData and RangeFinderClassicData.isLocked then
    RangeFinder_Classic_Frame:EnableMouse(false)
    RangeFinder_Classic_Frame:SetMovable(false)
    RangeFinder_Classic_Frame:RegisterForDrag() -- Disable dragging
    print("Range Finder Classic frame locked.")
  end
end

function RangeFinder_Classic_LockFrame()
  RangeFinderClassicData.isLocked = true
  C_Timer.After(0.5, DelayedLockFrame) -- Delay locking by 0.5 seconds
end

function RangeFinder_Classic_UnlockFrame()
  RangeFinderClassicData.isLocked = false
  RangeFinder_Classic_Frame:EnableMouse(true)
  RangeFinder_Classic_Frame:SetMovable(true)
  RangeFinder_Classic_Frame:RegisterForDrag("LeftButton") -- Re-enable dragging
  print("Range Finder Classic frame unlocked.")
end

function SetColor(r, g, b, a)
  if RangeFinder_Classic_Frame.SetBackdropColor then
    local lightAlpha = 0.85
    RangeFinder_Classic_Frame:SetBackdropColor(r, g, b, lightAlpha)
  end
end

function RangeFinder_Classic_OnLoad(self)
  RangeFinder_Classic_Frame:Hide()

  self:RegisterEvent("VARIABLES_LOADED")
  self:RegisterEvent("PLAYER_TARGET_CHANGED")
  self:RegisterEvent("UNIT_FACTION")
  self:RegisterEvent("PLAYER_ENTERING_WORLD")

  local _, playerClass = UnitClass("player")
  if playerClass ~= "HUNTER" then
    DEFAULT_CHAT_FRAME:AddMessage("Range Finder Classic is only for hunters")
    return
  end

  RangeText:SetTextColor(1, 1, 1)

  self:SetScript("OnEvent", RangeFinder_Classic_OnEvent)
  self:SetScript("OnUpdate", RangeFinder_Classic_OnUpdate)

  self:RegisterForDrag("LeftButton")
  self:SetScript("OnDragStart", function()
    self:StartMoving()
  end)
  self:SetScript("OnDragStop", function()
    self:StopMovingOrSizing()
    if not RangeFinderClassicData then
      RangeFinderClassicData = {
        isLocked = false,
        wingClipSlot = 8,
        autoShotSlot = 11
      }
    end
    -- Save the new position
    local point, _, relativePoint, xOfs, yOfs = self:GetPoint()
    RangeFinderClassicData.framePosition = {
      point = point,
      relativePoint = relativePoint,
      xOfs = xOfs,
      yOfs = yOfs
    }
  end)

  DEFAULT_CHAT_FRAME:AddMessage("Range Finder Classic Loaded")
end

function RangeFinder_Classic_OnEvent(self, event, ...)
  if event == "VARIABLES_LOADED" then
    -- Initialize RangeFinderClassicData if it doesn't exist
    if not RangeFinderClassicData then
      RangeFinderClassicData = {
        isLocked = false,
        wingClipSlot = 8,
        autoShotSlot = 11,
        displayMode = "auto" -- Default display mode
      }
    end

    -- Set the initial values based on saved data
    WingClip = RangeFinderClassicData.wingClipSlot
    AutoShot = RangeFinderClassicData.autoShotSlot
    displayMode = RangeFinderClassicData.displayMode or "auto"

    -- Set frame position
    if RangeFinderClassicData.framePosition then
      self:ClearAllPoints()
      self:SetPoint(
        RangeFinderClassicData.framePosition.point,
        UIParent,
        RangeFinderClassicData.framePosition.relativePoint,
        RangeFinderClassicData.framePosition.xOfs,
        RangeFinderClassicData.framePosition.yOfs
      )
    end

    -- Apply lock or unlock state
    if RangeFinderClassicData.isLocked then
      RangeFinder_Classic_LockFrame()
    else
      RangeFinder_Classic_UnlockFrame()
    end
  end

  -- Visibility handling for all events
  if displayMode == "always" then
    RangeFinder_Classic_Frame:Show()
  elseif displayMode == "auto" then
    if UnitExists("target") and not UnitIsDead("target") and UnitCanAttack("player", "target") then
      RangeFinder_Classic_Frame:Show()
    else
      RangeFinder_Classic_Frame:Hide()
    end
  end
end

function RangeFinder_Classic_OnUpdate()
  if UnitExists("target") then
    local inMeleeRange = IsActionInRange(WingClip)
    local inAutoShotRange = IsActionInRange(AutoShot)

    if inMeleeRange then
      RangeText:SetText("Melee")
      SetColor(1, 1, 0, 1)            -- Yellow Background
      RangeText:SetTextColor(1, 1, 0) -- Yellow
    elseif inAutoShotRange then
      RangeText:SetText("Ranged Shot")
      SetColor(0, 1, 0, 1)            -- Green Background
      RangeText:SetTextColor(0, 1, 0) -- Green
    else
      RangeText:SetText("Out of Range")
      SetColor(1, 0, 0, 1)            -- Red Background
      RangeText:SetTextColor(1, 0, 0) -- Red
    end
    -- Debug messages
    -- DEFAULT_CHAT_FRAME:AddMessage("Checking Range...")
    -- DEFAULT_CHAT_FRAME:AddMessage("Melee Range (Slot " .. WingClip .. "): " .. tostring(inMeleeRange))
    -- DEFAULT_CHAT_FRAME:AddMessage("Auto Shot Range (Slot " .. AutoShot .. "): " .. tostring(inAutoShotRange))
  else
    if displayMode == "always" then
      RangeText:SetText("No Target")
      SetColor(0.5, 0.5, 0.5, 1)            -- Gray Background
      RangeText:SetTextColor(0.5, 0.5, 0.5) -- Gray
      RangeFinder_Classic_Frame:Show()
    elseif displayMode == "auto" then
      RangeFinder_Classic_Frame:Hide()
    end
  end
end

-- Slash Command Setup
SLASH_RF1 = '/rf'

SlashCmdList['RF'] = function(msg)
  -- Split the message into arguments
  local args = {}
  for word in msg:gmatch("%S+") do
    table.insert(args, word)
  end

  -- Check the first argument to determine the action
  local command = args[1] and args[1]:lower() or ""

  if command == "show" then
    if args[2] == "always" then
      displayMode = "always"
      RangeFinderClassicData.displayMode = "always"
      RangeFinder_Classic_Frame:Show()
      print("Range Finder Classic will always show the frame.")
    elseif args[2] == "auto" then
      displayMode = "auto"
      RangeFinderClassicData.displayMode = "auto"
      print("Range Finder Classic will auto show/hide the frame.")
    else
      print("Usage: /rf show always | /rf show auto")
    end
  elseif command == "frame" then
    if args[2] == "lock" then
      RangeFinder_Classic_LockFrame()
    elseif args[2] == "unlock" then
      RangeFinder_Classic_UnlockFrame()
    else
      print("Usage: /rf frame lock | /rf frame unlock")
    end
  elseif command == "wingclip" then
    local slot = tonumber(args[2])
    if slot then
      WingClip = slot
      RangeFinderClassicData.wingClipSlot = slot
      print("Wing Clip slot set to:", slot)
    else
      print("Invalid slot for Wing Clip.")
    end
  elseif command == "autoshot" then
    local slot = tonumber(args[2])
    if slot then
      AutoShot = slot
      RangeFinderClassicData.autoShotSlot = slot
      print("Auto Shot slot set to:", slot)
    else
      print("Invalid slot for Auto Shot.")
    end
  else
    print([[
      Range Finder (Classic) Commands:
/rf show [auto|always] - Set when the frame is shown.
eg. /rf show auto

/rf frame [lock|unlock] - Lock or unlock the frame.
eg. /rf frame lock

/rf wingclip [n] - Set the slot number for Wing Clip.
eg. /rf wingclip 8

/rf autoshot [n] - Set the slot number for Auto Shot.
eg. /rf autoshot 11
]])
  end
end
