package shaman

// Local level-aware patch. The level and profile are read once per process, so each test re-runs
// this test binary with the environment set and checks the ranks there.

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/spelldata"
	"github.com/wowsims/forever/sim/core/stats"
)

func rerun(t *testing.T, name string, env ...string) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^"+name+"$", "-test.v")
	cmd.Env = append(os.Environ(), append(env, "LEVEL_AWARE_CHILD=1")...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s at %v failed:\n%s", name, env, out)
	}
}

func ladderIDs(l spelldata.Ladder) []int32 {
	var ids []int32
	l.Each(func(_ int32, s *spelldata.Spell) { ids = append(ids, s.ID) })
	return ids
}

func TestLevelAwareRanksAtLevel30(t *testing.T) {
	if os.Getenv("LEVEL_AWARE_CHILD") == "" {
		rerun(t, t.Name(), "WOWSIMS_LEVEL=30")
		return
	}
	if core.CharacterLevel != 30 {
		t.Fatalf("CharacterLevel = %d, want 30", core.CharacterLevel)
	}
	// Highest is the top rank taught at or below level 30.
	for _, c := range []struct {
		name   string
		ladder spelldata.Ladder
		want   int32
	}{
		{"Lightning Bolt", spellData.LightningBolt, 943},
		{"Earth Shock", spellData.EarthShock, 8046},
		{"Flame Shock", spellData.FlameShock, 8053},
		{"Lightning Shield", spellData.LightningShield, 905},
		{"Windfury Weapon", spellData.WindfuryWeapon, 8232},
		{"Searing Totem", spellData.SearingTotem, 6364},
	} {
		if got := c.ladder.Highest().ID; got != c.want {
			t.Errorf("%s Highest = %d, want %d", c.name, got, c.want)
		}
	}
	// Castable damage ranks: taught from level 14 (30 - 16) to 30.
	if got, want := ladderIDs(castableRanks(spellData.EarthShock)), []int32{8045, 8046}; !slices.Equal(got, want) {
		t.Errorf("castable Earth Shock = %v, want %v", got, want)
	}
	if got, want := ladderIDs(castableRanks(spellData.LightningBolt)), []int32{548, 915, 943}; !slices.Equal(got, want) {
		t.Errorf("castable Lightning Bolt = %v, want %v", got, want)
	}
	if got := strengthOfEarthTotemRanks; len(got) != 1 || got[0].ID != 8160 {
		t.Errorf("Strength of Earth ranks = %v, want [8160]", got)
	}
	// Windfury Totem is taught at 32: Highest answers its lowest rank and lists it as unreached.
	if got := spellData.WindfuryTotem.Highest().ID; got != 8512 {
		t.Errorf("Windfury Totem Highest = %d, want 8512", got)
	}
	if !slices.Contains(spelldata.UnreachedRanks(), 8512) {
		t.Errorf("UnreachedRanks %v lacks Windfury Totem 8512", spelldata.UnreachedRanks())
	}
}

func TestLevelAwareRanksAtLevel60AreUnchanged(t *testing.T) {
	if core.CharacterLevel != 60 || core.ActiveLevelProfile != nil {
		t.Skip("run without WOWSIMS_LEVEL and WOWSIMS_LEVEL_PROFILE")
	}
	if got := spellData.LightningBolt.Highest().ID; got != 15208 {
		t.Errorf("Lightning Bolt Highest = %d, want 15208", got)
	}
	if got, want := ladderIDs(castableRanks(spellData.EarthShock)), []int32{10413, 10414}; !slices.Equal(got, want) {
		t.Errorf("castable Earth Shock = %v, want %v", got, want)
	}
	if len(strengthOfEarthTotemRanks) != 2 {
		t.Errorf("Strength of Earth ranks = %d, want the trained and the book rank", len(strengthOfEarthTotemRanks))
	}
}

const testProfile = `{"level": 30, "race": "RaceOrc", "class": "ClassShaman",
 "strength": 50, "agility": 30, "stamina": 55, "intellect": 45, "spirit": 60,
 "baseHealth": 500, "baseMana": 400, "baseAttackPower": 40,
 "critPerAgility": 0.09, "dodgePerAgility": 0.07, "spellCritPerInt": 0.03,
 "baseMeleeCrit": 1.7, "baseSpellCrit": 2.3, "baseDodgePercent": 1.7,
 "knownSpells": [8045, 943, 915]}`

func TestLevelProfile(t *testing.T) {
	if os.Getenv("LEVEL_AWARE_CHILD") == "" {
		path := filepath.Join(t.TempDir(), "profile.json")
		if err := os.WriteFile(path, []byte(testProfile), 0o644); err != nil {
			t.Fatal(err)
		}
		rerun(t, t.Name(), "WOWSIMS_LEVEL_PROFILE="+path)
		return
	}
	if core.CharacterLevel != 30 {
		t.Fatalf("CharacterLevel = %d, want the profile's 30", core.CharacterLevel)
	}
	base := core.BaseStats[core.BaseStatsKey{Race: proto.Race_RaceOrc, Class: proto.Class_ClassShaman}]
	if base[stats.Strength] != 50 || base[stats.Intellect] != 45 || base[stats.Mana] != 400 || base[stats.AttackPower] != 40 {
		t.Errorf("Orc Shaman base stats = %v, want the profile's", base)
	}
	if got := core.CritPerAgiMaxLevel[proto.Class_ClassShaman]; got != 0.09 {
		t.Errorf("crit per Agility = %v, want 0.09", got)
	}
	// Trained spells rule: Earth Shock rank 3 is the only trained rank, though rank 4 is taught at 24.
	if got := spellData.EarthShock.Highest().ID; got != 8045 {
		t.Errorf("Earth Shock Highest = %d, want the trained 8045", got)
	}
	if got, want := ladderIDs(castableRanks(spellData.LightningBolt)), []int32{915, 943}; !slices.Equal(got, want) {
		t.Errorf("castable Lightning Bolt = %v, want the trained %v", got, want)
	}
	// A spell with no trained rank answers its lowest rank and is listed as unreached.
	if spellData.FlameShock.Highest().ID != 8050 || !slices.Contains(spelldata.UnreachedRanks(), 8050) {
		t.Errorf("Flame Shock: want the lowest rank 8050, listed as unreached")
	}
}
