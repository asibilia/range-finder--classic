package paladin

import (
	"github.com/wowsims/forever/sim/core/buffs"
)

// Concentration Aura
// https://www.wowhead.com/forever/spell=19746
//
// Gives a 35% chance of ignoring spell interruption when damaged to all party members within 30
// yards. Players may only have one Aura on them per Paladin at any one time.
func (paladin *Paladin) registerConcentrationAura() {
	rank := spellData.ConcentrationAura.Highest()
	aura := buffs.NewSpellDataConcentrationAuraRank(&paladin.Character, auraRank(rank))
	paladin.registerAuraSpell(rank, aura, SpellMaskConcentrationAura)
}
