import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import Spinner from "./Spinner";
import type { SubscriptionTier } from "../lib/types";

interface Plan {
  tier: SubscriptionTier;
  priceNgn: number;
  commissionRate: number;
}
interface PlansResponse {
  vatRate: number;
  plans: Plan[];
  durationDays: number;
}
interface MyPlan {
  tier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  commissionRate: number;
  vatRate: number;
}

const TIER_LABEL: Record<SubscriptionTier, string> = {
  FREE: "Free",
  STANDARD: "Standard",
  PREMIUM: "Premium",
};
const TIER_BLURB: Record<SubscriptionTier, string> = {
  FREE: "Pay as you go — no monthly commitment.",
  STANDARD: "For regular sellers, transporters and buyers who want lower fees.",
  PREMIUM: "Lowest fees — for high-volume users.",
};

// Bare plans grid — no page chrome, so it can render either standalone
// (wrapped in TopBar, see Subscription.tsx) or nested inside a dashboard
// shell (e.g. /farmer/:name/plans, wrapped in AppShell).
export default function SubscriptionContent() {
  const { user } = useAuth();
  const [upgrading, setUpgrading] = useState<SubscriptionTier | null>(null);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => (await api.get<PlansResponse>("/subscriptions/plans")).data,
  });

  const { data: myPlan } = useQuery({
    queryKey: ["my-subscription"],
    enabled: !!user,
    queryFn: async () => (await api.get<MyPlan>("/subscriptions/me")).data,
  });

  async function upgrade(tier: Exclude<SubscriptionTier, "FREE">) {
    if (!user) {
      toast.error("Sign in to upgrade your plan");
      return;
    }
    setUpgrading(tier);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/subscriptions/upgrade", { tier });
      window.location.assign(data.checkoutUrl);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not start upgrade");
      setUpgrading(null);
    }
  }

  if (plansLoading || !plansData) {
    return <Spinner />;
  }

  const currentTier = myPlan?.tier ?? (user ? "FREE" : null);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold text-primary-dark">Subscription plans</h1>
      <p className="mt-1 text-sm text-muted">
        Every order carries a Farm2Me service fee (platform commission + {(plansData.vatRate * 100).toFixed(1)}%
        VAT) — subscribing lowers your commission rate on every order you're part of, as a farmer, transporter or
        buyer.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {plansData.plans.map((plan) => {
          const isCurrent = currentTier === plan.tier;
          return (
            <div
              key={plan.tier}
              className={`card flex flex-col p-5 ${isCurrent ? "border-2 border-accent" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-primary-dark">{TIER_LABEL[plan.tier]}</h2>
                {isCurrent && <span className="pill bg-success text-primary">Current</span>}
              </div>
              <p className="mt-1 text-sm text-muted">{TIER_BLURB[plan.tier]}</p>

              <p className="mt-4 text-2xl font-extrabold text-primary-dark">
                {plan.priceNgn === 0 ? "₦0" : naira(plan.priceNgn)}
                {plan.priceNgn > 0 && <span className="text-sm font-semibold text-muted"> /{plansData.durationDays}d</span>}
              </p>

              <div className="mt-4 flex items-start gap-2 text-sm">
                <Check size={16} className="mt-0.5 flex-none text-primary" />
                <span>
                  <span className="font-extrabold text-primary-dark">{(plan.commissionRate * 100).toFixed(0)}%</span>{" "}
                  platform commission per order
                </span>
              </div>
              <div className="mt-2 flex items-start gap-2 text-sm">
                <Check size={16} className="mt-0.5 flex-none text-primary" />
                <span>{(plansData.vatRate * 100).toFixed(1)}% VAT on that commission (same at every tier)</span>
              </div>

              {plan.tier === "FREE" ? (
                <div className="mt-5 rounded-xl bg-background px-3 py-2.5 text-center text-xs font-bold text-muted">
                  Default plan — no sign-up needed
                </div>
              ) : (
                <button
                  className="btn-primary mt-5 w-full"
                  disabled={isCurrent || upgrading === plan.tier}
                  onClick={() => upgrade(plan.tier as Exclude<SubscriptionTier, "FREE">)}
                >
                  {isCurrent ? "Active" : upgrading === plan.tier ? "Redirecting…" : `Upgrade to ${TIER_LABEL[plan.tier]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {myPlan?.subscriptionExpiresAt && myPlan.tier !== "FREE" && (
        <p className="mt-4 text-center text-sm text-muted">
          Your {TIER_LABEL[myPlan.tier]} plan renews/expires on{" "}
          {new Date(myPlan.subscriptionExpiresAt).toLocaleDateString()} — upgrade again before then to keep the
          discounted rate.
        </p>
      )}
    </div>
  );
}
