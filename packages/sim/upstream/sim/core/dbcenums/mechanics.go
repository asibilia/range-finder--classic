package dbcenums

// SpellCategories.Mechanic and EffectMechanic, and the misc value of A_MECHANIC_DURATION_MOD and
// A_MECHANIC_IMMUNITY, under TrinityCore's names for the game files' SpellMechanic rows.
type Mechanic uint8

const (
	MECHANIC_NONE            Mechanic = 0
	MECHANIC_CHARM           Mechanic = 1
	MECHANIC_DISORIENTED     Mechanic = 2
	MECHANIC_DISARM          Mechanic = 3
	MECHANIC_DISTRACT        Mechanic = 4
	MECHANIC_FEAR            Mechanic = 5
	MECHANIC_GRIP            Mechanic = 6
	MECHANIC_ROOT            Mechanic = 7
	MECHANIC_SLOW_ATTACK     Mechanic = 8
	MECHANIC_SILENCE         Mechanic = 9
	MECHANIC_SLEEP           Mechanic = 10
	MECHANIC_SNARE           Mechanic = 11
	MECHANIC_STUN            Mechanic = 12
	MECHANIC_FREEZE          Mechanic = 13
	MECHANIC_KNOCKOUT        Mechanic = 14
	MECHANIC_BLEED           Mechanic = 15
	MECHANIC_BANDAGE         Mechanic = 16
	MECHANIC_POLYMORPH       Mechanic = 17
	MECHANIC_BANISH          Mechanic = 18
	MECHANIC_SHIELD          Mechanic = 19
	MECHANIC_SHACKLE         Mechanic = 20
	MECHANIC_MOUNT           Mechanic = 21
	MECHANIC_INFECTED        Mechanic = 22
	MECHANIC_TURN            Mechanic = 23
	MECHANIC_HORROR          Mechanic = 24
	MECHANIC_INVULNERABILITY Mechanic = 25
	MECHANIC_INTERRUPT       Mechanic = 26
	MECHANIC_DAZE            Mechanic = 27
	MECHANIC_DISCOVERY       Mechanic = 28
	MECHANIC_IMMUNE_SHIELD   Mechanic = 29
	MECHANIC_SAPPED          Mechanic = 30
	MECHANIC_ENRAGED         Mechanic = 31
	MECHANIC_WOUNDED         Mechanic = 32
	MECHANIC_INFECTED_2      Mechanic = 33
	MECHANIC_INFECTED_3      Mechanic = 34
	MECHANIC_INFECTED_4      Mechanic = 35
	MECHANIC_TAUNTED         Mechanic = 36
)
