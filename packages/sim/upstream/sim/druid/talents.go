package druid

func (druid *Druid) ApplyTalents() {
	// Brambles: applied as Thorns aura points in thorns.go
	// Omen of Clarity: Forever drops the talent; see omen_of_clarity.go
	druid.registerBalanceTalents()
	druid.registerFeralCombatTalents()
	druid.registerRestorationTalents()
}
