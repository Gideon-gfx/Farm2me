import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import toast from "react-hot-toast";
import { Boxes, Briefcase, Handshake, Navigation, Package, Wallet as WalletIcon } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira, statusBadge } from "../lib/format";
import { truckIconSelf, farmIconAvailable, farmIconMine, buyerIcon, farmIconNearby } from "../lib/mapIcons";
import Spinner from "../components/Spinner";

interface Load {
  escrowTripId: string;
  cargoDescription: string;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  logisticsFee: string | number;
  requiredCrates: number;
  distanceKm?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
}
interface MyLoad extends Load {
  status: string;
  deliveryLocation: string | null;
  pickupPin: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  driverLat?: number | null;
  driverLng?: number | null;
}
interface FarmPin {
  farmerId: string;
  farmName: string;
  locationLabel: string | null;
  locationLat: number | null;
  locationLng: number | null;
  activeListings: number;
  crops: string[];
  distanceKm: number | null;
}

// Marker roles: selfIcon="you are here" (truck), availableIcon/pickupIcon
// are both a seller's farm (colour tells open-load vs your-accepted-pickup
// apart), deliveryIcon is the buyer, farmIcon is a farm nearby with no load
// tied to it yet. See ../lib/mapIcons for the shared truck/farm/house glyphs
// reused across the transporter map, product page and order tracking.
const selfIcon = truckIconSelf;
const availableIcon = farmIconAvailable;
const pickupIcon = farmIconMine;
const deliveryIcon = buyerIcon;
const farmIcon = farmIconNearby;

type LatLng = [number, number];

// Keeps the map framed around every marker currently on it — re-fits
// whenever the set of points changes (a new load appears, a job is
// accepted, the driver's live position updates, etc.).
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

export default function TransporterDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [myPosition, setMyPosition] = useState<LatLng | null>(
    user?.locationLat != null && user?.locationLng != null ? [user.locationLat, user.locationLng] : null
  );

  // A genuinely "live" position on the map — refines as GPS reports come in,
  // separate from the one-off profile location captured at sign-in.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyPosition([pos.coords.latitude, pos.coords.longitude]),
      () => {
        // Denied/unavailable — falls back to the profile's last saved location.
      },
      { enableHighAccuracy: true, maximumAge: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const availableQ = useQuery({
    queryKey: ["available-loads"],
    queryFn: async () => (await api.get<{ data: Load[] }>("/transport/available-loads")).data.data ?? [],
    refetchInterval: 15_000,
  });
  const mineQ = useQuery({
    queryKey: ["my-loads"],
    queryFn: async () => (await api.get<{ data: MyLoad[] }>("/transport/my-loads")).data.data ?? [],
    refetchInterval: 15_000,
  });
  const farmsQ = useQuery({
    queryKey: ["nearby-farms"],
    queryFn: async () => (await api.get<{ data: FarmPin[] }>("/transport/nearby-farms")).data.data ?? [],
    refetchInterval: 60_000,
  });

  const accept = useMutation({
    mutationFn: async (escrowTripId: string) => api.post("/transport/accept-load", { escrowTripId }),
    onSuccess: () => {
      // The farmer has the final say on every load now — accepting just
      // submits a full-price request, same queue as a negotiated offer.
      toast.success("Sent to the farmer for approval");
      queryClient.invalidateQueries({ queryKey: ["available-loads"] });
      queryClient.invalidateQueries({ queryKey: ["my-offers"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Could not accept load"),
  });

  // This driver's own pending counter-offers — an InDrive-style "name your
  // price" alternative to accepting the posted fee outright.
  const offersQ = useQuery({
    queryKey: ["my-offers"],
    queryFn: async () =>
      (await api.get<{ data: { tripId: string; amount: string | number; status: string }[] }>("/transport/my-offers"))
        .data.data ?? [],
    refetchInterval: 15_000,
  });
  const makeOffer = useMutation({
    mutationFn: async ({ escrowTripId, amount }: { escrowTripId: string; amount: number }) =>
      api.post(`/transport/loads/${escrowTripId}/offers`, { amount }),
    onSuccess: () => {
      toast.success("Offer sent to the farmer");
      queryClient.invalidateQueries({ queryKey: ["my-offers"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Could not send offer"),
  });

  const activeTrips = (mineQ.data ?? []).filter(
    (l) => l.status === "FUNDS_LOCKED" || l.status === "IN_TRANSIT" || l.status === "ARRIVED"
  );
  const potentialEarnings = (availableQ.data ?? []).reduce((sum, l) => sum + Number(l.logisticsFee), 0);

  const mapPoints = useMemo<LatLng[]>(() => {
    const points: LatLng[] = [];
    if (myPosition) points.push(myPosition);
    for (const l of availableQ.data ?? []) {
      if (l.pickupLat != null && l.pickupLng != null) points.push([l.pickupLat, l.pickupLng]);
    }
    for (const l of activeTrips) {
      if (l.pickupLat != null && l.pickupLng != null) points.push([l.pickupLat, l.pickupLng]);
      if (l.deliveryLat != null && l.deliveryLng != null) points.push([l.deliveryLat, l.deliveryLng]);
    }
    for (const f of farmsQ.data ?? []) {
      if (f.locationLat != null && f.locationLng != null) points.push([f.locationLat, f.locationLng]);
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPosition, availableQ.data, mineQ.data, farmsQ.data]);

  const mapCenter: LatLng = myPosition ?? mapPoints[0] ?? [9.082, 8.6753]; // Nigeria-ish fallback

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-primary-dark">Jobs</h1>
        <p className="mt-0.5 text-sm text-muted">Loads matched to your route &amp; vehicle</p>
      </div>

      {/* Stats */}
      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-escrow text-escrow-ink">
            <Package size={17} />
          </span>
          <div>
            <div className="text-2xl font-extrabold text-primary-dark">{availableQ.data?.length ?? 0}</div>
            <div className="text-xs text-muted">Available loads</div>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-success text-primary">
            <Briefcase size={17} />
          </span>
          <div>
            <div className="text-2xl font-extrabold text-primary-dark">{activeTrips.length}</div>
            <div className="text-xs text-muted">Active trips</div>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent/15 text-accent-dark">
            <WalletIcon size={17} />
          </span>
          <div>
            <div className="text-2xl font-extrabold text-accent-dark">{naira(potentialEarnings)}</div>
            <div className="text-xs text-muted">Potential earnings on offer</div>
          </div>
        </div>
      </div>

      {/* Live map */}
      <div className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm font-extrabold text-primary-dark">
            <Navigation size={14} className="text-primary" /> Live map
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2F6B3F]" /> Available</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#D9A441]" /> Your pickup</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#8B5CF6]" /> Your dropoff</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#EA580C]" /> Farms</span>
          </div>
        </div>
        <div className="h-80 sm:h-96">
          <MapContainer center={mapCenter} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds points={mapPoints} />

            {myPosition && (
              <Marker position={myPosition} icon={selfIcon}>
                <Popup>You are here</Popup>
              </Marker>
            )}

            {(availableQ.data ?? []).map((l) =>
              l.pickupLat != null && l.pickupLng != null ? (
                <Fragment key={l.escrowTripId}>
                  <Marker position={[l.pickupLat, l.pickupLng]} icon={availableIcon}>
                    <Popup>
                      <div className="min-w-[180px] text-sm">
                        <div className="font-extrabold text-primary-dark">{l.cargoDescription}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {l.pickupLocation ?? "Pickup"} → {l.dropoffLocation ?? "Dropoff"}
                          {l.distanceKm != null ? ` · ${l.distanceKm}km away` : ""}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="font-extrabold text-primary">{naira(l.logisticsFee)}</span>
                          <button
                            onClick={() => accept.mutate(l.escrowTripId)}
                            disabled={accept.isPending}
                            className="btn-accent !min-h-0 !px-3 !py-1.5 text-xs"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  {/* Route from where this driver is now to the pickup — so
                      "see the route" is true before accepting, not only after. */}
                  {myPosition && (
                    <Polyline
                      positions={[myPosition, [l.pickupLat, l.pickupLng]]}
                      pathOptions={{ color: "#2563eb", weight: 2, dashArray: "4 6", opacity: 0.6 }}
                    />
                  )}
                </Fragment>
              ) : null
            )}

            {(farmsQ.data ?? []).map((f) =>
              f.locationLat != null && f.locationLng != null ? (
                <Marker key={f.farmerId} position={[f.locationLat, f.locationLng]} icon={farmIcon}>
                  <Popup>
                    <div className="min-w-[160px] text-sm">
                      <div className="font-extrabold text-primary-dark">{f.farmName}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {f.crops.slice(0, 3).join(", ")}
                        {f.crops.length > 3 ? "…" : ""}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {f.activeListings} active listing{f.activeListings === 1 ? "" : "s"}
                        {f.distanceKm != null ? ` · ${f.distanceKm}km away` : ""}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ) : null
            )}

            {activeTrips.map((l) => (
              <Fragment key={l.escrowTripId}>
                {l.pickupLat != null && l.pickupLng != null && (
                  <Marker position={[l.pickupLat, l.pickupLng]} icon={pickupIcon}>
                    <Popup>Pickup — {l.cargoDescription}</Popup>
                  </Marker>
                )}
                {l.deliveryLat != null && l.deliveryLng != null && (
                  <Marker position={[l.deliveryLat, l.deliveryLng]} icon={deliveryIcon}>
                    <Popup>Dropoff — {l.deliveryLocation ?? "Buyer"}</Popup>
                  </Marker>
                )}
                {l.pickupLat != null && l.pickupLng != null && l.deliveryLat != null && l.deliveryLng != null && (
                  <Polyline
                    positions={[
                      [l.pickupLat, l.pickupLng],
                      [l.deliveryLat, l.deliveryLng],
                    ]}
                    pathOptions={{ color: "#D9A441", weight: 3, dashArray: "6 6" }}
                  />
                )}
              </Fragment>
            ))}
          </MapContainer>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-extrabold text-primary-dark">Available loads</h2>
      {availableQ.isLoading ? (
        <Spinner />
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(availableQ.data ?? []).map((l) => {
            const myOffer = (offersQ.data ?? []).find((o) => o.tripId === l.escrowTripId);
            return (
              <div key={l.escrowTripId} className="card flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-extrabold text-primary">{naira(l.logisticsFee)}</span>
                  <span className="pill bg-escrow text-escrow-ink">Escrow funded</span>
                </div>

                {/* Route timeline — filled dot at pickup, hollow dot at
                    dropoff, connected by a vertical line, like a ride-app
                    job request card. */}
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="h-2.5 w-2.5 flex-none rounded-full bg-primary" />
                    <span className="my-1 w-px flex-1 bg-border" />
                    <span className="h-2.5 w-2.5 flex-none rounded-full border-2 border-accent bg-white" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <p className="truncate text-sm font-bold text-primary-dark">{l.pickupLocation ?? "Pickup"}</p>
                    <p className="truncate text-sm font-bold text-primary-dark">{l.dropoffLocation ?? "Dropoff"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                  <span>{l.cargoDescription}</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Boxes size={11} /> {l.requiredCrates} crates
                  </span>
                  {l.distanceKm != null && (
                    <>
                      <span>·</span>
                      <span>{l.distanceKm}km away</span>
                    </>
                  )}
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <button
                    onClick={() => accept.mutate(l.escrowTripId)}
                    disabled={accept.isPending}
                    className="btn-accent w-full"
                  >
                    Accept load
                  </button>
                  {myOffer ? (
                    <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-accent-dark">
                      <Handshake size={14} /> Your offer: {naira(myOffer.amount)} — waiting for the farmer
                    </p>
                  ) : (
                    <OfferBox
                      maxAmount={Number(l.logisticsFee)}
                      onSubmit={(amount) => makeOffer.mutate({ escrowTripId: l.escrowTripId, amount })}
                      pending={makeOffer.isPending}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {availableQ.data?.length === 0 && (
            <div className="card p-10 text-center text-sm text-muted sm:col-span-2 lg:col-span-3">
              No available loads right now.
            </div>
          )}
        </div>
      )}

      <h2 className="mb-3 text-lg font-extrabold text-primary-dark">My active trips</h2>
      {mineQ.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(mineQ.data ?? []).map((l) => (
            <Link
              key={l.escrowTripId}
              to={`/orders/${l.escrowTripId}`}
              className="card flex flex-col gap-4 p-5 transition hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl font-extrabold text-primary">{naira(l.logisticsFee)}</span>
                <span className={`pill ${statusBadge(l.status)}`}>{l.status.replace("_", " ")}</span>
              </div>

              {/* Same route timeline as the available-loads cards, so an
                  accepted trip reads as the same kind of thing, just now
                  yours. */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="h-2.5 w-2.5 flex-none rounded-full bg-primary" />
                  <span className="my-1 w-px flex-1 bg-border" />
                  <span className="h-2.5 w-2.5 flex-none rounded-full border-2 border-accent bg-white" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                  <p className="truncate text-sm font-bold text-primary-dark">{l.pickupLocation ?? "Pickup"}</p>
                  <p className="truncate text-sm font-bold text-primary-dark">{l.deliveryLocation ?? "Dropoff"}</p>
                </div>
              </div>

              <p className="text-xs text-muted">{l.cargoDescription}</p>

              <div className="mt-auto flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Pickup PIN</span>
                <span className="font-mono text-lg font-extrabold tracking-widest text-primary-dark">
                  {l.pickupPin ?? "––––"}
                </span>
              </div>
            </Link>
          ))}
          {mineQ.data?.length === 0 && (
            <div className="card p-10 text-center text-sm text-muted sm:col-span-2 lg:col-span-3">
              No active trips yet.
            </div>
          )}
        </div>
      )}
    </>
  );
}

// InDrive-style "name your price" box — a driver can propose a lower fee
// than the posted one instead of accepting it outright. Collapsed behind a
// toggle by default so the primary action (Accept) stays the visual focus;
// bounded above by the posted fee (server-enforced too), since that's all
// the buyer already paid for delivery.
function OfferBox({
  maxAmount,
  onSubmit,
  pending,
}: {
  maxAmount: number;
  onSubmit: (amount: number) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const value = Number(amount);
  const valid = value > 0 && value <= maxAmount;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline w-full">
        <Handshake size={15} /> Make an offer
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark">
        <Handshake size={14} className="text-primary" /> Propose a fee (up to {naira(maxAmount)})
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">₦</span>
          <input
            type="number"
            step="1"
            min={1}
            max={maxAmount}
            placeholder={String(maxAmount)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            className="input !min-h-0 w-full !py-2 pl-7 text-sm"
          />
        </div>
        <button
          onClick={() => onSubmit(value)}
          disabled={!valid || pending}
          className="btn-accent !min-h-0 !px-4 !py-2 text-xs disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-xs font-bold text-muted hover:text-primary-dark"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
