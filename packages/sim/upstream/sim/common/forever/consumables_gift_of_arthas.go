package forever

import (
	"time"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/buffs"
	"github.com/wowsims/forever/sim/core/stats"
)

func init() {
	core.NewConsumableEffect(9088, func(agent core.Agent) {
		character := agent.GetCharacter()
		character.AddStat(stats.ShadowResistance, 10)
		auras := character.NewEnemyAuraArray(func(target *core.Unit) *core.Aura {
			return buffs.NewSpellDataGiftOfArthasAura(target, true, 0)
		})
		procSpell := character.RegisterSpell(core.SpellConfig{
			ActionID:    core.ActionID{SpellID: 11374},
			SpellSchool: core.SpellSchoolNature,
			ProcMask:    core.ProcMaskEmpty,

			FlatThreatBonus: 90,

			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				spell.CalcAndDealOutcome(sim, target, spell.OutcomeAlwaysHit)
				auras.Get(target).Activate(sim)
			},
		})

		character.MakeProcTriggerAura(core.ProcTrigger{
			Name:       "Gift of Arthas - Trigger",
			ICD:        time.Second * 3,
			ProcChance: 0.3,
			Outcome:    core.OutcomeLanded,
			Callback:   core.CallbackOnSpellHitTaken,
			Handler: func(sim *core.Simulation, spell *core.Spell, _ *core.SpellResult) {
				procSpell.Cast(sim, spell.Unit)
			},
		})
	})
}
