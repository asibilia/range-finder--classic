package core

import (
	"slices"
	"testing"
	"time"
)

type castResultEvent struct {
	kind string
	at   time.Duration
}

type castResultTest struct {
	*channelTest
	missile *Spell
	silent  *Spell
	heal    *Spell
	events  []castResultEvent
}

func castResultSpellConfig(id int32, flags SpellFlag) SpellConfig {
	return SpellConfig{
		ActionID:         ActionID{SpellID: id},
		Flags:            flags,
		SpellSchool:      SpellSchoolFire,
		DefenseType:      DefenseTypeMagic,
		ProcMask:         ProcMaskSpellDamage,
		MissileSpeed:     20,
		DamageMultiplier: 1,
		ThreatMultiplier: 1,
	}
}

// A missile that travels for a second, the same missile with SpellFlagNoOnDamageDealt, a heal, and
// an aura that records the missile's cast results and hits. register adds what a test needs on top.
func newCastResultTest(t *testing.T, register func(crt *castResultTest, char *Character)) *castResultTest {
	t.Helper()
	crt := &castResultTest{}
	crt.channelTest = newChannelTest(func(ct *channelTest, char *Character) *Spell {
		crt.missile = char.RegisterSpell(castResultSpellConfig(910201, SpellFlagNone))
		crt.silent = char.RegisterSpell(castResultSpellConfig(910202, SpellFlagNoOnDamageDealt))
		crt.heal = char.RegisterSpell(SpellConfig{
			ActionID:         ActionID{SpellID: 910203},
			Flags:            SpellFlagHelpful,
			SpellSchool:      SpellSchoolHoly,
			ProcMask:         ProcMaskSpellHealing,
			DamageMultiplier: 1,
			ThreatMultiplier: 1,
		})
		record := func(kind string) OnSpellHit {
			return func(_ *Aura, sim *Simulation, spell *Spell, _ *SpellResult) {
				if spell == crt.missile || spell == crt.silent || spell == crt.heal {
					crt.events = append(crt.events, castResultEvent{kind, sim.CurrentTime})
				}
			}
		}
		char.RegisterAura(Aura{
			Label:           "Cast Result Recorder",
			Duration:        NeverExpires,
			OnReset:         func(aura *Aura, sim *Simulation) { aura.Activate(sim) },
			OnCastResult:    record("cast result"),
			OnSpellHitDealt: record("hit"),
			OnHealDealt:     record("heal"),
		})
		if register != nil {
			register(crt, char)
		}
		return crt.missile
	})
	crt.silent.finalize()
	crt.heal.finalize()
	crt.start()
	crt.fw.DistanceFromTarget = 20
	if crt.missile.TravelTime() != time.Second {
		t.Fatalf("missile travel time %v, want %v", crt.missile.TravelTime(), time.Second)
	}
	return crt
}

func (crt *castResultTest) result(spell *Spell, outcome HitOutcome) *SpellResult {
	result := spell.NewResult(crt.fw.CurrentTarget)
	result.Outcome = outcome
	result.Damage = 100
	return result
}

func (crt *castResultTest) count(kind string) int {
	n := 0
	for _, event := range crt.events {
		if event.kind == kind {
			n++
		}
	}
	return n
}

func wantEvents(t *testing.T, got []castResultEvent, want ...castResultEvent) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("events %v, want %v", got, want)
	}
}

// A result dealt at the cast and again after travel fires its cast result at the cast and not again at impact.
func TestCastResultFiresOnceAtTheCast(t *testing.T) {
	crt := newCastResultTest(t, nil)
	crt.runUntil(time.Second)

	result := crt.result(crt.missile, OutcomeHit)
	crt.missile.DealCastResult(crt.sim, result)
	crt.missile.DealCastResult(crt.sim, result)
	crt.missile.WaitTravelTime(crt.sim, func(sim *Simulation) { crt.missile.DealDamage(sim, result) })
	crt.runUntil(3 * time.Second)

	wantEvents(t, crt.events, castResultEvent{"cast result", time.Second}, castResultEvent{"hit", 2 * time.Second})
}

// The travel helper deals the cast result at the cast and the hit at impact.
func TestDealDamageAfterTravelDealsCastResultAtTheCast(t *testing.T) {
	crt := newCastResultTest(t, nil)
	crt.runUntil(time.Second)

	crt.missile.DealDamageAfterTravel(crt.sim, crt.result(crt.missile, OutcomeCrit))
	crt.runUntil(3 * time.Second)

	wantEvents(t, crt.events, castResultEvent{"cast result", time.Second}, castResultEvent{"hit", 2 * time.Second})
}

// A result dealt without a cast result of its own fires it right before its hit, at the same moment.
func TestDealDamageDealsCastResultRightBeforeTheHit(t *testing.T) {
	crt := newCastResultTest(t, nil)
	crt.runUntil(time.Second)

	crt.missile.DealDamage(crt.sim, crt.result(crt.missile, OutcomeHit))

	wantEvents(t, crt.events, castResultEvent{"cast result", time.Second}, castResultEvent{"hit", time.Second})
}

// Ticks and heals never fire a cast result, and SpellFlagNoOnDamageDealt keeps a direct hit silent.
func TestCastResultSkipsTicksHealsAndSilentSpells(t *testing.T) {
	crt := newCastResultTest(t, nil)

	crt.missile.DealPeriodicDamage(crt.sim, crt.result(crt.missile, OutcomeHit))
	heal := crt.heal.NewResult(&crt.fw.Unit)
	heal.Outcome = OutcomeHit
	heal.Damage = 100
	crt.heal.DealHealing(crt.sim, heal)
	crt.silent.DealDamage(crt.sim, crt.result(crt.silent, OutcomeHit))
	crt.silent.DealDamageAfterTravel(crt.sim, crt.result(crt.silent, OutcomeHit))
	crt.runUntil(2 * time.Second)

	if got := crt.count("cast result"); got != 0 {
		t.Errorf("cast results %d, want none", got)
	}
	if got := crt.count("heal"); got != 1 {
		t.Errorf("heals %d, want the one heal dealt", got)
	}
}

// A pooled result handed out again after it was dealt starts without a cast result dealt.
func TestReusedResultDealsCastResultAgain(t *testing.T) {
	crt := newCastResultTest(t, nil)

	first := crt.result(crt.missile, OutcomeHit)
	crt.missile.DealCastResult(crt.sim, first)
	crt.missile.DealDamage(crt.sim, first)
	second := crt.result(crt.missile, OutcomeHit)
	if second != first {
		t.Fatalf("the result cache handed out a new result, want the disposed one back")
	}
	crt.missile.DealDamage(crt.sim, second)

	if got := crt.count("cast result"); got != 2 {
		t.Errorf("cast results %d, want one per dealt result", got)
	}
}

// A second registration under the same label replaces the cast result callback.
func TestGetOrRegisterAuraCarriesOnCastResult(t *testing.T) {
	var first, second int
	crt := newCastResultTest(t, func(_ *castResultTest, char *Character) {
		char.GetOrRegisterAura(Aura{
			Label:        "Cast Result Replaced",
			Duration:     NeverExpires,
			OnReset:      func(aura *Aura, sim *Simulation) { aura.Activate(sim) },
			OnCastResult: func(_ *Aura, _ *Simulation, _ *Spell, _ *SpellResult) { first++ },
		})
		char.GetOrRegisterAura(Aura{
			Label:        "Cast Result Replaced",
			OnCastResult: func(_ *Aura, _ *Simulation, _ *Spell, _ *SpellResult) { second++ },
		})
	})
	crt.missile.DealDamage(crt.sim, crt.result(crt.missile, OutcomeHit))

	if first != 0 || second != 1 {
		t.Errorf("first callback ran %d times and second %d, want only the second, once", first, second)
	}
}

func castResultTrigger(name string, fired *[]castResultEvent, config ProcTrigger) func(*castResultTest, *Character) {
	return func(crt *castResultTest, char *Character) {
		config.Name = name
		config.Callback = CallbackOnCastResult
		config.ProcMask = ProcMaskSpellDamage
		config.Handler = func(sim *Simulation, _ *Spell, result *SpellResult) {
			kind := "fired"
			if result == nil || !result.Landed() {
				kind = "fired without a landed result"
			}
			*fired = append(*fired, castResultEvent{kind, sim.CurrentTime})
		}
		char.MakeProcTriggerAura(config)
	}
}

// A cast result trigger takes its outcome filter from the result.
func TestCastResultTriggerHonoursOutcome(t *testing.T) {
	var fired []castResultEvent
	crt := newCastResultTest(t, castResultTrigger("Cast Result Outcome", &fired, ProcTrigger{Outcome: OutcomeLanded, TriggerImmediately: true}))

	crt.missile.DealDamageAfterTravel(crt.sim, crt.result(crt.missile, OutcomeMiss))
	crt.missile.DealDamageAfterTravel(crt.sim, crt.result(crt.missile, OutcomeHit))
	crt.runUntil(2 * time.Second)

	wantEvents(t, fired, castResultEvent{"fired", 0})
}

// A cast result trigger's cooldown starts at the cast result it fires on.
func TestCastResultTriggerHonoursICD(t *testing.T) {
	var fired []castResultEvent
	crt := newCastResultTest(t, castResultTrigger("Cast Result ICD", &fired, ProcTrigger{ICD: 5 * time.Second, TriggerImmediately: true}))

	for _, at := range seconds(1, 3, 6) {
		crt.runUntil(at)
		crt.missile.DealDamageAfterTravel(crt.sim, crt.result(crt.missile, OutcomeHit))
	}
	crt.runUntil(8 * time.Second)

	wantEvents(t, fired, castResultEvent{"fired", time.Second}, castResultEvent{"fired", 6 * time.Second})
}

// A cast result trigger rolls its chance on each cast result.
func TestCastResultTriggerHonoursChance(t *testing.T) {
	var never, always []castResultEvent
	crt := newCastResultTest(t, func(crt *castResultTest, char *Character) {
		castResultTrigger("Cast Result Never", &never, ProcTrigger{ProcChance: 1e-6, TriggerImmediately: true})(crt, char)
		castResultTrigger("Cast Result Always", &always, ProcTrigger{TriggerImmediately: true})(crt, char)
	})

	const castResults = 200
	for range castResults {
		crt.missile.DealCastResult(crt.sim, crt.result(crt.missile, OutcomeHit))
	}

	if len(never) != 0 {
		t.Errorf("a near-zero chance fired %d times, want none", len(never))
	}
	if len(always) != castResults {
		t.Errorf("a certain chance fired %d times, want every cast result", len(always))
	}
}

// An immediate cast result trigger fires at the cast, a deferred one a spell batch later with a copy of
// the result, and both before the missile lands.
func TestCastResultTriggerImmediateAndDeferred(t *testing.T) {
	var immediate, deferred []castResultEvent
	crt := newCastResultTest(t, func(crt *castResultTest, char *Character) {
		castResultTrigger("Cast Result Immediate", &immediate, ProcTrigger{TriggerImmediately: true})(crt, char)
		castResultTrigger("Cast Result Deferred", &deferred, ProcTrigger{})(crt, char)
	})
	crt.runUntil(time.Second)

	crt.missile.DealDamageAfterTravel(crt.sim, crt.result(crt.missile, OutcomeHit))
	crt.runUntil(3 * time.Second)

	wantEvents(t, immediate, castResultEvent{"fired", time.Second})
	wantEvents(t, deferred, castResultEvent{"fired", time.Second + SpellBatchWindow})
	wantEvents(t, crt.events, castResultEvent{"cast result", time.Second}, castResultEvent{"hit", 2 * time.Second})
}
