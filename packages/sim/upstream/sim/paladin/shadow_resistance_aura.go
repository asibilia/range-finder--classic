package paladin

import (
	"github.com/wowsims/forever/sim/core/buffs"
	"github.com/wowsims/forever/sim/core/spelldata"
)

var ShadowResistanceAuraRankMap = spellData.ShadowResistanceAura

// Shadow Resistance Aura
// https://www.wowhead.com/forever/spell=19896
//
// Gives 60 additional Shadow resistance to all party and raid members within 30 yards. Players
// may only have one Aura on them per Paladin at any one time.
func (paladin *Paladin) registerShadowResistanceAura() {
	ShadowResistanceAuraRankMap.Each(func(_ int32, rank *spelldata.Spell) {
		aura := buffs.NewSpellDataShadowResistanceAuraRank(&paladin.Character, auraRank(rank))
		paladin.registerAuraSpell(rank, aura, SpellMaskShadowResistanceAura)
	})
}
