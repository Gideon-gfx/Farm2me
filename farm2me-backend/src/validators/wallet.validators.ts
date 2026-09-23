import { z } from "zod";

// POST /api/wallet/deposit — ₦100 minimum keeps Monnify's own transaction
// floor happy; ₦2,000,000 is a conservative ceiling for a hosted-checkout
// top-up (large sums should go through split payouts/escrow, not a wallet
// deposit).
export const walletDepositSchema = z.object({
  amount: z.number().positive().min(100).max(2_000_000),
});

export type WalletDepositInput = z.infer<typeof walletDepositSchema>;
