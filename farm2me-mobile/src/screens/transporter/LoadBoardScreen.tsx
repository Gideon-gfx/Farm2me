import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { api } from "../../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, Pill } from "../../components/ui";
import type { TransporterTabScreenProps } from "../../navigation/types";

interface Load {
  escrowTripId: string;
  cargoDescription: string;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  logisticsFee: string | number;
  requiredCrates: number;
  listingGrade: string | null;
  deadline: string | null;
  distanceKm: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
}

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export default function LoadBoardScreen({ navigation }: TransporterTabScreenProps<"AvailableLoads">) {
  const insets = useSafeAreaInsets();
  const [loads, setLoads] = useState<Load[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get<{ data: Load[] }>("/transport/available-loads");
      setLoads(data.data ?? []);
    } catch {
      // pull to refresh
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(escrowTripId: string) {
    setAccepting(escrowTripId);
    try {
      await api.post("/transport/accept-load", { escrowTripId });
      navigation.navigate("ActiveTrip", { escrowTripId });
    } catch (e: any) {
      Alert.alert("Could not accept load", e?.response?.data?.error ?? "It may have been taken.");
      load();
    } finally {
      setAccepting(null);
    }
  }

  const pinned = loads.filter((l) => l.pickupLat != null && l.pickupLng != null);

  function renderLoad({ item }: { item: Load }) {
    return (
      <View style={styles.card}>
        <View style={styles.routeRow}>
          <Text style={styles.routeText} numberOfLines={1}>
            {item.pickupLocation ?? "Pickup"}
          </Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.routeText} numberOfLines={1}>
            {item.dropoffLocation ?? "Dropoff"}
          </Text>
        </View>
        <Text style={styles.cargo}>{item.cargoDescription}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{item.requiredCrates} crates</Text>
          {item.distanceKm != null && <Text style={styles.meta}>{item.distanceKm} km</Text>}
        </View>
        <View style={styles.footerRow}>
          <Pill label="Escrow funded" bg={COLORS.ESCROW_BG} color={COLORS.ESCROW_TEXT} />
          <View style={{ flex: 1 }} />
          <Text style={styles.payout}>{naira(item.logisticsFee)}</Text>
        </View>
        <Button
          label="Accept load"
          onPress={() => accept(item.escrowTripId)}
          loading={accepting === item.escrowTripId}
          variant="gold"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Jobs</Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, !mapView && styles.toggleBtnActive]}
          onPress={() => setMapView(false)}
        >
          <Text style={[styles.toggleText, !mapView && styles.toggleTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mapView && styles.toggleBtnActive]}
          onPress={() => setMapView(true)}
        >
          <Text style={[styles.toggleText, mapView && styles.toggleTextActive]}>Map</Text>
        </TouchableOpacity>
      </View>

      {mapView ? (
        <MapView
          style={styles.map}
          initialRegion={
            pinned[0]
              ? {
                  latitude: pinned[0].pickupLat!,
                  longitude: pinned[0].pickupLng!,
                  latitudeDelta: 0.5,
                  longitudeDelta: 0.5,
                }
              : { latitude: 9.082, longitude: 8.6753, latitudeDelta: 6, longitudeDelta: 6 } // Nigeria
          }
        >
          {pinned.map((l) => (
            <Marker
              key={l.escrowTripId}
              coordinate={{ latitude: l.pickupLat!, longitude: l.pickupLng! }}
              title={l.cargoDescription}
              description={`${naira(l.logisticsFee)} · ${l.requiredCrates} crates`}
              onCalloutPress={() => accept(l.escrowTripId)}
            />
          ))}
        </MapView>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={loads}
          keyExtractor={(l) => l.escrowTripId}
          renderItem={renderLoad}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.PRIMARY} />}
          ListEmptyComponent={<Text style={styles.empty}>No available loads right now. Pull to refresh.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  topRow: { paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  title: { fontSize: 22, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  toggleRow: { flexDirection: "row", paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: "center",
  },
  toggleBtnActive: { backgroundColor: COLORS.PRIMARY_DARK, borderColor: COLORS.PRIMARY_DARK },
  toggleText: { fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY, fontSize: 13 },
  toggleTextActive: { color: "#fff" },
  map: { flex: 1 },
  content: { padding: SPACING.md, paddingTop: 0, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 10,
  },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeText: { flex: 1, fontSize: 14.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  arrow: { marginHorizontal: SPACING.sm, color: COLORS.ACCENT, fontSize: 18, fontWeight: FONT.weight.bold },
  cargo: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  metaRow: { flexDirection: "row", gap: SPACING.lg },
  meta: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  footerRow: { flexDirection: "row", alignItems: "center" },
  payout: { fontSize: 14.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  empty: { textAlign: "center", color: COLORS.TEXT_MUTED, fontFamily: FONT.family, marginTop: SPACING.lg },
});
