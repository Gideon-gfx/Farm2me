import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import toast from "react-hot-toast";
import { CheckCircle2, Lock, MapPin, Navigation, Phone } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { formatAmountInput, naira, parseAmountInput, statusBadge } from "../lib/format";
import { farmIconListing, buyerIcon, truckIconLive } from "../lib/mapIcons";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";
import { StarPicker } from "../components/StarRating";
import type { EscrowStatus } from "../lib/types";

// Pickup = the farmer's location, delivery = the buyer's — both the shared
// farm/house glyphs (see ../lib/mapIcons) — and the driver's live-reported
// GPS position as a truck, distinct from either endpoint.
const pickupIcon = farmIconListing;
const deliveryIcon = buyerIcon;
const driverIcon = truckIconLive;

interface Waypoint {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
}
interface TripDetail {
  id: string;
  status: EscrowStatus;
  item: string;
  buyerName: string;
  buyerPhone: string | null;
  farmerName: string | null;
  farmerPhone: string | null;
  driverName: string | null;
  driverPhone: string | null;
  farmerIds: string[];
  driverId: string | null;
  pickupPin: string;
  deliveryPin?: string;
  totalAmount: string | number;
  farmerPayout: string | number;
  logisticsFee: string | number;
  pickup: Waypoint;
  delivery: Waypoint;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// The trip is created FUNDS_LOCKED at payment-initialize time (see
// initializePayment), so that's the real starting stage — there's no separate
// "order placed" step before it.
const STAGES: { status: EscrowStatus; label: string; desc: string }[] = [
  { status: "FUNDS_LOCKED", label: "Funds in escrow", desc: "Payment is locked and waiting for pickup" },
  { status: "IN_TRANSIT", label: "In transit", desc: "Transporter is moving the load" },
  { status: "ARRIVED", label: "Arrived at buyer's location", desc: "Waiting for the delivery code" },
  { status: "DELIVERED", label: "Delivered", desc: "Code confirmed — receipt verified" },
  { status: "RELEASED", label: "Funds released", desc: "Escrow paid out to farmer & transporter" },
];
const STAGE_INDEX: Record<EscrowStatus, number> = {
  FUNDS_LOCKED: 0,
  IN_TRANSIT: 1,
  ARRIVED: 2,
  DELIVERED: 3,
  RELEASED: 4,
  DISPUTED: 1,
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sharingLocation, setSharingLocation] = useState(false);
  const watchId = useRef<number | null>(null);

  const { data: trip, isLoading } = useQuery({
    queryKey: ["escrow-trip", id],
    queryFn: async () => (await api.get<TripDetail>(`/escrow/${id}`)).data,
    // Live-ish tracking: while the load is actually moving, poll for the
    // driver's latest reported position. Stops once it's no longer relevant.
    refetchInterval: (query) => (query.state.data?.status === "IN_TRANSIT" ? 15_000 : false),
  });

  const reportLocation = useMutation({
    mutationFn: async (coords: { lat: number; lng: number }) => api.post(`/escrow/${id}/location`, coords),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["escrow-trip", id] }),
  });

  const isBuyer = user?.role === "BUYER";
  const canRate = isBuyer && trip?.status === "RELEASED";

  const { data: myRatings } = useQuery({
    queryKey: ["my-ratings", id],
    enabled: !!canRate,
    queryFn: async () =>
      (await api.get<{ ratings: { rateeId: string; rating: number; comment: string | null }[] }>(`/ratings/trip/${id}/mine`)).data.ratings,
  });

  // Stop the browser's GPS watch on unmount or when sharing is toggled off.
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  function toggleSharing() {
    if (sharingLocation) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharingLocation(false);
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Your browser doesn't support location sharing");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => reportLocation.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("Could not access your location — check browser permissions"),
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    setSharingLocation(true);
    toast.success("Sharing your live location with the buyer");
  }

  if (isLoading) {
    return (
      <AppShell>
        <Spinner />
      </AppShell>
    );
  }
  if (!trip) {
    return (
      <AppShell>
        <p className="text-muted">Order not found, or you don't have access to it.</p>
      </AppShell>
    );
  }

  const disputed = trip.status === "DISPUTED";
  const currentStage = STAGE_INDEX[trip.status];
  const hasPickup = trip.pickup.lat != null && trip.pickup.lng != null;
  const hasDelivery = trip.delivery.lat != null && trip.delivery.lng != null;
  const hasDriver = trip.driverLat != null && trip.driverLng != null;
  const isTransporter = user?.role === "TRANSPORTER";
  // A TRANSPORTER only ever successfully loads this page if they're the
  // assigned driver (see the isDriver check in GET /escrow/:id) — anyone
  // else gets a 403 before trip data exists at all.
  const canConfirmArrival = isTransporter && trip.status === "IN_TRANSIT";
  const canEnterDeliveryCode = (isBuyer || isTransporter) && trip.status === "ARRIVED";
  const canShareLocation = isTransporter && (trip.status === "IN_TRANSIT" || trip.status === "ARRIVED");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Order</div>
            <h1 className="mt-1 text-2xl font-extrabold text-primary-dark">{trip.item}</h1>
            <p className="mt-1 text-sm text-muted">
              {trip.farmerName ?? "Village pool"} → {trip.buyerName}
              {trip.driverName ? ` · driven by ${trip.driverName}` : ""}
            </p>
          </div>
          <span className={`pill ${statusBadge(trip.status)}`}>{trip.status.replace("_", " ")}</span>
        </div>

        <div className="grid gap-5 md:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-5">
            {(hasPickup || hasDelivery) && (
              <div>
                <div className="h-72 overflow-hidden rounded-card">
                  <MapContainer
                    center={[
                      trip.driverLat ?? trip.pickup.lat ?? trip.delivery.lat!,
                      trip.driverLng ?? trip.pickup.lng ?? trip.delivery.lng!,
                    ]}
                    zoom={9}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {hasPickup && <Marker position={[trip.pickup.lat!, trip.pickup.lng!]} icon={pickupIcon} />}
                    {hasDelivery && <Marker position={[trip.delivery.lat!, trip.delivery.lng!]} icon={deliveryIcon} />}
                    {hasDriver && <Marker position={[trip.driverLat!, trip.driverLng!]} icon={driverIcon} />}
                    {hasPickup && hasDelivery && (
                      <Polyline
                        positions={[
                          [trip.pickup.lat!, trip.pickup.lng!],
                          [trip.delivery.lat!, trip.delivery.lng!],
                        ]}
                        pathOptions={{ color: "#2F6B3F", weight: 4 }}
                      />
                    )}
                  </MapContainer>
                </div>
                {hasDriver && trip.driverLocationAt && (
                  <p className="mt-2 text-xs text-muted">
                    Driver location updated {new Date(trip.driverLocationAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}

            <div className="card p-5">
              <div className="mb-4 text-sm font-extrabold text-primary-dark">Escrow timeline</div>
              <div className="flex flex-col">
                {disputed ? (
                  <TimelineRow
                    label="Dispute raised"
                    desc="Our team is reviewing this order — funds stay locked until it's resolved."
                    state="current"
                    last
                  />
                ) : (
                  STAGES.map((s, i) => (
                    <TimelineRow
                      key={s.status}
                      label={s.label}
                      desc={s.desc}
                      state={i < currentStage ? "done" : i === currentStage ? "current" : "upcoming"}
                      last={i === STAGES.length - 1}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted">Total (held in escrow)</span>
                <span className="text-xl font-extrabold text-primary-dark">{naira(trip.totalAmount)}</span>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-escrow p-3">
                <Lock size={15} className="mt-0.5 flex-none text-escrow-ink" />
                <span className="text-xs font-bold leading-relaxed text-escrow-ink">
                  {trip.status === "RELEASED"
                    ? "Escrow complete — funds disbursed to all parties"
                    : "Funds release automatically when the buyer confirms delivery"}
                </span>
              </div>
            </div>

            <div className="card p-5">
              <div className="mb-3 text-sm font-extrabold text-primary-dark">Contacts</div>
              <p className="mb-3 text-xs text-muted">
                Call directly for pickup/delivery follow-ups outside the app.
              </p>
              <div className="flex flex-col divide-y divide-border">
                <ContactRow label="Farmer" name={trip.farmerName} phone={trip.farmerPhone} />
                <ContactRow label="Buyer" name={trip.buyerName} phone={trip.buyerPhone} />
                <ContactRow label="Driver" name={trip.driverName} phone={trip.driverPhone} />
              </div>
            </div>

            {canRate && (
              <RatingCard
                tripId={trip.id}
                farmerIds={trip.farmerIds}
                farmerName={trip.farmerName}
                driverId={trip.driverId}
                driverName={trip.driverName}
                already={myRatings ?? []}
              />
            )}

            {isBuyer && trip.status === "RELEASED" && trip.driverId && (
              <TipDriverCard tripId={trip.id} driverName={trip.driverName} />
            )}

            {canConfirmArrival && (
              <ConfirmArrivalCard tripId={trip.id} />
            )}

            {canEnterDeliveryCode && (
              <DeliveryCodeCard tripId={trip.id} isTransporter={isTransporter} />
            )}

            {canShareLocation && (
              <button
                onClick={toggleSharing}
                className={sharingLocation ? "btn-ink w-full" : "btn-accent w-full"}
              >
                <Navigation size={16} />
                {sharingLocation ? "Sharing live location…" : "Share my live location"}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

interface MyRating {
  rateeId: string;
  rating: number;
  comment: string | null;
}

// Rate the farmer(s)/transporter who fulfilled this order — only shown once
// the trip is RELEASED, and only for parties the buyer hasn't already rated.
function RatingCard({
  tripId,
  farmerIds,
  farmerName,
  driverId,
  driverName,
  already,
}: {
  tripId: string;
  farmerIds: string[];
  farmerName: string | null;
  driverId: string | null;
  driverName: string | null;
  already: MyRating[];
}) {
  const queryClient = useQueryClient();
  const ratedIds = new Set(already.map((r) => r.rateeId));

  const targets = [
    ...farmerIds.map((id, i) => ({
      id,
      label: farmerIds.length > 1 ? `${farmerName ?? "Farmer"} (share ${i + 1})` : farmerName ?? "Farmer",
    })),
    ...(driverId ? [{ id: driverId, label: driverName ?? "Transporter" }] : []),
  ];
  const unrated = targets.filter((t) => !ratedIds.has(t.id));

  const submit = useMutation({
    mutationFn: async (input: { rateeId: string; rating: number; comment: string }) =>
      api.post("/ratings", { escrowTripId: tripId, rateeId: input.rateeId, rating: input.rating, comment: input.comment || undefined }),
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      queryClient.invalidateQueries({ queryKey: ["my-ratings", tripId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Could not submit rating"),
  });

  if (targets.length === 0) return null;

  if (unrated.length === 0) {
    return (
      <div className="card p-5 text-center text-sm font-bold text-primary">
        Thanks — you've rated everyone on this order.
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="text-sm font-extrabold text-primary-dark">Rate your order</div>
      {unrated.map((t) => (
        <RateRow key={t.id} label={t.label} onSubmit={(rating, comment) => submit.mutate({ rateeId: t.id, rating, comment })} pending={submit.isPending} />
      ))}
    </div>
  );
}

function RateRow({
  label,
  onSubmit,
  pending,
}: {
  label: string;
  onSubmit: (rating: number, comment: string) => void;
  pending: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="text-xs font-bold text-muted">{label}</div>
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
        onClick={() => onSubmit(rating, comment)}
        disabled={rating === 0 || pending}
        className="btn-outline mt-2 !min-h-0 w-full !py-2 text-xs"
      >
        Submit rating
      </button>
    </div>
  );
}

// Transporter-only: marks them as physically at the delivery address, no
// PIN needed — just a one-tap confirmation that unlocks the code-entry step.
function ConfirmArrivalCard({ tripId }: { tripId: string }) {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  async function confirm() {
    setSending(true);
    try {
      await api.post("/payments/confirm-arrival", { escrowTripId: tripId });
      toast.success("Marked as arrived");
      queryClient.invalidateQueries({ queryKey: ["escrow-trip", tripId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not confirm arrival");
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={confirm} disabled={sending} className="btn-accent w-full">
      <MapPin size={16} /> {sending ? "Confirming…" : "I've arrived at the buyer's location"}
    </button>
  );
}

// The buyer reads their delivery code to the driver in person; either of
// them can type it in here — same action either way (verify PIN + release
// escrow). Shows a green check immediately on a match before the trip
// re-fetches into RELEASED.
function DeliveryCodeCard({ tripId, isTransporter }: { tripId: string; isTransporter: boolean }) {
  const LEN = 4;
  const queryClient = useQueryClient();
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const pin = digits.join("");
  const complete = pin.length === LEN;

  function onChange(v: string, i: number) {
    const c = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = c;
      return next;
    });
    if (c && i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  async function confirm() {
    if (!complete || busy) return;
    setBusy(true);
    try {
      await api.post("/payments/confirm-delivery", { escrowTripId: tripId, pin });
      setConfirmed(true);
      toast.success("Delivery confirmed — funds released!");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["escrow-trip", tripId] }), 900);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Incorrect code — try again");
      setBusy(false);
    }
  }

  if (confirmed) {
    return (
      <div className="card flex flex-col items-center gap-2 p-6 text-center">
        <CheckCircle2 size={36} className="text-success" />
        <p className="text-sm font-extrabold text-primary-dark">Code confirmed</p>
        <p className="text-xs text-muted">Releasing escrow…</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <p className="text-sm font-extrabold text-primary-dark">Enter delivery code</p>
      <p className="mt-1 text-xs text-muted">
        {isTransporter
          ? "Ask the buyer for their 4-digit delivery code and enter it below."
          : "Enter the 4-digit code sent to you by SMS to confirm receipt."}
      </p>
      <div className="mt-4 flex justify-center gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            className="h-14 w-12 rounded-xl border border-black/10 bg-white text-center text-xl font-extrabold text-primary-dark focus:border-2 focus:border-accent"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => onChange(e.target.value, i)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
            }}
          />
        ))}
      </div>
      <button onClick={confirm} disabled={!complete || busy} className="btn-primary mt-4 w-full">
        {busy ? "Confirming…" : "Confirm & release funds"}
      </button>
    </div>
  );
}

const TIP_PRESETS = [200, 500, 1000];

// Optional, one-off tip for the transporter — only offered once the trip is
// RELEASED (delivery confirmed, escrow paid out), since a buyer should only
// ever tip after seeing the job through. The amount is entirely the buyer's
// choice — presets are just quick-fill shortcuts for the one real input
// (comma-formatted, no upper bound, same as any other money field in the
// app), not a fixed menu of allowed amounts.
function TipDriverCard({ tripId, driverName }: { tripId: string; driverName: string | null }) {
  const [amountInput, setAmountInput] = useState("");
  const [sending, setSending] = useState(false);
  const amount = parseAmountInput(amountInput);

  const { data: tip, isLoading } = useQuery({
    queryKey: ["tip", tripId],
    queryFn: async () => (await api.get<{ tip: { amount: number; status: string } | null }>(`/payments/tip/${tripId}`)).data.tip,
  });

  if (isLoading) return null;

  if (tip) {
    return (
      <div className="card p-5 text-center text-sm font-bold text-primary">
        {tip.status === "COMPLETED" ? `You tipped ${naira(tip.amount)} — thanks for supporting your driver!` : "Your tip is processing…"}
      </div>
    );
  }

  async function sendTip() {
    if (!amount || amount <= 0) return;
    setSending(true);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/payments/tip", {
        escrowTripId: tripId,
        amount,
      });
      window.location.assign(data.checkoutUrl);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not start tip payment");
      setSending(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-extrabold text-primary-dark">Tip {driverName ?? "your driver"}?</div>
      <p className="mt-1 text-xs text-muted">Any amount you like — completely optional.</p>

      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-muted">₦</span>
        <input
          inputMode="decimal"
          placeholder="Enter an amount"
          value={amountInput}
          onChange={(e) => setAmountInput(formatAmountInput(e.target.value))}
          className="input w-full pl-8 text-base font-bold"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {TIP_PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => setAmountInput(formatAmountInput(String(v)))}
            className={`rounded-pill border px-4 py-1.5 text-sm font-bold ${
              amount === v ? "border-accent bg-accent/10 text-accent-dark" : "border-border text-primary-dark"
            }`}
          >
            {naira(v)}
          </button>
        ))}
      </div>

      <button
        onClick={sendTip}
        disabled={!amount || amount <= 0 || sending}
        className="btn-accent mt-3 w-full disabled:opacity-50"
      >
        {sending ? "Redirecting…" : amount > 0 ? `Send ${naira(amount)} tip` : "Send tip"}
      </button>
    </div>
  );
}

function ContactRow({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  if (!name) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</div>
        <div className="truncate text-sm font-semibold text-primary-dark">{name}</div>
      </div>
      {phone ? (
        <a href={`tel:${phone}`} className="btn-outline !min-h-0 shrink-0 !px-3.5 !py-1.5 text-xs">
          <Phone size={13} /> {phone}
        </a>
      ) : (
        <span className="shrink-0 text-xs text-muted">No phone on file</span>
      )}
    </div>
  );
}

function TimelineRow({
  label,
  desc,
  state,
  last,
}: {
  label: string;
  desc: string;
  state: "done" | "current" | "upcoming";
  last?: boolean;
}) {
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-extrabold ${
            state === "done"
              ? "bg-primary text-white"
              : state === "current"
                ? "border-2 border-accent bg-white text-accent-ink"
                : "border-2 border-black/10 bg-white text-transparent"
          }`}
        >
          {state === "done" ? "✓" : state === "current" ? "●" : ""}
        </div>
        {!last && <div className={`w-0.5 flex-1 ${state === "done" ? "bg-primary" : "bg-black/10"}`} style={{ minHeight: 18 }} />}
      </div>
      <div className={last ? "" : "pb-4"}>
        <div className={`text-sm font-extrabold ${state === "upcoming" ? "text-muted" : "text-primary-dark"}`}>{label}</div>
        <div className="mt-0.5 text-xs text-muted">{desc}</div>
      </div>
    </div>
  );
}
