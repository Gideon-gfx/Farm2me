import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Linking, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/ui";
import { GlassTopNav, TOP_NAV_CONTENT_HEIGHT } from "../../components/GlassTopNav";
import { useUnreadNotifications } from "../../lib/useUnreadNotifications";
import type { FarmerTabScreenProps } from "../../navigation/types";

// Maps a deal/escrow status to the prototype's pill palette.
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  FUNDS_LOCKED: { label: "Funds locked", bg: COLORS.ESCROW_BG, fg: COLORS.ESCROW_TEXT },
  IN_TRANSIT: { label: "In transit", bg: COLORS.ESCROW_BG, fg: COLORS.ESCROW_TEXT },
  ARRIVED: { label: "Arrived", bg: COLORS.ESCROW_BG, fg: COLORS.ESCROW_TEXT },
  DELIVERED: { label: "Delivered", bg: COLORS.SUCCESS_BG, fg: COLORS.PRIMARY },
  RELEASED: { label: "Released", bg: COLORS.NEUTRAL_BG, fg: COLORS.NEUTRAL_TEXT },
  DISPUTED: { label: "Disputed", bg: COLORS.NEUTRAL_BG, fg: COLORS.DANGER },
  CANCELLED: { label: "Cancelled", bg: COLORS.NEUTRAL_BG, fg: COLORS.NEUTRAL_TEXT },
};

interface Deal {
  id: string;
  item: string;
  party: string;
  status: string;
  amount: string | number;
  createdAt: string;
  deliveryLocation?: string | null;
  logisticsFee?: string | number;
  dispatched?: boolean;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  buyerPhone?: string | null;
  driverLocationAt?: string | null;
  offers?: { id: string; driverName: string; isVerified: boolean; amount: string | number }[];
}

function formatNaira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FarmerDashboard({ navigation }: FarmerTabScreenProps<"MyFarm">) {
  const { user, refreshProfile } = useAuth();
  const unreadCount = useUnreadNotifications();
  const insets = useSafeAreaInsets();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      const { data } = await api.get<{ data: Deal[] }>("/payments/my-deals");
      setDeals(data.data ?? []);
    } catch {
      // Silent — pull to refresh to retry.
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const activeOrders = deals.filter((d) => d.status !== "RELEASED" && d.status !== "CANCELLED").length;
  const needsDriverCount = deals.filter((d) => d.status === "FUNDS_LOCKED" && !d.driverId).length;

  function startEditingName() {
    setNameInput(user?.farmName ?? "");
    setEditingName(true);
  }

  async function saveFarmName() {
    if (savingName) return;
    setSavingName(true);
    try {
      await api.patch("/auth/profile", { farmName: nameInput.trim() });
      await refreshProfile();
      setEditingName(false);
    } catch {
      // Stay in edit mode so the farmer can retry.
    } finally {
      setSavingName(false);
    }
  }

  async function respondToOffer(offerId: string, action: "accept" | "reject") {
    setRespondingOfferId(offerId);
    try {
      await api.post(`/transport/offers/${offerId}/${action}`);
      await load();
    } catch (e: any) {
      Alert.alert("Could not respond", e?.response?.data?.error ?? "Try again");
    } finally {
      setRespondingOfferId(null);
    }
  }

  function renderTopNav() {
    return (
      <GlassTopNav>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.navigate("Profile")} activeOpacity={0.85}>
            <View style={styles.headerAvatar}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.headerAvatarImage} />
              ) : (
                <Text style={styles.headerAvatarText}>{(user?.fullName ?? "F").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            {editingName ? (
              <View style={{ flex: 1 }}>
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="e.g. Amaka's Organic Farm"
                    placeholderTextColor={COLORS.TEXT_MUTED}
                    autoFocus
                  />
                  <TouchableOpacity style={styles.nameIconBtn} onPress={saveFarmName} disabled={savingName}>
                    <Icon name="check" size={16} color={COLORS.PRIMARY} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nameIconBtn} onPress={() => setEditingName(false)} disabled={savingName}>
                    <Icon name="close" size={16} color={COLORS.TEXT_MUTED} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={startEditingName} activeOpacity={0.7}>
                <View style={styles.nameRow}>
                  <Text style={styles.title}>{user?.farmName || "My Farm"}</Text>
                  <Icon name="edit" size={13} color={COLORS.TEXT_MUTED} />
                </View>
                <Text style={styles.subtitle}>{user?.locationLabel ?? user?.fullName ?? "Farmer"}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.bellBtn} onPress={() => navigation.navigate("Notifications")} activeOpacity={0.85}>
            <Icon name="bell" size={18} color={COLORS.TEXT_PRIMARY} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </GlassTopNav>
    );
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>WALLET BALANCE</Text>
          <Text style={styles.walletAmount}>{formatNaira(user?.walletBalance ?? 0)}</Text>
          <View style={styles.walletActions}>
            <TouchableOpacity
              style={styles.withdrawBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("Wallet")}
            >
              <Text style={styles.withdrawText}>Add funds</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate("Subscription")}>
              <Text style={styles.plansLink}>View plans ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: COLORS.PRIMARY_DARK }]}>{activeOrders}</Text>
            <Text style={styles.statLabel}>Active orders</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: COLORS.ACCENT }]}>{needsDriverCount}</Text>
            <Text style={styles.statLabel}>Need a driver</Text>
          </View>
        </View>

        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => navigation.navigate("CreatePool")}>
            <Text style={styles.poolLink}>+ Create a Village Pool</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("FindDriver")} style={styles.findDriverLink}>
            <Icon name="truck" size={13} color={COLORS.PRIMARY} />
            <Text style={styles.poolLink}>Find a driver</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My orders</Text>
      </View>
    );
  }

  function renderDeal({ item: d }: { item: Deal }) {
    const needsDriver = d.status === "FUNDS_LOCKED" && !d.driverId;
    return (
      <TouchableOpacity
        style={styles.dealCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("ActiveOrder", { escrowTripId: d.id })}
      >
        <View style={styles.dealTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dealItem}>{d.item}</Text>
            <Text style={styles.dealParty} numberOfLines={1}>
              {d.party}
              {d.deliveryLocation ? ` · delivering to ${d.deliveryLocation}` : ""}
            </Text>
          </View>
          <Pill
            label={(STATUS_META[d.status] ?? STATUS_META.FUNDS_LOCKED).label}
            bg={(STATUS_META[d.status] ?? STATUS_META.FUNDS_LOCKED).bg}
            color={(STATUS_META[d.status] ?? STATUS_META.FUNDS_LOCKED).fg}
          />
        </View>
        <Text style={styles.dealAmount}>{formatNaira(d.amount)}</Text>

        {d.driverName ? (
          <View style={styles.trackRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.trackTitleRow}>
                <Icon name="truck" size={12} color={COLORS.PRIMARY} />
                <Text style={styles.trackTitle}>
                  {d.driverName}
                  {d.logisticsFee != null ? ` · ${formatNaira(d.logisticsFee)}` : ""}
                </Text>
              </View>
              <Text style={styles.trackStatus}>
                {d.status === "IN_TRANSIT" || d.status === "ARRIVED"
                  ? d.driverLocationAt
                    ? `Last seen ${timeAgo(d.driverLocationAt)}`
                    : "On the way — no live location yet"
                  : d.status === "DELIVERED" || d.status === "RELEASED"
                    ? "Delivered"
                    : "Waiting for pickup"}
              </Text>
            </View>
            {d.driverPhone && (
              <TouchableOpacity style={styles.callChip} onPress={() => Linking.openURL(`tel:${d.driverPhone}`)}>
                <Icon name="phone" size={11} color={COLORS.TEXT_PRIMARY} />
              </TouchableOpacity>
            )}
            {d.buyerPhone && (
              <TouchableOpacity style={styles.callChip} onPress={() => Linking.openURL(`tel:${d.buyerPhone}`)}>
                <Icon name="phone" size={11} color={COLORS.ACCENT_DARK} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          needsDriver && (
            <View style={{ marginTop: SPACING.sm }}>
              {d.offers && d.offers.length > 0 && (
                <View style={styles.offersBox}>
                  <Text style={styles.offersTitle}>Drivers ready to deliver — you have the final say</Text>
                  {d.offers.map((o) => (
                    <View key={o.id} style={styles.offerRow}>
                      <Text style={styles.offerText} numberOfLines={1}>
                        {o.driverName}
                        {o.isVerified ? " ✓" : ""} — {formatNaira(o.amount)}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          disabled={respondingOfferId === o.id}
                          onPress={() => respondToOffer(o.id, "accept")}
                        >
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          disabled={respondingOfferId === o.id}
                          onPress={() => respondToOffer(o.id, "reject")}
                        >
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {d.dispatched ? (
                <Text style={styles.dispatchedText}>Posted to the load board — waiting for a driver</Text>
              ) : (
                <TouchableOpacity
                  style={styles.findDriverBtn}
                  onPress={() => navigation.navigate("FindDriver", { escrowTripId: d.id })}
                >
                  <Icon name="truck" size={13} color={COLORS.PRIMARY} />
                  <Text style={styles.poolLink}>Find a driver</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      {renderTopNav()}
      <FlatList
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: TOP_NAV_CONTENT_HEIGHT + insets.top + SPACING.sm, paddingBottom: SPACING.xl * 3 },
        ]}
        data={deals}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={renderHeader()}
        renderItem={renderDeal}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.PRIMARY} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Escrow orders from your sold listings will appear here.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarImage: { width: "100%", height: "100%" },
  headerAvatarText: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: "#fff" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 22, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  subtitle: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.ACCENT,
    paddingVertical: 2,
  },
  nameIconBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.SURFACE },
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
  walletCard: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: RADIUS.cardLarge,
    padding: SPACING.lg,
  },
  walletLabel: { color: "#8FBF9C", fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, letterSpacing: 1 },
  walletAmount: {
    color: "#F5EFE2",
    fontSize: 30,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    marginVertical: 6,
  },
  walletActions: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  withdrawBtn: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.ACCENT,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 9,
  },
  withdrawText: { color: COLORS.ACCENT_DARK, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 12.5 },
  plansLink: { color: "#F5EFE2", fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 12.5, textDecorationLine: "underline" },
  statsRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: 12,
  },
  statVal: { fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
  statLabel: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md },
  findDriverLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  poolLink: { color: COLORS.PRIMARY, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, fontSize: 12.5 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
  dealCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dealTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACING.sm },
  dealItem: { fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  dealParty: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  dealAmount: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, marginTop: 6 },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  trackTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  trackTitle: { fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  trackStatus: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  callChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  offersBox: { backgroundColor: COLORS.SUCCESS_BG, borderRadius: RADIUS.input, padding: SPACING.sm, gap: 6, marginBottom: SPACING.sm },
  offersTitle: { fontSize: 10, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY_DARK, textTransform: "uppercase" },
  offerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  offerText: { flex: 1, fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  acceptBtn: { backgroundColor: COLORS.PRIMARY, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  acceptBtnText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: "#fff" },
  declineBtn: { borderWidth: 1, borderColor: COLORS.BORDER, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  declineBtnText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  dispatchedText: { fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.ACCENT_DARK },
  findDriverBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
});
