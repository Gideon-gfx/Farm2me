import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { Button, ProgressBar } from "../components/ui";
import type { ScreenProps } from "../navigation/types";
import type { PoolStatus } from "../types";

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function daysUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

interface Contribution {
  farmerName: string;
  locationLabel?: string | null;
  weightKg: number;
  confirmedAt?: string | null;
}

interface PoolDetail {
  id: string;
  contractName: string;
  cropType: string;
  subType?: string | null;
  targetWeightKg: number;
  currentWeightKg: number;
  percentageFilled?: number;
  deadline: string;
  pricePerKg: string | number;
  status: PoolStatus;
  radiusKm?: number | null;
  buyerName?: string | null;
  createdByFarmerName?: string | null;
  contributorCount: number;
  contributions: Contribution[];
}

export default function PoolDetailScreen({ route, navigation }: ScreenProps<"PoolDetail">) {
  const { poolId } = route.params;
  const { user } = useAuth();
  const [pool, setPool] = useState<PoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ pool: PoolDetail }>(`/pools/${poolId}`);
        setPool(data.pool);
      } catch {
        setError("Could not load this pool.");
      } finally {
        setLoading(false);
      }
    })();
  }, [poolId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }
  if (!pool) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Pool not found."}</Text>
      </View>
    );
  }

  const pct = pool.percentageFilled ?? (pool.targetWeightKg > 0 ? Math.round((pool.currentWeightKg / pool.targetWeightKg) * 100) : 0);
  const isFarmer = user?.role === "FARMER";
  const partyLine = pool.buyerName
    ? `Buyer: ${pool.buyerName}`
    : pool.createdByFarmerName
      ? `Started by ${pool.createdByFarmerName} · awaiting a buyer`
      : "Awaiting a buyer";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{pool.contractName}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{pool.status}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {pool.cropType}
          {pool.subType ? ` — ${pool.subType}` : ""} · {naira(pool.pricePerKg)}/kg
        </Text>
        <Text style={styles.meta}>{partyLine}</Text>

        <View style={{ marginTop: SPACING.md }}>
          <ProgressBar pct={pct} color={COLORS.ACCENT} />
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.meta}>{pool.currentWeightKg}/{pool.targetWeightKg} kg ({pct}%)</Text>
          <Text style={styles.meta}>Closes {daysUntil(pool.deadline)}</Text>
        </View>
        {pool.radiusKm ? <Text style={styles.hint}>Visible within {pool.radiusKm}km of where it was created.</Text> : null}

        {pool.status === "LOCKED" ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>This pool is fully funded and awaiting transport.</Text>
          </View>
        ) : isFarmer ? (
          <Button
            label="Contribute Your Yield"
            onPress={() => navigation.navigate("CreateListing")}
            variant="green"
            style={{ marginTop: SPACING.lg }}
          />
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Contributors ({pool.contributions.length})</Text>
      <View style={styles.card}>
        {pool.contributions.length === 0 ? (
          <Text style={styles.hint}>No contributions yet.</Text>
        ) : (
          pool.contributions.map((c, i) => (
            <View key={i} style={[styles.contribRow, i > 0 && styles.contribRowBorder]}>
              <Text style={styles.contribName}>Farmer from {c.locationLabel ?? "an undisclosed area"}</Text>
              <Text style={styles.contribWeight}>{c.weightKg} kg</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.BACKGROUND },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, fontFamily: FONT.family },
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACING.sm },
  title: { flex: 1, fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  statusPill: { backgroundColor: COLORS.SUCCESS_BG, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  meta: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 4 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.sm },
  hint: { fontSize: FONT.size.caption, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.xs },
  lockedBanner: { marginTop: SPACING.lg, backgroundColor: COLORS.ESCROW_BG, borderRadius: RADIUS.input, padding: SPACING.md },
  lockedBannerText: { fontSize: FONT.size.small, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.ESCROW_TEXT },
  sectionTitle: {
    fontSize: 15,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  contribRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SPACING.sm },
  contribRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.DIVIDER },
  contribName: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  contribWeight: { fontSize: FONT.size.small, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
});
