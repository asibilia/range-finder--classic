package spelldata

import "github.com/wowsims/forever/sim/core/dbcenums"

// The damage the spell deals to its own caster: Goblin Sapper Charge 13241 rolls 600 on the enemies
// around the caster in its first effect and 500 on the caster in its second. DamageEffect answers
// the first damaging effect only.
func (s *Spell) CasterDamageEffect() *Effect {
	for i := range s.Effects {
		if e := &s.Effects[i]; e.Type == dbcenums.E_SCHOOL_DAMAGE && e.Target[0] == dbcenums.TARGET_UNIT_CASTER {
			return e
		}
	}
	return NilEffect
}
