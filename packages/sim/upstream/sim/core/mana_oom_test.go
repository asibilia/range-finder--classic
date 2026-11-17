package core

import (
	"testing"
	"time"
)

const unaffordableCost = 20000

// A spell paying cost mana that records when its effects apply, on the GCD when instant.
func manaSpellConfig(id int32, cost int32, castTime time.Duration, castAt *[]time.Duration) SpellConfig {
	config := paidSpellConfig(id, castTime)
	config.ManaCost.FlatCost = cost
	if castTime == 0 {
		config.Cast.DefaultCast.GCD = GCDDefault
	}
	config.ApplyEffects = func(sim *Simulation, _ *Unit, _ *Spell) {
		*castAt = append(*castAt, sim.CurrentTime)
	}
	return config
}

func TestOOMTracking(t *testing.T) {
	t.Run("a costlier spell skipped for mana while a cheaper filler casts is OOM", func(t *testing.T) {
		var filler *Spell
		var fillerCasts []time.Duration
		ct := newManaTickTest(func(char *Character) *Spell {
			filler = char.RegisterSpell(manaSpellConfig(910320, 100, 0, &fillerCasts))
			return char.RegisterSpell(manaSpellConfig(910321, unaffordableCost, 0, new([]time.Duration)))
		})
		filler.finalize()
		ct.start(ct.castOf(ct.spell), ct.castOf(filler))
		ct.runUntil(10 * time.Second)
		if len(fillerCasts) == 0 {
			t.Fatal("the filler was never cast")
		}
		if !ct.fw.IsOOM() || ct.fw.Metrics.FirstOOMTimestamp != 0 {
			t.Errorf("OOM %v from %v, want OOM from the pull", ct.fw.IsOOM(), ct.fw.Metrics.FirstOOMTimestamp)
		}
	})

	t.Run("OOM ends at the first pass after the GCD that skips no spell for mana", func(t *testing.T) {
		var costlyCasts []time.Duration
		var filler *Spell
		ct := newManaTickTest(func(char *Character) *Spell {
			filler = char.RegisterSpell(manaSpellConfig(910328, 100, 0, new([]time.Duration)))
			return char.RegisterSpell(manaSpellConfig(910329, unaffordableCost, 0, &costlyCasts))
		})
		filler.finalize()
		ct.start(ct.castOf(ct.spell), ct.castOf(filler))
		midGCD := GCDDefault / 2
		ct.runUntil(midGCD)
		ct.spell.Cost.FlatModifier = 100 - unaffordableCost
		ct.fw.ReactToEvent(ct.sim, false, false)
		ct.runUntil(midGCD)
		if !ct.fw.IsOOM() {
			t.Fatal("a pass during the GCD ended OOM")
		}
		ct.runUntil(GCDDefault + time.Second)
		if len(costlyCasts) == 0 || costlyCasts[0] != GCDDefault {
			t.Fatalf("costlier spell cast at %v, want at the end of the first GCD", costlyCasts)
		}
		if got := ct.fw.Metrics.OOMTime; ct.fw.IsOOM() || got != GCDDefault {
			t.Errorf("OOM %v with %v OOM time, want %v: from the pull to the end of the GCD", ct.fw.IsOOM(), got, GCDDefault)
		}
	})

	t.Run("an unaffordable spell on cooldown is not OOM until its cooldown ends", func(t *testing.T) {
		ct := newManaTickTest(func(char *Character) *Spell {
			config := manaSpellConfig(910322, unaffordableCost, 0, new([]time.Duration))
			config.Cast.CD = Cooldown{Timer: char.NewTimer(), Duration: time.Minute}
			return char.RegisterSpell(config)
		})
		cooldownEnd := 5 * time.Second
		ct.spell.CD.Set(cooldownEnd)
		ct.start(ct.castOf(ct.spell))
		ct.runUntil(cooldownEnd - time.Second)
		if ct.fw.IsOOM() || ct.fw.Metrics.WentOOM {
			t.Fatalf("OOM from %v while the spell was on cooldown", ct.fw.Metrics.FirstOOMTimestamp)
		}
		ct.runUntil(cooldownEnd + time.Second)
		if !ct.fw.IsOOM() || ct.fw.Metrics.FirstOOMTimestamp < cooldownEnd {
			t.Errorf("OOM %v from %v, want OOM from %v, when the cooldown ends", ct.fw.IsOOM(), ct.fw.Metrics.FirstOOMTimestamp, cooldownEnd)
		}
	})

	t.Run("an unaffordable cast-time spell is not OOM while the unit moves", func(t *testing.T) {
		ct := newManaTickTest(func(char *Character) *Spell {
			return char.RegisterSpell(manaSpellConfig(910330, unaffordableCost, 2*time.Second, new([]time.Duration)))
		})
		moveEnd := 3 * time.Second
		ct.start(ct.castOf(ct.spell))
		ct.fw.MoveDuration(moveEnd, ct.sim)
		ct.runUntil(moveEnd - time.Second)
		if ct.fw.IsOOM() || ct.fw.Metrics.WentOOM {
			t.Fatalf("OOM from %v while moving", ct.fw.Metrics.FirstOOMTimestamp)
		}
		ct.runUntil(moveEnd + time.Second)
		if !ct.fw.IsOOM() || ct.fw.Metrics.FirstOOMTimestamp < moveEnd {
			t.Errorf("OOM %v from %v, want OOM from %v, when the unit stops", ct.fw.IsOOM(), ct.fw.Metrics.FirstOOMTimestamp, moveEnd)
		}
	})

	t.Run("an unaffordable off-GCD spell checked during the GCD is not OOM", func(t *testing.T) {
		var offGCD *Spell
		ct := newManaTickTest(func(char *Character) *Spell {
			config := paidSpellConfig(910331, 0)
			config.ManaCost.FlatCost = unaffordableCost
			offGCD = char.RegisterSpell(config)
			return char.RegisterSpell(manaSpellConfig(910332, 100, 0, new([]time.Duration)))
		})
		offGCD.finalize()
		ct.start(ct.castOf(ct.spell), ct.castOf(offGCD))
		midGCD := GCDDefault - MaxSpellQueueWindow - 100*time.Millisecond
		ct.runUntil(midGCD)
		ct.fw.ReactToEvent(ct.sim, false, false)
		ct.runUntil(midGCD)
		if ct.fw.IsOOM() || ct.fw.Metrics.WentOOM {
			t.Errorf("OOM from %v while the GCD ran", ct.fw.Metrics.FirstOOMTimestamp)
		}
	})

	t.Run("a stall on an unaffordable spell is OOM until a mana spell starts casting", func(t *testing.T) {
		castTime := 3 * time.Second
		ct := newManaTickTest(func(char *Character) *Spell {
			return char.RegisterSpell(manaSpellConfig(910323, unaffordableCost, castTime, new([]time.Duration)))
		})
		ct.start(ct.castOf(ct.spell))
		ct.runUntil(2 * time.Second)
		if !ct.fw.IsOOM() || ct.fw.Metrics.FirstOOMTimestamp != 0 {
			t.Fatalf("OOM %v from %v, want OOM from the pull", ct.fw.IsOOM(), ct.fw.Metrics.FirstOOMTimestamp)
		}
		ct.spell.Cost.FlatModifier = 100 - unaffordableCost
		for at := 2*time.Second + manaTestStep; ct.fw.Hardcast.Expires <= ct.sim.CurrentTime; at += manaTestStep {
			if at > 5*time.Second {
				t.Fatal("the spell never started casting once affordable")
			}
			ct.runUntil(at)
		}
		castStart := ct.fw.Hardcast.Expires - castTime
		if ct.fw.IsOOM() {
			t.Errorf("still OOM during the cast started at %v", castStart)
		}
		if got := ct.fw.Metrics.OOMTime; got != castStart {
			t.Errorf("%v OOM time, want %v: from the pull to the cast's start", got, castStart)
		}
	})

	t.Run("the queue check during a hardcast counts the mana the cast has yet to pay", func(t *testing.T) {
		var costly, cheap *Spell
		var hardcastAt []time.Duration
		ct := newManaTickTest(func(char *Character) *Spell {
			costly = char.RegisterSpell(manaSpellConfig(910325, 9950, 0, new([]time.Duration)))
			cheap = char.RegisterSpell(manaSpellConfig(910326, 50, 0, new([]time.Duration)))
			return char.RegisterSpell(manaSpellConfig(910324, 9950, 3*time.Second, &hardcastAt))
		})
		costly.finalize()
		cheap.finalize()
		ct.start()
		if !ct.spell.Cast(ct.sim, ct.fw.CurrentTarget) {
			t.Fatal("the hardcast was not cast")
		}
		ct.runUntil(2900 * time.Millisecond)
		target := ct.fw.CurrentTarget
		if costly.CanCastOrQueue(ct.sim, target) {
			t.Error("a spell the mana left after the hardcast cannot pay for is queueable")
		}
		if !cheap.CanCastOrQueue(ct.sim, target) {
			t.Error("a spell the mana left after the hardcast pays for is not queueable")
		}
		ct.runUntil(3 * time.Second)
		if len(hardcastAt) != 1 || ct.fw.CurrentMana() != 50 {
			t.Errorf("hardcast completed %d times with %v mana left, want once with the cost paid once", len(hardcastAt), ct.fw.CurrentMana())
		}
	})

	t.Run("wanding while a mana spell is unaffordable stays OOM", func(t *testing.T) {
		var nuke *Spell
		var shots, nukeCasts []time.Duration
		ct := newManaTickTest(func(char *Character) *Spell {
			nuke = char.RegisterSpell(manaSpellConfig(910327, unaffordableCost, 0, &nukeCasts))
			return fakeShoot(char, &shots)
		})
		nuke.finalize()
		ct.start(ct.castOf(nuke), ct.castOf(ct.spell))
		ct.runUntil(10 * time.Second)
		if len(shots) < 2 {
			t.Fatalf("%d shots, want several separate Shoot casts", len(shots))
		}
		if !ct.fw.IsOOM() || ct.fw.Metrics.FirstOOMTimestamp != 0 {
			t.Fatalf("OOM %v from %v while wanding, want OOM from the pull", ct.fw.IsOOM(), ct.fw.Metrics.FirstOOMTimestamp)
		}
		nuke.Cost.FlatModifier = 100 - unaffordableCost
		ct.runUntil(15 * time.Second)
		if len(nukeCasts) == 0 {
			t.Fatal("the mana spell was never cast once affordable")
		}
		if got := ct.fw.Metrics.OOMTime; got != nukeCasts[0] {
			t.Errorf("%v OOM time, want %v: from the pull to the mana spell's cast", got, nukeCasts[0])
		}
	})
}
