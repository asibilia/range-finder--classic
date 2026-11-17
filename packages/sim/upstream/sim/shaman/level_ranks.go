package shaman

import (
	"github.com/wowsims/forever/sim/core"
)

// Local level-aware patch: the ranks a shaman has follow the character's level and level profile,
// which may change before each sim (core.SetLevelProfile). They're set at start-up, at level 60 with
// no profile, and again after every change.
func init() {
	setLevelRanks()
	core.OnLevelChange(setLevelRanks)
}

func setLevelRanks() {
	// Damage spells: the ranks the shaman casts.
	lightningBoltRanks = castableRanks(spellData.LightningBolt)
	chainLightningRanks = castableRanks(spellData.ChainLightning)
	earthShockRanks = castableRanks(spellData.EarthShock)
	flameShockRanks = castableRanks(spellData.FlameShock)
	frostShockRanks = castableRanks(spellData.FrostShock)
	stormstrikeRank = spellData.Stormstrike.Highest()

	// Shields.
	waterShieldRank = spellData.WaterShield.Highest()
	waterShieldMana = spellData.WaterShieldTriggered.Highest()
	lightningShieldRank = spellData.LightningShield.Highest()
	lightningShieldOrb = lightningShieldRank.Refs()[0]

	// Weapon imbues: read off the top rank's refs.
	windfuryWeaponAttack = spellData.WindfuryWeapon.Highest().Refs()[0]
	flametongueWeaponProc = spellData.FlametongueWeapon.Highest().Refs()[0]
	flametongueWeaponAttack = spellData.FlametongueWeapon.Highest().Refs()[1]
	frostbrandWeaponAttack = spellData.FrostbrandWeapon.Highest().Refs()[0]
	rockbiterWeaponPassive = spellData.RockbiterWeapon.Highest().Refs()[0]

	// Totems.
	windfuryTotemRank = spellData.WindfuryTotem.Highest()
	strengthOfEarthTotemRanks = levelTotemRanks(spellData.StrengthOfEarthTotem, 10442, 25361)
	graceOfAirTotemRanks = levelTotemRanks(spellData.GraceOfAirTotem, 10627, 25359)
	manaSpringTotemRank = spellData.ManaSpringTotem.Highest()
	flametongueTotemRank = spellData.FlametongueTotem.Highest()
	frostResistanceTotemRank = spellData.FrostResistanceTotem.Highest()
	totemicRecallRank = spellData.TotemicRecall.Highest()
	searingTotemRank = spellData.SearingTotem.Highest()
	searingAttackRank = spellData.SearingTotemTriggered.Highest()
	searingTotemPeriod = searingTotemPeriodOf(searingAttackRank)
	magmaTotemRank = spellData.MagmaTotem.Highest()
	fireNovaRank = spellData.FireNova.Highest()
	fireNovaDamageRank = spellData.FireNovaTriggered.Highest()

	// Talents.
	flurryBuff = spellData.FlurryTriggered.Highest()
	improvedStormstrikeBuff = spellData.ImprovedStormstrikeTriggered.Highest()
	maelstromWeaponBuff = spellData.MaelstromWeaponTriggered.Highest()
	rageOfTheFarseerRank = spellData.RageOfTheFarseer.Highest()
	manaTideTotemRank = spellData.ManaTideTotem.Highest()
	naturesSwiftnessRank = spellData.NaturesSwiftness.Highest()
	elementalDevastationBuff = spellData.ElementalDevastationTriggered.Highest()
	clearcastingBuff = spellData.ElementalFocusTriggered.Highest()
	lightningMasteryRank = spellData.LightningMastery.Highest()
}
