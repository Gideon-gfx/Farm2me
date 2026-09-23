import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Phone, Plus } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira, statusBadge } from "../lib/format";
import { slugify } from "../lib/slug";
import { ANIMAL_TYPES, CROP_TYPES, type PoolStatus, type VillagePool } from "../lib/types";
import Spinner from "./Spinner";
import Dropdown from "./Dropdown";

const CROP_OPTIONS = CROP_TYPES.map((c) => ({ value: c, label: c }));
const ANIMAL_OPTIONS = ANIMAL_TYPES.map((a) => ({ value: a, label: a }));
const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "LOCKED", label: "Locked" },
];

// Bare pool board — no page chrome, so it can render either standalone
// (wrapped in TopBar, see PoolBoard.tsx) or nested inside a dashboard shell
// (e.g. /farmer/:name/pools, wrapped in AppShell). Pool detail links are
// relative so they resolve correctly under either parent path.
export default function PoolBoardContent() {
  const { user } = useAuth();
  const [kind, setKind] = useState<"crop" | "animal">("crop");
  const [cropType, setCropType] = useState("");
  const [status, setStatus] = useState<PoolStatus | "">("");
  // Prefer the signed-in user's stored profile location; otherwise fall back
  // to a best-effort one-off browser geolocation prompt. Either way this is
  // just used to filter pools that set a discovery radius — pools with none
  // set always show regardless.
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
        // Permission denied/unavailable — pools with a radius just won't be
        // filtered for this visit.
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const { data, isLoading } = useQuery({
    queryKey: ["pools", cropType, status, viewer?.lat, viewer?.lng],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (cropType) params.cropType = cropType;
      if (status) params.status = status;
      if (viewer) {
        params.lat = viewer.lat;
        params.lng = viewer.lng;
      }
      const res = await api.get<{ data: VillagePool[]; farData: VillagePool[] }>("/pools", { params });
      return { near: res.data.data ?? [], far: res.data.farData ?? [] };
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      {/* Banner */}
      <div className="card mb-6 bg-escrow p-5">
        <p className="text-lg font-extrabold text-primary-dark">Are you a farmer?</p>
        <p className="text-sm text-escrow-ink">
          Join a pool to fulfill large orders together and reach buyers you couldn't supply alone.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-primary-dark">Village Pools</h1>
        {user?.role === "BUYER" && (
          <Link to={`/buyer/${slugify(user.fullName)}/pools/new`} className="btn-primary !min-h-0 !px-4 !py-2 text-sm">
            <Plus size={16} /> Create a pool
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex gap-2">
          {(["crop", "animal"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCropType("");
              }}
              className={`rounded-xl border-2 px-5 py-2.5 text-sm font-extrabold transition ${
                kind === k ? "border-accent bg-white text-primary-dark" : "border-black/[.06] bg-white text-muted"
              }`}
            >
              {k === "crop" ? "Crop" : "Animal"}
            </button>
          ))}
        </div>
        <Dropdown
          className="w-full max-w-[200px]"
          placeholder={kind === "crop" ? "All crops" : "All animals"}
          value={cropType}
          onChange={setCropType}
          options={kind === "crop" ? CROP_OPTIONS : ANIMAL_OPTIONS}
        />
        <Dropdown
          className="w-full max-w-[200px]"
          placeholder="All statuses"
          value={status}
          onChange={(v) => setStatus(v as PoolStatus | "")}
          options={STATUS_OPTIONS}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (data?.near ?? []).length === 0 ? (
        <p className="text-muted">No pools match your filters nearby.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.near ?? []).map((p) => (
            <PoolCard key={p.id} pool={p} />
          ))}
        </div>
      )}

      {/* Nationwide fallback — pools >200km away, same state or another
          one entirely, so buyers/sellers with no local matches can still
          find and call a distant party. */}
      {!isLoading && (data?.far ?? []).length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-extrabold text-primary-dark">Other regions</h2>
          <p className="mt-0.5 text-sm text-muted">
            No local match? These pools are further away (200km+) — call ahead if you're both open to it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.far ?? []).map((p) => (
              <PoolCard key={p.id} pool={p} far />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PoolCard({ pool: p, far }: { pool: VillagePool; far?: boolean }) {
  const pct = Math.min(p.percentageFilled ?? Math.round((p.currentWeightKg / p.targetWeightKg) * 100), 100);
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-extrabold text-primary-dark">{p.contractName}</h2>
        <span className={`pill ${statusBadge(p.status)}`}>{p.status}</span>
      </div>
      <p className="text-sm text-muted">
        {p.cropType}
        {p.subType ? ` — ${p.subType}` : ""} · {naira(p.pricePerKg)}/kg
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {p.buyerName ? `Buyer: ${p.buyerName}` : p.createdByFarmerName ? `Started by ${p.createdByFarmerName} · awaiting a buyer` : "Awaiting a buyer"}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-black/[.06]">
        <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {p.currentWeightKg}/{p.targetWeightKg} kg · {pct}% filled
      </p>
      <p className="mt-1 text-xs text-muted">
        {p.distanceKm != null ? `${p.distanceKm}km away · ` : ""}
        Closes {formatDistanceToNow(parseISO(p.deadline), { addSuffix: true })}
        {!far && p.radiusKm ? ` · visible within ${p.radiusKm}km` : ""}
      </p>

      {far && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-primary-dark">
          <Phone size={13} className="flex-none" />
          {p.contactPhone ? (
            <a href={`tel:${p.contactPhone}`} className="hover:text-primary">{p.contactPhone}</a>
          ) : (
            <span className="font-normal text-muted">Sign in to see contact number</span>
          )}
        </p>
      )}

      <Link to={p.id} className="btn-outline mt-4">
        View Details
      </Link>
    </div>
  );
}
