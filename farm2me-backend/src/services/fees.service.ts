import type { SubscriptionTier } from "@prisma/client";
import {
  DELIVERY_BASE_FEE_NGN,
  DELIVERY_RATE_PER_KM_NGN,
  DELIVERY_RATE_PER_KG_NGN,
  TIER_COMMISSION_RATE,
  VAT_RATE,
} from "../config/fees";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A lapsed paid subscription (expiresAt in the past) is treated as FREE for
// fee purposes, regardless of what the raw column still says — there's no
// separate renewal job clearing it, so every fee calculation checks this
// instead of trusting subscriptionTier directly.
export function effectiveTier(user: { subscriptionTier: SubscriptionTier; subscriptionExpiresAt: Date | null }): SubscriptionTier {
  if (user.subscriptionTier === "FREE") return "FREE";
  if (user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() < Date.now()) return "FREE";
  return user.subscriptionTier;
}

// Standard distance-and-weight delivery pricing — deliberately not left up
// to the transporter, so quotes stay predictable and can't be inflated. A
// heavier order costs more to move over the same distance, not just a
// farther one.
export function calcDeliveryFee(distanceKm: number, weightKg: number): number {
  return round2(
    DELIVERY_BASE_FEE_NGN +
      Math.max(0, distanceKm) * DELIVERY_RATE_PER_KM_NGN +
      Math.max(0, weightKg) * DELIVERY_RATE_PER_KG_NGN
  );
}

export interface PartyFee {
  commission: number;
  vat: number;
  total: number;
}

// The platform's cut of one party's own portion of the order — commission at
// their subscription tier's rate, plus VAT on that commission (never on the
// underlying goods/delivery value itself).
export function commissionAndVat(gross: number, tier: SubscriptionTier): PartyFee {
  const commission = round2(gross * TIER_COMMISSION_RATE[tier]);
  const vat = round2(commission * VAT_RATE);
  return { commission, vat, total: round2(commission + vat) };
}

export interface OrderFees {
  goodsValue: number;
  distanceKm: number;
  deliveryFeeGross: number;
  buyerServiceFee: number;
  buyerVat: number;
  totalAmount: number;
}

// Computed at checkout time (initializePayment) — everything the buyer needs
// to know before paying. Farmer/transporter deductions happen later, at
// confirmDelivery, once the specific recipients (and their *current*
// subscription tiers) are known — see payment.controller.ts.
export function computeCheckoutFees(
  goodsValue: number,
  distanceKm: number,
  buyerTier: SubscriptionTier,
  weightKg: number
): OrderFees {
  const deliveryFeeGross = calcDeliveryFee(distanceKm, weightKg);
  const buyerBase = round2(goodsValue + deliveryFeeGross);
  const buyerFee = commissionAndVat(buyerBase, buyerTier);

  return {
    goodsValue: round2(goodsValue),
    distanceKm: round2(distanceKm),
    deliveryFeeGross,
    buyerServiceFee: buyerFee.commission,
    buyerVat: buyerFee.vat,
    totalAmount: round2(buyerBase + buyerFee.total),
  };
}

// A single recipient's (farmer share, or transporter) net payout after their
// own tier's commission+VAT is deducted from their gross amount.
export function netPayout(gross: number, tier: SubscriptionTier): PartyFee & { gross: number; net: number } {
  const fee = commissionAndVat(gross, tier);
  return { ...fee, gross: round2(gross), net: round2(gross - fee.total) };
}
