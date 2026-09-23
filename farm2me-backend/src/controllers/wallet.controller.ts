import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import * as monnify from "../services/monnify.service";
import { customerEmailFor } from "../utils/customerEmail";
import { walletDepositSchema } from "../validators/wallet.validators";

// GET /api/wallet  (protected, any role) — balance + recent deposit history.
export async function myWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const deposits = await prisma.walletDeposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return res.json({ walletBalance: user.walletBalance, deposits });
  } catch (err) {
    return next(err);
  }
}

// POST /api/wallet/deposit  (protected, any role) — one-off Monnify checkout
// to top up the caller's own wallet balance. Starts PENDING; the webhook (see
// handleSuccessfulWalletDeposit in payment.controller.ts) credits the wallet
// once payment is confirmed, and is guarded against double-crediting by the
// deposit's own status field (same idempotency pattern as EscrowTrip).
export async function initiateDeposit(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount } = walletDepositSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const deposit = await prisma.walletDeposit.create({
      data: { userId: user.id, amount },
    });

    const reference = `F2M-WALLET-${deposit.id}`;
    const init = await monnify.initializeTransaction(
      amount,
      customerEmailFor(user),
      user.fullName,
      reference,
      { walletDepositId: deposit.id }
    );

    await prisma.walletDeposit.update({
      where: { id: deposit.id },
      data: { monnifyRef: init.transactionReference },
    });

    return res.status(201).json({
      depositId: deposit.id,
      checkoutUrl: init.checkoutUrl,
      transactionReference: init.transactionReference,
      amount,
    });
  } catch (err) {
    return next(err);
  }
}
