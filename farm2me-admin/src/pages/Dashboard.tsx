import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { naira } from "../lib/format";
import type { Overview } from "../lib/types";
import { Card, PageTitle, Spinner, StatCard } from "../components/ui";

const PIE_COLORS = ["#1E5631", "#FFB800", "#2E9E5B", "#6C757D", "#D7263D", "#3B82F6", "#9333EA"];

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["overview"],
    queryFn: async () => (await api.get<Overview>("/admin/overview")).data,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <div className="text-red-600">Failed to load overview.</div>;

  const { stats, dailyVolume, listingsByCrop } = data;

  return (
    <div>
      <PageTitle>Dashboard Overview</PageTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={stats.totalUsers.toLocaleString()} />
        <StatCard label="Active Listings" value={stats.activeListings.toLocaleString()} />
        <StatCard label="Funds in Escrow" value={naira(stats.fundsInEscrow)} accent />
        <StatCard label="Completed Trips Today" value={stats.completedTripsToday.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4">Daily transaction volume (last 30 days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyVolume} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), "d MMM")}
                minTickGap={24}
                fontSize={12}
              />
              <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} fontSize={12} width={48} />
              <Tooltip
                formatter={(v) => naira(Number(v))}
                labelFormatter={(d) => format(parseISO(d as string), "d MMM yyyy")}
              />
              <Line type="monotone" dataKey="volume" stroke="#1E5631" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Listings by crop type</h2>
          {listingsByCrop.length === 0 ? (
            <div className="text-muted text-sm py-12 text-center">No listings yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={listingsByCrop}
                  dataKey="count"
                  nameKey="cropType"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(e: any) => e.cropType ?? ""}
                >
                  {listingsByCrop.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
