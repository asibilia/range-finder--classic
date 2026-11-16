package spelldata

import (
	"slices"

	"github.com/wowsims/forever/sim/core/dbcenums"
	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

// The haste pseudo stats each attack or cast speed aura adds its percent to: a raise of the caster's
// speeds, or a slow of an enemy's where the percent is negative. Unlike ranged hit and crit, ranged
// haste is not a total including melee: the sim applies melee, ranged and cast speed each on its own.
var SpeedAuraPseudoStats = map[dbcenums.EffectAuraType][]proto.PseudoStat{
	dbcenums.A_MOD_ATTACKSPEED:             {proto.PseudoStat_PseudoStatMeleeHastePercent},
	dbcenums.A_MOD_MELEE_HASTE_3:           {proto.PseudoStat_PseudoStatMeleeHastePercent},
	dbcenums.A_MOD_RANGED_HASTE:            {proto.PseudoStat_PseudoStatRangedHastePercent},
	dbcenums.A_MOD_MELEE_RANGED_HASTE_2:    {proto.PseudoStat_PseudoStatMeleeHastePercent, proto.PseudoStat_PseudoStatRangedHastePercent},
	dbcenums.A_MOD_CASTING_SPEED_NOT_STACK: {proto.PseudoStat_PseudoStatSpellHastePercent},
}

// The auras that raise a speed of the spell's caster: 23733 (Blinding Light) states 33% cast speed
// and 25% melee haste.
func (s *Spell) SpeedEffects() []*Effect {
	var effects []*Effect
	for i := range s.Effects {
		e := &s.Effects[i]
		if e.Type == dbcenums.E_APPLY_AURA && e.Target[0] == dbcenums.TARGET_UNIT_CASTER &&
			e.BasePoints > 0 && len(SpeedAuraPseudoStats[e.Aura]) > 0 {
			effects = append(effects, e)
		}
	}
	return effects
}

// The haste percents the spell's speed effects add, indexed by proto.PseudoStat.
func (s *Spell) SpeedPseudoStats() []float64 {
	pseudoStats := make([]float64, stats.PseudoStatsLen)
	for _, e := range s.SpeedEffects() {
		for _, pseudoStat := range SpeedAuraPseudoStats[e.Aura] {
			pseudoStats[pseudoStat] += e.BasePoints
		}
	}
	return pseudoStats
}

// Whether the effect's speed aura changes the time between melee attacks.
func (e *Effect) ChangesAttackSpeed() bool {
	return slices.Contains(SpeedAuraPseudoStats[e.Aura], proto.PseudoStat_PseudoStatMeleeHastePercent)
}

// Whether the effect's speed aura changes cast times.
func (e *Effect) ChangesCastSpeed() bool {
	return slices.Contains(SpeedAuraPseudoStats[e.Aura], proto.PseudoStat_PseudoStatSpellHastePercent)
}
