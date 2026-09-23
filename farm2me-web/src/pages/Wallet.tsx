import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Wallet as WalletIcon } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";

interface WalletDeposit {
  id: string;
  amount: string | number;
  status: "PENDING" | "COMPLETED";
  createdAt: string;
}
interface WalletData {
  walletBalance: string | number;
  deposits: WalletDeposit[];
}

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

export default function Wallet() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["wallet"],
    enabled: !!user,
    queryFn: async () => (await api.get<WalletData>("/wallet")).data,
  });

  async function deposit() {
    const value = Number(amount);
    if (!value || value < 100) {
      toast.error("Enter an amount of at least ₦100");
      return;
    }
    setDepositing(true);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/wallet/deposit", { amount: value });
      window.location.assign(data.checkoutUrl);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not start deposit");
      setDepositing(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-extrabold text-primary-dark">Wallet</h1>

        <div className="mt-5 rounded-2xl bg-primary-dark p-6">
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-widest text-[#8FBF9C]">
            <WalletIcon size={13} /> Available balance
          </div>
          <div className="mt-2 text-3xl font-extrabold text-[#F5EFE2]">
            {isLoading ? "…" : naira(data?.walletBalance ?? user.walletBalance)}
          </div>
        </div>

        <div className="mt-5 card p-5">
          <h2 className="text-sm font-extrabold text-primary-dark">Add funds</h2>
          <p className="mt-1 text-xs text-muted">Top up your Farm2Me wallet via Monnify's secure checkout.</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(String(a))}
                className={`pill ${amount === String(a) ? "bg-primary text-white" : "bg-background text-primary-dark"}`}
              >
                {naira(a)}
              </button>
            ))}
          </div>

          <input
            type="number"
            min={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount (₦)"
            className="mt-3 w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none focus:border-primary"
          />

          <button onClick={deposit} disabled={depositing} className="btn-accent mt-4 w-full">
            {depositing ? "Redirecting…" : "Add funds"}
          </button>
        </div>

        <div className="mt-5 card p-5">
          <h2 className="text-sm font-extrabold text-primary-dark">Recent deposits</h2>
          {isLoading ? (
            <Spinner />
          ) : (data?.deposits ?? []).length === 0 ? (
            <p className="mt-2 text-xs text-muted">No deposits yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {(data?.deposits ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-bold text-primary-dark">{naira(d.amount)}</div>
                    <div className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()}</div>
                  </div>
                  <span className={`pill ${d.status === "COMPLETED" ? "bg-success text-primary" : "bg-escrow text-escrow-ink"}`}>
                    {d.status === "COMPLETED" ? "Completed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => refetch()} className="mt-3 w-full text-center text-xs font-bold text-muted hover:text-primary">
          Refresh
        </button>
      </div>
    </AppShell>
  );
}
