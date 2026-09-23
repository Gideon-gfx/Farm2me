import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/ui";
import { GlassTopNav, TOP_NAV_CONTENT_HEIGHT } from "../../components/GlassTopNav";
import EditListingModal from "../../components/EditListingModal";
import CreateListingScreen from "./CreateListingScreen";
import { tintFor } from "../../lib/colorTint";
import type { RootStackParamList } from "../../navigation/types";
import type { Listing } from "../../types";

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: "Live", bg: COLORS.SUCCESS_BG, fg: COLORS.PRIMARY },
  IN_TRANSIT: { label: "In transit", bg: COLORS.ESCROW_BG, fg: COLORS.ESCROW_TEXT },
  SOLD: { label: "Sold", bg: COLORS.NEUTRAL_BG, fg: COLORS.NEUTRAL_TEXT },
  COMPLETED: { label: "Sold", bg: COLORS.NEUTRAL_BG, fg: COLORS.NEUTRAL_TEXT },
  CANCELLED: { label: "Cancelled", bg: COLORS.NEUTRAL_BG, fg: COLORS.NEUTRAL_TEXT },
};

function formatNaira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

// The farmer tabs' "Add listings" tab — folded up behind a "+ Add listing"
// button rather than dropping straight into the create form: the default
// view browses the farmer's own listings (tap one to edit), and the form
// (CreateListingScreen) only takes over locally, in place, when "+" is
// pressed — so the tab bar stays visible the whole time either way.
export default function AddListingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [mode, setMode] = useState<"list" | "form">("list");
  const [listings, setListings] = useState<Listing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<{ data: Listing[] }>("/listings", { params: { limit: 50 } });
      setListings((data.data ?? []).filter((l) => l.farmerId === user?.id));
    } catch {
      // Silent — pull to refresh to retry.
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function deleteListing(id: string) {
    setEditingListing(null);
    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  if (mode === "form") {
    return (
      <View style={styles.screen}>
        <View style={[styles.formHeader, { paddingTop: insets.top + SPACING.sm }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setMode("list")} activeOpacity={0.85}>
            <Icon name="back" size={20} color={COLORS.TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.formTitle}>Add listing</Text>
        </View>
        <CreateListingScreen
          onCreated={() => {
            setMode("list");
            load();
          }}
        />
      </View>
    );
  }

  function renderListing({ item }: { item: Listing }) {
    const meta = STATUS_META[item.status] ?? STATUS_META.ACTIVE;
    const tint = tintFor(item.cropType);
    const editable = item.status === "ACTIVE";
    const mediaCount = (item.imageUrls?.length ?? 0) + (item.videoUrls?.length ?? 0);
    return (
      <TouchableOpacity
        style={styles.listingCard}
        activeOpacity={editable ? 0.8 : 1}
        onPress={() => editable && setEditingListing(item)}
      >
        {item.imageUrls?.[0] ? (
          <Image source={{ uri: item.imageUrls[0] }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: tint }]}>
            <Text style={styles.thumbInit}>{item.cropType.slice(0, 2)}</Text>
          </View>
        )}
        <View style={styles.listingBody}>
          <Text style={styles.listingCrop}>{item.cropType}</Text>
          <Text style={styles.listingMeta}>
            {formatNaira(item.pricePerKg)}/kg · {item.weightKg}kg available
          </Text>
          <Text style={styles.listingMediaCount}>{mediaCount > 0 ? `${mediaCount} media` : "No media"}</Text>
        </View>
        <Pill label={meta.label} bg={meta.bg} color={meta.fg} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      <GlassTopNav>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.navBackBtn}
            onPress={() => navigation.navigate("MyFarm" as never)}
            activeOpacity={0.85}
          >
            <Icon name="back" size={20} color={COLORS.TEXT_PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>My listings</Text>
        </View>
      </GlassTopNav>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: TOP_NAV_CONTENT_HEIGHT + insets.top + SPACING.md }]}
        data={listings}
        keyExtractor={(l) => l.id}
        renderItem={renderListing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.PRIMARY} />}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.9} onPress={() => setMode("form")}>
            <Text style={styles.addBtnPlus}>＋</Text>
            <Text style={styles.addBtnText}>Add listing</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={<Text style={styles.empty}>No listings yet. Tap "+ Add listing" to create one.</Text>}
      />
      <EditListingModal
        visible={!!editingListing}
        listing={editingListing}
        onClose={() => setEditingListing(null)}
        onSaved={() => {
          setEditingListing(null);
          load();
        }}
        onDelete={deleteListing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  navRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 },
  navBackBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.BACKGROUND,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  formTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl * 3 },
  addBtn: {
    height: 52,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: SPACING.lg,
  },
  addBtnPlus: { color: "#fff", fontSize: 19, lineHeight: 19 },
  addBtnText: { color: "#fff", fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 14.5 },
  listingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: 12,
    marginBottom: SPACING.sm,
    gap: 12,
  },
  thumb: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  thumbInit: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 15, color: "rgba(0,0,0,0.35)" },
  listingBody: { flex: 1 },
  listingCrop: { fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  listingMeta: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  listingMediaCount: { fontSize: 10, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
});
