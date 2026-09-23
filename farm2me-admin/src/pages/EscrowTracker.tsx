import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { naira } from "../lib/format";
import type { InTransitTrip } from "../lib/types";
import { Badge, Card, PageTitle, Spinner } from "../components/ui";

function bandLabel(t: InTransitTrip) {
  if (t.band === "red") return ">48 hrs";
  if (t.band === "amber") return "24–48 hrs";
  return "<24 hrs";
}

export default function EscrowTracker() {
  const { data, isLoading } = useQuery({
    queryKey: ["in-transit"],
    queryFn: async () => (await api.get<{ data: InTransitTrip[] }>("/admin/escrow/in-transit")).data.data,
    refetchInterval: 30_000, // keep the tracker live
  });

  return (
    <div>
      <PageTitle>Live Escrow Tracker</PageTitle>
      <p className="text-muted mb-4 text-sm">All trips currently in transit. Refreshes every 30s.</p>

      <Card className="overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted">
              <tr>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Amount locked</th>
                <th className="px-4 py-3">Time in transit</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t.escrowTripId} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    {t.cargo}
                    <div className="text-xs text-muted">{t.requiredCrates} crates</div>
                  </td>
                  <td className="px-4 py-3">
                    {t.route.pickup} <span className="text-accent">→</span> {t.route.dropoff}
                  </td>
                  <td className="px-4 py-3">{t.driverName}</td>
                  <td className="px-4 py-3">{t.buyerName}</td>
                  <td className="px-4 py-3 font-semibold">{naira(t.amountLocked)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={t.band}>
                      {t.hoursInTransit}h · {bandLabel(t)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No trips currently in transit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
