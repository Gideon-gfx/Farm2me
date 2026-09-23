import type { SubscriptionTier } from "@prisma/client";

// VAT is charged on the platform's commission (the service being rendered),
// not on the underlying goods value — same treatment at every tier.
export const VAT_RATE = 0.075; // 7.5%

// Per-order platform commission, charged independently to each of the three
// parties (farmer, transporter, buyer) on their own portion of the order —
// lower tiers pay less. Free-tier rate (7%) and the "retain VAT across all
// tiers" rule come directly from the pricing brief; Standard/Premium are set
// deliberately low enough to make upgrading worthwhile.
export const TIER_COMMISSION_RATE: Record<SubscriptionTier, number> = {
  FREE: 0.07,
  STANDARD: 0.04,
  PREMIUM: 0.02,
};

// Monthly subscription price, in Naira. Adjust freely — these aren't wired to
// any external pricing source.
export const SUBSCRIPTION_PRICE_NGN: Record<"STANDARD" | "PREMIUM", number> = {
  STANDARD: 2500,
  PREMIUM: 6000,
};
export const SUBSCRIPTION_DURATION_DAYS = 30;

// Standard, distance-and-weight-based delivery pricing — a flat rate per km
// plus a flat rate per kg plus a base fee, so a transporter can't inflate
// what a delivery "should" cost, and a heavier load costs proportionally
// more to move (bigger truck/more crates) even over the same distance.
// Tuned for Nigerian intra-/inter-state produce haulage; adjust to match
// real fuel/vehicle costs as needed.
export const DELIVERY_BASE_FEE_NGN = 1000;
export const DELIVERY_RATE_PER_KM_NGN = 150;
export const DELIVERY_RATE_PER_KG_NGN = 10;

// Local discovery radius (pool visibility, nearby-listing search, transporter
// load matching) — everything within this range is "local"; see
// FAR_LISTING_THRESHOLD_KM for the nationwide fallback beyond it.
export const MAX_SEARCH_RADIUS_KM = 100;

// Listings/pools farther than this show up in a separate "other regions"
// view (same state or nationwide) so a buyer/seller with no local matches can
// still find and call someone far away.
export const FAR_LISTING_THRESHOLD_KM = 200;
