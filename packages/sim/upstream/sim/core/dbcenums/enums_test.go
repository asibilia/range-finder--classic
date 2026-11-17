package dbcenums

import "testing"

// The game files' numbers, which the generated tables and the store's rows are written against: a
// renumbering here would silently re-point every row that names the constant.
func TestGameFilesValues(t *testing.T) {
	if E_SCHOOL_DAMAGE != 2 {
		t.Errorf("E_SCHOOL_DAMAGE = %d, want 2", E_SCHOOL_DAMAGE)
	}
	if A_PROC_TRIGGER_SPELL != 42 {
		t.Errorf("A_PROC_TRIGGER_SPELL = %d, want 42", A_PROC_TRIGGER_SPELL)
	}
	if ATTR_EX_8_PERIODIC_CAN_CRIT != 0x200 {
		t.Errorf("ATTR_EX_8_PERIODIC_CAN_CRIT = %#x, want 0x200", ATTR_EX_8_PERIODIC_CAN_CRIT)
	}
	if PROC_FLAG_DEAL_HARMFUL_SPELL != 0x10000 {
		t.Errorf("PROC_FLAG_DEAL_HARMFUL_SPELL = %#x, want 0x10000", PROC_FLAG_DEAL_HARMFUL_SPELL)
	}
}
