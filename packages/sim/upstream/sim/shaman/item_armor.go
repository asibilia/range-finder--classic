package shaman

import (
	"github.com/wowsims/forever/sim/common/shared"
)

func init() {
	// Unmarred Vision of Voodress
	// https://www.wowhead.com/forever/item=19609/unmarred-vision-of-voodress
	//
	// Decreases the mana cost of your Healing Stream and Mana Spring totems by 20.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 24436},
		[]shared.ItemVariant{
			{ItemID: 19609, ItemName: "Unmarred Vision of Voodress"},
		})
}
