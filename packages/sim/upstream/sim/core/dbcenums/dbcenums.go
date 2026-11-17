// Package dbcenums is the game files' own spell enums: what an effect does, which aura it applies,
// the attribute bits a spell carries and the proc bits its aura listens to.
//
// The package imports only the standard library, so every side can read the same definitions: the
// extractor in tools/database/dbc, the store in sim/core/spelldata and the decoder in sim/core.
package dbcenums

import (
	"fmt"
	"strings"
)

//go:generate stringer -type=SpellEffectType,EffectAuraType
//go:generate stringer -type=Mechanic,PowerType,ImplicitTarget
//go:generate stringer -type=SpellModOp

// A constant's name, and whether it has one: a stringer answers "Type(n)" for a value no constant
// names, which no constant name contains.
func Named(v fmt.Stringer) (string, bool) {
	name := v.String()
	return name, !strings.Contains(name, "(")
}
