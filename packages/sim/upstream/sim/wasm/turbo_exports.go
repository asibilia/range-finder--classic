//go:build js && wasm

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"syscall/js"

	"github.com/wowsims/forever/sim/core"
	proto "github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/spelldata"
	protojson "google.golang.org/protobuf/encoding/protojson"
)

// Our three exports, for @goturbo/sim. Each takes one JSON string and returns one JSON string; any
// failure returns {"error": "<message>"}, never a panic.
//
//   - turboSim({ request, level_profile? }): a RaidSimRequest run, returning the RaidSimResult.
//   - turboSheet({ request, level_profile? }): { level, unreached_ranks, player }, the sheet the
//     character would have, where player is its PlayerStats from ComputeStats.
//   - turboVersion(): { upstream_commit, patch_id, go_version }.
//
// Requests are protojson, parsed strictly: an unknown field or enum value is an error. The level
// profile travels with each call: it's applied before the run and the level 60 tables are put back
// after, so a call with no profile runs at level 60, exactly as upstream.

// upstreamCommit is the WoWSims Forever commit vendored in packages/sim/upstream: sim:build sets it
// from UPSTREAM.md's table, the commit's one place, with -ldflags "-X main.upstreamCommit=<commit>".
// A build without it reports unknown.
var upstreamCommit = "unknown"

// patchID names the Go this module was built from: sim:build sets it with
// -ldflags "-X main.patchID=<id>". A build without it reports dev.
var patchID = "dev"

func init() {
	js.Global().Set("turboSim", js.FuncOf(func(_ js.Value, args []js.Value) any {
		return turboReply(args, turboSim)
	}))
	js.Global().Set("turboSheet", js.FuncOf(func(_ js.Value, args []js.Value) any {
		return turboReply(args, turboSheet)
	}))
	js.Global().Set("turboVersion", js.FuncOf(func(_ js.Value, _ []js.Value) any {
		return turboReply(nil, func([]byte) ([]byte, error) { return turboVersion() })
	}))
}

// turboReply runs one call on its JSON argument and answers its JSON, or {"error": "<message>"}.
func turboReply(args []js.Value, call func([]byte) ([]byte, error)) any {
	out, err := func() (out []byte, err error) {
		defer func() {
			if r := recover(); r != nil {
				out, err = nil, fmt.Errorf("%v", r)
			}
		}()
		var input []byte
		if len(args) > 0 {
			if args[0].Type() != js.TypeString {
				return nil, errors.New("want one JSON string")
			}
			input = []byte(args[0].String())
		}
		return call(input)
	}()
	if err != nil {
		out, _ = json.Marshal(struct {
			Error string `json:"error"`
		}{err.Error()})
	}
	return js.ValueOf(string(out))
}

type turboCall struct {
	Request      json.RawMessage `json:"request"`
	LevelProfile json.RawMessage `json:"level_profile"`
}

// parseTurboCall reads { request, level_profile? } strictly.
func parseTurboCall(input []byte) (*proto.RaidSimRequest, *core.LevelProfile, error) {
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.DisallowUnknownFields()
	call := turboCall{}
	if err := decoder.Decode(&call); err != nil {
		return nil, nil, fmt.Errorf("call: %v", err)
	}
	if len(call.Request) == 0 || string(call.Request) == "null" {
		return nil, nil, errors.New("call: no request")
	}
	request := &proto.RaidSimRequest{}
	if err := protojson.Unmarshal(call.Request, request); err != nil {
		return nil, nil, fmt.Errorf("request: %v", err)
	}
	if len(call.LevelProfile) == 0 || string(call.LevelProfile) == "null" {
		return request, nil, nil
	}
	profile, err := core.ParseLevelProfile(call.LevelProfile)
	if err != nil {
		return nil, nil, err
	}
	return request, profile, nil
}

// withLevelProfile runs run under the profile (none: level 60), then puts the level 60 tables back,
// even when run panics.
func withLevelProfile(profile *core.LevelProfile, run func()) (err error) {
	if err := core.SetLevelProfile(profile); err != nil {
		return err
	}
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
		if restoreErr := core.SetLevelProfile(nil); restoreErr != nil && err == nil {
			err = restoreErr
		}
	}()
	run()
	return nil
}

var resultJSON = protojson.MarshalOptions{EmitUnpopulated: true}

func turboSim(input []byte) ([]byte, error) {
	request, profile, err := parseTurboCall(input)
	if err != nil {
		return nil, err
	}
	var result *proto.RaidSimResult
	if err := withLevelProfile(profile, func() { result = core.RunRaidSim(request) }); err != nil {
		return nil, err
	}
	if result.Error != nil {
		return nil, errors.New(result.Error.Message)
	}
	return resultJSON.Marshal(result)
}

type sheet struct {
	Level          int32           `json:"level"`
	UnreachedRanks []int32         `json:"unreached_ranks"`
	Player         json.RawMessage `json:"player"`
}

func turboSheet(input []byte) ([]byte, error) {
	request, profile, err := parseTurboCall(input)
	if err != nil {
		return nil, err
	}
	out := sheet{}
	var player *proto.PlayerStats
	err = withLevelProfile(profile, func() {
		result := core.ComputeStats(&proto.ComputeStatsRequest{Raid: request.Raid, Encounter: request.Encounter})
		if parties := result.GetRaidStats().GetParties(); len(parties) > 0 && len(parties[0].GetPlayers()) > 0 {
			player = parties[0].GetPlayers()[0]
		}
		// Read before the level 60 tables come back, which starts the list again.
		out.Level = core.CharacterLevel
		out.UnreachedRanks = spelldata.UnreachedRanks()
	})
	if err != nil {
		return nil, err
	}
	if player == nil {
		return nil, errors.New("request: no player in the raid's first party")
	}
	if out.Player, err = resultJSON.Marshal(player); err != nil {
		return nil, err
	}
	return json.Marshal(out)
}

func turboVersion() ([]byte, error) {
	return json.Marshal(struct {
		UpstreamCommit string `json:"upstream_commit"`
		PatchID        string `json:"patch_id"`
		GoVersion      string `json:"go_version"`
	}{upstreamCommit, patchID, runtime.Version()})
}
