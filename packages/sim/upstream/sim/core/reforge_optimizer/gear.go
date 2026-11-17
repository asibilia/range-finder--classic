package reforgeoptimizer

import (
	"slices"

	"github.com/wowsims/forever/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

func cloneEquipmentSpec(equipment *proto.EquipmentSpec) *proto.EquipmentSpec {
	if equipment == nil {
		return &proto.EquipmentSpec{}
	}
	return googleProto.Clone(equipment).(*proto.EquipmentSpec)
}

func frozenItemSlots(settings *proto.ReforgeSettings) map[proto.ItemSlot]bool {
	frozen := map[proto.ItemSlot]bool{}
	if settings == nil || !settings.GetFreezeItemSlots() {
		return frozen
	}
	for _, item := range settings.GetFrozenItemSlots() {
		frozen[item] = true
	}
	return frozen
}

// Puts the selected candidates' enchants on a clone of the baseline gear.
func (o *reforgeOptimizer) applyEnchantSolution(selected []string) *proto.EquipmentSpec {
	gear := cloneEquipmentSpec(o.baseGear)
	for _, candidate := range o.candidates {
		if slices.Contains(selected, enchantVariableKey(candidate.slot, candidate.enchant.EffectID)) {
			gear.Items[candidate.slot].Enchant = candidate.enchant.EffectID
		}
	}
	return gear
}
