package mage

func (mage *Mage) ApplyTalents() {
	mage.registerArcaneTalents()
	mage.registerFireTalents()
	mage.registerFrostTalents()
}
