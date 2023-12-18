-- Change to values corresponding to your setup
local WingClip = 8  -- Wing Clip ability slot number
local AutoShot = 11 -- Auto Shot ability slot number

function RangeFinder_Classic_LockFrame()
  RangeFinderClassicData.isLocked = true
  RangeFinder_Classic_Frame:EnableMouse(false)
  RangeFinder_Classic_Frame:SetMovable(false)
  RangeFinder_Classic_Frame:RegisterForDrag() -- Disable dragging
  print("Range Finder Classic frame locked.")
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
    if not RangeFinderClassicData then
      RangeFinderClassicData = {
        isLocked = false,
        wingClipSlot = 8,
        autoShotSlot = 11
      }
    end

    WingClip = RangeFinderClassicData.wingClipSlot
    AutoShot = RangeFinderClassicData.autoShotSlot

    -- Set frame position
    if RangeFinderClassicData.framePosition then
      self:SetPoint(
        RangeFinderClassicData.framePosition.point,
        UIParent,
        RangeFinderClassicData.framePosition.relativePoint,
        RangeFinderClassicData.framePosition.xOfs,
        RangeFinderClassicData.framePosition.yOfs
      )
    end

    if RangeFinderClassicData.isLocked then
      RangeFinder_Classic_LockFrame()
    else
      RangeFinder_Classic_UnlockFrame()
    end
  elseif (UnitExists("target") and (not UnitIsDead("target")) and UnitCanAttack("player", "target")) then
    RangeFinder_Classic_Frame:Show()
  else
    RangeFinder_Classic_Frame:Hide()
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

  if command == "frame" then
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
    print("Invalid command. Usage: /rf [frame|wingclip|autoshot] [lock|unlock|n]")
  end
end
