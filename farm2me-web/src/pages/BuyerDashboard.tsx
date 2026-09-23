import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Search } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import { CROP_TYPES, type Listing } from "../lib/types";
import { tintFor } from "../lib/colorTint";
import { publicLocationLabel } from "../lib/location";
import Spinner from "../components/Spinner";
import MediaCarousel, { buildMediaSlides } from "../components/MediaCarousel";

// Village Pools now lives at its own nested route (see BuyerLayout) — this
// page is just the classifieds-style produce market + order history.
export default function BuyerDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [crop, setCrop] = useState("");

  // Same viewer-location convention as Village Pools — prefer the profile's
  // stored location, else a best-effort one-off browser prompt. Listings
  // beyond 200km still show (see farData below); this just sorts/filters the
  // primary list nearest-first.
  const [viewer, setViewer] = useState<{ lat: number; lng: number } | null>(
    user?.locationLat != null && user?.locationLng != null
      ? { lat: user.locationLat, lng: user.locationLng }
      : null
  );

  useEffect(() => {
    if (viewer || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setViewer({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Permission denied/unavailable — listings just won't be distance-sorted.
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const listingsQ = useQuery({
    queryKey: ["buyer-listings", viewer?.lat, viewer?.lng],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 100 };
      if (viewer) {
        params.lat = viewer.lat;
        params.lng = viewer.lng;
      }
      const res = await api.get<{ data: Listing[]; farData: Listing[] }>("/listings", { params });
      return { near: res.data.data ?? [], far: res.data.farData ?? [] };
    },
  });

  const filterFn = (l: Listing) => {
    const q = search.trim().toLowerCase();
    if (crop && l.cropType !== crop) return false;
    if (q && !l.cropType.toLowerCase().includes(q)) return false;
    return true;
  };
  const filtered = useMemo(() => (listingsQ.data?.near ?? []).filter(filterFn), [listingsQ.data, crop, search]);
  const filteredFar = useMemo(() => (listingsQ.data?.far ?? []).filter(filterFn), [listingsQ.data, crop, search]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-primary-dark">Market</h1>
      <p className="mt-0.5 text-sm text-muted">Escrow protected · pay safely for every order</p>

      {/* Search + category — a big, marketplace-style toolbar rather than a
          generic app header search field. */}
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <div className="flex flex-1 items-center gap-2.5 rounded-pill border border-border bg-white px-4 py-2">
          <Search size={16} className="flex-none text-muted" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-primary-dark outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 placeholder:text-muted"
            placeholder="Search produce, e.g. Maize, Beans, Tomatoes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input sm:max-w-[200px]"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        >
          <option value="">All categories</option>
          {CROP_TYPES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {listingsQ.isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
          {filtered.length === 0 && <p className="mt-5 text-muted">No listings match your search nearby.</p>}

          {/* Nationwide fallback — listings >200km away, same state or
              another one entirely, so buyers with no local supply can
              still browse and buy from a farmer further out. */}
          {filteredFar.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-extrabold text-primary-dark">Other regions</h2>
              <p className="mt-0.5 text-sm text-muted">
                No local match? These listings are further away (200km+) — delivery cost reflects the distance.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredFar.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Classifieds-style card — price is the dominant element (bold, first),
// title/specs secondary, location + "posted x ago" last, matching the visual
// hierarchy of a marketplace listing (e.g. Jiji) rather than a product card.
function ListingCard({ listing: l }: { listing: Listing }) {
  const media = buildMediaSlides(l.imageUrls, l.videoUrls);
  return (
    <Link
      to={`/listings/${l.id}`}
      className="overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]"
    >
      <div className="relative">
        <MediaCarousel
          media={media}
          fallbackLabel={l.cropType.slice(0, 2)}
          fallbackColor={tintFor(l.cropType)}
          aspectClassName="aspect-square"
        />
        <span className="pill pointer-events-none absolute left-2 top-2 bg-white/90 text-[10px] text-primary-dark shadow-sm">
          {l.grade.replace("GRADE_", "Grade ")}
        </span>
      </div>
      <div className="p-3">
        <p className="text-lg font-extrabold leading-tight text-primary-dark">{naira(l.totalPrice)}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-primary-dark/80">
          {l.cropType} · {l.weightKg}kg
        </p>
        {l.farmerName && <p className="mt-1 truncate text-xs font-bold text-primary">{l.farmerName}</p>}
        <p className="mt-1 truncate text-xs text-muted">
          {publicLocationLabel(l.locationLabel) ?? "Location not set"}
          {l.distanceKm != null ? ` · ${l.distanceKm}km away` : ""}
        </p>
        <p className="mt-0.5 text-[10.5px] text-muted">
          {formatDistanceToNow(parseISO(l.createdAt), { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}

