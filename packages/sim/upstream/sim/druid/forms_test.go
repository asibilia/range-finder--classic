package druid

import (
	"testing"

	"github.com/wowsims/forever/sim/core/dbcenums"
	"github.com/wowsims/forever/sim/core/spelldata"
)

// The bear form passives state their health as a flat amount that grows with the druid's level.
func TestBearFormPassivesAddFlatHealthAtSixty(t *testing.T) {
	for _, c := range []struct {
		row  *spelldata.Spell
		want float64
	}{
		{spellData.BearFormTriggered.Highest(), 560},
		{spellData.DireBearFormTriggered.Highest(), 1240},
	} {
		var health []spelldata.Applied
		for _, a := range spelldata.DryRun(c.row, spelldata.Level(60)).Applied {
			if a.Effect.Aura == dbcenums.A_MOD_MAX_HEALTH {
				health = append(health, a)
			}
		}
		if len(health) != 1 || health[0].Kind != "stat Health" || health[0].Value != c.want {
			t.Errorf("%d %s: the health effect became %v, want stat Health %v", c.row.ID, c.row.Name, health, c.want)
		}
	}
}
