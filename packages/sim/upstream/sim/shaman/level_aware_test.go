package shaman

// Local level-aware patch. The level and profile travel with each sim: each test sets them, checks
// the ranks, and puts level 60 back.

import (
	"slices"
	"testing"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/spelldata"
	"github.com/wowsims/forever/sim/core/stats"
)

func atLevel60(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		if err := core.SetLevelProfile(nil); err != nil {
			t.Fatal(err)
		}
	})
}

func ladderIDs(l spelldata.Ladder) []int32 {
	var ids []int32
	l.Each(func(_ int32, s *spelldata.Spell) { ids = append(ids, s.ID) })
	return ids
}

func checkLevel60Ranks(t *testing.T) {
	t.Helper()
	if core.CharacterLevel != 60 || core.ActiveLevelProfile != nil {
		t.Fatalf("CharacterLevel = %d with profile %v, want 60 and none", core.CharacterLevel, core.ActiveLevelProfile)
	}
	if got := spellData.LightningBolt.Highest().ID; got != 15208 {
		t.Errorf("Lightning Bolt Highest = %d, want 15208", got)
	}
	if got, want := ladderIDs(earthShockRanks), []int32{10413, 10414}; !slices.Equal(got, want) {
		t.Errorf("castable Earth Shock = %v, want %v", got, want)
	}
	if len(strengthOfEarthTotemRanks) != 2 {
		t.Errorf("Strength of Earth ranks = %d, want the trained and the book rank", len(strengthOfEarthTotemRanks))
	}
	if got := spelldata.UnreachedRanks(); len(got) != 0 {
		t.Errorf("UnreachedRanks = %v, want none at level 60", got)
	}
}

func TestLevelAwareRanksAtLevel30(t *testing.T) {
	atLevel60(t)
	if err := core.SetCharacterLevel(30); err != nil {
		t.Fatal(err)
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
	if got, want := ladderIDs(earthShockRanks), []int32{8045, 8046}; !slices.Equal(got, want) {
		t.Errorf("castable Earth Shock = %v, want %v", got, want)
	}
	if got, want := ladderIDs(lightningBoltRanks), []int32{548, 915, 943}; !slices.Equal(got, want) {
		t.Errorf("castable Lightning Bolt = %v, want %v", got, want)
	}
	if got := strengthOfEarthTotemRanks; len(got) != 1 || got[0].ID != 8160 {
		t.Errorf("Strength of Earth ranks = %v, want [8160]", got)
	}
	// Windfury Totem is taught at 32: Highest answers its lowest rank and lists it as unreached.
	if got := windfuryTotemRank.ID; got != 8512 {
		t.Errorf("Windfury Totem rank = %d, want 8512", got)
	}
	if !slices.Contains(spelldata.UnreachedRanks(), 8512) {
		t.Errorf("UnreachedRanks %v lacks Windfury Totem 8512", spelldata.UnreachedRanks())
	}
}

func TestLevelAwareRanksAtLevel60AreUnchanged(t *testing.T) {
	atLevel60(t)
	checkLevel60Ranks(t)
}

var testProfile = core.LevelProfile{
	Level: 30, Race: "RaceOrc", Class: "ClassShaman",
	Strength: 50, Agility: 30, Stamina: 55, Intellect: 45, Spirit: 60,
	BaseHealth: 500, BaseMana: 400, BaseAttackPower: 40,
	CritPerAgility: 0.09, DodgePerAgility: 0.07, SpellCritPerInt: 0.03,
	BaseMeleeCrit: 1.7, BaseSpellCrit: 2.3, BaseDodgePercent: 1.7,
	KnownSpells: []int32{8045, 943, 915},
}

func TestLevelProfile(t *testing.T) {
	atLevel60(t)
	level60Base := core.BaseStats[core.BaseStatsKey{Race: proto.Race_RaceOrc, Class: proto.Class_ClassShaman}]
	level60Crit := core.CritPerAgiMaxLevel[proto.Class_ClassShaman]

	profile := testProfile
	if err := core.SetLevelProfile(&profile); err != nil {
		t.Fatal(err)
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
	if got, want := ladderIDs(lightningBoltRanks), []int32{915, 943}; !slices.Equal(got, want) {
		t.Errorf("castable Lightning Bolt = %v, want the trained %v", got, want)
	}
	// A spell with no trained rank answers its lowest rank and is listed as unreached.
	if spellData.FlameShock.Highest().ID != 8050 || !slices.Contains(spelldata.UnreachedRanks(), 8050) {
		t.Errorf("Flame Shock: want the lowest rank 8050, listed as unreached")
	}

	// No profile puts every level 60 table and rank back.
	if err := core.SetLevelProfile(nil); err != nil {
		t.Fatal(err)
	}
	if got := core.BaseStats[core.BaseStatsKey{Race: proto.Race_RaceOrc, Class: proto.Class_ClassShaman}]; got != level60Base {
		t.Errorf("Orc Shaman base stats after the profile = %v, want level 60's %v", got, level60Base)
	}
	if got := core.CritPerAgiMaxLevel[proto.Class_ClassShaman]; got != level60Crit {
		t.Errorf("crit per Agility after the profile = %v, want level 60's %v", got, level60Crit)
	}
	checkLevel60Ranks(t)
}

func TestParseLevelProfileIsStrict(t *testing.T) {
	if _, err := core.ParseLevelProfile([]byte(`{"level": 30, "race": "RaceOrc", "class": "ClassShaman", "lvl": 1}`)); err == nil {
		t.Error("an unknown field: want an error")
	}
	if _, err := core.ParseLevelProfile([]byte(`{"level": 61, "race": "RaceOrc", "class": "ClassShaman"}`)); err == nil {
		t.Error("level 61: want an error")
	}
	if _, err := core.ParseLevelProfile([]byte(`{"level": 30, "race": "RaceElf", "class": "ClassShaman"}`)); err == nil {
		t.Error("an unknown race: want an error")
	}
}
