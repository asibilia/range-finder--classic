package core

import (
	"testing"
	"time"
)

func TestPushBackNeverLeavesMoreThanTheCastTime(t *testing.T) {
	hc := Hardcast{Expires: time.Second, CastTime: time.Second}

	steps := []struct {
		at, moved, expires time.Duration
	}{
		{at: 10 * time.Millisecond, moved: 10 * time.Millisecond, expires: 1010 * time.Millisecond},
		{at: 20 * time.Millisecond, moved: 10 * time.Millisecond, expires: 1020 * time.Millisecond},
		{at: 20 * time.Millisecond, moved: 0, expires: 1020 * time.Millisecond},
		{at: 800 * time.Millisecond, moved: SpellPushbackDuration, expires: 1520 * time.Millisecond},
		{at: 900 * time.Millisecond, moved: 380 * time.Millisecond, expires: 1900 * time.Millisecond},
	}
	for _, step := range steps {
		if moved := hc.pushBack(step.at); moved != step.moved || hc.Expires != step.expires {
			t.Fatalf("hit at %v: moved %v to %v, want %v to %v", step.at, moved, hc.Expires, step.moved, step.expires)
		}
	}
}
