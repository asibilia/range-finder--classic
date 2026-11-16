package hunter

import (
	"github.com/wowsims/forever/sim/common/shared"
)

func init() {
	// Knight-Lieutenant's Chain Gauntlets
	// https://www.wowhead.com/forever/item=16403/knight-lieutenant-s-chain-gauntlets
	// Blood Guard's Chain Gauntlets
	// https://www.wowhead.com/forever/item=16530/blood-guard-s-chain-gauntlets
	//
	// Reduces the mana cost of your Arcane Shot by 15.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 23157},
		[]shared.ItemVariant{
			{ItemID: 16403, ItemName: "Knight-Lieutenant's Chain Gauntlets"},
			{ItemID: 16530, ItemName: "Blood Guard's Chain Gauntlets"},
		})

	// Premier Chain Gauntlets
	// https://www.wowhead.com/forever/item=272495/premier-chain-gauntlets
	// Premier Champion's Chain Gloves
	// https://www.wowhead.com/forever/item=272536/premier-champion-s-chain-gloves
	// Premier Chainmail Gauntlets
	// https://www.wowhead.com/forever/item=272715/premier-chainmail-gauntlets
	// Premier Lieutenant Commander's Chainmail Grips
	// https://www.wowhead.com/forever/item=272772/premier-lieutenant-commander-s-chainmail-grips
	//
	// Increases the damage done by your Multi-Shot by 4%.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 28539},
		[]shared.ItemVariant{
			{ItemID: 272495, ItemName: "Premier Chain Gauntlets"},
			{ItemID: 272536, ItemName: "Premier Champion's Chain Gloves"},
			{ItemID: 272715, ItemName: "Premier Chainmail Gauntlets"},
			{ItemID: 272772, ItemName: "Premier Lieutenant Commander's Chainmail Grips"},
		})
}
