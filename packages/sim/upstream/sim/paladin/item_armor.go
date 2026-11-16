package paladin

import (
	"github.com/wowsims/forever/sim/common/shared"
	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/spelldata"
)

// The PvP gloves' equip spell 23300: a flat 20 on Judgement of the Crusader's Holy damage bonus.
var crusaderJudgementIncrease = spelldata.MustFind(23300).EffectN(1).Average()

func init() {
	// Knight-Lieutenant's Lamellar Gauntlets
	// https://www.wowhead.com/forever/item=16410/knight-lieutenant-s-lamellar-gauntlets
	//
	// Increases the Holy damage bonus of your Judgement of the Crusader by 20.
	core.NewItemEffect(16410, raiseJudgementOfTheCrusader)

	// Marshal's Lamellar Gloves
	// https://www.wowhead.com/forever/item=16471/marshal-s-lamellar-gloves
	//
	// Increases the Holy damage bonus of your Judgement of the Crusader by 20.
	core.NewItemEffect(16471, raiseJudgementOfTheCrusader)

	// Knight-Lieutenant's Lamellar Gauntlets
	// https://www.wowhead.com/forever/item=23274/knight-lieutenant-s-lamellar-gauntlets
	//
	// Increases the Holy damage bonus of your Judgement of the Crusader by 20.
	core.NewItemEffect(23274, raiseJudgementOfTheCrusader)

	// Premier Lieutenant Commander's Luminous Gloves
	// https://www.wowhead.com/forever/item=273329/premier-lieutenant-commander-s-luminous-gloves
	// Premier Luminous Gauntlets
	// https://www.wowhead.com/forever/item=273363/premier-luminous-gauntlets
	// Premier Champion's Lamellar Gloves
	// https://www.wowhead.com/forever/item=274250/premier-champion-s-lamellar-gloves
	// Premier Lamellar Gauntlets
	// https://www.wowhead.com/forever/item=274256/premier-lamellar-gauntlets
	//
	// Increases the critical strike chance of your Flash of Light by 2%.
	shared.NewSpellDataEquipAura(shared.SpellDataProc{TriggerSpellID: 1293544},
		[]shared.ItemVariant{
			{ItemID: 273329, ItemName: "Premier Lieutenant Commander's Luminous Gloves"},
			{ItemID: 273363, ItemName: "Premier Luminous Gauntlets"},
			{ItemID: 274250, ItemName: "Premier Champion's Lamellar Gloves"},
			{ItemID: 274256, ItemName: "Premier Lamellar Gauntlets"},
		})
}

func raiseJudgementOfTheCrusader(agent core.Agent) {
	agent.(PaladinAgent).GetPaladin().judgementOfTheCrusaderBonus += crusaderJudgementIncrease
}
