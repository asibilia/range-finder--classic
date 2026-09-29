-- The self-timer helper: countdowns Turbo runs on its own clock, started from
-- plain events (a totem cast, say) instead of reading the game's secret timer.
local _, ns = ...

local safe = ns.safe

local timers = {}
ns.timers = timers

---@class TurboSelfTimer
---@field startedAt number
---@field duration number
---@field cancelled boolean?
local SelfTimer = {}
SelfTimer.__index = SelfTimer

---Seconds left, never below zero.
---@return number
function SelfTimer:remaining()
	if self.cancelled then
		return 0
	end
	return math.max(0, self.startedAt + self.duration - safe.now())
end

---Whether the countdown has run out (or was cancelled).
---@return boolean
function SelfTimer:expired()
	return self:remaining() <= 0
end

---Stops the countdown; its `onDone` never runs.
function SelfTimer:cancel()
	self.cancelled = true
end

---Starts a countdown now.
---@param duration number seconds
---@param onDone fun()? runs when it runs out, unless cancelled first
---@return TurboSelfTimer
function timers.start(duration, onDone)
	local timer = setmetatable({ startedAt = safe.now(), duration = duration }, SelfTimer)
	if onDone then
		safe.after(duration, function()
			if not timer.cancelled then
				onDone()
			end
		end)
	end
	return timer
end
