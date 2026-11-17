package paladin

import (
	"github.com/wowsims/forever/sim/core/buffs"
	"github.com/wowsims/forever/sim/core/spelldata"
)

var DevotionAuraRankMap = spellData.DevotionAura

// Devotion Aura
// https://www.wowhead.com/forever/spell=10293
//
// Gives 735 additional armor to party members within 30 yards. Players may only have one Aura on
// them per Paladin at any one time.
func (paladin *Paladin) registerDevotionAura() {
	DevotionAuraRankMap.Each(func(_ int32, rank *spelldata.Spell) {
		aura := buffs.NewSpellDataDevotionAuraRank(&paladin.Character, auraRank(rank))
		paladin.registerAuraSpell(rank, aura, SpellMaskDevotionAura)
	})
}
