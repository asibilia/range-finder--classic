package core

import (
	"math"
	"time"

	"github.com/wowsims/forever/sim/core/proto"
)

// The timeline (local level-aware patch): damage and mana per time bucket, averaged over the
// iterations with their spread, for one character and its pets. It's off unless
// SimOptions.timeline_bucket_ms > 0. It only listens where damage and mana already change: no
// events, no random rolls, so a sim with it on gives the same numbers as with it off.
type timelineRecorder struct {
	owner  *UnitMetrics
	bucket time.Duration

	dmg   []float64 // this iteration: damage per bucket
	mana  []float64 // this iteration: mana at the end of each bucket (NaN: no change seen yet)
	start float64   // this iteration: mana at the pull

	sumD, sumD2, sumM, sumM2 []float64
	n                        []int32
}

func newTimelineRecorder(owner *UnitMetrics, bucketMs int32) *timelineRecorder {
	return &timelineRecorder{owner: owner, bucket: time.Duration(bucketMs) * time.Millisecond}
}

func (r *timelineRecorder) index(t time.Duration) int {
	if t < 0 {
		return 0
	}
	return int(t / r.bucket)
}

func grow(xs []float64, i int, fill float64) []float64 {
	for len(xs) <= i {
		xs = append(xs, fill)
	}
	return xs
}

func (r *timelineRecorder) startIteration(startMana float64) {
	r.dmg = r.dmg[:0]
	r.mana = r.mana[:0]
	r.start = startMana
}

func (r *timelineRecorder) addDamage(t time.Duration, damage float64) {
	i := r.index(t)
	r.dmg = grow(r.dmg, i, 0)
	r.dmg[i] += damage
}

func (r *timelineRecorder) setMana(t time.Duration, mana float64) {
	if t < 0 {
		r.start = mana
		return
	}
	i := r.index(t)
	r.mana = grow(r.mana, i, math.NaN())
	r.mana[i] = mana
}

func (r *timelineRecorder) doneIteration(duration time.Duration) {
	buckets := int((duration + r.bucket - 1) / r.bucket)
	secs := r.bucket.Seconds()
	last := r.start
	for i := 0; i < buckets; i++ {
		d := 0.0
		if i < len(r.dmg) {
			d = r.dmg[i] / secs
		}
		if i < len(r.mana) && !math.IsNaN(r.mana[i]) {
			last = r.mana[i]
		}
		r.sumD = grow(r.sumD, i, 0)
		r.sumD2 = grow(r.sumD2, i, 0)
		r.sumM = grow(r.sumM, i, 0)
		r.sumM2 = grow(r.sumM2, i, 0)
		for len(r.n) <= i {
			r.n = append(r.n, 0)
		}
		r.sumD[i] += d
		r.sumD2[i] += d * d
		r.sumM[i] += last
		r.sumM2[i] += last * last
		r.n[i]++
	}
}

func stdev(sum, sum2 float64, n int32) float64 {
	if n < 2 {
		return 0
	}
	mean := sum / float64(n)
	return math.Sqrt(math.Max(0, sum2/float64(n)-mean*mean))
}

func (r *timelineRecorder) toProto() []*proto.TimelinePoint {
	out := make([]*proto.TimelinePoint, 0, len(r.n))
	for i, n := range r.n {
		out = append(out, &proto.TimelinePoint{
			TS:         (time.Duration(i) * r.bucket).Seconds(),
			Dps:        r.sumD[i] / float64(n),
			DpsStdev:   stdev(r.sumD[i], r.sumD2[i], n),
			Mana:       r.sumM[i] / float64(n),
			ManaStdev:  stdev(r.sumM[i], r.sumM2[i], n),
			Iterations: n,
		})
	}
	return out
}

// setupTimeline gives the character a recorder (pets share it) when the sim asks for one.
func (character *Character) setupTimeline(sim *Simulation) {
	if sim.Options == nil || sim.Options.TimelineBucketMs <= 0 {
		return
	}
	if character.Metrics.timeline == nil {
		character.Metrics.timeline = newTimelineRecorder(&character.Metrics, sim.Options.TimelineBucketMs)
	}
	for _, pet := range character.Pets {
		pet.Metrics.timeline = character.Metrics.timeline
	}
	character.Metrics.timeline.startIteration(character.CurrentMana())
}
