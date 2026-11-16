package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/stats"
)

func TestHealsReadHealingNotSpellDamage(t *testing.T) {
	caster := &Unit{}
	caster.stats[stats.SpellDamage] = 21
	caster.stats[stats.HolyDamage] = 30
	caster.stats[stats.HealingPower] = 62
	target := &Unit{}
	target.PseudoStats.BonusHealingTaken = 10
	heal := &Spell{Unit: caster, SpellSchool: SpellSchoolHoly, BonusSpellDamage: 5}

	if got := heal.HealingPower(target); got != 72 {
		t.Errorf("healing power %v, want the caster's healing 62 plus the target's 10 taken", got)
	}
}
