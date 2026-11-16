package shaman

import (
	"github.com/wowsims/forever/sim/common/shared"
)

func init() {
	// Rage of the Storm
	// https://www.wowhead.com/forever/item=280604/rage-of-the-storm
	//
	// Increases the damage dealt by your Stormstrike ability by 10%.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 1309422},
		[]shared.ItemVariant{
			{ItemID: 280604, ItemName: "Rage of the Storm"},
		})

	// Tidebringer's Claw
	// https://www.wowhead.com/forever/item=280605/tidebringer-s-claw
	//
	// Increases the critical strike chance of your Healing Wave and Lesser Healing Wave spells by 2%.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 1309539},
		[]shared.ItemVariant{
			{ItemID: 280605, ItemName: "Tidebringer's Claw"},
		})

	// Lightning's Grasp
	// https://www.wowhead.com/forever/item=280607/lightning-s-grasp
	//
	// Increases the critical strike chance of your Lightning Bolt spell by 1%.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 1309442},
		[]shared.ItemVariant{
			{ItemID: 280607, ItemName: "Lightning's Grasp"},
		})
}
