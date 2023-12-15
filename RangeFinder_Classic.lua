-- Change to values corresponding to your setup
local WingClip = 8  -- Wing Clip ability slot number
local AutoShot = 11 -- Auto Shot ability slot number

function RangeFinder_Classic_LockFrame()
  RangeFinder_Classic_Frame:EnableMouse(false) -- Disables mouse interaction
  RangeFinder_Classic_Frame:SetMovable(false)  -- Disables moving the frame
  print("RangeFinder_Classic frame locked.")
end

function RangeFinder_Classic_UnlockFrame()
  RangeFinder_Classic_Frame:EnableMouse(true) -- Enables mouse interaction
  RangeFinder_Classic_Frame:SetMovable(true)  -- Enables moving the frame
  print("RangeFinder_Classic frame unlocked.")
end

function RangeFinder_Classic_OnLoad(self)
  RangeFinder_Classic_Frame:Hide()
  _, cl = UnitClass("player")
  if cl ~= "HUNTER" then
    DEFAULT_CHAT_FRAME:AddMessage("RangeFinder_Classic is only for hunters")
    return
  end
  FontString1:SetTextColor(1, 1, 1)

  self:RegisterEvent("PLAYER_TARGET_CHANGED")
  self:RegisterEvent("UNIT_FACTION")

  self:SetScript("OnEvent", RangeFinder_Classic_OnEvent)
  self:SetScript("OnUpdate", RangeFinder_Classic_OnUpdate)

  self:RegisterForDrag("LeftButton")
  self:SetScript("OnDragStart", function()
    self:StartMoving()
  end)
  self:SetScript("OnDragStop", function()
    self:StopMovingOrSizing()
  end)

  DEFAULT_CHAT_FRAME:AddMessage("RangeFinder_Classic Loaded")
  RangeFinder_Classic_UnlockFrame()
end

function SetColor(r, g, b, a)
  if RangeFinder_Classic_Frame.SetBackdropColor then
    -- Increase the alpha value to lighten the color
    local lightAlpha = 0.85 -- Adjust this value as needed, range is 0 (fully transparent) to 1 (fully opaque)
    RangeFinder_Classic_Frame:SetBackdropColor(r, g, b, lightAlpha)
  end
end

function RangeFinder_Classic_OnUpdate()
  if UnitExists("target") then
    local inMeleeRange = IsActionInRange(WingClip)
    local inAutoShotRange = IsActionInRange(AutoShot)

    if inMeleeRange then
      FontString1:SetText("Melee")
      SetColor(1, 1, 0, 1)              -- Yellow Background
      FontString1:SetTextColor(1, 1, 0) -- Yellow
    elseif inAutoShotRange then
      FontString1:SetText("Ranged Shot")
      SetColor(0, 1, 0, 1)              -- Green Background
      FontString1:SetTextColor(0, 1, 0) -- Green
    else
      FontString1:SetText("Out of Range")
      SetColor(1, 0, 0, 1)              -- Red Background
      FontString1:SetTextColor(1, 0, 0) -- Red
    end
    -- Debug messages
    -- DEFAULT_CHAT_FRAME:AddMessage("Checking Range...")
    -- DEFAULT_CHAT_FRAME:AddMessage("Melee Range (Slot " .. WingClip .. "): " .. tostring(inMeleeRange))
    -- DEFAULT_CHAT_FRAME:AddMessage("Auto Shot Range (Slot " .. AutoShot .. "): " .. tostring(inAutoShotRange))
  end
end

function RangeFinder_Classic_OnEvent(self, event, ...)
  if (UnitExists("target") and (not UnitIsDead("target")) and UnitCanAttack("player", "target")) then
    RangeFinder_Classic_Frame:Show()
  else
    RangeFinder_Classic_Frame:Hide()
  end
end

SLASH_RangeFinder_Classic1 = '/RangeFinder_Classic'

SlashCmdList['RangeFinder_Classic'] = function(msg, editbox)
  if msg == 'lock' then
    RangeFinder_Classic_LockFrame()
  elseif msg == 'unlock' then
    RangeFinder_Classic_UnlockFrame()
  else
    print("Use '/RangeFinder_Classic lock' to lock the frame, '/RangeFinder_Classic unlock/' to unlock it.")
  end
end
