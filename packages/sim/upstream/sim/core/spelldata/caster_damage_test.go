package spelldata

import "testing"

func TestCasterDamageEffectIsTheHalfThatHitsTheCaster(t *testing.T) {
	defer generatedStore()()

	sapper := MustFind(13241)
	if got := sapper.CasterDamageEffect(); got != sapper.EffectAtIndex(1) {
		t.Errorf("13241's caster damage is effect %d, want effect 1", got.Index)
	}
	if got := sapper.DamageEffect(); got != sapper.EffectAtIndex(0) {
		t.Errorf("13241's damage is effect %d, want effect 0", got.Index)
	}

	if got := MustFind(23000).CasterDamageEffect(); got != NilEffect {
		t.Errorf("Ez-Thro Dynamite II 23000 damages its caster through effect %d, want none", got.Index)
	}
}
