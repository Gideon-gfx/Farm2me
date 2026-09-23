import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Info, Lock, Star, X } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import { tintFor } from "../lib/colorTint";
import { publicLocationLabel } from "../lib/location";
import { getRecentlyViewed, recordRecentlyViewed } from "../lib/recentlyViewed";
import { GRADES, type Grade, type Listing } from "../lib/types";
import TopBar from "../components/TopBar";
import Spinner from "../components/Spinner";
import { StarDisplay, StarPicker } from "../components/StarRating";
import MediaCarousel, { buildMediaSlides } from "../components/MediaCarousel";
import { farmIconListing, farmIconNearby } from "../lib/mapIcons";

// This listing's own farmer pin, and the smaller pins for other nearby
// farms — both the shared farm glyph (see ../lib/mapIcons), sized/coloured
// to tell "this one" apart from "nearby".
const markerIcon = farmIconListing;
const nearbyIcon = farmIconNearby;

interface FarmerInfo {
  id: string;
  fullName: string;
  // Public storefront name (see FarmerDashboard's editable "My Farm" field)
  // — shown here instead of fullName whenever the farmer has set one.
  farmName?: string | null;
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  isVerified?: boolean;
  avatarUrl?: string | null;
}
type ListingDetailData = Listing & { farmer: FarmerInfo };

interface PaymentQuote {
  farmerPayout: number;
  logisticsFee: number;
  distanceKm: number;
  buyerServiceFee: number;
  buyerVat: number;
  totalAmount: number;
  quantityKg?: number | null;
}

interface RatingEntry {
  id: string;
  rating: number;
  comment?: string | null;
  raterName: string;
  createdAt: string;
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showGrade, setShowGrade] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [paying, setPaying] = useState(false);
  // How much of the listing's weight the buyer wants to order — defaults to
  // the full remaining weight once the listing loads, bounded by the
  // farmer's minOrderKg on the low end.
  const [quantityKg, setQuantityKg] = useState<number | null>(null);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => (await api.get<{ listing: ListingDetailData }>(`/listings/${id}`)).data.listing,
  });

  useEffect(() => {
    if (listing) setQuantityKg(listing.weightKg);
  }, [listing?.id]);

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery({
    queryKey: ["payment-quote", id, quantityKg],
    enabled: showPay && !!user && !!quantityKg,
    queryFn: async () =>
      (await api.post<PaymentQuote>("/payments/quote", { listingId: id, quantityKg })).data,
  });

  const { data: farmerRatings } = useQuery({
    queryKey: ["ratings", listing?.farmer.id],
    enabled: !!listing,
    queryFn: async () =>
      (await api.get<{ average: number; count: number; ratings: RatingEntry[] }>(
        `/ratings/user/${listing!.farmer.id}`
      )).data,
  });

  // Other listings from the same crop type, excluding this one — shown just
  // above the map.
  const { data: relatedListings } = useQuery({
    queryKey: ["related-listings", listing?.cropType, id],
    enabled: !!listing,
    queryFn: async () => {
      const res = await api.get<{ data: Listing[] }>("/listings", {
        params: { cropType: listing!.cropType, limit: 12 },
      });
      return (res.data.data ?? []).filter((l) => l.id !== id).slice(0, 8);
    },
  });

  // Where this specific listing actually is — its own location if the
  // farmer set one (produce stored elsewhere), else their registered
  // address. Used for the map, "nearby farms" centering, and the farmer
  // card's location line below.
  const pickupLat = listing?.locationLat ?? listing?.farmer.locationLat;
  const pickupLng = listing?.locationLng ?? listing?.farmer.locationLng;
  const pickupLabel = listing?.locationLabel ?? listing?.farmer.locationLabel;

  // Other active farms nearby — plotted as extra pins on the map below,
  // refetched periodically since the user asked for "live" pins.
  const hasCoords = pickupLat != null && pickupLng != null;
  const { data: nearbyFarms } = useQuery({
    queryKey: ["nearby-farms", pickupLat, pickupLng],
    enabled: hasCoords,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await api.get<{ data: Listing[] }>("/listings", {
        params: { lat: pickupLat, lng: pickupLng, limit: 50 },
      });
      const seenFarmers = new Set<string>([listing!.farmerId]);
      const farms: Listing[] = [];
      for (const l of res.data.data ?? []) {
        if (l.locationLat == null || l.locationLng == null) continue;
        if (seenFarmers.has(l.farmerId)) continue;
        seenFarmers.add(l.farmerId);
        farms.push(l);
      }
      return farms;
    },
  });

  const recentIds = getRecentlyViewed(id);
  const { data: recentListings } = useQuery({
    queryKey: ["recently-viewed", recentIds.join(",")],
    enabled: recentIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        recentIds.map(async (rid) => {
          try {
            return (await api.get<{ listing: Listing }>(`/listings/${rid}`)).data.listing;
          } catch {
            return null;
          }
        })
      );
      return results.filter((l): l is Listing => l != null);
    },
  });

  useEffect(() => {
    if (id) recordRecentlyViewed(id);
  }, [id]);

  if (isLoading) return (<div className="min-h-screen bg-page-background"><TopBar /><Spinner /></div>);
  if (!listing) return (<div className="min-h-screen bg-page-background"><TopBar /><p className="p-6 text-muted">Listing not found.</p></div>);

  const media = buildMediaSlides(listing.imageUrls, listing.videoUrls);

  async function pay() {
    if (!user) {
      toast.error("Sign in as a buyer to purchase");
      return;
    }
    setPaying(true);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/payments/initialize", {
        listingId: id,
        quantityKg,
      });
      window.location.assign(data.checkoutUrl);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not start payment");
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Media — images and videos together in one slider, always above
            the name/order section on every screen size. */}
        <MediaCarousel
          media={media}
          fallbackLabel={listing.cropType.slice(0, 2)}
          fallbackColor={tintFor(listing.cropType)}
          aspectClassName="aspect-[4/3]"
          roundedClassName="rounded-card"
          videoControls
          expandOnClick
        />

        {/* Details + order — always below the media, on desktop and mobile alike. */}
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold text-primary-dark">{listing.cropType}</h1>
            <button onClick={() => setShowGrade(true)} className="pill bg-escrow text-escrow-ink">
              {listing.grade.replace("GRADE_", "Grade ")} <Info size={13} className="ml-1" />
            </button>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-primary">{naira(listing.totalPrice)}</p>
          <p className="mt-1 text-muted">{listing.weightKg} kg · {naira(listing.pricePerKg)}/kg</p>

          <div className="mt-5 card flex items-center gap-3 p-3.5">
            <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-success text-sm font-extrabold text-primary">
              {listing.farmer.avatarUrl ? (
                <img src={listing.farmer.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (listing.farmer.farmName || listing.farmer.fullName).slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm font-extrabold text-primary-dark">
                {listing.farmer.farmName || listing.farmer.fullName}
                {listing.farmer.isVerified ? " ✓" : ""}
              </p>
              <p className="text-xs text-muted">
                {publicLocationLabel(pickupLabel) ?? "Location not specified"}
              </p>
              <div className="mt-0.5">
                <StarDisplay average={farmerRatings?.average ?? 0} count={farmerRatings?.count ?? 0} />
              </div>
            </div>
          </div>

          {/* Quantity — buy part of the listing instead of only the whole
              thing, bounded by the farmer's minimum order. */}
          <div className="mt-4">
            <label className="mb-1 block text-sm font-bold text-primary-dark">How many kg do you want?</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input"
                min={listing.minOrderKg}
                max={listing.weightKg}
                step="0.1"
                value={quantityKg ?? ""}
                onChange={(e) => setQuantityKg(e.target.value === "" ? null : Number(e.target.value))}
              />
              <span className="flex-none text-sm text-muted">of {listing.weightKg}kg available</span>
            </div>
            {listing.minOrderKg > 1 && (
              <p className="mt-1 text-xs text-muted">Minimum order: {listing.minOrderKg}kg</p>
            )}
            {quantityKg != null && quantityKg > 0 && (
              <p className="mt-2 text-lg font-extrabold text-primary">
                {naira(Number(listing.pricePerKg) * quantityKg, 2)} <span className="text-sm font-normal text-muted">for this order</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-escrow p-3">
            <Lock size={15} className="mt-0.5 flex-none text-escrow-ink" />
            <span className="text-xs font-bold leading-relaxed text-escrow-ink">
              Your money is held in escrow until you confirm delivery
            </span>
          </div>

          <button
            onClick={() => setShowPay(true)}
            disabled={!quantityKg || quantityKg < listing.minOrderKg || quantityKg > listing.weightKg}
            className="btn-accent mt-5 w-full disabled:opacity-50"
          >
            Order via escrow
          </button>
        </div>

        {/* Ratings & Comments */}
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold text-primary-dark">Ratings & comments</h2>
          {user?.role === "BUYER" && user.id !== listing.farmer.id && (
            <RateFarmerCard
              rateeId={listing.farmer.id}
              onRated={() => queryClient.invalidateQueries({ queryKey: ["ratings", listing.farmer.id] })}
            />
          )}
          {!farmerRatings || farmerRatings.count === 0 ? (
            <p className="text-sm text-muted">No reviews yet for this farmer.</p>
          ) : (
            <div className="card divide-y divide-border">
              {farmerRatings.ratings.map((r) => (
                <div key={r.id} className="p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-primary-dark">{r.raterName}</span>
                    <span className="text-[11px] text-muted">
                      {formatDistanceToNow(parseISO(r.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-0.5 flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} size={13} className={n <= r.rating ? "fill-accent text-accent" : "text-black/15"} />
                    ))}
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-muted">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently viewed */}
        {recentListings && recentListings.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-extrabold text-primary-dark">Recently viewed</h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {recentListings.map((l) => (
                <Link
                  key={l.id}
                  to={`/listings/${l.id}`}
                  className="w-32 flex-none overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]"
                >
                  <MediaCarousel
                    media={buildMediaSlides(l.imageUrls, l.videoUrls)}
                    fallbackLabel={l.cropType.slice(0, 2)}
                    fallbackColor={tintFor(l.cropType)}
                    aspectClassName="aspect-square"
                  />
                  <div className="p-2">
                    <p className="truncate text-xs font-extrabold text-primary-dark">{naira(l.totalPrice)}</p>
                    <p className="truncate text-[11px] text-muted">{l.cropType}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Related products */}
        {relatedListings && relatedListings.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-extrabold text-primary-dark">Related products</h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {relatedListings.map((l) => (
                <Link
                  key={l.id}
                  to={`/listings/${l.id}`}
                  className="w-32 flex-none overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]"
                >
                  <MediaCarousel
                    media={buildMediaSlides(l.imageUrls, l.videoUrls)}
                    fallbackLabel={l.cropType.slice(0, 2)}
                    fallbackColor={tintFor(l.cropType)}
                    aspectClassName="aspect-square"
                  />
                  <div className="p-2">
                    <p className="truncate text-xs font-extrabold text-primary-dark">{naira(l.totalPrice)}</p>
                    <p className="truncate text-[11px] text-muted">{l.cropType}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        {hasCoords && (
          <div className="mt-8">
            <p className="mb-2 text-sm font-bold text-primary-dark">Approximate farm area</p>
            <div className="h-64 overflow-hidden rounded-card">
              <MapContainer
                center={[pickupLat!, pickupLng!]}
                zoom={11}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[pickupLat!, pickupLng!]} icon={markerIcon}>
                  <Popup>{listing.farmer.farmName || listing.farmer.fullName} (this listing)</Popup>
                </Marker>
                {nearbyFarms?.map((l) => (
                  <Marker key={l.id} position={[l.locationLat!, l.locationLng!]} icon={nearbyIcon}>
                    <Popup>
                      <Link to={`/listings/${l.id}`} className="font-bold text-primary">
                        {l.farmerName ?? "Nearby farm"}
                      </Link>
                      <br />
                      {l.cropType} · {naira(l.totalPrice)}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            <p className="mt-1 text-xs text-muted">
              Exact address hidden for privacy. Green pins are other farms nearby.
            </p>
          </div>
        )}
      </main>

      {/* Grade tooltip modal */}
      {showGrade && (
        <Modal onClose={() => setShowGrade(false)} title="Grade guide">
          {GRADES.map((g) => (
            <p key={g.value} className={`py-1 ${listing.grade === (g.value as Grade) ? "font-bold text-primary" : "text-muted"}`}>
              {g.label} — {g.description}
            </p>
          ))}
        </Modal>
      )}

      {/* Payment modal */}
      {showPay && (
        <Modal onClose={() => setShowPay(false)} title="Payment breakdown">
          {!user ? (
            <p className="py-4 text-center text-sm text-muted">Sign in as a buyer to see your payment breakdown.</p>
          ) : quoteLoading || !quote ? (
            <div className="py-6"><Spinner /></div>
          ) : quoteError ? (
            <p className="py-4 text-center text-sm text-danger">Could not calculate fees. Please try again.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <Row
                label={quote.quantityKg ? `Goods (${quote.quantityKg}kg)` : "Goods"}
                value={naira(quote.farmerPayout)}
              />
              <Row label={`Delivery (${quote.distanceKm.toFixed(1)} km)`} value={naira(quote.logisticsFee)} />
              <Row label="Service fee" value={naira(quote.buyerServiceFee)} />
              <Row label="VAT (7.5%)" value={naira(quote.buyerVat)} />
              <div className="border-t border-border pt-2">
                <Row label="Total" value={naira(quote.totalAmount)} bold />
              </div>
            </div>
          )}
          <button onClick={pay} disabled={paying || !user || quoteLoading || !quote} className="btn-accent mt-5 w-full">
            {paying ? "Redirecting…" : "Confirm & Pay"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            You'll be redirected to Monnify's secure checkout.
          </p>
        </Modal>
      )}
    </div>
  );
}

// Lets a buyer with a completed (RELEASED) order for this farmer rate them
// and leave a comment right from the product page, instead of only from
// their order history.
function RateFarmerCard({
  rateeId,
  onRated,
}: {
  rateeId: string;
  onRated: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const submit = useMutation({
    mutationFn: async () =>
      api.post("/ratings/general", { rateeId, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      setRating(0);
      setComment("");
      onRated();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Could not submit rating"),
  });

  return (
    <div className="card mb-4 p-4">
      <p className="text-sm font-extrabold text-primary-dark">Rate this farmer</p>
      <div className="mt-1.5">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <input
        className="input mt-2 !py-2 text-sm"
        placeholder="Leave a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button
        onClick={() => submit.mutate()}
        disabled={rating === 0 || submit.isPending}
        className="btn-outline mt-2 !min-h-0 w-full !py-2 text-xs"
      >
        Submit rating
      </button>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-extrabold" : ""}`}>
      <span className={bold ? "text-primary-dark" : "text-muted"}>{label}</span>
      <span className="text-primary-dark">{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-primary-dark">{title}</h3>
          <button onClick={onClose} className="text-muted"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
