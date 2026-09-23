import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Icon } from "../../components/Icon";
import type { ScreenProps } from "../../navigation/types";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  escrowTripId?: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, "wallet" | "truck" | "escrow" | "star" | "bell"> = {
  TIP_RECEIVED: "star",
  ORDER_FUNDED: "escrow",
  LOAD_ASSIGNED: "truck",
  ORDER_IN_TRANSIT: "truck",
  DRIVER_ARRIVED: "truck",
  ORDER_DELIVERED: "escrow",
  PAYOUT_RELEASED: "wallet",
  OFFER_RECEIVED: "truck",
  NEW_JOB: "truck",
  OFFER_ACCEPTED: "truck",
  DELIVERY_SAVINGS: "wallet",
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsScreen({ navigation }: ScreenProps<"Notifications">) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const { data } = await api.get<{ data: Notification[] }>("/notifications");
      setItems(data.data ?? []);
    } catch {
      // Keep last known list — pull to refresh to retry.
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.post("/notifications/read-all").catch(() => {});
  }, [load]);

  function openNotification(n: Notification) {
    if (!n.isRead) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (!n.escrowTripId) return;
    if (user?.role === "FARMER") {
      navigation.navigate("ActiveOrder", { escrowTripId: n.escrowTripId });
    } else if (user?.role === "TRANSPORTER") {
      navigation.navigate("ActiveTrip", { escrowTripId: n.escrowTripId });
    } else if (user?.role === "BUYER") {
      navigation.navigate("ConfirmDelivery", { escrowTripId: n.escrowTripId });
    }
  }

  function renderItem({ item }: { item: Notification }) {
    return (
      <TouchableOpacity style={[styles.row, !item.isRead && styles.rowUnread]} activeOpacity={0.8} onPress={() => openNotification(item)}>
        <View style={styles.rowIcon}>
          <Icon name={TYPE_ICON[item.type] ?? "bell"} size={17} color={COLORS.PRIMARY} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Icon name="back" size={20} color={COLORS.TEXT_PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.PRIMARY} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No notifications yet.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowUnread: { borderColor: COLORS.PRIMARY },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.SUCCESS_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  rowBody: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  rowTime: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.PRIMARY, marginTop: 4 },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
});
