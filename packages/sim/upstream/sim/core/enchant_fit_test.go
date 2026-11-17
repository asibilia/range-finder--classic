//go:build with_db

package core

import (
	"testing"

	"github.com/wowsims/forever/sim/core/proto"
	"github.com/wowsims/forever/sim/core/stats"
)

func TestFittingEnchantRowPicksTheRowThatFits(t *testing.T) {
	shared := addFitTestEnchant(910030, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeTwoHand)
	addFitTestEnchant(shared, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeNormal)
	bracer := addFitTestEnchant(910031, proto.ItemType_ItemTypeWrist, proto.EnchantType_EnchantTypeNormal)

	oneHand := Item{Type: proto.ItemType_ItemTypeWeapon, HandType: proto.HandType_HandTypeOneHand, WeaponType: proto.WeaponType_WeaponTypeSword}
	twoHand := Item{Type: proto.ItemType_ItemTypeWeapon, HandType: proto.HandType_HandTypeTwoHand, WeaponType: proto.WeaponType_WeaponTypeSword}
	if row, ok := FittingEnchantRow(shared, oneHand); !ok || row.EnchantType != proto.EnchantType_EnchantTypeNormal {
		t.Errorf("FittingEnchantRow(%d, one-hand) = %+v, %v; want the one-hand row", shared, row, ok)
	}
	if row, ok := FittingEnchantRow(shared, twoHand); !ok || row.EnchantType != proto.EnchantType_EnchantTypeTwoHand {
		t.Errorf("FittingEnchantRow(%d, two-hand) = %+v, %v; want the two-hand row, the first that fits", shared, row, ok)
	}
	if _, ok := FittingEnchantRow(bracer, oneHand); ok {
		t.Error("a bracer enchant fits a sword")
	}
}

func TestEnchantIsStatic(t *testing.T) {
	const statsOnly, procWithStats, empty = 910032, 910033, 910034
	agility := make([]float64, stats.ProtoStatsLen)
	agility[stats.Agility] = 1
	AddToDatabase(&proto.SimDatabase{Enchants: []*proto.SimEnchant{
		{EffectId: statsOnly, Type: proto.ItemType_ItemTypeWrist, Stats: agility},
		{EffectId: procWithStats, Type: proto.ItemType_ItemTypeWeapon, Stats: agility, ProcKind: proto.EnchantProcKind_EnchantProcKindCombat},
		{EffectId: empty, Type: proto.ItemType_ItemTypeHands},
	}})

	if !GetEnchantByEffectID(statsOnly).IsStatic() {
		t.Error("an enchant of stats alone is not static")
	}
	if GetEnchantByEffectID(procWithStats).IsStatic() {
		t.Error("an enchant with a proc is static")
	}
	if GetEnchantByEffectID(empty).IsStatic() {
		t.Error("an enchant with no stats is static")
	}
}

func addFitTestEnchant(effectID int32, itemType proto.ItemType, enchantType proto.EnchantType) int32 {
	AddToDatabase(&proto.SimDatabase{
		Enchants: []*proto.SimEnchant{{EffectId: effectID, Type: itemType, EnchantType: enchantType}},
	})
	return effectID
}

func TestEnchantAppliesToItem_UsesWeaponTypeRules(t *testing.T) {
	weaponEffectID := addFitTestEnchant(910001, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeNormal)

	twoHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeTwoHand}
	oneHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeOneHand}
	staff := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeStaff, HandType: proto.HandType_HandTypeTwoHand}
	shield := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeShield, HandType: proto.HandType_HandTypeOffHand}
	offHand := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeOffHand, HandType: proto.HandType_HandTypeOffHand}

	if !EnchantAppliesToItem(weaponEffectID, twoHandSword) {
		t.Fatalf("expected weapon enchant to apply to two-handed weapon")
	}
	if !EnchantAppliesToItem(weaponEffectID, oneHandSword) {
		t.Fatalf("expected weapon enchant to apply to one-handed weapon")
	}
	if !EnchantAppliesToItem(weaponEffectID, staff) {
		t.Fatalf("expected weapon enchant to apply to staff")
	}
	if EnchantAppliesToItem(weaponEffectID, shield) {
		t.Fatalf("expected weapon enchant to not apply to shield")
	}
	if EnchantAppliesToItem(weaponEffectID, offHand) {
		t.Fatalf("expected weapon enchant to not apply to off-hand frill")
	}
}

func TestEnchantAppliesToItem_UsesEnchantTypeRules(t *testing.T) {
	twoHand := addFitTestEnchant(910010, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeTwoHand)
	shieldOnly := addFitTestEnchant(910011, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeShield)
	staffOnly := addFitTestEnchant(910012, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeStaff)
	offHandOnly := addFitTestEnchant(910013, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeOffHand)

	oneHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeOneHand}
	twoHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeTwoHand}
	staff := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeStaff, HandType: proto.HandType_HandTypeTwoHand}
	mace := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeMace, HandType: proto.HandType_HandTypeTwoHand}
	shield := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeShield, HandType: proto.HandType_HandTypeOffHand}
	frill := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeOffHand, HandType: proto.HandType_HandTypeOffHand}

	cases := []struct {
		name    string
		enchant int32
		item    Item
		want    bool
	}{
		{"two-hand enchant on two-hander", twoHand, twoHandSword, true},
		{"two-hand enchant on one-hander", twoHand, oneHandSword, false},
		{"shield enchant on shield", shieldOnly, shield, true},
		{"shield enchant on weapon", shieldOnly, oneHandSword, false},
		{"staff enchant on staff", staffOnly, staff, true},
		{"staff enchant on two-hand mace", staffOnly, mace, false},
		{"off-hand enchant on off-hand frill", offHandOnly, frill, true},
		{"off-hand enchant on shield", offHandOnly, shield, false},
	}
	for _, c := range cases {
		if got := EnchantAppliesToItem(c.enchant, c.item); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestEnchantAppliesToItem_AnyRowFits(t *testing.T) {
	sharedEffectID := addFitTestEnchant(910020, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeTwoHand)
	addFitTestEnchant(sharedEffectID, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeNormal)

	oneHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeOneHand}
	twoHandSword := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeSword, HandType: proto.HandType_HandTypeTwoHand}
	shield := Item{Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeShield, HandType: proto.HandType_HandTypeOffHand}

	if !EnchantAppliesToItem(sharedEffectID, oneHandSword) {
		t.Errorf("expected the one-hand row to fit a one-hander")
	}
	if !EnchantAppliesToItem(sharedEffectID, twoHandSword) {
		t.Errorf("expected the enchant to fit a two-hander")
	}
	if EnchantAppliesToItem(sharedEffectID, shield) {
		t.Errorf("expected neither row to fit a shield")
	}
}

func TestEnchantAppliesToItem_UsesTypedRangedRules(t *testing.T) {
	rangedEffectID := addFitTestEnchant(910005, proto.ItemType_ItemTypeRanged, proto.EnchantType_EnchantTypeNormal)
	weaponEffectID := addFitTestEnchant(910006, proto.ItemType_ItemTypeWeapon, proto.EnchantType_EnchantTypeNormal)

	bow := Item{Type: proto.ItemType_ItemTypeRanged, RangedWeaponType: proto.RangedWeaponType_RangedWeaponTypeBow}
	wand := Item{Type: proto.ItemType_ItemTypeRanged, RangedWeaponType: proto.RangedWeaponType_RangedWeaponTypeWand}
	gun := Item{Type: proto.ItemType_ItemTypeRanged, RangedWeaponType: proto.RangedWeaponType_RangedWeaponTypeGun}

	if !EnchantAppliesToItem(rangedEffectID, bow) {
		t.Fatalf("expected ranged enchant to apply to bow")
	}
	if EnchantAppliesToItem(rangedEffectID, wand) {
		t.Fatalf("expected ranged enchant to not apply to wand")
	}
	if EnchantAppliesToItem(weaponEffectID, gun) {
		t.Fatalf("expected non-ranged enchant to not apply to non-wand ranged weapon")
	}
}

func TestEnchantAppliesToItem_RejectsNonMatchingItemTypes(t *testing.T) {
	extraTypeEffectID := addFitTestEnchant(910007, proto.ItemType_ItemTypeChest, proto.EnchantType_EnchantTypeNormal)

	wrist := Item{Type: proto.ItemType_ItemTypeWrist}
	legs := Item{Type: proto.ItemType_ItemTypeLegs}
	chest := Item{Type: proto.ItemType_ItemTypeChest}

	if !EnchantAppliesToItem(extraTypeEffectID, chest) {
		t.Fatalf("expected enchant to apply to matching item type")
	}
	if EnchantAppliesToItem(extraTypeEffectID, wrist) {
		t.Fatalf("expected chest enchant to not apply to wrist")
	}
	if EnchantAppliesToItem(extraTypeEffectID, legs) {
		t.Fatalf("expected enchant to not apply to unrelated item type")
	}
}
