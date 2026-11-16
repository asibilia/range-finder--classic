package core

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

// Local level-aware patch (branch level-aware, not upstream).
//
// The sim's numbers are written for one character level, CharacterLevel. Two environment
// variables move it for one process, before any package builds its spells:
//
//   - WOWSIMS_LEVEL: the character level, 1 to 60. Unset means 60 and changes nothing.
//   - WOWSIMS_LEVEL_PROFILE: a JSON LevelProfile, made from a character export, holding the
//     level-dependent numbers the game files in this repository carry only at level 60: base
//     attributes, base health, mana and attack power, and the Agility and Intellect conversion
//     rates. It may also name the spell ids the character has trained, which rank selection then
//     follows (KnownSpell). Its level wins over WOWSIMS_LEVEL.
//
// With neither set, every table keeps its level 60 value, so a level 60 sim is unchanged.

// LevelProfile is the level-dependent data of one race and class at one level.
type LevelProfile struct {
	Level int32  `json:"level"`
	Race  string `json:"race"`  // proto.Race name, e.g. "RaceOrc"
	Class string `json:"class"` // proto.Class name, e.g. "ClassShaman"

	// Base attributes as the character sheet states them before gear, buffs and talents.
	Strength  float64 `json:"strength"`
	Agility   float64 `json:"agility"`
	Stamina   float64 `json:"stamina"`
	Intellect float64 `json:"intellect"`
	Spirit    float64 `json:"spirit"`

	BaseHealth      float64 `json:"baseHealth"`      // Health before Stamina.
	BaseMana        float64 `json:"baseMana"`        // Mana before Intellect.
	BaseAttackPower float64 `json:"baseAttackPower"` // Flat attack power before any stat converts into it.

	CritPerAgility   float64 `json:"critPerAgility"`   // Melee crit percent per Agility point.
	DodgePerAgility  float64 `json:"dodgePerAgility"`  // Dodge percent per Agility point.
	SpellCritPerInt  float64 `json:"spellCritPerInt"`  // Spell crit percent per Intellect point.
	BaseMeleeCrit    float64 `json:"baseMeleeCrit"`    // Melee crit percent before Agility.
	BaseSpellCrit    float64 `json:"baseSpellCrit"`    // Spell crit percent before Intellect.
	BaseDodgePercent float64 `json:"baseDodgePercent"` // Dodge percent before Agility.

	// The spell ids the character has trained. Empty means unknown: rank selection then takes the
	// highest rank whose SpellLevel the character has reached.
	KnownSpells []int32 `json:"knownSpells"`

	// Free text: where the numbers came from (an export, or a placeholder).
	Source string `json:"source"`
}

// ActiveLevelProfile is the profile this process runs with, or nil at level 60 with no profile.
var ActiveLevelProfile *LevelProfile

var knownSpells map[int32]bool

// CharacterLevel is the level every character in this process is simmed at.
var CharacterLevel = loadCharacterLevel()

func loadCharacterLevel() int32 {
	level := int32(60)
	if v := os.Getenv("WOWSIMS_LEVEL"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 60 {
			panic(fmt.Sprintf("WOWSIMS_LEVEL=%q: want a level from 1 to 60", v))
		}
		level = int32(n)
	}
	if path := os.Getenv("WOWSIMS_LEVEL_PROFILE"); path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			panic(fmt.Sprintf("WOWSIMS_LEVEL_PROFILE: %v", err))
		}
		profile := &LevelProfile{}
		if err := json.Unmarshal(raw, profile); err != nil {
			panic(fmt.Sprintf("WOWSIMS_LEVEL_PROFILE %s: %v", path, err))
		}
		if profile.Level < 1 || profile.Level > 60 {
			panic(fmt.Sprintf("WOWSIMS_LEVEL_PROFILE %s: level %d is not 1 to 60", path, profile.Level))
		}
		ActiveLevelProfile = profile
		level = profile.Level
		if len(profile.KnownSpells) > 0 {
			knownSpells = make(map[int32]bool, len(profile.KnownSpells))
			for _, id := range profile.KnownSpells {
				knownSpells[id] = true
			}
		}
	}
	return level
}

// KnownSpell answers whether the profile names the spell as trained, and whether the profile names
// trained spells at all.
func KnownSpell(id int32) (known bool, listed bool) {
	if knownSpells == nil {
		return false, false
	}
	return knownSpells[id], true
}

// applyLevelProfile overwrites the level 60 tables for the profile's race and class. It runs after
// the base stat combos are built.
func applyLevelProfile() {
	p := ActiveLevelProfile
	if p == nil {
		return
	}
	race, ok := proto.Race_value[p.Race]
	if !ok {
		panic(fmt.Sprintf("level profile: unknown race %q", p.Race))
	}
	class, ok := proto.Class_value[p.Class]
	if !ok {
		panic(fmt.Sprintf("level profile: unknown class %q", p.Class))
	}
	c := proto.Class(class)

	base := stats.Stats{}
	base[stats.Strength] = p.Strength
	base[stats.Agility] = p.Agility
	base[stats.Stamina] = p.Stamina
	base[stats.Intellect] = p.Intellect
	base[stats.Spirit] = p.Spirit
	base[stats.Health] = p.BaseHealth
	base[stats.Mana] = p.BaseMana
	base[stats.AttackPower] = p.BaseAttackPower
	base[stats.PhysicalCritPercent] = p.BaseMeleeCrit
	base[stats.SpellCritPercent] = p.BaseSpellCrit
	// The base attributes already hold the race's offsets, so they replace the combo whole.
	BaseStats[BaseStatsKey{Race: proto.Race(race), Class: c}] = base

	// The conversion tables hold percent per point, as the profile does; base dodge is a fraction.
	CritPerAgiMaxLevel[c] = p.CritPerAgility
	CritPerIntMaxLevel[c] = p.SpellCritPerInt
	levelDodgePerAgility[c] = p.DodgePerAgility
	ClassBaseDodge[c] = p.BaseDodgePercent / 100
}

// levelDodgePerAgility holds a profile's dodge per Agility for its class; it wins over the level 60
// rule that dodge per Agility equals crit per Agility.
var levelDodgePerAgility = map[proto.Class]float64{}
