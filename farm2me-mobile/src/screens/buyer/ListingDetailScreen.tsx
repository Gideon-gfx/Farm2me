import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { WebView } from "react-native-webview";
import { useVideoPlayer, VideoView } from "expo-video";
import { api } from "../../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, Card, EscrowBanner } from "../../components/ui";
import { StarDisplay } from "../../components/StarRating";
import { GRADES, type Grade, type Listing } from "../../types";
import type { ScreenProps } from "../../navigation/types";

const { width } = Dimensions.get("window");

interface FarmerInfo {
  id: string;
  fullName: string;
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  isVerified?: boolean;
  avatarUrl?: string | null;
}
type ListingDetail = Listing & { farmer: FarmerInfo };

interface PaymentQuote {
  farmerPayout: number;
  logisticsFee: number;
  distanceKm: number;
  buyerServiceFee: number;
  buyerVat: number;
  totalAmount: number;
}

function VideoClip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={styles.videoClip} nativeControls />;
}

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export default function ListingDetailScreen({ route, navigation }: ScreenProps<"ListingDetail">) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradeInfo, setGradeInfo] = useState<Grade | null>(null);
  const [autoMatch, setAutoMatch] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pendingTripId, setPendingTripId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [farmerRatings, setFarmerRatings] = useState<{ average: number; count: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ listing: ListingDetail }>(`/listings/${listingId}`);
        setListing(data.listing);
        api
          .get<{ average: number; count: number }>(`/ratings/user/${data.listing.farmer.id}`)
          .then(({ data }) => setFarmerRatings(data))
          .catch(() => {
            // Rating summary is a nice-to-have — the listing itself already loaded.
          });
      } catch {
        setError("Could not load this listing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  async function openPayModal() {
    if (!listing) return;
    setShowPay(true);
    setError(null);
    if (quote) return;
    setQuoting(true);
    try {
      const { data } = await api.post<PaymentQuote>("/payments/quote", { listingId: listing.id });
      setQuote(data);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not calculate fees.");
    } finally {
      setQuoting(false);
    }
  }

  async function proceedToPayment() {
    if (!listing || paying) return;
    setPaying(true);
    setError(null);
    try {
      // driverId omitted => backend leaves the load open for transporter auto-match.
      const { data } = await api.post<{ escrowTripId: string; checkoutUrl: string }>(
        "/payments/initialize",
        { listingId: listing.id }
      );
      setPendingTripId(data.escrowTripId);
      setCheckoutUrl(data.checkoutUrl);
      setShowPay(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not start payment.");
    } finally {
      setPaying(false);
    }
  }

  // Detect Monnify redirecting back to our return URL => payment finished.
  function onWebViewNavChange(navState: { url: string }) {
    if (navState.url.includes("payment-complete")) {
      const tripId = pendingTripId;
      setCheckoutUrl(null);
      setPendingTripId(null);
      if (tripId) navigation.replace("ConfirmDelivery", { escrowTripId: tripId });
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }
  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Listing not found."}</Text>
      </View>
    );
  }

  const hasCoords = listing.farmer.locationLat != null && listing.farmer.locationLng != null;
  const images = listing.imageUrls?.length ? listing.imageUrls : [];
  const videos = listing.videoUrls ?? [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Image carousel */}
        <View>
          {images.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {images.map((uri) => (
                <Image key={uri} source={{ uri }} style={[styles.carouselImage, { width }]} />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.carouselImage, styles.imagePlaceholder, { width }]}>
              <Text style={styles.imagePlaceholderInit}>{listing.cropType.slice(0, 2)}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.crop}>{listing.cropType}</Text>
              <Text style={styles.meta}>{listing.farmer.fullName}</Text>
            </View>
            <Text style={styles.price}>{naira(listing.totalPrice)}</Text>
          </View>
          <TouchableOpacity onPress={() => setGradeInfo(listing.grade)}>
            <Text style={styles.gradeLink}>Grade {listing.grade.slice(-1)} ⓘ · {listing.weightKg}kg · {naira(listing.pricePerKg)}/kg</Text>
          </TouchableOpacity>

          {/* Farmer + mini map */}
          <Card style={styles.farmerCard}>
            <View style={styles.farmerAvatar}>
              {listing.farmer.avatarUrl ? (
                <Image source={{ uri: listing.farmer.avatarUrl }} style={styles.farmerAvatarImage} />
              ) : (
                <Text style={styles.farmerAvatarText}>{listing.farmer.fullName.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.farmerName}>
                {listing.farmer.fullName}
                {listing.farmer.isVerified ? "  ✓" : ""}
              </Text>
              <Text style={styles.meta}>{listing.farmer.locationLabel ?? "Location not set"}</Text>
              <View style={{ marginTop: 2 }}>
                <StarDisplay average={farmerRatings?.average ?? 0} count={farmerRatings?.count ?? 0} />
              </View>
            </View>
          </Card>
          {hasCoords && (
            <View style={styles.mapWrap}>
              <MapView
                style={styles.map}
                region={{
                  latitude: listing.farmer.locationLat!,
                  longitude: listing.farmer.locationLng!,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                pointerEvents="none"
              >
                <Marker
                  coordinate={{
                    latitude: listing.farmer.locationLat!,
                    longitude: listing.farmer.locationLng!,
                  }}
                />
              </MapView>
            </View>
          )}

          {videos.length > 0 && (
            <View style={{ gap: SPACING.sm }}>
              <Text style={styles.sectionTitle}>Videos</Text>
              {videos.map((uri) => (
                <VideoClip key={uri} uri={uri} />
              ))}
            </View>
          )}

          {/* Transporter selection */}
          <Text style={styles.sectionTitle}>Select a transporter</Text>
          <TouchableOpacity
            style={[styles.option, autoMatch && styles.optionSelected]}
            onPress={() => setAutoMatch(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.optionTitle}>Auto-match best available driver</Text>
            <Text style={styles.meta}>
              We post your load to nearby drivers; the first to accept handles pickup.
            </Text>
          </TouchableOpacity>

          <EscrowBanner label="Your money is held in escrow until you confirm delivery" />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 14 }]}>
        <View>
          <Text style={styles.totalLabel}>GOODS PRICE</Text>
          <Text style={styles.totalValue}>{naira(listing.totalPrice)}</Text>
        </View>
        <Button
          label="Order via escrow"
          onPress={openPayModal}
          variant="gold"
          style={{ flex: 1 }}
        />
      </View>

      {/* Grade explanation tooltip */}
      <Modal visible={gradeInfo !== null} transparent animationType="fade" onRequestClose={() => setGradeInfo(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setGradeInfo(null)}>
          <View style={styles.tooltip}>
            <Text style={styles.tooltipTitle}>Grade guide</Text>
            {GRADES.map((g) => (
              <Text key={g.value} style={[styles.tooltipLine, gradeInfo === g.value && styles.tooltipLineActive]}>
                {g.label} — {g.description}
              </Text>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Payment breakdown modal */}
      <Modal visible={showPay} transparent animationType="slide" onRequestClose={() => setShowPay(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowPay(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.payTooltip}>
            <Text style={styles.tooltipTitle}>Payment breakdown</Text>
            {quoting || !quote ? (
              <ActivityIndicator color={COLORS.PRIMARY} style={{ marginVertical: SPACING.lg }} />
            ) : (
              <View style={{ gap: 8 }}>
                <PayRow label="Goods" value={naira(quote.farmerPayout)} />
                <PayRow label={`Delivery (${quote.distanceKm.toFixed(1)} km)`} value={naira(quote.logisticsFee)} />
                <PayRow label="Service fee" value={naira(quote.buyerServiceFee)} />
                <PayRow label="VAT (7.5%)" value={naira(quote.buyerVat)} />
                <View style={styles.payTotalRow}>
                  <PayRow label="Total" value={naira(quote.totalAmount)} bold />
                </View>
              </View>
            )}
            {error ? <Text style={[styles.error, { marginTop: 8 }]}>{error}</Text> : null}
            <Button
              label={paying ? "Redirecting…" : "Confirm & Pay"}
              onPress={proceedToPayment}
              loading={paying}
              disabled={quoting || !quote}
              variant="gold"
              style={{ marginTop: SPACING.lg }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Monnify hosted checkout */}
      <Modal visible={checkoutUrl !== null} animationType="slide" onRequestClose={() => setCheckoutUrl(null)}>
        <View style={[styles.webHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setCheckoutUrl(null)}>
            <Text style={styles.webClose}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.webTitle}>Secure payment</Text>
          <View style={{ width: 60 }} />
        </View>
        {checkoutUrl && (
          <WebView source={{ uri: checkoutUrl }} onNavigationStateChange={onWebViewNavChange} />
        )}
      </Modal>
    </View>
  );
}

function PayRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.payRow}>
      <Text style={[styles.payRowLabel, bold && styles.payRowBold]}>{label}</Text>
      <Text style={[styles.payRowValue, bold && styles.payRowBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.BACKGROUND },
  content: { paddingBottom: 130 },
  carouselImage: { height: 200 },
  imagePlaceholder: { backgroundColor: COLORS.ESCROW_BG, alignItems: "center", justifyContent: "center" },
  imagePlaceholderInit: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 38, color: "rgba(0,0,0,0.3)" },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 17, color: COLORS.TEXT_PRIMARY },
  body: { padding: SPACING.md, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  crop: { fontSize: 20, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  price: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  gradeLink: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  meta: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 3 },
  sectionTitle: { fontSize: 13, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  farmerCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  farmerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.SUCCESS_BG,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  farmerAvatarImage: { width: "100%", height: "100%" },
  farmerAvatarText: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 13, color: COLORS.PRIMARY },
  farmerName: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 13, color: COLORS.TEXT_PRIMARY },
  mapWrap: { borderRadius: RADIUS.card, overflow: "hidden" },
  map: { width: "100%", height: 150 },
  videoClip: { width: "100%", height: 200, borderRadius: RADIUS.card, backgroundColor: "#000" },
  option: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
  },
  optionSelected: { borderColor: COLORS.PRIMARY },
  optionTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, fontFamily: FONT.family },
  ctaBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingTop: 14,
    backgroundColor: COLORS.SURFACE,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  totalLabel: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  totalValue: { fontSize: 19, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  tooltip: { backgroundColor: COLORS.SURFACE, borderRadius: RADIUS.card, padding: SPACING.lg, width: "100%" },
  tooltipTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, marginBottom: SPACING.sm },
  tooltipLine: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.xs },
  tooltipLineActive: { color: COLORS.PRIMARY, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold },
  payTooltip: { backgroundColor: COLORS.SURFACE, borderRadius: RADIUS.card, padding: SPACING.lg, width: "100%" },
  payRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payRowLabel: { fontSize: 13, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  payRowValue: { fontSize: 13, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  payRowBold: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  payTotalRow: { borderTopWidth: 1, borderTopColor: COLORS.BORDER, paddingTop: 8, marginTop: 4 },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.PRIMARY_DARK,
  },
  webClose: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold },
  webTitle: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
});
