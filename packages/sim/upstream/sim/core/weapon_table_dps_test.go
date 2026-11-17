package core

import (
	"fmt"
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestUnroundedDPS(t *testing.T) {
	cases := []struct {
		name, metadata string
	}{
		{"legacy", ""},
		{"zero", `,"unroundedDps":0`},
		{"caster", `,"unroundedDps":14.695897`},
		{"noncaster", `,"unroundedDps":19.808466`},
	}
	for index, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			id := int32(1900000000 + index)
			payload := fmt.Sprintf(`{"id":%d,"weaponSpeed":2.4,"scalingOptions":{"0":{"weaponDamageMin":60,"weaponDamageMax":90%s}}}`, id, c.metadata)
			source := &proto.SimItem{}
			if err := protojson.Unmarshal([]byte(payload), source); err != nil {
				t.Fatal(err)
			}
			dbMu.RLock()
			_, exists := itemsByID[id]
			dbMu.RUnlock()
			if exists {
				t.Fatalf("synthetic item ID %d is occupied", id)
			}
			t.Cleanup(func() { dbMu.Lock(); delete(itemsByID, id); dbMu.Unlock() })
			AddToDatabase(&proto.SimDatabase{Items: []*proto.SimItem{source}})

			item := NewItem(ItemSpec{ID: id})

			want := source.ScalingOptions[0].UnroundedDps
			if item.UnroundedDPS != want {
				t.Fatalf("equipped unrounded DPS = %.9f, want %.9f", item.UnroundedDPS, want)
			}
			if item.WeaponDamageMin != 60 || item.WeaponDamageMax != 90 || item.SwingSpeed != 2.4 {
				t.Fatalf("equipped damage/speed changed: %v-%v at %v", item.WeaponDamageMin, item.WeaponDamageMax, item.SwingSpeed)
			}
		})
	}
}
