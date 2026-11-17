package hunter

func (hunter *Hunter) ApplyTalents() {
	hunter.registerBeastMasteryTalents()
	hunter.registerMarksmanshipTalents()
	hunter.registerSurvivalTalents()

	if hunter.Pet != nil {
		hunter.Pet.ApplyTalents()
	}
}
