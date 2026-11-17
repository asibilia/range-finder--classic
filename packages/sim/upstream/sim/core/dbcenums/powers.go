package dbcenums

// SpellPower.PowerType, under TrinityCore's names. A type no code reads is commented out.
type PowerType int8

// Whether the game files state the bar in tenths: rage runs 0-1000 where the sim counts 0-100, so a
// cost of 150 is 15 rage. Every other bar is stated in whole points.
func (t PowerType) InTenths() bool {
	return t == POWER_RAGE
}

const (
	POWER_HEALTH       PowerType = -2
	POWER_MANA         PowerType = 0
	POWER_RAGE         PowerType = 1
	POWER_FOCUS        PowerType = 2
	POWER_ENERGY       PowerType = 3
	POWER_COMBO_POINTS PowerType = 4
	// POWER_RUNES PowerType = 5
	// POWER_RUNIC_POWER PowerType = 6
	// POWER_SOUL_SHARDS PowerType = 7
	// POWER_LUNAR_POWER PowerType = 8
	// POWER_HOLY_POWER PowerType = 9
	// POWER_ALTERNATE_POWER PowerType = 10
	// POWER_MAELSTROM PowerType = 11
	// POWER_CHI PowerType = 12
	// POWER_INSANITY PowerType = 13
	// POWER_BURNING_EMBERS PowerType = 14
	// POWER_DEMONIC_FURY PowerType = 15
	// POWER_ARCANE_CHARGES PowerType = 16
	// POWER_FURY PowerType = 17
	// POWER_PAIN PowerType = 18
	// POWER_ESSENCE PowerType = 19
	// POWER_RUNE_BLOOD PowerType = 20
	// POWER_RUNE_FROST PowerType = 21
	// POWER_RUNE_UNHOLY PowerType = 22
	// POWER_ALTERNATE_QUEST PowerType = 23
	// POWER_ALTERNATE_ENCOUNTER PowerType = 24
	// POWER_ALTERNATE_MOUNT PowerType = 25
)
