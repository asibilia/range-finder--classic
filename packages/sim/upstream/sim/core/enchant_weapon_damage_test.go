package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
)

func TestEnchantWeaponDamageReachesTheWeapon(t *testing.T) {
	const testItemID, testEnchantID = 990201, 990202

	addToDatabase(&proto.SimDatabase{
		Items: []*proto.SimItem{{
			Id:             testItemID,
			Name:           "Test Weapon Damage Axe",
			Type:           proto.ItemType_ItemTypeWeapon,
			WeaponType:     proto.WeaponType_WeaponTypeAxe,
			HandType:       proto.HandType_HandTypeTwoHand,
			WeaponSpeed:    3.5,
			ScalingOptions: map[int32]*proto.ScalingItemProperties{0: {WeaponDamageMin: 100, WeaponDamageMax: 150}},
		}},
		Enchants: []*proto.SimEnchant{{
			EffectId:     testEnchantID,
			Name:         "Test Weapon Damage Impact",
			WeaponDamage: 7,
		}},
	})

	equipment := ProtoToEquipment(&proto.EquipmentSpec{Items: []*proto.ItemSpec{{Id: testItemID, Enchant: testEnchantID}}})
	weapon := newWeaponFromItem(equipment.MainHand(), 0)

	if weapon.BaseDamageMin != 107 || weapon.BaseDamageMax != 157 {
		t.Errorf("weapon damage %v-%v, want 107-157", weapon.BaseDamageMin, weapon.BaseDamageMax)
	}
}
