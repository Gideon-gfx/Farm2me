import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira, statusBadge } from "../lib/format";
import { slugify } from "../lib/slug";
import { publicLocationLabel } from "../lib/location";
import type { PoolContribution, VillagePool } from "../lib/types";
import Spinner from "./Spinner";

type PoolDetailData = VillagePool & { contributions: (PoolContribution & { farmerName?: string })[] };

// Bare pool detail — no page chrome, so it can render either standalone
// (wrapped in TopBar, see PoolDetail.tsx) or nested inside a dashboard shell
// (e.g. /farmer/:name/pools/:id, wrapped in AppShell).
export default function PoolDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: pool, isLoading } = useQuery({
    queryKey: ["pool", id],
    queryFn: async () => (await api.get<{ pool: PoolDetailData }>(`/pools/${id}`)).data.pool,
  });

  if (isLoading) return <Spinner />;
  if (!pool) return <p className="text-muted">Pool not found.</p>;

  const pct = Math.min(pool.percentageFilled ?? Math.round((pool.currentWeightKg / pool.targetWeightKg) * 100), 100);
  const isFarmer = user?.role === "FARMER";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-primary-dark">{pool.contractName}</h1>
            <p className="text-muted">
              {pool.cropType}
              {pool.subType ? ` — ${pool.subType}` : ""} · {naira(pool.pricePerKg)}/kg ·{" "}
              {pool.buyerName
                ? `Buyer: ${pool.buyerName}`
                : pool.createdByFarmerName
                  ? `Started by ${pool.createdByFarmerName} · awaiting a buyer`
                  : "Awaiting a buyer"}
            </p>
          </div>
          <span className={`pill ${statusBadge(pool.status)}`}>{pool.status}</span>
        </div>

        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-pill bg-black/[.06]">
          <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-sm text-muted">
          <span>{pool.currentWeightKg}/{pool.targetWeightKg} kg ({pct}%)</span>
          <span>Closes {formatDistanceToNow(parseISO(pool.deadline), { addSuffix: true })}</span>
        </div>

        {pool.status === "LOCKED" ? (
          <div className="mt-6 rounded-xl bg-escrow p-4 text-sm font-bold text-escrow-ink">
            This pool is fully funded and awaiting transport.
          </div>
        ) : isFarmer ? (
          <Link to={`/farmer/${slugify(user!.fullName)}/listings/new`} className="btn-primary mt-6 w-full">
            Contribute Your Yield
          </Link>
        ) : (
          <Link to="/auth?role=FARMER" className="btn-primary mt-6 w-full">
            Sign in as a farmer to contribute
          </Link>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-xl font-extrabold text-primary-dark">Contributors ({pool.contributions.length})</h2>
      <div className="card divide-y divide-border">
        {pool.contributions.length === 0 ? (
          <p className="p-4 text-sm text-muted">No contributions yet.</p>
        ) : (
          pool.contributions.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-primary-dark">Farmer from {publicLocationLabel(c.locationLabel) ?? "an undisclosed area"}</span>
              <span className="flex items-center gap-3">
                <span className="font-extrabold text-primary-dark">{c.weightKg} kg</span>
                {c.confirmedAt && (
                  <span className="text-xs text-muted">{format(parseISO(c.confirmedAt), "d MMM")}</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
