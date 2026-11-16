package spelldata

import (
	"github.com/wowsims/forever/sim/core/dbcenums"
	"github.com/wowsims/forever/sim/core/stats"
)

const (
	// Attributes[3]: the aura stays on the unit through death. Flasks and Well Fed carry it.
	attrEx3DeathPersistent uint32 = 0x100000

	// AuraInterruptFlags[0]: the aura drops when the unit stands up, which is how the game ends
	// eating and drinking.
	auraInterruptStanding uint32 = 0x40000
)

func (s *Spell) PersistsThroughDeath() bool {
	return s.HasAttr(dbcenums.ATTR_INDEX_EX_3, attrEx3DeathPersistent)
}

// Whether the spell's aura lasts only while the unit sits: the eating and drinking of food and water,
// whose health and mana come in out of combat.
func (s *Spell) WhileSeated() bool {
	return s.AuraInterrupt[0]&auraInterruptStanding != 0
}

// The stats a flat stat or resistance aura adds its amount to, as the parser attaches them:
// A_MOD_STAT by the game files' stat index, A_MOD_RESISTANCE by its school mask, where armor is
// school 1. Nil for any other effect.
func (e *Effect) FlatStats() []stats.Stat {
	if !AppliesAura(e.Type) {
		return nil
	}
	switch e.Aura {
	case dbcenums.A_MOD_STAT:
		return clientStatList(e.Misc)
	case dbcenums.A_MOD_RESISTANCE:
		return resistanceStats(e.Misc)
	}
	return nil
}
