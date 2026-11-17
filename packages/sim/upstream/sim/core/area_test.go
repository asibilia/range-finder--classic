package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

func TestAreaTypeSetDropsUnknownAndDuplicates(t *testing.T) {
	got := areaTypeSet([]proto.AreaType{
		proto.AreaType_AreaTypeUnknown,
		proto.AreaType_AreaTypeForestGrassland,
		proto.AreaType_AreaTypeMountainous,
		proto.AreaType_AreaTypeForestGrassland,
	})
	want := []proto.AreaType{proto.AreaType_AreaTypeForestGrassland, proto.AreaType_AreaTypeMountainous}
	if len(got) != len(want) {
		t.Fatalf("areaTypeSet = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("areaTypeSet = %v, want %v", got, want)
		}
	}

	encounter := Encounter{AreaTypes: got}
	if !encounter.InArea(proto.AreaType_AreaTypeMountainous) || encounter.InArea(proto.AreaType_AreaTypeDesert) {
		t.Fatalf("InArea reads the wrong set: %v", got)
	}
}

func TestItemInAreaFoldsOnlyMatchingAreaStats(t *testing.T) {
	item := Item{
		ID:    19120,
		Stats: stats.Stats{stats.AttackPower: 15},
		ScalingOptions: map[int32]*proto.ScalingItemProperties{
			0: {
				Stats: map[int32]float64{int32(proto.Stat_StatAttackPower): 15},
				AreaStats: []*proto.AreaStats{
					{AreaType: proto.AreaType_AreaTypeForestGrassland, Stats: map[int32]float64{int32(proto.Stat_StatAttackPower): 29}},
				},
			},
		},
	}

	for _, tc := range []struct {
		name  string
		areas []proto.AreaType
		want  float64
	}{
		{"no area set", nil, 15},
		{"another area", []proto.AreaType{proto.AreaType_AreaTypeMountainous}, 15},
		{"the matching area", []proto.AreaType{proto.AreaType_AreaTypeMountainous, proto.AreaType_AreaTypeForestGrassland}, 44},
	} {
		if got := item.inArea(tc.areas).Stats[stats.AttackPower]; got != tc.want {
			t.Errorf("%s: attack power = %v, want %v", tc.name, got, tc.want)
		}
	}

	if got := item.Stats[stats.AttackPower]; got != 15 {
		t.Errorf("inArea changed the receiver: attack power = %v", got)
	}

	var equipment Equipment
	equipment[proto.ItemSlot_ItemSlotTrinket1] = item
	folded := equipment.inArea([]proto.AreaType{proto.AreaType_AreaTypeForestGrassland})
	if got := folded[proto.ItemSlot_ItemSlotTrinket1].Stats[stats.AttackPower]; got != 44 {
		t.Errorf("equipment fold: attack power = %v, want 44", got)
	}
	if got := folded.Stats(proto.Spec_SpecDpsWarrior)[stats.AttackPower]; got != 44 {
		t.Errorf("equipment stats after fold = %v, want 44", got)
	}
}
