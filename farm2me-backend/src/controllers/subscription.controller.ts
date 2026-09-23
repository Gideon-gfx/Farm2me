import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import * as monnify from "../services/monnify.service";
import { customerEmailFor } from "../utils/customerEmail";
import { effectiveTier } from "../services/fees.service";
import { SUBSCRIPTION_DURATION_DAYS, SUBSCRIPTION_PRICE_NGN, TIER_COMMISSION_RATE, VAT_RATE } from "../config/fees";
import { upgradeSubscriptionSchema } from "../validators/subscription.validators";

// GET /api/subscriptions/plans  (public) — pricing/commission info for the
// upgrade screen. Static config, not user-specific.
export function listPlans(_req: Request, res: Response) {
  return res.json({
    vatRate: VAT_RATE,
    plans: [
      { tier: "FREE", priceNgn: 0, commissionRate: TIER_COMMISSION_RATE.FREE },
      { tier: "STANDARD", priceNgn: SUBSCRIPTION_PRICE_NGN.STANDARD, commissionRate: TIER_COMMISSION_RATE.STANDARD },
      { tier: "PREMIUM", priceNgn: SUBSCRIPTION_PRICE_NGN.PREMIUM, commissionRate: TIER_COMMISSION_RATE.PREMIUM },
    ],
    durationDays: SUBSCRIPTION_DURATION_DAYS,
  });
}

// GET /api/subscriptions/me  (protected)
export async function myPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const tier = effectiveTier(user);
    return res.json({
      tier,
      rawTier: user.subscriptionTier,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      commissionRate: TIER_COMMISSION_RATE[tier],
      vatRate: VAT_RATE,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/subscriptions/upgrade  (protected) — one-off Monnify checkout for
// 30 days of the chosen tier; the webhook (see payment.controller.ts) applies
// it once payment succeeds. Renewal is manual — call this again before it
// lapses to keep the discounted rate.
export async function upgradeSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const { tier } = upgradeSubscriptionSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const price = SUBSCRIPTION_PRICE_NGN[tier];
    const reference = `F2M-SUB-${user.id}-${Date.now()}`;

    const init = await monnify.initializeTransaction(
      price,
      customerEmailFor(user),
      user.fullName,
      reference,
      { subscriptionUserId: user.id, subscriptionTier: tier }
    );

    return res.status(201).json({
      checkoutUrl: init.checkoutUrl,
      transactionReference: init.transactionReference,
      tier,
      priceNgn: price,
    });
  } catch (err) {
    return next(err);
  }
}
