package spelldata

import (
	"testing"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
)

func TestAreaBonusReadsAnyOfItsGroups(t *testing.T) {
	bonus := &Spell{AreaBonusGroups: []int32{9163, 9202}, AreaMultiplier: 2, AreaDurationMultiplier: 1}
	plain := &Spell{}

	for _, tc := range []struct {
		name           string
		areas          []proto.AreaType
		amount, length float64
	}{
		{"no area", nil, 1, 1},
		{"another area", []proto.AreaType{proto.AreaType_AreaTypeForestGrassland}, 1, 1},
		{"the second group", []proto.AreaType{proto.AreaType_AreaTypeSnowy, proto.AreaType_AreaTypeHaunted}, 2, 1},
		{"the first group", []proto.AreaType{proto.AreaType_AreaTypeWasteland}, 2, 1},
	} {
		encounter := &core.Encounter{AreaTypes: tc.areas}
		if amount, length := bonus.AreaBonus(encounter); amount != tc.amount || length != tc.length {
			t.Errorf("%s: bonus reads x%v (duration x%v), want x%v (duration x%v)", tc.name, amount, length, tc.amount, tc.length)
		}
		if amount, length := plain.AreaBonus(encounter); amount != 1 || length != 1 {
			t.Errorf("%s: a row without a bonus reads x%v (duration x%v)", tc.name, amount, length)
		}
	}

	if amount, length := Nil.AreaBonus(&core.Encounter{AreaTypes: []proto.AreaType{proto.AreaType_AreaTypeVolcanic}}); amount != 1 || length != 1 {
		t.Errorf("the nil row reads x%v (duration x%v)", amount, length)
	}
}
