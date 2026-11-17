package paladin

import (
	"github.com/wowsims/forever/sim/core/buffs"
	"github.com/wowsims/forever/sim/core/spelldata"
)

var FireResistanceAuraRankMap = spellData.FireResistanceAura

// Fire Resistance Aura
// https://www.wowhead.com/forever/spell=19900
//
// Gives 60 additional Fire resistance to all party and raid members within 30 yards. Players may
// only have one Aura on them per Paladin at any one time.
func (paladin *Paladin) registerFireResistanceAura() {
	FireResistanceAuraRankMap.Each(func(_ int32, rank *spelldata.Spell) {
		aura := buffs.NewSpellDataFireResistanceAuraRank(&paladin.Character, auraRank(rank))
		paladin.registerAuraSpell(rank, aura, SpellMaskFireResistanceAura)
	})
}
