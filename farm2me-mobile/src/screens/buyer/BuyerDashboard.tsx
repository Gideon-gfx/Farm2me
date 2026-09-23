import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/ui";
import { tintFor } from "../../lib/colorTint";
import { useUnreadNotifications } from "../../lib/useUnreadNotifications";
import type { BuyerTabScreenProps } from "../../navigation/types";
import type { Grade, Listing, VillagePool } from "../../types";

// Category chips map to a set of crop types for client-side filtering.
const CATEGORIES: { key: string; label: string; crops: string[] }[] = [
  { key: "tubers", label: "Tubers", crops: ["Cassava", "Yam"] },
  { key: "vegetables", label: "Vegetables", crops: ["Tomatoes", "Peppers"] },
  { key: "poultry", label: "Poultry", crops: ["Poultry"] },
  { key: "grains", label: "Grains", crops: ["Maize"] },
  { key: "other", label: "Other", crops: ["Other"] },
];

const GRADE_BADGE: Record<Grade, string> = {
  GRADE_A: "A",
  GRADE_B: "B",
  GRADE_C: "C",
};

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export default function BuyerDashboard({ navigation }: BuyerTabScreenProps<"Home">) {
  const { user } = useAuth();
  const unreadCount = useUnreadNotifications();
  const [tab, setTab] = useState<"listings" | "pools">("listings");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [farListings, setFarListings] = useState<Listing[]>([]);
  const [pools, setPools] = useState<VillagePool[]>([]);
  const [farPools, setFarPools] = useState<VillagePool[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      // Closer listings/pools are sorted first automatically by the backend
      // when a viewer location is sent, and anything beyond 200km comes back
      // separately in farData rather than being hidden — same convention for
      // both endpoints.
      const locParams: Record<string, string | number> = {};
      if (user?.locationLat != null && user?.locationLng != null) {
        locParams.lat = user.locationLat;
        locParams.lng = user.locationLng;
      }
      const [l, p] = await Promise.all([
        api.get<{ data: Listing[]; farData: Listing[] }>("/listings", { params: { limit: 50, ...locParams } }),
        api.get<{ data: VillagePool[]; farData: VillagePool[] }>("/pools", { params: { status: "OPEN", limit: 50, ...locParams } }),
      ]);
      setListings(l.data.data ?? []);
      setFarListings(l.data.farData ?? []);
      setPools(p.data.data ?? []);
      setFarPools(p.data.farData ?? []);
    } catch {
      // pull to refresh to retry
    } finally {
      setRefreshing(false);
    }
  }, [user?.locationLat, user?.locationLng]);

  useEffect(() => {
    load();
  }, [load]);

  const cat = CATEGORIES.find((c) => c.key === category);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (cat && !cat.crops.includes(l.cropType)) return false;
      if (q && !l.cropType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [listings, cat, search]);

  const filteredFarListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farListings.filter((l) => {
      if (cat && !cat.crops.includes(l.cropType)) return false;
      if (q && !l.cropType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [farListings, cat, search]);

  const filteredPools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pools.filter((p) => {
      if (cat && !cat.crops.includes(p.cropType)) return false;
      if (q && !p.cropType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pools, cat, search]);

  const filteredFarPools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farPools.filter((p) => {
      if (cat && !cat.crops.includes(p.cropType)) return false;
      if (q && !p.cropType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [farPools, cat, search]);

  function renderHeader() {
    return (
      <View>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.title}>Market</Text>
            <Text style={styles.subtitle}>
              {user?.locationLabel ?? "Delivering to your location"}
            </Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} onPress={() => navigation.navigate("Notifications")} activeOpacity={0.85}>
            <Icon name="bell" size={18} color={COLORS.TEXT_PRIMARY} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={COLORS.TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search cassava, yam, maize…"
            placeholderTextColor={COLORS.TEXT_MUTED}
          />
        </View>

        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === "listings" && styles.segmentBtnActive]}
            onPress={() => setTab("listings")}
          >
            <Text style={[styles.segmentText, tab === "listings" && styles.segmentTextActive]}>
              Listings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === "pools" && styles.segmentBtnActive]}
            onPress={() => setTab("pools")}
          >
            <Text style={[styles.segmentText, tab === "pools" && styles.segmentTextActive]}>
              Village Pools
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "pools" && (
          <TouchableOpacity style={styles.createPoolBtn} onPress={() => navigation.navigate("CreatePool")}>
            <Text style={styles.createPoolBtnText}>+ Create a pool</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => setCategory(active ? null : c.key)}
              >
                <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderListing({ item }: { item: Listing }) {
    return <ListingCard item={item} onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })} />;
  }

  function renderPool({ item }: { item: VillagePool }) {
    return <PoolCard item={item} onPress={() => navigation.navigate("PoolDetail", { poolId: item.id })} />;
  }

  function renderFarPoolsFooter() {
    if (filteredFarPools.length === 0) return null;
    return (
      <View style={styles.farSection}>
        <Text style={styles.farTitle}>Other regions</Text>
        <Text style={styles.farSubtitle}>
          No local match? These pools are further away (200km+) — call ahead if you're both open to it.
        </Text>
        {filteredFarPools.map((item) => (
          <PoolCard
            key={item.id}
            item={item}
            far
            onPress={() => navigation.navigate("PoolDetail", { poolId: item.id })}
          />
        ))}
      </View>
    );
  }

  function renderFarListingsFooter() {
    if (filteredFarListings.length === 0) return null;
    return (
      <View style={styles.farSection}>
        <Text style={styles.farTitle}>Other regions</Text>
        <Text style={styles.farSubtitle}>
          No local match? These listings are further away (200km+) — delivery cost reflects the distance.
        </Text>
        <View style={styles.farListingsRow}>
          {filteredFarListings.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              style={styles.farListingCard}
              onPress={() => navigation.navigate("ListingDetail", { listingId: item.id })}
            />
          ))}
        </View>
      </View>
    );
  }

  return tab === "listings" ? (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.sm }]}
      data={filteredListings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={renderHeader}
      renderItem={renderListing}
      ListFooterComponent={renderFarListingsFooter}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.PRIMARY} />}
      ListEmptyComponent={<Text style={styles.empty}>No listings match your filters nearby.</Text>}
    />
  ) : (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.sm }]}
      data={filteredPools}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={renderHeader}
      renderItem={renderPool}
      ListFooterComponent={renderFarPoolsFooter}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.PRIMARY} />}
      ListEmptyComponent={<Text style={styles.empty}>No open pools match your filters.</Text>}
    />
  );
}

function ListingCard({
  item,
  onPress,
  style,
}: {
  item: Listing;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = tintFor(item.cropType);
  return (
    <TouchableOpacity style={[styles.card, style]} activeOpacity={0.85} onPress={onPress}>
      {item.imageUrls?.[0] ? (
        <Image source={{ uri: item.imageUrls[0] }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, { backgroundColor: tint }]}>
          <Text style={styles.cardInit}>{item.cropType.slice(0, 2)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardCrop} numberOfLines={1}>{item.cropType}</Text>
          <View style={styles.gradeBadge}>
            <Text style={styles.gradeBadgeText}>{GRADE_BADGE[item.grade]}</Text>
          </View>
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.weightKg}kg · {naira(item.pricePerKg)}/kg
        </Text>
        <Text style={styles.cardPrice}>{naira(item.totalPrice)}</Text>
        {item.distanceKm != null && (
          <Text style={styles.cardMeta} numberOfLines={1}>{item.distanceKm}km away</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PoolCard({ item, far, onPress }: { item: VillagePool; far?: boolean; onPress: () => void }) {
  const pct =
    item.percentageFilled ??
    (item.targetWeightKg > 0 ? Math.round((item.currentWeightKg / item.targetWeightKg) * 100) : 0);
  return (
    <TouchableOpacity style={styles.poolCard} activeOpacity={0.85} onPress={onPress}>
      <Text style={styles.cardCrop}>{item.contractName}</Text>
      <Text style={styles.cardMeta}>
        {item.cropType}
        {item.subType ? ` — ${item.subType}` : ""} · {naira(item.pricePerKg)}/kg
      </Text>
      <ProgressBar pct={pct} color={COLORS.ACCENT} />
      <Text style={styles.cardMeta}>
        {pct}% filled · {item.currentWeightKg}/{item.targetWeightKg}kg
        {item.distanceKm != null ? ` · ${item.distanceKm}km away` : ""}
      </Text>
      {far && (
        <TouchableOpacity
          disabled={!item.contactPhone}
          onPress={() => item.contactPhone && Linking.openURL(`tel:${item.contactPhone}`)}
          style={styles.farContactRow}
        >
          <Icon name="phone" size={13} color={COLORS.TEXT_PRIMARY} />
          <Text style={styles.farContactText}>
            {item.contactPhone ?? "Sign in to see contact number"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  title: { fontSize: 22, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  subtitle: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.DANGER,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.BACKGROUND,
  },
  bellBadgeText: { color: "#fff", fontSize: 9.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 13.5, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.pill,
    padding: 5,
    marginTop: SPACING.sm,
    alignSelf: "flex-start",
  },
  segmentBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.pill },
  segmentBtnActive: { backgroundColor: COLORS.PRIMARY_DARK },
  segmentText: { fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_MUTED },
  segmentTextActive: { color: "#fff" },
  createPoolBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
  },
  createPoolBtnText: { fontSize: 12, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  catRow: { paddingVertical: SPACING.md, gap: SPACING.sm },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    marginRight: SPACING.sm,
  },
  catChipActive: { backgroundColor: COLORS.PRIMARY_DARK, borderColor: COLORS.PRIMARY_DARK },
  catText: { fontSize: 12, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_MUTED },
  catTextActive: { color: "#fff" },
  row: { gap: SPACING.sm },
  card: {
    flex: 1,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    overflow: "hidden",
    marginBottom: SPACING.sm,
  },
  cardImage: { width: "100%", height: 86, alignItems: "center", justifyContent: "center" },
  cardInit: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 22, color: "rgba(0,0,0,0.35)" },
  cardBody: { padding: 12 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  cardCrop: { flex: 1, fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  gradeBadge: { backgroundColor: COLORS.ESCROW_BG, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  gradeBadgeText: { fontSize: 10, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.ESCROW_TEXT },
  cardMeta: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2, marginBottom: 6 },
  cardPrice: { fontSize: 13, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  poolCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 6,
  },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
  farSection: { marginTop: SPACING.lg },
  farListingsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  farListingCard: { flex: undefined, width: "47%" },
  farTitle: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  farSubtitle: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2, marginBottom: SPACING.sm },
  farContactRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  farContactText: { fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY },
});
