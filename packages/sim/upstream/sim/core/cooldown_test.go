package core

import (
	"testing"
	"time"
)

const fakeSharedCategory int32 = 65

var fakeCategorySpellActionIDs = [2]ActionID{{SpellID: 11951}, {SpellID: 11952}}

// Two spells in the same game files spell category, which the game puts on one cooldown.
func (fw *FakeRageWarrior) registerFakeCategorySpells() {
	for _, actionID := range fakeCategorySpellActionIDs {
		fw.RegisterSpell(SpellConfig{
			ActionID: actionID,
			Cast: CastConfig{
				CD: Cooldown{
					Timer:    fw.CategoryTimer(fakeSharedCategory),
					Duration: time.Minute,
				},
			},
		})
	}
}

func TestCategoryTimerIsSharedByCategory(t *testing.T) {
	sim := SetupFakeRageSim()
	fw := sim.Raid.Parties[0].Players[0].(*FakeRageWarrior)

	if fw.CategoryTimer(fakeSharedCategory) != fw.CategoryTimer(fakeSharedCategory) {
		t.Error("the same category should hand out the same timer")
	}
	if fw.CategoryTimer(fakeSharedCategory) == fw.CategoryTimer(88) {
		t.Error("different categories should hand out different timers")
	}
}

func TestCategoryTimerBlocksTheWholeCategory(t *testing.T) {
	sim := SetupFakeRageSim()
	fw := sim.Raid.Parties[0].Players[0].(*FakeRageWarrior)
	first := fw.GetSpell(fakeCategorySpellActionIDs[0])
	second := fw.GetSpell(fakeCategorySpellActionIDs[1])
	target := sim.Encounter.ActiveTargetUnits[0]

	if !first.CanCast(sim, target) || !second.CanCast(sim, target) {
		t.Fatal("both spells should be ready before either is cast")
	}

	if !first.Cast(sim, target) {
		t.Fatal("the first spell should cast")
	}

	if second.CanCast(sim, target) {
		t.Error("the second spell should be on cooldown after the first was cast")
	}

	sim.CurrentTime = time.Minute
	if !second.CanCast(sim, target) {
		t.Error("the second spell should be ready once the category's cooldown has elapsed")
	}
}

// The category timers are created through NewTimer, so the per-iteration reset covers them.
func TestCategoryTimerIsResetEachIteration(t *testing.T) {
	sim := SetupFakeRageSim()
	fw := sim.Raid.Parties[0].Players[0].(*FakeRageWarrior)
	timer := fw.CategoryTimer(fakeSharedCategory)

	timer.Set(time.Minute)
	fw.Unit.resetCDs(sim)

	if timer.ReadyAt() != startingCDTime {
		t.Errorf("category timer after a reset: %v, want %v", timer.ReadyAt(), startingCDTime)
	}
}
