package dbcenums

// Named bits of SpellAuraOptions.ProcTypeMask word 0, under TrinityCore's names for them.
const (
	PROC_FLAG_NONE uint32 = 0

	PROC_FLAG_HEARTBEAT uint32 = 0x00000001 // 00 Heartbeat
	PROC_FLAG_KILL      uint32 = 0x00000002 // 01 Kill target (in most cases need XP/Honor reward)

	PROC_FLAG_DEAL_MELEE_SWING uint32 = 0x00000004 // 02 Done melee auto attack
	PROC_FLAG_TAKE_MELEE_SWING uint32 = 0x00000008 // 03 Taken melee auto attack

	PROC_FLAG_DEAL_MELEE_ABILITY uint32 = 0x00000010 // 04 Done attack by Spell that has dmg class melee
	PROC_FLAG_TAKE_MELEE_ABILITY uint32 = 0x00000020 // 05 Taken attack by Spell that has dmg class melee

	PROC_FLAG_DEAL_RANGED_ATTACK uint32 = 0x00000040 // 06 Done ranged auto attack
	PROC_FLAG_TAKE_RANGED_ATTACK uint32 = 0x00000080 // 07 Taken ranged auto attack

	PROC_FLAG_DEAL_RANGED_ABILITY uint32 = 0x00000100 // 08 Done attack by Spell that has dmg class ranged
	PROC_FLAG_TAKE_RANGED_ABILITY uint32 = 0x00000200 // 09 Taken attack by Spell that has dmg class ranged

	PROC_FLAG_DEAL_HELPFUL_ABILITY uint32 = 0x00000400 // 10 Done positive spell that has dmg class none
	PROC_FLAG_TAKE_HELPFUL_ABILITY uint32 = 0x00000800 // 11 Taken positive spell that has dmg class none

	PROC_FLAG_DEAL_HARMFUL_ABILITY uint32 = 0x00001000 // 12 Done negative spell that has dmg class none
	PROC_FLAG_TAKE_HARMFUL_ABILITY uint32 = 0x00002000 // 13 Taken negative spell that has dmg class none

	PROC_FLAG_DEAL_HELPFUL_SPELL uint32 = 0x00004000 // 14 Done positive spell that has dmg class magic
	PROC_FLAG_TAKE_HELPFUL_SPELL uint32 = 0x00008000 // 15 Taken positive spell that has dmg class magic

	PROC_FLAG_DEAL_HARMFUL_SPELL uint32 = 0x00010000 // 16 Done negative spell that has dmg class magic
	PROC_FLAG_TAKE_HARMFUL_SPELL uint32 = 0x00020000 // 17 Taken negative spell that has dmg class magic

	PROC_FLAG_DEAL_HARMFUL_PERIODIC uint32 = 0x00040000 // 18 Successful do periodic (damage)
	PROC_FLAG_TAKE_HARMFUL_PERIODIC uint32 = 0x00080000 // 19 Taken spell periodic (damage)

	PROC_FLAG_TAKE_ANY_DAMAGE uint32 = 0x00100000 // 20 Taken any damage

	PROC_FLAG_DEAL_HELPFUL_PERIODIC uint32 = 0x00200000 // 21

	PROC_FLAG_MAIN_HAND_WEAPON_SWING uint32 = 0x00400000 // 22 Done main-hand melee attacks (spell and autoattack)
	PROC_FLAG_OFF_HAND_WEAPON_SWING  uint32 = 0x00800000 // 23 Done off-hand melee attacks (spell and autoattack)

	PROC_FLAG_DEATH                 uint32 = 0x01000000 // 24 The caster died
	PROC_FLAG_JUMP                  uint32 = 0x02000000 // 25 The caster jumped
	PROC_FLAG_PROC_CLONE_SPELL      uint32 = 0x04000000 // 26 Proc clone spell
	PROC_FLAG_ENTER_COMBAT          uint32 = 0x08000000 // 27 The caster entered combat
	PROC_FLAG_ENCOUNTER_START       uint32 = 0x10000000 // 28 The encounter started
	PROC_FLAG_CAST_ENDED            uint32 = 0x20000000 // 29 A cast ended, however it ended
	PROC_FLAG_LOOTED                uint32 = 0x40000000 // 30 The caster looted
	PROC_FLAG_TAKE_HELPFUL_PERIODIC uint32 = 0x80000000 // 31 Taken helpful periodic

	PROC_FLAG_ANY_DIRECT_TAKEN uint32 = PROC_FLAG_TAKE_MELEE_SWING |
		PROC_FLAG_TAKE_MELEE_ABILITY |
		PROC_FLAG_TAKE_RANGED_ABILITY |
		PROC_FLAG_TAKE_HARMFUL_ABILITY |
		PROC_FLAG_TAKE_RANGED_ATTACK |
		PROC_FLAG_TAKE_HELPFUL_SPELL |
		PROC_FLAG_TAKE_HELPFUL_ABILITY |
		PROC_FLAG_TAKE_ANY_DAMAGE |
		PROC_FLAG_TAKE_HARMFUL_SPELL
	PROC_FLAG_ANY_DIRECT_DEALT uint32 = PROC_FLAG_DEAL_MELEE_SWING |
		PROC_FLAG_DEAL_MELEE_ABILITY |
		PROC_FLAG_DEAL_RANGED_ATTACK |
		PROC_FLAG_DEAL_RANGED_ABILITY |
		PROC_FLAG_DEAL_HARMFUL_ABILITY |
		PROC_FLAG_DEAL_HARMFUL_SPELL
	PROC_FLAG_ANY_HEAL uint32 = PROC_FLAG_DEAL_HELPFUL_PERIODIC |
		PROC_FLAG_DEAL_HELPFUL_ABILITY |
		PROC_FLAG_DEAL_HELPFUL_SPELL
)

// Named bits of ProcTypeMask word 1, under TrinityCore's names. The sim models only
// PROC_FLAG_2_MAIN_HAND_ONLY, which carries no TrinityCore name: Bloodthrill and the main-hand
// weapon procs that state it hear main-hand melee attacks alone.
const (
	PROC_FLAG_2_TARGET_DIES       uint32 = 0x00000001 // 32 Kill or assist in killing the target
	PROC_FLAG_2_KNOCKBACK         uint32 = 0x00000002 // 33 Knockback
	PROC_FLAG_2_CAST_SUCCESSFUL   uint32 = 0x00000004 // 34 Cast successful
	PROC_FLAG_2_SUCCESSFUL_DISPEL uint32 = 0x00000010 // 36 Successful dispel
	PROC_FLAG_2_MAIN_HAND_ONLY    uint32 = 0x00000020 // 37 Main-hand melee attacks only
	PROC_FLAG_2_DO_EMOTE          uint32 = 0x00000040 // 38 Do emote
)
