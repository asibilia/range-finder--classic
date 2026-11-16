package warrior

import (
	"github.com/wowsims/forever/sim/common/shared"
)

func init() {
	// Knight-Lieutenant's Plate Gauntlets
	// https://www.wowhead.com/forever/item=16406/knight-lieutenant-s-plate-gauntlets
	// Marshal's Plate Gauntlets
	// https://www.wowhead.com/forever/item=16484/marshal-s-plate-gauntlets
	// Blood Guard's Plate Gloves
	// https://www.wowhead.com/forever/item=16510/blood-guard-s-plate-gloves
	// General's Plate Gauntlets
	// https://www.wowhead.com/forever/item=16548/general-s-plate-gauntlets
	// Blood Guard's Plate Gauntlets
	// https://www.wowhead.com/forever/item=22868/blood-guard-s-plate-gauntlets
	// Knight-Lieutenant's Plate Gauntlets
	// https://www.wowhead.com/forever/item=23286/knight-lieutenant-s-plate-gauntlets
	// Premier Mortarplate Gloves
	// https://www.wowhead.com/forever/item=272478/premier-mortarplate-gloves
	// Premier Champion's Mortarplate Gauntlets
	// https://www.wowhead.com/forever/item=272513/premier-champion-s-mortarplate-gauntlets
	// Premier Plate Gauntlets
	// https://www.wowhead.com/forever/item=272717/premier-plate-gauntlets
	// Premier Lieutenant Commander's Plate Gauntlets
	// https://www.wowhead.com/forever/item=272793/premier-lieutenant-commander-s-plate-gauntlets
	//
	// Hamstring Rage cost reduced by 3.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 22778},
		[]shared.ItemVariant{
			{ItemID: 16406, ItemName: "Knight-Lieutenant's Plate Gauntlets"},
			{ItemID: 16484, ItemName: "Marshal's Plate Gauntlets"},
			{ItemID: 16510, ItemName: "Blood Guard's Plate Gloves"},
			{ItemID: 16548, ItemName: "General's Plate Gauntlets"},
			{ItemID: 22868, ItemName: "Blood Guard's Plate Gauntlets"},
			{ItemID: 23286, ItemName: "Knight-Lieutenant's Plate Gauntlets"},
			{ItemID: 272478, ItemName: "Premier Mortarplate Gloves"},
			{ItemID: 272513, ItemName: "Premier Champion's Mortarplate Gauntlets"},
			{ItemID: 272717, ItemName: "Premier Plate Gauntlets"},
			{ItemID: 272793, ItemName: "Premier Lieutenant Commander's Plate Gauntlets"},
		})

	// Rage of Mugamba
	// https://www.wowhead.com/forever/item=19577/rage-of-mugamba
	//
	// Reduces the cost of your Hamstring ability by 2 rage points.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 24428},
		[]shared.ItemVariant{
			{ItemID: 19577, ItemName: "Rage of Mugamba"},
		})
}
