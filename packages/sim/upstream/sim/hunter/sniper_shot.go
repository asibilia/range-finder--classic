package hunter

import (
	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/spelldata"
)

var sniperShotRank = spellData.SniperShot.Highest()

func (hunter *Hunter) registerSniperShot() {
	if !hunter.Talents.SniperShot {
		return
	}

	// The buff is the row's own aura: its duration, its charges and the range its second effect adds
	// to the Shots its class flags name, Auto Shot among them. Sniper Shot is not one of them.
	buff := hunter.RegisterAura(spelldata.AuraConfig(sniperShotRank))
	spelldata.ParseEffects(&hunter.Character, buff, sniperShotRank)

	// One charge per Shot the range mod names, however many targets it hits. The row's proc flags hear
	// every ranged hit, Sniper Shot's own among them, so the listener takes the mod's class flags.
	// TODO: Ingame test needed: a Shot that misses keeps the charge (the row's proc flags ask for damage
	// dealt), and Multi-Shot spends one charge per cast.
	spelldata.AttachChargeSpender(&hunter.Character, buff, sniperShotRank, "Sniper Shot - Spend")

	config := spelldata.SpellConfig(&hunter.Unit, sniperShotRank, spelldata.Melee(core.ProcMaskRangedSpecial))
	hunter.hasteRangedCast(&config)
	config.RelatedSelfBuff = buff

	config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
		buff.Activate(sim)
		buff.SetStacks(sim, buff.MaxStacks)

		baseDamage := sniperShotRank.WeaponStrike(sim, spell, hunter.RangedNormalizedWeaponDamage(sim, spell.RangedAttackPower(target)), 0)
		result := spell.CalcDamage(sim, target, baseDamage, spell.OutcomeRangedHitAndCrit)

		spell.DealDamageAfterTravel(sim, result)
	}

	hunter.RegisterSpell(config)
}
