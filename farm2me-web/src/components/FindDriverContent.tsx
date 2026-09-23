import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import toast from "react-hot-toast";
import { Phone, Star, Truck } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import { farmIconListing } from "../lib/mapIcons";
import Spinner from "./Spinner";

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
  driverName?: string | null;
}

interface Driver {
  driverId: string;
  fullName: string;
  phoneNumber: string | null;
  locationLabel: string | null;
  isVerified: boolean;
  avatarUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  distanceKm: number | null;
}

// Farmer-facing driver page — always open, not gated on having an order:
// a "Nearby drivers" browse-and-call list is always shown, and a dispatch
// form (confirm pickup + a suggested fee, then broadcast to the board — see
// POST /transport/dispatch and the InDrive-style offers on
// TransporterDashboard) appears above it whenever there's a paid,
// unassigned order to post.
export default function FindDriverContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselect = searchParams.get("order");

  const { data: deals, isLoading } = useQuery({
    queryKey: ["my-deals"],
    queryFn: async () => (await api.get<{ data: Deal[] }>("/payments/my-deals")).data.data ?? [],
    refetchInterval: 5_000,
  });

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ["nearby-drivers"],
    queryFn: async () => (await api.get<{ data: Driver[] }>("/transport/nearby-drivers")).data.data ?? [],
  });

  const eligible = useMemo(() => (deals ?? []).filter((d) => d.status === "FUNDS_LOCKED" && !d.driverId), [deals]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const [pickupLabel, setPickupLabel] = useState("");
  const [suggestedFee, setSuggestedFee] = useState("");
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    setPickupLabel(user?.locationLabel ?? "");
    setSuggestedFee(selected ? String(Number(selected.logisticsFee ?? 0)) : "");
  }, [selected?.id, user?.locationLabel]);

  async function dispatch() {
    if (!selected) return;
    const fee = Number(suggestedFee);
    if (!(fee > 0)) {
      toast.error("Enter a suggested delivery fee");
      return;
    }
    setDispatching(true);
    try {
      await api.post("/transport/dispatch", {
        escrowTripId: selected.id,
        pickupLabel: pickupLabel.trim() || undefined,
        suggestedFee: fee,
      });
      toast.success("Posted to the load board — nearby drivers have been notified");
      queryClient.invalidateQueries({ queryKey: ["my-deals"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not post this order");
    } finally {
      setDispatching(false);
    }
  }

  const hasCoords = user?.locationLat != null && user?.locationLng != null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-extrabold text-primary-dark">Find a driver</h1>
      <p className="mt-0.5 text-sm text-muted">Browse drivers near your farm, or post a paid order to the board</p>

      {isLoading ? (
        <Spinner />
      ) : eligible.length > 0 ? (
        <div className="card mt-5 p-5">
          <label className="mb-1 block text-sm font-bold text-primary-dark">Order</label>
          <select
            className="input"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {eligible.map((d) => (
              <option key={d.id} value={d.id}>
                {d.item} — {d.party}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-primary-dark">Product</label>
                  <div className="input flex items-center bg-background text-muted">{selected.cropType}</div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-primary-dark">Quantity</label>
                  <div className="input flex items-center bg-background text-muted">
                    {selected.weightKg != null ? `${selected.weightKg}kg` : "—"}
                  </div>
                </div>
              </div>

              <label className="mb-1 mt-4 block text-sm font-bold text-primary-dark">Delivery address (buyer)</label>
              <div className="input flex min-h-[42px] items-center bg-background text-muted">
                {selected.deliveryLocation ?? "Not set"}
              </div>

              <label className="mb-1 mt-4 block text-sm font-bold text-primary-dark">Pickup address</label>
              <input
                className="input"
                placeholder="e.g. Gate 3, off Ikorodu road"
                value={pickupLabel}
                onChange={(e) => setPickupLabel(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">Prefilled from your farm's saved location — edit if pickup is elsewhere.</p>

              <label className="mb-1 mt-4 block text-sm font-bold text-primary-dark">Suggested delivery fee</label>
              <input
                type="number"
                className="input"
                max={Number(selected.logisticsFee ?? 0)}
                value={suggestedFee}
                onChange={(e) => setSuggestedFee(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Up to {naira(selected.logisticsFee ?? 0)} — the delivery amount your buyer already paid. Suggesting less
                refunds the difference straight to their wallet.
              </p>

              {selected.dispatched ? (
                <SearchingState pickupLabel={pickupLabel} hasCoords={hasCoords} lat={user?.locationLat} lng={user?.locationLng} />
              ) : (
                <button onClick={dispatch} disabled={dispatching} className="btn-accent mt-5 w-full">
                  <Truck size={16} /> {dispatching ? "Posting…" : "Post to the load board"}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="card mt-5 p-6 text-center text-sm text-muted">
          No paid orders need a driver right now — browse nearby drivers below for when you do.
        </div>
      )}

      {/* Always shown, regardless of whether there's an order to dispatch —
          a farmer can look up and call a transporter at any time. */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-primary-dark">Nearby drivers</h2>
      {driversLoading ? (
        <Spinner />
      ) : drivers && drivers.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {drivers.map((d) => (
            <div key={d.driverId} className="card flex items-center gap-3 p-3.5">
              <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-success text-sm font-extrabold text-primary">
                {d.avatarUrl ? (
                  <img src={d.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  d.fullName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-primary-dark">
                  {d.fullName}
                  {d.isVerified ? " ✓" : ""}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  {d.ratingCount > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <Star size={11} className="fill-accent text-accent" /> {d.ratingAverage.toFixed(1)} ({d.ratingCount})
                    </span>
                  ) : (
                    <span>No ratings yet</span>
                  )}
                  {d.distanceKm != null && <span>· {d.distanceKm}km away</span>}
                </div>
              </div>
              {d.phoneNumber ? (
                <a href={`tel:${d.phoneNumber}`} className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs">
                  <Phone size={13} /> Call
                </a>
              ) : (
                <span className="text-[11px] text-muted">No phone on file</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-muted">No transporters found near your farm yet.</div>
      )}
    </div>
  );
}

// Shown right after dispatch — a pulsing "searching" map so the farmer sees
// their request actively going out to nearby drivers, until one accepts
// (my-deals is polled every 5s and driverId flips once someone does).
function SearchingState({
  pickupLabel,
  hasCoords,
  lat,
  lng,
}: {
  pickupLabel: string;
  hasCoords: boolean;
  lat?: number | null;
  lng?: number | null;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 rounded-xl bg-escrow p-3 text-sm font-bold text-escrow-ink">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-escrow-ink opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-escrow-ink" />
        </span>
        Searching for a nearby driver…
      </div>
      {hasCoords && (
        <div className="relative mt-3 h-56 overflow-hidden rounded-card">
          <MapContainer center={[lat!, lng!]} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false} dragging={false}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[lat!, lng!]} icon={farmIconListing} />
          </MapContainer>
          {/* Radiating wave overlay, centered on the map — purely visual. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="absolute h-16 w-16 animate-ping rounded-full bg-accent/30" style={{ animationDuration: "1.8s" }} />
            <span className="absolute h-28 w-28 animate-ping rounded-full bg-accent/20" style={{ animationDuration: "2.4s" }} />
            <span className="absolute h-40 w-40 animate-ping rounded-full bg-accent/10" style={{ animationDuration: "3s" }} />
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Pickup: {pickupLabel || "your farm"}</p>
    </div>
  );
}
