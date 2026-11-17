package core

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

// Local level-aware patch (branch level-aware, not upstream).
//
// The sim's numbers are written for one character level, CharacterLevel. A LevelProfile moves it for
// the sims that follow, until the next change: SetLevelProfile applies one before a run, and
// SetLevelProfile(nil) puts the level 60 tables back after it. A profile, made from a character
// export, holds the level-dependent numbers the game files in this repository carry only at level 60:
// base attributes, base health, mana and attack power, and the Agility and Intellect conversion
// rates. It may also name the spell ids the character has trained, which rank selection then follows
// (KnownSpell).
//
// With no profile, every table keeps its level 60 value, so a level 60 sim is unchanged.

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

// ActiveLevelProfile is the profile the sims run with now, or nil with no profile.
var ActiveLevelProfile *LevelProfile

var knownSpells map[int32]bool

// CharacterLevel is the level every character is simmed at now: 60 unless a level or a profile is set.
var CharacterLevel int32 = 60

// levelHooks run after every change of level or profile, so values read at start-up from the level
// (a class's spell ranks) follow it.
var levelHooks []func()

// OnLevelChange registers a hook that runs after every change of level or profile.
func OnLevelChange(hook func()) {
	levelHooks = append(levelHooks, hook)
}

// ParseLevelProfile reads a JSON LevelProfile strictly (an unknown field is an error) and checks it.
func ParseLevelProfile(raw []byte) (*LevelProfile, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	profile := &LevelProfile{}
	if err := decoder.Decode(profile); err != nil {
		return nil, fmt.Errorf("level profile: %v", err)
	}
	if err := profile.check(); err != nil {
		return nil, err
	}
	return profile, nil
}

func (p *LevelProfile) check() error {
	if p.Level < 1 || p.Level > 60 {
		return fmt.Errorf("level profile: level %d is not 1 to 60", p.Level)
	}
	if _, ok := proto.Race_value[p.Race]; !ok {
		return fmt.Errorf("level profile: unknown race %q", p.Race)
	}
	if _, ok := proto.Class_value[p.Class]; !ok {
		return fmt.Errorf("level profile: unknown class %q", p.Class)
	}
	return nil
}

// SetLevelProfile makes p the profile the sims that follow run with. nil puts the level 60 tables
// back: the sims that follow run at level 60, exactly as upstream.
func SetLevelProfile(p *LevelProfile) error {
	if p == nil {
		setLevel(60, nil)
		return nil
	}
	if err := p.check(); err != nil {
		return err
	}
	copied := *p
	copied.KnownSpells = append([]int32(nil), p.KnownSpells...)
	setLevel(copied.Level, &copied)
	return nil
}

// SetCharacterLevel sims at a level with no profile: ranks follow the level, the tables stay at
// level 60.
func SetCharacterLevel(level int32) error {
	if level < 1 || level > 60 {
		return fmt.Errorf("level %d is not 1 to 60", level)
	}
	setLevel(level, nil)
	return nil
}

func setLevel(level int32, p *LevelProfile) {
	restoreLevel60Tables()
	CharacterLevel = level
	ActiveLevelProfile = p
	knownSpells = nil
	if p != nil {
		if len(p.KnownSpells) > 0 {
			knownSpells = make(map[int32]bool, len(p.KnownSpells))
			for _, id := range p.KnownSpells {
				knownSpells[id] = true
			}
		}
		applyLevelProfile(p)
	}
	for _, hook := range levelHooks {
		hook()
	}
}

// KnownSpell answers whether the profile names the spell as trained, and whether the profile names
// trained spells at all.
func KnownSpell(id int32) (known bool, listed bool) {
	if knownSpells == nil {
		return false, false
	}
	return knownSpells[id], true
}

// The level 60 values a profile replaced, put back by restoreLevel60Tables.
type level60Tables struct {
	key  BaseStatsKey
	base stats.Stats

	class      proto.Class
	critPerAgi float64
	critPerInt float64
	baseDodge  float64

	hadBase, hadCritPerAgi, hadCritPerInt, hadBaseDodge bool
}

var replaced *level60Tables

// applyLevelProfile overwrites the level 60 tables for the profile's race and class, keeping what it
// replaces.
func applyLevelProfile(p *LevelProfile) {
	race := proto.Race(proto.Race_value[p.Race])
	c := proto.Class(proto.Class_value[p.Class])
	key := BaseStatsKey{Race: race, Class: c}

	saved := &level60Tables{key: key, class: c}
	saved.base, saved.hadBase = BaseStats[key]
	saved.critPerAgi, saved.hadCritPerAgi = CritPerAgiMaxLevel[c]
	saved.critPerInt, saved.hadCritPerInt = CritPerIntMaxLevel[c]
	saved.baseDodge, saved.hadBaseDodge = ClassBaseDodge[c]
	replaced = saved

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
	BaseStats[key] = base

	// The conversion tables hold percent per point, as the profile does; base dodge is a fraction.
	CritPerAgiMaxLevel[c] = p.CritPerAgility
	CritPerIntMaxLevel[c] = p.SpellCritPerInt
	levelDodgePerAgility[c] = p.DodgePerAgility
	ClassBaseDodge[c] = p.BaseDodgePercent / 100
}

// restoreLevel60Tables puts back the level 60 values the last profile replaced.
func restoreLevel60Tables() {
	saved := replaced
	if saved == nil {
		return
	}
	replaced = nil
	putBack(BaseStats, saved.key, saved.base, saved.hadBase)
	putBack(CritPerAgiMaxLevel, saved.class, saved.critPerAgi, saved.hadCritPerAgi)
	putBack(CritPerIntMaxLevel, saved.class, saved.critPerInt, saved.hadCritPerInt)
	putBack(ClassBaseDodge, saved.class, saved.baseDodge, saved.hadBaseDodge)
	delete(levelDodgePerAgility, saved.class)
}

func putBack[K comparable, V any](table map[K]V, key K, value V, had bool) {
	if had {
		table[key] = value
	} else {
		delete(table, key)
	}
}

// levelDodgePerAgility holds a profile's dodge per Agility for its class; it wins over the level 60
// rule that dodge per Agility equals crit per Agility.
var levelDodgePerAgility = map[proto.Class]float64{}
