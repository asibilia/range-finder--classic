package sim

import (
	"github.com/wowsims/forever/sim/common"
	"github.com/wowsims/forever/sim/druid/balance"
	"github.com/wowsims/forever/sim/druid/feralbear"
	"github.com/wowsims/forever/sim/druid/feralcat"
	restoDruid "github.com/wowsims/forever/sim/druid/restoration"
	_ "github.com/wowsims/forever/sim/encounters"
	"github.com/wowsims/forever/sim/hunter"
	"github.com/wowsims/forever/sim/mage"
	holyPaladin "github.com/wowsims/forever/sim/paladin/holy"
	protPaladin "github.com/wowsims/forever/sim/paladin/protection"
	"github.com/wowsims/forever/sim/paladin/retribution"
	"github.com/wowsims/forever/sim/priest"
	healerPriest "github.com/wowsims/forever/sim/priest/healer"
	"github.com/wowsims/forever/sim/rogue"
	"github.com/wowsims/forever/sim/shaman/elemental"
	"github.com/wowsims/forever/sim/shaman/enhancement"
	restoShaman "github.com/wowsims/forever/sim/shaman/restoration"
	"github.com/wowsims/forever/sim/warlock"
	DpsWarrior "github.com/wowsims/forever/sim/warrior/dps"
	protWarrior "github.com/wowsims/forever/sim/warrior/protection"
)

var registered = false

func RegisterAll() {
	if registered {
		return
	}
	registered = true

	balance.RegisterBalanceDruid()
	feralcat.RegisterFeralCatDruid()
	feralbear.RegisterFeralBearDruid()
	restoDruid.RegisterRestorationDruid()

	hunter.RegisterHunter()

	mage.RegisterMage()

	holyPaladin.RegisterHolyPaladin()
	protPaladin.RegisterProtectionPaladin()
	retribution.RegisterRetributionPaladin()

	priest.RegisterPriest()
	healerPriest.RegisterHealerPriest()

	rogue.RegisterRogue()

	elemental.RegisterElementalShaman()
	enhancement.RegisterEnhancementShaman()
	restoShaman.RegisterRestorationShaman()

	warlock.RegisterWarlock()

	DpsWarrior.RegisterDpsWarrior()
	protWarrior.RegisterProtectionWarrior()

	common.RegisterAllEffects()
}
