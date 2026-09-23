import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Linking,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapView, { Marker, Polyline } from "react-native-maps";
import LeafletMap, { type LeafletMapHandle, type LeafletMarker } from "../../components/LeafletMap";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { haversineKm } from "../../lib/geo";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, Card } from "../../components/ui";
import { Icon } from "../../components/Icon";
import SelectModal from "../../components/SelectModal";
import TransportRequestCard from "../../components/TransportRequestCard";
import type { RootStackParamList } from "../../navigation/types";

const IS_ANDROID = Platform.OS === "android";

interface Deal {
  id: string;
  item: string;
  cropType: string;
  weightKg: number | null;
  party: string;
  status: string;
  deliveryLocation?: string | null;
  logisticsFee?: string | number;
  dispatched?: boolean;
  driverId?: string | null;
}

interface Driver {
  driverId: string;
  fullName: string;
  phoneNumber: string | null;
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  isVerified: boolean;
  avatarUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  distanceKm: number | null;
}

// Central-Nigeria fallback so the map never opens on "null island" (0,0)
// when neither the farmer nor any driver has a saved location yet.
const FALLBACK_REGION = { latitude: 9.082, longitude: 8.6753 };

function formatNaira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

interface FindDriverScreenProps {
  route: { params?: { escrowTripId?: string } };
}

// Farmer-facing driver page — a full-screen map (like a ride-hailing app)
// with every nearby driver pinged on it, and a swipeable bottom sheet
// holding a search bar, the dispatch form (when there's a paid order
// awaiting a driver), and the "Nearby drivers" browse-and-call list.
export default function FindDriverScreen({ route }: FindDriverScreenProps) {
  const preselect = route.params?.escrowTripId;
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const leafletRef = useRef<LeafletMapHandle>(null);

  // Draggable bottom sheet, built on plain Animated + PanResponder (no extra
  // native deps) — dragged only via the handle bar, so the driver list below
  // can still scroll normally on its own.
  const SCREEN_HEIGHT = Dimensions.get("window").height;
  const collapsedY = SCREEN_HEIGHT - (insets.bottom + 150);
  const halfY = SCREEN_HEIGHT * 0.52;
  const fullY = insets.top + 50;
  const sheetY = useRef(new Animated.Value(halfY)).current;
  const lastSnap = useRef(halfY);

  function snapTo(y: number) {
    lastSnap.current = y;
    // JS-driven, not native — mixing a native-driven spring with a gesture-
    // tracked offset (setOffset/flattenOffset below) is a known source of
    // crashes on Android specifically; this whole drag stays on the JS
    // thread for reliability over the last bit of animation smoothness.
    Animated.spring(sheetY, { toValue: y, useNativeDriver: false, bounciness: 4 }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        sheetY.setOffset(lastSnap.current);
        sheetY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: sheetY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        sheetY.flattenOffset();
        const current = lastSnap.current + g.dy;
        const points = [fullY, halfY, collapsedY];
        const nearest = points.reduce((a, b) => (Math.abs(current - a) < Math.abs(current - b) ? a : b));
        snapTo(nearest);
      },
    })
  ).current;

  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);

  // Tap two driver markers on the map to compare the distance BETWEEN them
  // (not each one's distance from the farm) — a plain toggle, not tied to
  // focusDriver, so comparing two pins never triggers a fly-to/zoom.
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickupLabel, setPickupLabel] = useState(user?.locationLabel ?? "");
  const [suggestedFee, setSuggestedFee] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pulse = React.useRef(new Animated.Value(0.4)).current;

  async function loadDeals() {
    try {
      const { data } = await api.get<{ data: Deal[] }>("/payments/my-deals");
      setDeals(data.data ?? []);
    } catch {
      // Keep last known list.
    } finally {
      setDealsLoading(false);
    }
  }

  async function loadDrivers() {
    try {
      const { data } = await api.get<{ data: Driver[] }>("/transport/nearby-drivers");
      setDrivers(data.data ?? []);
    } catch {
      // Keep last known list.
    } finally {
      setDriversLoading(false);
    }
  }

  useEffect(() => {
    loadDeals();
    loadDrivers();
    const t = setInterval(loadDeals, 5000);
    return () => clearInterval(t);
  }, []);

  const eligible = useMemo(() => deals.filter((d) => d.status === "FUNDS_LOCKED" && !d.driverId), [deals]);

  useEffect(() => {
    if (eligible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && eligible.some((d) => d.id === selectedId)) return;
    setSelectedId(preselect && eligible.some((d) => d.id === preselect) ? preselect : eligible[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.map((d) => d.id).join(","), preselect]);

  const selected = eligible.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    setSuggestedFee(selected ? String(Number(selected.logisticsFee ?? 0)) : "");
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.dispatched) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [selected?.dispatched, pulse]);

  // The plain PanResponder sheet (unlike the bottom-sheet library it
  // replaced) has no built-in keyboard awareness, so the search bar/inputs
  // inside it would sit under the keyboard unless the sheet is pushed to
  // full height while typing, then restored to where it was on dismiss.
  useEffect(() => {
    const preKeyboardSnap = { current: lastSnap.current };
    const showSub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      preKeyboardSnap.current = lastSnap.current;
      snapTo(fullY);
    });
    const hideSub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      snapTo(preKeyboardSnap.current);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const driversWithLocation = useMemo(() => drivers.filter((d) => d.lat != null && d.lng != null), [drivers]);

  const initialRegion = {
    latitude: user?.locationLat ?? driversWithLocation[0]?.lat ?? FALLBACK_REGION.latitude,
    longitude: user?.locationLng ?? driversWithLocation[0]?.lng ?? FALLBACK_REGION.longitude,
    latitudeDelta: 0.4,
    longitudeDelta: 0.4,
  };

  function focusDriver(d: Driver) {
    if (d.lat == null || d.lng == null) return;
    if (IS_ANDROID) {
      leafletRef.current?.animateToRegion(d.lat, d.lng);
    } else {
      mapRef.current?.animateToRegion(
        { latitude: d.lat, longitude: d.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
        400
      );
    }
    snapTo(halfY);
  }

  // Tapping a marker ON THE MAP selects it for comparison instead of flying
  // to it — no zoom/pan happens, so tapping a second marker right after
  // still lands where you'd expect. (Tapping a driver row in the sheet list
  // below still uses focusDriver, which is the "jump to this one" action.)
  function toggleCompare(driverId: string) {
    setCompareIds((prev) => {
      if (prev.includes(driverId)) return prev.filter((id) => id !== driverId);
      const next = [...prev, driverId];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  }

  const compareDrivers = compareIds
    .map((id) => driversWithLocation.find((d) => d.driverId === id))
    .filter((d): d is Driver => !!d);
  const compareDistanceKm =
    compareDrivers.length === 2
      ? Math.round(
          haversineKm(compareDrivers[0].lat!, compareDrivers[0].lng!, compareDrivers[1].lat!, compareDrivers[1].lng!) * 10
        ) / 10
      : null;

  async function dispatch() {
    if (!selected) return;
    const fee = Number(suggestedFee);
    if (!(fee > 0)) {
      setError("Enter a suggested delivery fee");
      return;
    }
    setDispatching(true);
    setError(null);
    try {
      await api.post("/transport/dispatch", {
        escrowTripId: selected.id,
        pickupLabel: pickupLabel.trim() || undefined,
        suggestedFee: fee,
      });
      await loadDeals();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not post this order");
    } finally {
      setDispatching(false);
    }
  }

  function callDriver(phone: string | null) {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  }

  function renderDriver({ item: d }: { item: Driver }) {
    return (
      <TouchableOpacity style={styles.driverRow} activeOpacity={0.85} onPress={() => focusDriver(d)}>
        <View style={styles.driverAvatar}>
          {d.avatarUrl ? (
            <Image source={{ uri: d.avatarUrl }} style={styles.driverAvatarImage} />
          ) : (
            <Text style={styles.driverAvatarText}>{d.fullName.slice(0, 2).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>
            {d.fullName}
            {d.isVerified ? " ✓" : ""}
          </Text>
          {d.locationLabel && (
            <Text style={styles.driverLocationText} numberOfLines={1}>
              {d.locationLabel}
            </Text>
          )}
          <View style={styles.driverMetaRow}>
            {d.ratingCount > 0 ? (
              <View style={styles.driverMetaItem}>
                <Icon name="star" size={11} color={COLORS.ACCENT} />
                <Text style={styles.driverMetaText}>
                  {d.ratingAverage.toFixed(1)} ({d.ratingCount})
                </Text>
              </View>
            ) : (
              <Text style={styles.driverMetaText}>No ratings yet</Text>
            )}
            {d.distanceKm != null && <Text style={styles.driverMetaText}>· {d.distanceKm}km away</Text>}
          </View>
        </View>
        {d.phoneNumber ? (
          <TouchableOpacity style={styles.callBtn} onPress={() => callDriver(d.phoneNumber)} activeOpacity={0.85}>
            <Icon name="phone" size={13} color={COLORS.TEXT_PRIMARY} />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.driverMetaText}>No phone</Text>
        )}
      </TouchableOpacity>
    );
  }

  function renderSheetHeader() {
    return (
      <>
        {dealsLoading ? (
          <ActivityIndicator color={COLORS.PRIMARY} style={{ marginBottom: SPACING.lg }} />
        ) : eligible.length > 0 ? (
          <Card style={{ marginBottom: SPACING.lg }}>
            <Text style={styles.label}>Order</Text>
            <SelectModal
              placeholder="Select an order"
              value={selectedId ?? ""}
              onChange={setSelectedId}
              options={eligible.map((d) => ({ value: d.id, label: `${d.item} — ${d.party}` }))}
            />

            {selected && (
              <>
                <View style={styles.row2}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Product</Text>
                    <View style={styles.readonly}>
                      <Text style={styles.readonlyText}>{selected.cropType}</Text>
                    </View>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Quantity</Text>
                    <View style={styles.readonly}>
                      <Text style={styles.readonlyText}>{selected.weightKg != null ? `${selected.weightKg}kg` : "—"}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>Delivery address (buyer)</Text>
                <View style={styles.readonly}>
                  <Text style={styles.readonlyText}>{selected.deliveryLocation ?? "Not set"}</Text>
                </View>

                <Text style={styles.label}>Pickup address</Text>
                <TextInput
                  style={styles.input}
                  value={pickupLabel}
                  onChangeText={setPickupLabel}
                  placeholder="e.g. Gate 3, off Ikorodu road"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                />
                <Text style={styles.hint}>Prefilled from your farm's saved location — edit if pickup is elsewhere.</Text>

                <Text style={styles.label}>Suggested delivery fee</Text>
                <TextInput
                  style={styles.input}
                  value={suggestedFee}
                  onChangeText={(t) => setSuggestedFee(t.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                />
                <Text style={styles.hint}>
                  Up to {formatNaira(selected.logisticsFee ?? 0)} — the delivery amount your buyer already paid.
                  Suggesting less refunds the difference straight to their wallet.
                </Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {selected.dispatched ? (
                  <View style={styles.searching}>
                    <View style={styles.searchingRow}>
                      <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />
                      <Text style={styles.searchingText}>Searching for a nearby driver…</Text>
                    </View>
                    <Text style={styles.hint}>Pickup: {pickupLabel || "your farm"}</Text>
                  </View>
                ) : (
                  <Button
                    label={dispatching ? "Posting…" : "Post to the load board"}
                    onPress={dispatch}
                    disabled={dispatching}
                    variant="green"
                    style={{ marginTop: SPACING.lg }}
                  />
                )}
              </>
            )}
          </Card>
        ) : (
          <Card style={{ marginBottom: SPACING.lg, alignItems: "center" }}>
            <Text style={styles.emptyText}>No paid orders need a driver right now — browse nearby drivers below for when you do.</Text>
          </Card>
        )}

        <TransportRequestCard />

        <Text style={styles.sectionTitle}>Nearby drivers</Text>
        {driversLoading && <ActivityIndicator color={COLORS.PRIMARY} />}
      </>
    );
  }

  const leafletMarkers = useMemo(() => {
    const markers: LeafletMarker[] = driversWithLocation.map((d) => ({
      id: d.driverId,
      lat: d.lat!,
      lng: d.lng!,
      emoji: "🚚",
      label: d.distanceKm != null ? `${d.distanceKm}km` : undefined,
      popupTitle: d.fullName,
      popupSubtitle: d.distanceKm != null ? `${d.distanceKm}km away` : undefined,
      selected: compareIds.includes(d.driverId),
    }));
    if (user?.locationLat != null && user?.locationLng != null) {
      markers.push({
        id: "__farm__",
        lat: user.locationLat,
        lng: user.locationLng,
        emoji: "🏡",
        popupTitle: "Your farm",
      });
    }
    return markers;
  }, [driversWithLocation, user?.locationLat, user?.locationLng, compareIds]);

  const leafletPolyline: [{ lat: number; lng: number }, { lat: number; lng: number }] | undefined =
    compareDrivers.length === 2
      ? [
          { lat: compareDrivers[0].lat!, lng: compareDrivers[0].lng! },
          { lat: compareDrivers[1].lat!, lng: compareDrivers[1].lng! },
        ]
      : undefined;

  return (
    <View style={styles.screen}>
      {IS_ANDROID ? (
        <LeafletMap
          ref={leafletRef}
          initialRegion={initialRegion}
          markers={leafletMarkers}
          polyline={leafletPolyline}
          onMarkerPress={(id) => toggleCompare(id)}
        />
      ) : (
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
          {user?.locationLat != null && user?.locationLng != null && (
            <Marker
              coordinate={{ latitude: user.locationLat, longitude: user.locationLng }}
              title="Your farm"
              pinColor={COLORS.PRIMARY}
            />
          )}
          {compareDrivers.length === 2 && (
            <Polyline
              coordinates={[
                { latitude: compareDrivers[0].lat!, longitude: compareDrivers[0].lng! },
                { latitude: compareDrivers[1].lat!, longitude: compareDrivers[1].lng! },
              ]}
              strokeColor={COLORS.PRIMARY}
              strokeWidth={3}
              lineDashPattern={[6, 6]}
            />
          )}
          {driversWithLocation.map((d) => (
            <Marker
              key={d.driverId}
              coordinate={{ latitude: d.lat!, longitude: d.lng! }}
              title={d.fullName}
              description={d.distanceKm != null ? `${d.distanceKm}km away` : undefined}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => toggleCompare(d.driverId)}
            >
              <View style={styles.markerWrap}>
                {compareIds.includes(d.driverId) && <View style={styles.selectedRing} />}
                <Icon name="truck" size={44} color={COLORS.ACCENT} />
                {d.distanceKm != null && (
                  <View style={styles.distanceLabel}>
                    <Text style={styles.distanceLabelText}>{d.distanceKm}km</Text>
                  </View>
                )}
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {compareDistanceKm != null && (
        <View style={[styles.compareBanner, { top: insets.top + 60 }]}>
          <Text style={styles.compareBannerText}>{compareDistanceKm}km between selected drivers</Text>
          <TouchableOpacity onPress={() => setCompareIds([])} hitSlop={8}>
            <Icon name="close" size={16} color={COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + SPACING.sm }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.85}
      >
        <Icon name="back" size={20} color={COLORS.TEXT_PRIMARY} />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.sheet,
          { height: SCREEN_HEIGHT, transform: [{ translateY: sheetY }] },
        ]}
      >
        <View style={styles.sheetHandleBar} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>
        <FlatList
          data={drivers}
          keyExtractor={(d) => d.driverId}
          contentContainerStyle={styles.sheetContent}
          ListHeaderComponent={renderSheetHeader()}
          renderItem={renderDriver}
          ListEmptyComponent={
            !driversLoading ? (
              <Card style={{ alignItems: "center" }}>
                <Text style={styles.emptyText}>No transporters found near your farm yet.</Text>
              </Card>
            ) : null
          }
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  markerWrap: { alignItems: "center" },
  selectedRing: {
    position: "absolute",
    top: -4,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: COLORS.PRIMARY,
  },
  compareBanner: {
    position: "absolute",
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  compareBannerText: { fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  distanceLabel: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  distanceLabelText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  backBtn: {
    position: "absolute",
    left: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.SURFACE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: COLORS.BACKGROUND,
    borderTopLeftRadius: RADIUS.cardLarge,
    borderTopRightRadius: RADIUS.cardLarge,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  sheetHandleBar: { alignItems: "center", paddingVertical: SPACING.sm },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.BORDER },
  sheetContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl * 2 },
  label: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY, marginTop: SPACING.md, marginBottom: SPACING.sm },
  row2: { flexDirection: "row", gap: SPACING.sm },
  col: { flex: 1 },
  readonly: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  readonlyText: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  input: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.base,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
  hint: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.xs },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, marginTop: SPACING.sm },
  searching: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.ESCROW_BG,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
  },
  searchingRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.ESCROW_TEXT },
  searchingText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.ESCROW_TEXT },
  emptyText: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, textAlign: "center" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginBottom: SPACING.sm,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.SUCCESS_BG,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  driverAvatarImage: { width: "100%", height: "100%" },
  driverAvatarText: { fontSize: 13, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  driverName: { fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  driverLocationText: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  driverMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  driverMetaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  driverMetaText: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  callBtnText: { fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
});
