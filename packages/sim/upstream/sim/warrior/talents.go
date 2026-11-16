package warrior

func (warrior *Warrior) ApplyTalents() {
	warrior.registerArmsTalents()
	warrior.registerFuryTalents()
	warrior.registerProtectionTalents()
}
