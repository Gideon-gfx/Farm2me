import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Card, Pill, ProgressBar } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { GlassTopNav, TOP_NAV_CONTENT_HEIGHT } from "../../components/GlassTopNav";
import type { RootStackParamList } from "../../navigation/types";
import type { VillagePool } from "../../types";

function formatNaira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function daysLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

export default function VillagePoolsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [pools, setPools] = useState<VillagePool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const { data } = await api.get<{ data: VillagePool[] }>("/pools", {
        params: {
          status: "OPEN",
          limit: 50,
          ...(user?.locationLat != null && user?.locationLng != null
            ? { lat: user.locationLat, lng: user.locationLng }
            : {}),
        },
      });
      setPools(data.data ?? []);
    } catch {
      // Keep last known list — pull to refresh to retry.
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [user?.locationLat, user?.locationLng]);

  useEffect(() => {
    load();
  }, [load]);

  function renderPool({ item }: { item: VillagePool }) {
    const pct =
      item.percentageFilled ??
      (item.targetWeightKg > 0 ? Math.round((item.currentWeightKg / item.targetWeightKg) * 100) : 0);
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate("PoolDetail", { poolId: item.id })}>
        <Card style={styles.poolCard}>
          <View style={styles.poolTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.poolName}>{item.contractName}</Text>
              <Text style={styles.poolMeta}>
                {item.cropType}
                {item.subType ? ` · ${item.subType}` : ""}
              </Text>
            </View>
            <Pill label={daysLeft(item.deadline)} />
          </View>

          <ProgressBar pct={pct} />
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {pct}% · {item.currentWeightKg}kg / {item.targetWeightKg}kg
            </Text>
            <Text style={styles.progressText}>{formatNaira(item.pricePerKg)}/kg</Text>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText} numberOfLines={1}>
              {item.buyerName
                ? `Buyer: ${item.buyerName}`
                : item.createdByFarmerName
                  ? `Started by ${item.createdByFarmerName}`
                  : "Awaiting a buyer"}
            </Text>
            <Text style={styles.footerText}>
              {item.contributorCount ?? 0} contributor{(item.contributorCount ?? 0) === 1 ? "" : "s"}
            </Text>
          </View>
        </Card>
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
          <Text style={styles.navTitle}>Village pools</Text>
        </View>
      </GlassTopNav>
      <FlatList
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: TOP_NAV_CONTENT_HEIGHT + insets.top + SPACING.md },
        ]}
        data={pools}
        keyExtractor={(p) => p.id}
        renderItem={renderPool}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.PRIMARY} />}
        ListHeaderComponent={
          <TouchableOpacity style={styles.createBtn} activeOpacity={0.9} onPress={() => navigation.navigate("CreatePool")}>
            <Text style={styles.createBtnPlus}>＋</Text>
            <Text style={styles.createBtnText}>Create a Village Pool</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No open village pools nearby yet.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  navRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 },
  navBackBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  container: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl * 3 },
  createBtn: {
    height: 52,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: SPACING.lg,
  },
  createBtnPlus: { color: "#fff", fontSize: 19, lineHeight: 19 },
  createBtnText: { color: "#fff", fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 14.5 },
  poolCard: { marginBottom: SPACING.sm },
  poolTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACING.sm, marginBottom: SPACING.sm },
  poolName: { fontSize: 14.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  poolMeta: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  progressText: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.sm, gap: SPACING.sm },
  footerText: { flex: 1, fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
});
