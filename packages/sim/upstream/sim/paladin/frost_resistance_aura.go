package paladin

import (
	"github.com/wowsims/forever/sim/core/buffs"
	"github.com/wowsims/forever/sim/core/spelldata"
)

var FrostResistanceAuraRankMap = spellData.FrostResistanceAura

// Frost Resistance Aura
// https://www.wowhead.com/forever/spell=19898
//
// Gives 60 additional Frost resistance to all party and raid members within 30 yards. Players may
// only have one Aura on them per Paladin at any one time.
func (paladin *Paladin) registerFrostResistanceAura() {
	FrostResistanceAuraRankMap.Each(func(_ int32, rank *spelldata.Spell) {
		aura := buffs.NewSpellDataFrostResistanceAuraRank(&paladin.Character, auraRank(rank))
		paladin.registerAuraSpell(rank, aura, SpellMaskFrostResistanceAura)
	})
}
