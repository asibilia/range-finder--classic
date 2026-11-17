package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

const shadowSwordID int32 = 991521

func addShadowSword() {
	addToDatabase(&proto.SimDatabase{Items: []*proto.SimItem{{
		Id:             shadowSwordID,
		Name:           "Test Shadow Sword",
		Type:           proto.ItemType_ItemTypeWeapon,
		WeaponType:     proto.WeaponType_WeaponTypeSword,
		HandType:       proto.HandType_HandTypeOneHand,
		WeaponSpeed:    2.6,
		SpellSchool:    proto.SpellSchool_SpellSchoolShadow,
		ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {WeaponDamageMin: 50, WeaponDamageMax: 90}},
	}}})
}

// A weapon's damage school adds no spell damage: a shadow sword's white hit is shadow and takes none of
// the wielder's spell damage.
func TestMagicSchoolWeaponAutosTakeNoSpellDamage(t *testing.T) {
	addShadowSword()
	sim, character := NewWeaponTestSim(t, proto.Race_RaceUndead, WeaponTestSlots(shadowSwordID, 0, 0), nil, nil)
	mhAuto := character.AutoAttacks.MHAuto()
	if mhAuto.SpellSchool != SpellSchoolShadow {
		t.Fatalf("the Shadow Sword's main-hand auto is %v, want shadow", mhAuto.SpellSchool)
	}

	character.AddStatsDynamic(sim, stats.Stats{stats.SpellDamage: 500, stats.ShadowDamage: 500})
	if result := mhAuto.CalcDamage(sim, sim.Encounter.ActiveTargetUnits[0], 0, mhAuto.OutcomeAlwaysHit); result.Damage != 0 {
		t.Errorf("with 500 spell and shadow damage the Shadow Sword's white hit adds %v to its weapon damage, want 0", result.Damage)
	}
}

// A swap moves the auto to the new weapon's school, with its spell damage share and its school's mods.
func TestWeaponSwapMovesTheAutosSchool(t *testing.T) {
	addShadowSword()
	sim, character := NewWeaponTestSim(t, proto.Race_RaceUndead, WeaponTestSlots(WeaponTestSwordID, 0, 0), WeaponTestSlots(shadowSwordID, 0, 0), nil)
	physical := character.AddDynamicMod(SpellModConfig{Kind: SpellMod_DamageDone_Pct, School: SpellSchoolPhysical, FloatValue: 0.1})
	physical.Activate()
	mhAuto := character.AutoAttacks.MHAuto()
	baseMultiplier := mhAuto.DamageMultiplier / 1.1

	check := func(when string, school SpellSchool, coefficient, fromMod float64) {
		t.Helper()
		if mhAuto.SpellSchool != school || mhAuto.SchoolIndex != school.SchoolIndex() || mhAuto.BonusCoefficient != coefficient {
			t.Errorf("%s: main-hand auto is %v (index %v) with bonus coefficient %v, want %v with %v", when, mhAuto.SpellSchool, mhAuto.SchoolIndex, mhAuto.BonusCoefficient, school, coefficient)
		}
		if got := mhAuto.DamageMultiplier / baseMultiplier; !WithinToleranceFloat64(fromMod, got, 1e-9) {
			t.Errorf("%s: main-hand auto takes ×%v from the physical mod, want ×%v", when, got, fromMod)
		}
	}
	check("test sword", SpellSchoolPhysical, 1, 1.1)

	character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Swap1, false)
	check("Shadow Sword swapped in", SpellSchoolShadow, 0, 1)

	character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Main, false)
	check("test sword swapped back", SpellSchoolPhysical, 1, 1.1)
}
