package priest

func (priest *Priest) ApplyTalents() {
	priest.registerDisciplineTalents()
	priest.registerHolyTalents()
	priest.registerShadowTalents()
}
