package spelldata

import (
	"math"
	"testing"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/dbcenums"
)

func attackDamage(spell *core.Spell, target *core.Character) float64 {
	return spell.CalcDamage(&core.Simulation{}, &target.Unit, 1000, spell.OutcomeAlwaysHitNoHitCounter).Damage
}

// Shadowform 16592: 20% less melee damage taken, and nothing off a ranged attack.
func TestMeleeDamageTakenLeavesRangedAlone(t *testing.T) {
	sim := &core.Simulation{}
	attacker, _, target := casterScene()
	row := &Spell{ID: 16592, Name: "Shadowform", DurationMs: -1,
		Effects: []Effect{{SpellID: 16592, Type: dbcenums.E_APPLY_AURA,
			Aura: dbcenums.A_MOD_MELEE_DAMAGE_TAKEN_PCT, BasePoints: -20}}}

	melee := parseSpell(attacker, 1, core.SpellSchoolPhysical, core.ProcMaskMeleeMHAuto, core.ClassFlags{})
	ranged := parseSpell(attacker, 2, core.SpellSchoolPhysical, core.ProcMaskRangedAuto, core.ClassFlags{})
	table := attacker.AttackTables[0]

	aura := target.RegisterAura(AuraConfig(row))
	ParseEffects(target, aura, row)
	aura.Activate(sim)

	if got := melee.TargetDamageMultiplier(sim, table, false); math.Abs(got-0.8) > 1e-9 {
		t.Errorf("a melee attack: %v, want 0.8", got)
	}
	if got := ranged.TargetDamageMultiplier(sim, table, false); got != 1 {
		t.Errorf("a ranged attack: %v, want 1", got)
	}

	aura.Deactivate(sim)
	if got := melee.TargetDamageMultiplier(sim, table, false); got != 1 {
		t.Errorf("a melee attack after the aura dropped: %v, want 1", got)
	}
}

// Windwall 15108: 32 less damage off each physical ranged attack, and nothing off a melee one.
func TestRangedDamageTakenLeavesMeleeAlone(t *testing.T) {
	sim := &core.Simulation{}
	attacker, _, target := casterScene()
	row := &Spell{ID: 15108, Name: "Windwall", DurationMs: -1,
		Effects: []Effect{{SpellID: 15108, Type: dbcenums.E_APPLY_AREA_AURA_PARTY,
			Aura: dbcenums.A_MOD_RANGED_DAMAGE_TAKEN, BasePoints: -32, Misc: 1}}}

	melee := parseSpell(attacker, 1, core.SpellSchoolPhysical, core.ProcMaskMeleeMHAuto, core.ClassFlags{})
	ranged := parseSpell(attacker, 2, core.SpellSchoolPhysical, core.ProcMaskRangedAuto, core.ClassFlags{})
	meleeBefore, rangedBefore := attackDamage(melee, target), attackDamage(ranged, target)

	aura := target.RegisterAura(AuraConfig(row))
	ParseEffects(target, aura, row)
	aura.Activate(sim)

	if got := attackDamage(ranged, target) - rangedBefore; math.Abs(got+32) > 1e-9 {
		t.Errorf("a ranged attack changes by %v, want -32", got)
	}
	if got := attackDamage(melee, target) - meleeBefore; got != 0 {
		t.Errorf("a melee attack changes by %v, want 0", got)
	}

	aura.Deactivate(sim)
	if got := attackDamage(ranged, target); got != rangedBefore {
		t.Errorf("a ranged attack after the aura dropped: %v, want %v", got, rangedBefore)
	}
}

// A mask without physical names ranged damage the sim has no field for.
func TestRangedDamageTakenNeedsPhysical(t *testing.T) {
	if parsed := DryRun(oneEffectRow(dbcenums.A_MOD_RANGED_DAMAGE_TAKEN, 126, -12)); len(parsed.Applied) != 0 {
		t.Errorf("a magic-only ranged damage taken row attached %v", appliedKinds(parsed))
	}
}
