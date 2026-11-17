package warlock

func (warlock *Warlock) ApplyTalents() {
	warlock.registerAfflictionTalents()
	warlock.registerDemonologyTalents()
	warlock.registerDestructionTalents()
}
