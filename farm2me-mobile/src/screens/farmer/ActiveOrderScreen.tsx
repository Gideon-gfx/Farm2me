import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { api } from "../../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import ContactsCard from "../../components/ContactsCard";
import type { ScreenProps } from "../../navigation/types";
import type { EscrowStatus } from "../../types";

const POLL_INTERVAL_MS = 30_000;

// Ordered timeline stages mapped from escrow status.
const STAGES = ["Funded", "Pickup", "In Transit", "Delivered", "Paid"] as const;

// How many stages are complete for a given status.
function completedStages(status: EscrowStatus): number {
  switch (status) {
    case "FUNDS_LOCKED":
      return 1; // Funded
    case "IN_TRANSIT":
      return 3; // Funded + Pickup + In Transit
    case "DELIVERED":
      return 4;
    case "RELEASED":
      return 5;
    case "DISPUTED":
      return 3;
    default:
      return 1;
  }
}

interface TripResponse {
  id: string;
  status: EscrowStatus;
  pickupPin: string;
  driverLat?: number | null;
  driverLng?: number | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}

export default function ActiveOrderScreen({ route }: ScreenProps<"ActiveOrder">) {
  const { escrowTripId } = route.params;
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchTrip() {
    try {
      const { data } = await api.get<TripResponse>(`/escrow/${escrowTripId}`);
      setTrip(data);
      if (data.driverLat != null && data.driverLng != null) {
        setRegion({
          latitude: data.driverLat,
          longitude: data.driverLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
    } catch {
      // Keep last known state; the next poll will retry.
    }
  }

  // Poll the driver's last known location every 30 seconds.
  useEffect(() => {
    fetchTrip();
    timer.current = setInterval(fetchTrip, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [escrowTripId]);

  const done = trip ? completedStages(trip.status) : 1;
  const pin = trip?.pickupPin ?? "----";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pinCard}>
        <Text style={styles.shield}>🛡️</Text>
        <Text style={styles.pinLabel}>Your pickup PIN</Text>
        <Text style={styles.pin}>{pin}</Text>
        <Text style={styles.instructions}>Show this PIN to your driver when they arrive</Text>
      </View>

      <Text style={styles.sectionTitle}>Driver location</Text>
      <View style={styles.mapWrap}>
        {region ? (
          <MapView style={styles.map} region={region}>
            <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} title="Driver" />
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Text style={styles.mapPlaceholderText}>
              Waiting for driver location… updates every 30s
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Order status</Text>
      <View style={styles.timeline}>
        {STAGES.map((stage, i) => {
          const reached = i < done;
          const current = i === done - 1;
          return (
            <View key={stage} style={styles.stageRow}>
              <View style={styles.stageMarkerCol}>
                <View
                  style={[
                    styles.dot,
                    reached && styles.dotDone,
                    current && styles.dotCurrent,
                  ]}
                >
                  {reached && <Text style={styles.dotCheck}>✓</Text>}
                </View>
                {i < STAGES.length - 1 && (
                  <View style={[styles.connector, reached && styles.connectorDone]} />
                )}
              </View>
              <Text style={[styles.stageLabel, reached && styles.stageLabelDone]}>{stage}</Text>
            </View>
          );
        })}
      </View>

      <ContactsCard
        contacts={[
          { label: "Buyer", name: trip?.buyerName, phone: trip?.buyerPhone },
          { label: "Driver", name: trip?.driverName, phone: trip?.driverPhone },
        ]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  pinCard: {
    backgroundColor: COLORS.PRIMARY_DARK,
    borderRadius: RADIUS.cardLarge,
    padding: SPACING.lg,
    alignItems: "center",
  },
  shield: { fontSize: 40 },
  pinLabel: { color: "#8FBF9C", fontSize: FONT.size.base, fontFamily: FONT.family, marginTop: SPACING.sm },
  pin: {
    color: "#F5EFE2",
    fontSize: 56,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    letterSpacing: 10,
    marginVertical: SPACING.sm,
  },
  instructions: { color: "#F5EFE2", fontSize: FONT.size.base, fontFamily: FONT.family, textAlign: "center" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  mapWrap: { borderRadius: RADIUS.card, overflow: "hidden" },
  map: { width: "100%", height: 220 },
  mapPlaceholder: { backgroundColor: COLORS.SURFACE, alignItems: "center", justifyContent: "center" },
  mapPlaceholderText: { color: COLORS.TEXT_MUTED, fontSize: FONT.size.small, fontFamily: FONT.family, paddingHorizontal: SPACING.lg, textAlign: "center" },
  timeline: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
  },
  stageRow: { flexDirection: "row", alignItems: "flex-start" },
  stageMarkerCol: { alignItems: "center", width: 32 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: { backgroundColor: COLORS.PRIMARY, borderColor: COLORS.PRIMARY },
  dotCurrent: { borderColor: COLORS.ACCENT, borderWidth: 3 },
  dotCheck: { color: COLORS.WHITE, fontSize: 14, fontWeight: FONT.weight.bold },
  connector: { width: 2, height: 28, backgroundColor: COLORS.BORDER },
  connectorDone: { backgroundColor: COLORS.PRIMARY },
  stageLabel: {
    fontSize: FONT.size.base,
    fontFamily: FONT.family,
    color: COLORS.TEXT_MUTED,
    marginLeft: SPACING.md,
    paddingTop: 2,
  },
  stageLabelDone: { color: COLORS.TEXT_PRIMARY, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold },
});
