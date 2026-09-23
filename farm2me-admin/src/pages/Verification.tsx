import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api } from "../lib/api";
import type { PendingTransporter } from "../lib/types";
import { Card, PageTitle, Spinner } from "../components/ui";

export default function Verification() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pending-transporters"],
    queryFn: async () =>
      (await api.get<{ data: PendingTransporter[] }>("/admin/transporters/pending")).data.data,
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "suspend" }) =>
      api.post(`/admin/users/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-transporters"] }),
  });

  return (
    <div>
      <PageTitle>User Verification Panel</PageTitle>
      <p className="text-muted mb-4 text-sm">Transporter accounts pending vehicle verification.</p>

      <Card className="overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{t.fullName}</td>
                  <td className="px-4 py-3">{t.phoneNumber}</td>
                  <td className="px-4 py-3 text-muted">{format(parseISO(t.createdAt), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: t.id, action: "approve" })}
                        className="rounded-full bg-primary text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: t.id, action: "suspend" })}
                        className="rounded-full bg-red-600 text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted">
                    No transporters awaiting verification.
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
