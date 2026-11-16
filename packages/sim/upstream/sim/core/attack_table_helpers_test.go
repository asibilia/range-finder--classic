package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

func newVersusTestUnit() (*Unit, *AttackTable, *AttackTable) {
	unit := &Unit{Type: PlayerUnit, Level: 60, auraTracker: newAuraTracker()}
	undead := &Unit{Type: EnemyUnit, Level: 63, MobType: proto.MobType_MobTypeUndead}
	humanoid := &Unit{Type: EnemyUnit, Level: 63, MobType: proto.MobType_MobTypeHumanoid}
	unit.AttackTables = []*AttackTable{NewAttackTable(unit, undead), NewAttackTable(unit, humanoid)}
	return unit, unit.AttackTables[0], unit.AttackTables[1]
}

func TestAddMobTypeBonusStatsAddsAgainstTheNamedTypes(t *testing.T) {
	unit, undead, humanoid := newVersusTestUnit()
	bonus := stats.Stats{stats.AttackPower: 150}

	unit.AddMobTypeBonusStats(bonus, proto.MobType_MobTypeUndead, proto.MobType_MobTypeDemon)
	if got := undead.MobTypeBonusStats[proto.MobType_MobTypeUndead][stats.AttackPower]; got != 150 {
		t.Errorf("Undead attack power %v, want 150", got)
	}
	if got := humanoid.MobTypeBonusStats[proto.MobType_MobTypeHumanoid][stats.AttackPower]; got != 0 {
		t.Errorf("Humanoid attack power %v, want 0", got)
	}

	unit.AddMobTypeBonusStats(bonus.Invert(), proto.MobType_MobTypeUndead)
	if got := undead.MobTypeBonusStats[proto.MobType_MobTypeUndead][stats.AttackPower]; got != 0 {
		t.Errorf("Undead attack power %v after the negative bonus, want 0", got)
	}
}

func TestMultiplyDamageVersusMultipliesOnlyTheNamedTypes(t *testing.T) {
	unit, undead, humanoid := newVersusTestUnit()

	unit.MultiplyDamageVersus(1.05, proto.MobType_MobTypeUndead)
	unit.MultiplyCritDamageVersus(1.05, proto.MobType_MobTypeUndead)
	unit.MultiplyDamageVersus(1.02, proto.MobType_MobTypeDemon, proto.MobType_MobTypeUndead)
	want := 1.0
	want *= 1.05
	want *= 1.02
	if undead.DamageDealtMultiplier != want || undead.CritMultiplier != 1.05 {
		t.Errorf("Undead damage %v and crit %v, want %v and 1.05", undead.DamageDealtMultiplier, undead.CritMultiplier, want)
	}
	if humanoid.DamageDealtMultiplier != 1 || humanoid.CritMultiplier != 1 {
		t.Errorf("Humanoid damage %v and crit %v, want 1 and 1", humanoid.DamageDealtMultiplier, humanoid.CritMultiplier)
	}
}

func TestAddArmorIgnoreFactorAddsToEveryTable(t *testing.T) {
	unit, undead, humanoid := newVersusTestUnit()

	unit.AddArmorIgnoreFactor(0.15)
	unit.AddArmorIgnoreFactor(-0.05)
	for _, at := range []*AttackTable{undead, humanoid} {
		if !WithinToleranceFloat64(0.10, at.ArmorIgnoreFactor, 1e-12) {
			t.Errorf("armor ignored %v, want 0.10", at.ArmorIgnoreFactor)
		}
	}
}

func TestAttachMobTypeBonusStatsFollowsTheAura(t *testing.T) {
	unit, undead, _ := newVersusTestUnit()
	aura := unit.RegisterAura(Aura{Label: "Versus", Duration: NeverExpires}).
		AttachMobTypeBonusStats(stats.Stats{stats.SpellDamage: 58}, proto.MobType_MobTypeUndead)

	aura.OnGain(aura, nil)
	if got := undead.MobTypeBonusStats[proto.MobType_MobTypeUndead][stats.SpellDamage]; got != 58 {
		t.Errorf("spell damage against Undead %v while up, want 58", got)
	}
	aura.OnExpire(aura, nil)
	if got := undead.MobTypeBonusStats[proto.MobType_MobTypeUndead][stats.SpellDamage]; got != 0 {
		t.Errorf("spell damage against Undead %v after expiry, want 0", got)
	}
}
