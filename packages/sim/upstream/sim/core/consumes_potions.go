package core

import (
	"github.com/wowsims/forever/sim/core/proto"
)

// Alchemists' Stone, whose equip spell raises what healing and mana potions give the wearer. The
// item requires Alchemy (ItemSparse.RequiredSkill 171).
var AlchStoneItemIDs = []int32{13503}

func (character *Character) HasAlchStone() bool {
	alchStoneEquipped := false
	for _, itemID := range AlchStoneItemIDs {
		alchStoneEquipped = alchStoneEquipped || character.HasTrinketEquipped(itemID)
	}
	return character.HasProfession(proto.Profession_Alchemy) && alchStoneEquipped
}
