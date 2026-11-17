package stats

import (
	"strings"
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
)

func TestStatsAdd(t *testing.T) {
	a := Stats{
		Intellect: 1,
	}
	b := Stats{
		Intellect: 1,
	}
	expectedResult := Stats{
		Intellect: 2,
	}

	result := a.Add(b)

	if !result.Equals(expectedResult) {
		t.Fatalf("Expected equal stats but were not equal: %s, %s", result, expectedResult)
	}
}

func TestStatsEquals_Success(t *testing.T) {
	a := Stats{
		Intellect: 1,
	}
	b := Stats{
		Intellect: 1,
	}

	if !a.Equals(b) {
		t.Fatalf("Expected equal stats but were not equal: %s, %s", a, b)
	}
}

func TestStatsEquals_Failure(t *testing.T) {
	a := Stats{
		Intellect: 1,
	}
	b := Stats{
		Intellect: 0,
	}

	if a.Equals(b) {
		t.Fatalf("Expected not equal stats but were equal: %s, %s", a, b)
	}
}

func TestStatsEqualsWithTolerance_Success(t *testing.T) {
	a := Stats{
		Intellect: 1,
	}
	b := Stats{
		Intellect: 0.5,
	}

	if !a.EqualsWithTolerance(b, 0.5) {
		t.Fatalf("Expected equal stats but were not equal: %s, %s", a, b)
	}
}

func TestStatsEqualsWithTolerance_Failure(t *testing.T) {
	a := Stats{
		Intellect: 1,
	}
	b := Stats{
		Intellect: 0.4,
	}

	if a.EqualsWithTolerance(b, 0.5) {
		t.Fatalf("Expected not equal stats but were equal: %s, %s", a, b)
	}
}

func TestStatsProtoInSync(t *testing.T) {
	d := proto.Stat_StatStrength.Descriptor().Values()

	for i := 0; i < d.Len(); i++ {
		enum := d.Get(i)
		protoName := enum.Name()
		goName := Stat(enum.Number()).StatName()
		sanitizedGoName := strings.ReplaceAll(goName, " ", "")
		if string(protoName) != "Stat"+sanitizedGoName && !strings.Contains(string(protoName), "AllPhys") {
			t.Fatalf("Encountered stat enum %d in proto.Stats with name %s differs from Go enum name %s (ignoring Stat prefix)", enum.Number(), protoName, goName)
		} else if strings.Contains(string(protoName), "AllPhys") && string(protoName) != "StatAllPhys"+sanitizedGoName {
			t.Fatalf("Encountered stat enum %d in proto.Stats with name %s differs from Go enum name %s (ignoring AllPhys prefix)", enum.Number(), protoName, goName)
		}
	}
}

func TestFromUnitStatsProtoImportsDodgeAndParryPercent(t *testing.T) {
	pseudoStats := make([]float64, len(proto.PseudoStat_name))
	pseudoStats[proto.PseudoStat_PseudoStatDodgePercent] = 2
	pseudoStats[proto.PseudoStat_PseudoStatParryPercent] = 3

	got := FromUnitStatsProto(&proto.UnitStats{PseudoStats: pseudoStats})
	if got[DodgePercent] != 2 || got[ParryPercent] != 3 {
		t.Errorf("DodgePercent %v and ParryPercent %v, want 2 and 3", got[DodgePercent], got[ParryPercent])
	}
}

func TestFromUnitStatsProtoImportsBlockPercentInPercent(t *testing.T) {
	pseudoStats := make([]float64, len(proto.PseudoStat_name))
	pseudoStats[proto.PseudoStat_PseudoStatBlockPercent] = 5

	got := FromUnitStatsProto(&proto.UnitStats{PseudoStats: pseudoStats})
	if got[BlockPercent] != 5 {
		t.Errorf("BlockPercent %v, want 5", got[BlockPercent])
	}
	if want := FromPseudoStatsProto(pseudoStats)[BlockPercent]; got[BlockPercent] != want {
		t.Errorf("BlockPercent %v, want %v as FromPseudoStatsProto reads it", got[BlockPercent], want)
	}
}

func TestWeightsKeepPercentWeightsPerPercent(t *testing.T) {
	pseudoStats := make([]float64, PseudoStatsLen)
	pseudoStats[proto.PseudoStat_PseudoStatBlockPercent] = 5
	pseudoStats[proto.PseudoStat_PseudoStatMeleeHitPercent] = 2
	pseudoStats[proto.PseudoStat_PseudoStatRangedHitPercent] = 3

	got := WeightsFromUnitStatsProto(&proto.UnitStats{Stats: make([]float64, ProtoStatsLen), PseudoStats: pseudoStats})
	if got[BlockPercent] != 5 {
		t.Errorf("Block%% weight %v, want the 5 per percent the EP values state", got[BlockPercent])
	}
	if got[PhysicalHitPercent] != 2 || got[RangedHitPercent] != 3 {
		t.Errorf("hit weights %v melee and %v ranged, want 2 and 3", got[PhysicalHitPercent], got[RangedHitPercent])
	}
}
