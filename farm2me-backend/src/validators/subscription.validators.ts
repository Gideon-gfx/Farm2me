import { z } from "zod";

// POST /api/subscriptions/upgrade
export const upgradeSubscriptionSchema = z.object({
  tier: z.enum(["STANDARD", "PREMIUM"]),
});

export type UpgradeSubscriptionInput = z.infer<typeof upgradeSubscriptionSchema>;
