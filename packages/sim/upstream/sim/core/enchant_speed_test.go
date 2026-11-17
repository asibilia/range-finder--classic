package core

import (
	"math"
	"testing"
	"time"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/simsignals"
	"github.com/wowsims/forever/sim/core/stats"
)

func TestEnchantSpeedFollowsTheEnchantedItem(t *testing.T) {
	const counterweightAxeID, plainAxeID, glovesID, counterweightID, minorHasteID int32 = 990601, 990602, 990603, 990604, 990605

	twoHander := func(id int32) *proto.SimItem {
		return &proto.SimItem{
			Id:             id,
			Name:           "Test Speed Axe",
			Type:           proto.ItemType_ItemTypeWeapon,
			WeaponType:     proto.WeaponType_WeaponTypeAxe,
			HandType:       proto.HandType_HandTypeTwoHand,
			WeaponSpeed:    3.5,
			ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {WeaponDamageMin: 100, WeaponDamageMax: 150}},
		}
	}
	haste := func(melee, ranged, spell float64) []float64 {
		pseudoStats := make([]float64, stats.PseudoStatsLen)
		pseudoStats[proto.PseudoStat_PseudoStatMeleeHastePercent] = melee
		pseudoStats[proto.PseudoStat_PseudoStatRangedHastePercent] = ranged
		pseudoStats[proto.PseudoStat_PseudoStatSpellHastePercent] = spell
		return pseudoStats
	}
	addToDatabase(&proto.SimDatabase{
		Items: []*proto.SimItem{
			twoHander(counterweightAxeID),
			twoHander(plainAxeID),
			{Id: glovesID, Name: "Test Speed Gloves", Type: proto.ItemType_ItemTypeHands, ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {}}},
		},
		Enchants: []*proto.SimEnchant{
			{EffectId: counterweightID, Name: "Test Counterweight", PseudoStats: haste(3, 0, 0)},
			{EffectId: minorHasteID, Name: "Test Minor Haste", PseudoStats: haste(1, 1, 1)},
		},
	})

	withMainHand := func(mainHand *proto.ItemSpec, hands *proto.ItemSpec) []*proto.ItemSpec {
		items := make([]*proto.ItemSpec, proto.ItemSlot_ItemSlotMainHand+1)
		for i := range items {
			items[i] = &proto.ItemSpec{}
		}
		items[proto.ItemSlot_ItemSlotHands] = hands
		items[proto.ItemSlot_ItemSlotMainHand] = mainHand
		return items
	}
	counterweightAxe := &proto.ItemSpec{Id: counterweightAxeID, Enchant: counterweightID}
	plainAxe := &proto.ItemSpec{Id: plainAxeID}
	encounter := &proto.Encounter{
		Targets:  []*proto.Target{{Name: "target", Level: 63, MobType: proto.MobType_MobTypeHumanoid}},
		Duration: 180,
	}
	raid := func(mainHand, swapMainHand *proto.ItemSpec) *proto.Raid {
		return &proto.Raid{Parties: []*proto.Party{{
			Players: []*proto.Player{{
				Name:           "Speed Tester",
				Class:          proto.Class_ClassWarrior,
				Race:           proto.Race_RaceHuman,
				Buffs:          &proto.IndividualBuffs{},
				Spec:           &proto.Player_DpsWarrior{},
				Equipment:      &proto.EquipmentSpec{Items: withMainHand(mainHand, &proto.ItemSpec{Id: glovesID, Enchant: minorHasteID})},
				EnableItemSwap: true,
				ItemSwap:       &proto.ItemSwap{Items: withMainHand(swapMainHand, &proto.ItemSpec{})},
				Rotation:       &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			}},
			Buffs: &proto.PartyBuffs{},
		}}}
	}
	newSim := func(mainHand, swapMainHand *proto.ItemSpec) (*Simulation, *Character) {
		sim := NewSim(&proto.RaidSimRequest{Raid: raid(mainHand, swapMainHand), Encounter: encounter, SimOptions: &proto.SimOptions{RandomSeed: 1}}, simsignals.CreateSignals())
		sim.Reset()
		return sim, sim.Raid.Parties[0].Players[0].GetCharacter()
	}

	check := func(when string, unit *Unit, melee float64) {
		t.Helper()
		for _, speed := range []struct {
			name      string
			got, want float64
		}{
			{"melee", unit.TotalMeleeHasteMultiplier(), melee * 1.01},
			{"ranged", unit.TotalRangedHasteMultiplier(), 1.01},
			{"cast", unit.TotalSpellHasteMultiplier(), 1.01},
		} {
			if math.Abs(speed.got-speed.want) > 1e-9 {
				t.Errorf("%s: %s speed multiplier %v, want %v", when, speed.name, speed.got, speed.want)
			}
		}
	}

	gearStats := ComputeStats(&proto.ComputeStatsRequest{Raid: raid(counterweightAxe, plainAxe), Encounter: encounter}).RaidStats.Parties[0].Players[0].GearStats
	if got, want := gearStats.PseudoStats[proto.PseudoStat_PseudoStatMeleeHastePercent], (1.03*1.01-1)*100; math.Abs(got-want) > 1e-9 {
		t.Errorf("gear melee haste %v%%, want %v%%", got, want)
	}

	sim, character := newSim(counterweightAxe, plainAxe)
	check("counterweight equipped", &character.Unit, 1.03)
	character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Swap1, false)
	check("counterweight swapped off", &character.Unit, 1)
	sim.Cleanup()
	sim.Reset()
	check("counterweight equipped again on the next iteration", &character.Unit, 1.03)

	sim, character = newSim(plainAxe, counterweightAxe)
	check("counterweight in the swap set", &character.Unit, 1)
	character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Swap1, false)
	check("counterweight swapped on", &character.Unit, 1.03)
	character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Main, false)
	check("counterweight swapped back off", &character.Unit, 1)
}

func TestEquipSpeedAppliesPerItem(t *testing.T) {
	const hastedAxeID, plainAxeID, helmID, legsID, rapidityID int32 = 990611, 990612, 990613, 990614, 990615

	haste := func(melee, ranged, spell float64) []float64 {
		pseudoStats := make([]float64, stats.PseudoStatsLen)
		pseudoStats[proto.PseudoStat_PseudoStatMeleeHastePercent] = melee
		pseudoStats[proto.PseudoStat_PseudoStatRangedHastePercent] = ranged
		pseudoStats[proto.PseudoStat_PseudoStatSpellHastePercent] = spell
		return pseudoStats
	}
	twoHander := func(id int32, pseudoStats []float64) *proto.SimItem {
		return &proto.SimItem{
			Id:             id,
			Name:           "Test Speed Axe",
			Type:           proto.ItemType_ItemTypeWeapon,
			WeaponType:     proto.WeaponType_WeaponTypeAxe,
			HandType:       proto.HandType_HandTypeTwoHand,
			WeaponSpeed:    3.5,
			PseudoStats:    pseudoStats,
			ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {WeaponDamageMin: 100, WeaponDamageMax: 150}},
		}
	}
	addToDatabase(&proto.SimDatabase{
		Items: []*proto.SimItem{
			twoHander(hastedAxeID, haste(2, 0, 0)),
			twoHander(plainAxeID, nil),
			{Id: helmID, Name: "Test Speed Helm", Type: proto.ItemType_ItemTypeHead, ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {}}},
			{Id: legsID, Name: "Test Speed Legs", Type: proto.ItemType_ItemTypeLegs, ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {}}},
		},
		Enchants: []*proto.SimEnchant{{EffectId: rapidityID, Name: "Test 2543 Arcanum of Rapidity", PseudoStats: haste(1, 1, 0)}},
	})

	items := func(head, legs, mainHand *proto.ItemSpec) []*proto.ItemSpec {
		specs := make([]*proto.ItemSpec, proto.ItemSlot_ItemSlotMainHand+1)
		for i := range specs {
			specs[i] = &proto.ItemSpec{}
		}
		specs[proto.ItemSlot_ItemSlotHead] = head
		specs[proto.ItemSlot_ItemSlotLegs] = legs
		specs[proto.ItemSlot_ItemSlotMainHand] = mainHand
		return specs
	}
	newSim := func(equipped, swap []*proto.ItemSpec) (*Simulation, *Character) {
		raid := &proto.Raid{Parties: []*proto.Party{{
			Players: []*proto.Player{{
				Name:           "Speed Tester",
				Class:          proto.Class_ClassWarrior,
				Race:           proto.Race_RaceHuman,
				Buffs:          &proto.IndividualBuffs{},
				Spec:           &proto.Player_DpsWarrior{},
				Equipment:      &proto.EquipmentSpec{Items: equipped},
				EnableItemSwap: true,
				ItemSwap:       &proto.ItemSwap{Items: swap},
				Rotation:       &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			}},
			Buffs: &proto.PartyBuffs{},
		}}}
		encounter := &proto.Encounter{
			Targets:  []*proto.Target{{Name: "target", Level: 63, MobType: proto.MobType_MobTypeHumanoid}},
			Duration: 180,
		}
		sim := NewSim(&proto.RaidSimRequest{Raid: raid, Encounter: encounter, SimOptions: &proto.SimOptions{RandomSeed: 1}}, simsignals.CreateSignals())
		sim.Reset()
		return sim, sim.Raid.Parties[0].Players[0].GetCharacter()
	}
	check := func(when string, unit *Unit, melee, ranged float64) {
		t.Helper()
		for _, speed := range []struct {
			name      string
			got, want float64
		}{
			{"melee", unit.TotalMeleeHasteMultiplier(), melee},
			{"ranged", unit.TotalRangedHasteMultiplier(), ranged},
			{"cast", unit.TotalSpellHasteMultiplier(), 1},
		} {
			if math.Abs(speed.got-speed.want) > 1e-9 {
				t.Errorf("%s: %s speed multiplier %v, want %v", when, speed.name, speed.got, speed.want)
			}
		}
	}

	helm := &proto.ItemSpec{Id: helmID}
	legs := &proto.ItemSpec{Id: legsID}
	hastedAxe := &proto.ItemSpec{Id: hastedAxeID}
	plainAxe := &proto.ItemSpec{Id: plainAxeID}

	t.Run("an item's own haste follows the item", func(t *testing.T) {
		sim, character := newSim(items(helm, legs, hastedAxe), items(&proto.ItemSpec{}, &proto.ItemSpec{}, plainAxe))
		check("hasted axe equipped", &character.Unit, 1.02, 1)
		character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Swap1, false)
		check("hasted axe swapped off", &character.Unit, 1, 1)
		character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Main, false)
		check("hasted axe swapped back on", &character.Unit, 1.02, 1)
	})

	t.Run("the same enchant on two items applies twice", func(t *testing.T) {
		rapidHelm := &proto.ItemSpec{Id: helmID, Enchant: rapidityID}
		rapidLegs := &proto.ItemSpec{Id: legsID, Enchant: rapidityID}
		sim, character := newSim(items(rapidHelm, rapidLegs, plainAxe), items(&proto.ItemSpec{}, legs, &proto.ItemSpec{}))
		check("arcanum on head and legs", &character.Unit, 1.01*1.01, 1.01*1.01)
		sim.CurrentTime = -time.Second // Armor slots swap before the pull only.
		character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Swap1, false)
		check("legs arcanum swapped off", &character.Unit, 1.01, 1.01)
		character.ItemSwap.SwapItems(sim, proto.APLActionItemSwap_Main, false)
		check("legs arcanum swapped back on", &character.Unit, 1.01*1.01, 1.01*1.01)
	})
}
