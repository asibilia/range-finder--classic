package core

import "github.com/wowsims/forever/sim/core/proto"

// The raid buffs and debuffs live in sim/core/buffs, above this package, so that they can read the
// spell store, which imports this package. They register themselves here from that package's init,
// and sim/common imports it, which is what links it into every sim.
type BuffHooks struct {
	ApplyBuffs func(char *Character, raid *proto.RaidBuffs, party *proto.PartyBuffs, individual *proto.IndividualBuffs)

	ApplyDebuffs func(target *Unit, debuffs *proto.Debuffs, raid *proto.Raid)
}

var buffHooks *BuffHooks

func RegisterBuffHooks(hooks BuffHooks) {
	buffHooks = &hooks
}

func registeredBuffs() *BuffHooks {
	if buffHooks == nil {
		panic(`no raid buffs are registered: import _ "github.com/wowsims/forever/sim/core/buffs"`)
	}
	return buffHooks
}
