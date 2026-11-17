package shaman_test

// The level-aware patch leaves level 60 alone: upstream's level-60 test request, with no level
// profile, gives upstream's DPS, and exactly the same DPS with the per-second timeline off and on
// (the hook only records).

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/wowsims/forever/sim/core"
	"github.com/wowsims/forever/sim/core/proto"
	_ "github.com/wowsims/forever/sim/encounters"
	"google.golang.org/protobuf/encoding/protojson"
)

const l60Fixtures = "../../../fixtures/"

func l60Request(t *testing.T) *proto.RaidSimRequest {
	t.Helper()
	data, err := os.ReadFile(l60Fixtures + "l60-test.in.json")
	if err != nil {
		t.Fatal(err)
	}
	request := &proto.RaidSimRequest{}
	if err := protojson.Unmarshal(data, request); err != nil {
		t.Fatal(err)
	}
	return request
}

func l60ExpectedDPS(t *testing.T) float64 {
	t.Helper()
	data, err := os.ReadFile(l60Fixtures + "l60-test.expected.json")
	if err != nil {
		t.Fatal(err)
	}
	expected := struct {
		DPS float64 `json:"dps"`
	}{}
	if err := json.Unmarshal(data, &expected); err != nil {
		t.Fatal(err)
	}
	return expected.DPS
}

func l60DPS(t *testing.T, request *proto.RaidSimRequest) (float64, *proto.UnitMetrics) {
	t.Helper()
	if err := core.SetLevelProfile(nil); err != nil {
		t.Fatal(err)
	}
	result := core.RunRaidSim(request)
	if result.Error != nil {
		t.Fatalf("RunRaidSim: %s", result.Error.Message)
	}
	player := result.GetRaidMetrics().GetParties()[0].GetPlayers()[0]
	return player.GetDps().GetAvg(), player
}

// within1e9 says whether got is within 1e-9 relative of want. The expected DPS was recorded by the
// command line's concurrent run; one thread (RunRaidSim, as in WASM) sums the iterations in another
// order, so the last digit can differ (819.0224561454964).
func within1e9(got, want float64) bool {
	return math.Abs(got-want) <= 1e-9*math.Abs(want)
}

func TestLevel60RequestGivesUpstreamDPS(t *testing.T) {
	want := l60ExpectedDPS(t)
	if want != 819.0224561454966 {
		t.Fatalf("l60-test.expected.json dps = %v, want upstream's 819.0224561454966", want)
	}
	got, player := l60DPS(t, l60Request(t))
	if !within1e9(got, want) {
		t.Errorf("level-60 DPS with no profile = %v, want %v within 1e-9 relative", got, want)
	}
	if len(player.GetTimeline()) != 0 {
		t.Errorf("timeline with timelineBucketMs unset = %d points, want none", len(player.GetTimeline()))
	}
}

func TestLevel60DPSIsExactlyTheSameWithTheTimelineOn(t *testing.T) {
	off, _ := l60DPS(t, l60Request(t))
	request := l60Request(t)
	request.SimOptions.TimelineBucketMs = 1000
	on, player := l60DPS(t, request)
	if on != off {
		t.Errorf("level-60 DPS with the timeline on = %v, want exactly the timeline-off %v", on, off)
	}
	if !within1e9(on, l60ExpectedDPS(t)) {
		t.Errorf("level-60 DPS with the timeline on = %v, want %v within 1e-9 relative", on, l60ExpectedDPS(t))
	}
	if len(player.GetTimeline()) == 0 {
		t.Error("timeline with timelineBucketMs 1000: want points, got none")
	}
}
