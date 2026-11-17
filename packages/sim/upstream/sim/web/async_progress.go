package main

import (
	"sync/atomic"

	uuid "github.com/google/uuid"
	proto "github.com/wowsims/forever/sim/core/proto"
)

type asyncProgress struct {
	id             string
	latestProgress atomic.Value
}

func (s *server) addNewSim() *asyncProgress {
	newID := uuid.NewString()
	simProgress := &asyncProgress{id: newID}
	simProgress.latestProgress.Store(&proto.ProgressMetrics{})

	s.progMut.Lock()
	s.asyncProgresses[newID] = simProgress
	s.progMut.Unlock()

	return simProgress
}
