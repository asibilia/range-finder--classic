package dbcenums

// SpellShapeshiftForm.ID: the form a unit is in, which SpellShapeshift masks name by bit ID-1.
// Zero is no form.
type ShapeshiftForm uint8

// The bit a SpellShapeshift mask names this form by. No form has no bit.
func (form ShapeshiftForm) Mask() uint64 {
	if form == 0 {
		return 0
	}
	return 1 << (form - 1)
}

// SpellShapeshiftForm.Flags bit 1: a stance, in which a spell that names no form can be cast,
// rather than a shapeshift, in which it cannot.
func (form ShapeshiftForm) IsStance() bool {
	return stanceForms&form.Mask() != 0
}
