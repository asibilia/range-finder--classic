package shaman

import (
	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/spelldata"
)

// In game a rank deals less damage once the caster is far enough past the level it is taught at; at
// level 60 a rank taught at 44 or later is clear of that.
const minRankLevel = 44 // TODO: Ingame test needed: the cutoff is believed to be 42 or 43 at level 60.

// The ranks of a damage spell the shaman registers: those taught at minRankLevel or later.
//
// Local level-aware patch: below level 60, or under a level profile, the window moves with the
// character: ranks taught from 16 levels below the character's level up to its level, and of those
// only the ones the profile lists as trained when it lists any. At level 60 with no profile the
// window is 44 to 60, the rule above, so nothing changes.
func castableRanks(ladder spelldata.Ladder) spelldata.Ladder {
	lowest := int16(minRankLevel - (60 - core.CharacterLevel))
	var ids []int32
	ladder.Each(func(_ int32, rank *spelldata.Spell) {
		if rank.SpellLevel < lowest || int32(rank.SpellLevel) > core.CharacterLevel {
			return
		}
		if known, listed := core.KnownSpell(rank.ID); listed && !known {
			return
		}
		ids = append(ids, rank.ID)
	})
	return spelldata.Ranked(ids...)
}
