import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api } from "../lib/api";
import { naira } from "../lib/format";
import type { DisputeDetail, DisputeRow, DisputeStatus } from "../lib/types";
import { Badge, Card, PageTitle, Spinner } from "../components/ui";

export default function Disputes() {
  const [filter, setFilter] = useState<DisputeStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["disputes", filter],
    queryFn: async () => {
      const params = filter === "ALL" ? {} : { status: filter };
      return (await api.get<{ data: DisputeRow[] }>("/admin/disputes", { params })).data.data;
    },
  });

  return (
    <div>
      <PageTitle>Dispute Resolution Center</PageTitle>

      <div className="flex gap-2 mb-4">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border ${
              filter === f ? "bg-primary text-white border-primary" : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted">
              <tr>
                <th className="px-4 py-3">Raised by</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">{d.raisedBy.fullName} <span className="text-muted">({d.raisedBy.role})</span></td>
                  <td className="px-4 py-3 max-w-xs truncate">{d.reason}</td>
                  <td className="px-4 py-3">{naira(d.escrowTrip.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={d.status === "OPEN" ? "amber" : "gray"}>{d.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{format(parseISO(d.createdAt), "d MMM yyyy")}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No disputes match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {selectedId && <DisputeDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function DisputeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dispute", id],
    queryFn: async () => (await api.get<DisputeDetail>(`/admin/disputes/${id}`)).data,
  });

  const resolve = useMutation({
    mutationFn: async (ruling: "BUYER" | "FARMER") =>
      api.post(`/admin/disputes/${id}/resolve`, { ruling, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      queryClient.invalidateQueries({ queryKey: ["dispute", id] });
      onClose();
    },
  });

  const resolved = data?.status === "RESOLVED";
  const canResolve = notes.trim().length > 0 && !resolved && !resolve.isPending;

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={onClose}>
      <div className="w-full max-w-lg bg-white h-full overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Dispute detail</h2>
          <button onClick={onClose} className="text-muted hover:text-gray-900">✕</button>
        </div>

        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge tone={data.status === "OPEN" ? "amber" : "gray"}>{data.status}</Badge>
              <span className="text-sm text-muted">Escrow: {data.escrowStatus}</span>
            </div>

            <div>
              <div className="text-sm text-muted">Amount at stake</div>
              <div className="text-2xl font-bold text-primary">{naira(data.amountAtStake)}</div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-1">Reason</div>
              <p className="text-sm text-gray-700">{data.reason}</p>
            </div>

            <div>
              <div className="text-sm font-semibold mb-1">Parties</div>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>🏪 Buyer: {data.parties.buyer?.fullName ?? "—"}</li>
                <li>🌾 Farmer(s): {data.parties.farmers.map((f) => f.fullName).join(", ") || "—"}</li>
                <li>🚚 Driver: {data.parties.driver?.fullName ?? "Unassigned"}</li>
                <li className="text-muted">Raised by: {data.parties.raisedBy.fullName}</li>
              </ul>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Evidence</div>
              {data.evidenceUrls.length === 0 ? (
                <div className="text-sm text-muted">No evidence attached.</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {data.evidenceUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="evidence" className="rounded-lg h-24 w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {resolved ? (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <div className="font-semibold">Resolution</div>
                <div className="text-gray-700">{data.resolution}</div>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-semibold">Resolution notes</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Explain the basis for this ruling…"
                  />
                </div>
                {resolve.isError && (
                  <div className="text-sm text-red-600">Could not resolve. Add notes and try again.</div>
                )}
                <div className="flex gap-3">
                  <button
                    disabled={!canResolve}
                    onClick={() => resolve.mutate("BUYER")}
                    className="flex-1 rounded-full bg-red-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Rule in Buyer's Favor
                  </button>
                  <button
                    disabled={!canResolve}
                    onClick={() => resolve.mutate("FARMER")}
                    className="flex-1 rounded-full bg-primary text-white py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Rule in Farmer's Favor
                  </button>
                </div>
                <p className="text-xs text-muted">
                  Buyer ruling refunds the buyer and flags the farmer. Farmer ruling releases escrow to
                  the farmer and flags the driver.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
