import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { api } from "../../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button } from "../../components/ui";
import ContactsCard from "../../components/ContactsCard";
import type { ScreenProps } from "../../navigation/types";
import type { EscrowStatus } from "../../types";

interface Waypoint {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
}
interface TripDetail {
  id: string;
  status: EscrowStatus;
  logisticsFee: string | number;
  pickup?: Waypoint;
  delivery?: Waypoint;
  farmerName?: string | null;
  farmerPhone?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
}

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export default function ActiveTripScreen({ route }: ScreenProps<"ActiveTrip">) {
  const { escrowTripId } = route.params;
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTrip = useCallback(async () => {
    try {
      const { data } = await api.get<TripDetail>(`/escrow/${escrowTripId}`);
      setTrip(data);
    } catch {
      // keep last state
    } finally {
      setLoading(false);
    }
  }, [escrowTripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  async function confirmPickup() {
    if (pin.length !== 4 || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/payments/confirm-pickup", { escrowTripId, pin });
      setPin("");
      await fetchTrip();
      Alert.alert("Pickup confirmed", "You're now in transit. Head to the delivery point.");
    } catch (e: any) {
      Alert.alert("Invalid PIN", e?.response?.data?.error ?? "Check the farmer's pickup PIN.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }
  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load this trip.</Text>
      </View>
    );
  }

  const pickup = trip.pickup;
  const delivery = trip.delivery;
  const hasPickup = pickup?.lat != null && pickup?.lng != null;
  const hasDelivery = delivery?.lat != null && delivery?.lng != null;
  const beforePickup = trip.status === "FUNDS_LOCKED";
  const inTransit = trip.status === "IN_TRANSIT";
  const done = trip.status === "DELIVERED" || trip.status === "RELEASED";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Payout always visible */}
      <View style={styles.payoutCard}>
        <Text style={styles.payoutLabel}>Your payout</Text>
        <Text style={styles.payout}>{naira(trip.logisticsFee)}</Text>
      </View>

      {/* Route map with pickup -> delivery waypoints */}
      <View style={styles.mapWrap}>
        {hasPickup ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: pickup!.lat!,
              longitude: pickup!.lng!,
              latitudeDelta: 0.4,
              longitudeDelta: 0.4,
            }}
          >
            <Marker coordinate={{ latitude: pickup!.lat!, longitude: pickup!.lng! }} title="Pickup" pinColor="green" />
            {hasDelivery && (
              <Marker coordinate={{ latitude: delivery!.lat!, longitude: delivery!.lng! }} title="Delivery" />
            )}
            {hasDelivery && (
              <Polyline
                coordinates={[
                  { latitude: pickup!.lat!, longitude: pickup!.lng! },
                  { latitude: delivery!.lat!, longitude: delivery!.lng! },
                ]}
                strokeColor={COLORS.PRIMARY}
                strokeWidth={4}
              />
            )}
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Text style={styles.muted}>Route map unavailable (no coordinates set).</Text>
          </View>
        )}
      </View>

      <View style={styles.waypoints}>
        <Text style={styles.waypoint}>🟢 Pickup: {pickup?.label ?? "Farmer location"}</Text>
        <Text style={styles.waypoint}>🔴 Delivery: {delivery?.label ?? "Buyer location"}</Text>
      </View>

      <ContactsCard
        contacts={[
          { label: "Farmer", name: trip.farmerName, phone: trip.farmerPhone },
          { label: "Buyer", name: trip.buyerName, phone: trip.buyerPhone },
        ]}
      />

      {/* Stage-driven action area */}
      {beforePickup && (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>At pickup</Text>
          <Text style={styles.muted}>Enter the farmer's 4-digit pickup PIN to start the trip.</Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="––––"
            placeholderTextColor={COLORS.TEXT_MUTED}
            textAlign="center"
          />
          <Button
            label="Confirm pickup"
            onPress={confirmPickup}
            disabled={pin.length !== 4}
            loading={submitting}
            variant="green"
            style={{ marginTop: SPACING.md }}
          />
        </View>
      )}

      {inTransit && (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>In transit → delivery</Text>
          <Text style={styles.muted}>
            At the drop-off, the buyer enters their delivery PIN in their app to release your payout.
            Ask the buyer to confirm delivery on their device.
          </Text>
        </View>
      )}

      {done && (
        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>✅ Delivered</Text>
          <Text style={styles.muted}>
            {trip.status === "RELEASED"
              ? `Payout of ${naira(trip.logisticsFee)} has been released.`
              : "Delivery confirmed. Payout is being released."}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.BACKGROUND },
  payoutCard: { backgroundColor: COLORS.PRIMARY_DARK, borderRadius: RADIUS.cardLarge, padding: SPACING.lg, alignItems: "center" },
  payoutLabel: { color: "#8FBF9C", fontSize: FONT.size.base, fontFamily: FONT.family },
  payout: { color: "#F5EFE2", fontSize: 30, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, marginTop: SPACING.xs },
  mapWrap: { borderRadius: RADIUS.card, overflow: "hidden", marginTop: SPACING.md },
  map: { width: "100%", height: 240 },
  mapPlaceholder: { backgroundColor: COLORS.SURFACE, alignItems: "center", justifyContent: "center" },
  waypoints: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  waypoint: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY, marginVertical: SPACING.xs },
  actionCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  actionTitle: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, marginBottom: SPACING.sm },
  muted: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  pinInput: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    fontSize: 26,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    letterSpacing: 10,
    color: COLORS.TEXT_PRIMARY,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },
});
