package dbcenums

type RPPMModifierType int

const (
	RPPMModifierHaste     RPPMModifierType = iota + 1 // 1
	RPPMModifierCrit                                  // 2
	RPPMModifierClass                                 // 3
	RPPMModifierSpec                                  // 4
	RPPMModifierRace                                  // 5
	RPPMModifierIlevel                                // 6
	RPPMModifierUnkAdjust                             // 7
	RPPMModifierAura                                  // 8
)
