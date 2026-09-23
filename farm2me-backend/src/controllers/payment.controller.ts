import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import * as monnify from "../services/monnify.service";
import { sendSms } from "../services/infobip.service";
import { notify } from "../services/notification.service";
import { haversineKm } from "../utils/geo";
import { customerEmailFor } from "../utils/customerEmail";
import { computeCheckoutFees, effectiveTier, netPayout, round2 } from "../services/fees.service";
import { SUBSCRIPTION_DURATION_DAYS } from "../config/fees";
import {
  initializePaymentSchema,
  confirmPickupSchema,
  confirmDeliverySchema,
  confirmArrivalSchema,
  raiseDisputeSchema,
  createTipSchema,
} from "../validators/payment.validators";

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Best-effort pickup point for a listing/pool order — mirrors
// transport.controller.ts's describeCargo, since the same "where does this
// load originate" question applies to both distance-based pricing and
// transporter matching.
function pickupCoords(
  listing: {
    locationLat: number | null;
    locationLng: number | null;
    farmer: { locationLat: number | null; locationLng: number | null };
  } | null,
  pool: { contributions: { farmer: { locationLat: number | null; locationLng: number | null } }[] } | null
): { lat: number; lng: number } | null {
  // A listing's own location (produce stored elsewhere) wins over the
  // farmer's registered address — a pool order has no per-listing override,
  // so it always uses the first contributing farmer's own location.
  const lat = listing ? listing.locationLat ?? listing.farmer.locationLat : pool?.contributions[0]?.farmer.locationLat;
  const lng = listing ? listing.locationLng ?? listing.farmer.locationLng : pool?.contributions[0]?.farmer.locationLng;
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

// Distance is a best-effort input to a standard per-km rate, not a security
// boundary — if either end hasn't set a location yet, fall back to a
// conservative flat estimate rather than blocking checkout entirely.
const FALLBACK_DISTANCE_KM = 15;

function generatePin(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, "0");
}

// Shared by initializePayment and quotePayment — resolves the goods value and
// pickup/dropoff distance for a listing or pool order, then runs the fee
// calculation for the given buyer. Returns an error tuple instead of
// throwing so both callers can turn it into the right HTTP response.
//
// `quantityKg` (listing orders only) lets a buyer purchase part of a
// listing's weight instead of always the whole thing — left unset, it
// defaults to the listing's full remaining weight so old "buy it all"
// behaviour is unchanged. Bounded by the listing's own minOrderKg/weightKg.
async function resolveOrderFees(
  listingId: string | undefined,
  poolId: string | undefined,
  buyerId: string,
  quantityKg?: number
) {
  let farmerPayout: number;
  let coords: { lat: number; lng: number } | null;
  let resolvedQuantityKg: number | null = null;
  let weightKg: number;
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { farmer: { select: { locationLat: true, locationLng: true } } },
    });
    if (!listing) return { ok: false as const, status: 404, message: "Listing not found" };
    if (listing.status !== "ACTIVE") {
      return { ok: false as const, status: 400, message: "Listing is not available for purchase" };
    }

    const available = listing.weightKg;
    const qty = quantityKg ?? available;
    if (qty < listing.minOrderKg) {
      return { ok: false as const, status: 400, message: `Minimum order for this listing is ${listing.minOrderKg}kg` };
    }
    if (qty > available + 0.001) {
      return { ok: false as const, status: 400, message: `Only ${available}kg left on this listing` };
    }

    farmerPayout = Number(listing.pricePerKg) * qty;
    resolvedQuantityKg = qty;
    weightKg = qty;
    coords = pickupCoords(listing, null);
  } else {
    const pool = await prisma.villagePool.findUnique({
      where: { id: poolId! },
      include: { contributions: { include: { farmer: { select: { locationLat: true, locationLng: true } } } } },
    });
    if (!pool) return { ok: false as const, status: 404, message: "Pool not found" };
    farmerPayout = Number(pool.pricePerKg) * pool.currentWeightKg;
    weightKg = pool.currentWeightKg;
    coords = pickupCoords(null, pool);
  }

  const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
  if (!buyer) return { ok: false as const, status: 404, message: "Buyer not found" };

  const distanceKm =
    coords && buyer.locationLat != null && buyer.locationLng != null
      ? haversineKm(coords.lat, coords.lng, buyer.locationLat, buyer.locationLng)
      : FALLBACK_DISTANCE_KM;

  const fees = computeCheckoutFees(farmerPayout, distanceKm, effectiveTier(buyer), weightKg);
  return { ok: true as const, buyer, fees, quantityKg: resolvedQuantityKg };
}

// POST /api/payments/quote  (BUYER only) — same fee calculation as
// initializePayment, but read-only: no EscrowTrip or Monnify session is
// created. Lets the frontend show the real, distance/tier-aware breakdown
// before the buyer commits to paying.
export async function quotePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { listingId, poolId, quantityKg } = initializePaymentSchema.parse(req.body);
    const result = await resolveOrderFees(listingId, poolId, req.user!.userId, quantityKg);
    if (!result.ok) return res.status(result.status).json({ error: result.message });

    return res.json({
      farmerPayout: result.fees.goodsValue,
      logisticsFee: result.fees.deliveryFeeGross,
      distanceKm: result.fees.distanceKm,
      buyerServiceFee: result.fees.buyerServiceFee,
      buyerVat: result.fees.buyerVat,
      totalAmount: result.fees.totalAmount,
      quantityKg: result.quantityKg,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/initialize  (BUYER only)
export async function initializePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const { listingId, poolId, driverId, quantityKg } = initializePaymentSchema.parse(req.body);
    const buyerId = req.user!.userId;

    // A driver is optional at this stage; if provided it must be a TRANSPORTER.
    if (driverId) {
      const driver = await prisma.user.findUnique({ where: { id: driverId } });
      if (!driver || driver.role !== "TRANSPORTER") {
        return res.status(400).json({ error: "driverId must reference a TRANSPORTER" });
      }
    }

    const result = await resolveOrderFees(listingId, poolId, buyerId, quantityKg);
    if (!result.ok) return res.status(result.status).json({ error: result.message });
    const { buyer, fees, quantityKg: resolvedQuantityKg } = result;

    // Re-check and decrement the listing's weight atomically with trip
    // creation, so two buyers racing for the same limited-quantity listing
    // can't both succeed against stock that only exists once. Monnify's
    // webhook never actually fires in dev, and even in prod the buyer's
    // money isn't at risk either way — this only guards against overselling
    // a farmer's stated weight, not against payment failure.
    let trip;
    try {
      trip = await prisma.$transaction(async (tx) => {
        if (listingId) {
          const listing = await tx.listing.findUnique({ where: { id: listingId } });
          const qty = resolvedQuantityKg!;
          if (!listing || listing.status !== "ACTIVE" || qty > Number(listing.weightKg) + 0.001) {
            throw new Error("LISTING_UNAVAILABLE");
          }
          const remaining = round2(Number(listing.weightKg) - qty);
          await tx.listing.update({
            where: { id: listingId },
            data: {
              weightKg: remaining,
              totalPrice: round2(remaining * Number(listing.pricePerKg)),
              // Fully sold out — no more of it to buy.
              ...(remaining <= 0.01 ? { status: "SOLD" as const } : {}),
            },
          });
        }

        return tx.escrowTrip.create({
          data: {
            listingId: listingId ?? null,
            poolId: poolId ?? null,
            driverId,
            buyerId,
            totalAmount: fees.totalAmount,
            logisticsFee: fees.deliveryFeeGross,
            platformFee: round2(fees.buyerServiceFee + fees.buyerVat),
            farmerPayout: fees.goodsValue,
            distanceKm: fees.distanceKm,
            listingQuantityKg: listingId ? resolvedQuantityKg : null,
            pickupPin: generatePin(),
            deliveryPin: generatePin(),
            status: "FUNDS_LOCKED",
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "LISTING_UNAVAILABLE") {
        return res.status(400).json({ error: "This listing is no longer available in that quantity" });
      }
      throw err;
    }

    const reference = `F2M-${trip.id}`;
    const init = await monnify.initializeTransaction(
      fees.totalAmount,
      customerEmailFor(buyer),
      buyer.fullName,
      reference,
      { escrowTripId: trip.id }
    );

    // Persist Monnify's transaction reference so the webhook can match it.
    await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { monnifyRef: init.transactionReference },
    });

    return res.status(201).json({
      escrowTripId: trip.id,
      checkoutUrl: init.checkoutUrl,
      transactionReference: init.transactionReference,
      amount: {
        farmerPayout: fees.goodsValue,
        logisticsFee: fees.deliveryFeeGross,
        distanceKm: fees.distanceKm,
        buyerServiceFee: fees.buyerServiceFee,
        buyerVat: fees.buyerVat,
        totalAmount: fees.totalAmount,
        quantityKg: resolvedQuantityKg,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/webhook  (public, no auth) — always returns 200.
export async function monnifyWebhook(req: Request, res: Response) {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const signature = req.header("monnify-signature");

    if (!monnify.verifyWebhookSignature(rawBody, signature)) {
      // eslint-disable-next-line no-console
      console.warn("[webhook] invalid Monnify signature — ignoring");
      return res.sendStatus(200);
    }

    const body = req.body as {
      eventType?: string;
      eventData?: {
        transactionReference?: string;
        metaData?: {
          escrowTripId?: string;
          subscriptionUserId?: string;
          subscriptionTier?: "STANDARD" | "PREMIUM";
          walletDepositId?: string;
          tipId?: string;
        };
      };
    };

    if (body.eventType === "SUCCESSFUL_TRANSACTION") {
      const metaData = body.eventData?.metaData;
      if (metaData?.subscriptionUserId && metaData?.subscriptionTier) {
        await handleSuccessfulSubscriptionPayment(metaData.subscriptionUserId, metaData.subscriptionTier);
      } else if (metaData?.walletDepositId) {
        await handleSuccessfulWalletDeposit(metaData.walletDepositId);
      } else if (metaData?.tipId) {
        await handleSuccessfulTip(metaData.tipId);
      } else {
        await handleSuccessfulTransaction(body.eventData?.transactionReference, metaData?.escrowTripId);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    // Never fail a webhook — log and acknowledge so Monnify stops retrying.
    // eslint-disable-next-line no-console
    console.error("[webhook] processing error:", err);
    return res.sendStatus(200);
  }
}

// A subscription upgrade (see subscription.controller.ts) is a one-off
// Monnify payment carrying the target tier in its metadata rather than an
// EscrowTrip — apply it directly to the user on success.
async function handleSuccessfulSubscriptionPayment(userId: string, tier: "STANDARD" | "PREMIUM") {
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: { subscriptionTier: tier, subscriptionExpiresAt: expiresAt },
  });
}

// A wallet top-up (see wallet.controller.ts) is a one-off Monnify payment
// carrying the deposit's own id in metadata rather than an EscrowTrip. Guard
// on the deposit's PENDING status so a retried/duplicate webhook delivery
// can't credit the wallet twice.
async function handleSuccessfulWalletDeposit(depositId: string) {
  const deposit = await prisma.walletDeposit.findUnique({ where: { id: depositId } });
  if (!deposit) {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] no WalletDeposit for id=${depositId}`);
    return;
  }
  if (deposit.status !== "PENDING") {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] wallet deposit ${depositId} already ${deposit.status}; skipping`);
    return;
  }

  await prisma.$transaction([
    prisma.walletDeposit.update({ where: { id: depositId }, data: { status: "COMPLETED" } }),
    prisma.user.update({ where: { id: deposit.userId }, data: { walletBalance: { increment: deposit.amount } } }),
  ]);
}

// A buyer's tip (see createTip) is a one-off Monnify payment carrying the
// tip's own id in metadata. Guard on PENDING so a retried/duplicate webhook
// delivery can't credit the driver twice.
async function handleSuccessfulTip(tipId: string) {
  const tip = await prisma.tip.findUnique({ where: { id: tipId } });
  if (!tip) {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] no Tip for id=${tipId}`);
    return;
  }
  if (tip.status !== "PENDING") {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] tip ${tipId} already ${tip.status}; skipping`);
    return;
  }

  await prisma.$transaction([
    prisma.tip.update({ where: { id: tipId }, data: { status: "COMPLETED" } }),
    prisma.user.update({ where: { id: tip.driverId }, data: { walletBalance: { increment: tip.amount } } }),
  ]);

  const driver = await prisma.user.findUnique({ where: { id: tip.driverId } });
  if (driver) {
    await sendSms(driver.phoneNumber, `You received a ₦${tip.amount} tip from a buyer. Thanks for the great delivery!`);
    notify(driver.id, "TIP_RECEIVED", "Tip received", `You received a ₦${tip.amount} tip from a buyer. Thanks for the great delivery!`);
  }
}

async function handleSuccessfulTransaction(transactionReference?: string, escrowTripId?: string) {
  const trip = await prisma.escrowTrip.findFirst({
    where: {
      OR: [
        transactionReference ? { monnifyRef: transactionReference } : undefined,
        escrowTripId ? { id: escrowTripId } : undefined,
      ].filter(Boolean) as object[],
    },
    include: {
      listing: { include: { farmer: true } },
      pool: { include: { contributions: { include: { farmer: true } } } },
      driver: true,
    },
  });

  if (!trip) {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] no EscrowTrip for ref=${transactionReference} escrowTripId=${escrowTripId}`);
    return;
  }
  if (trip.status !== "FUNDS_LOCKED") {
    // eslint-disable-next-line no-console
    console.warn(`[webhook] trip ${trip.id} already in status ${trip.status}; skipping`);
    return;
  }

  if (transactionReference && trip.monnifyRef !== transactionReference) {
    await prisma.escrowTrip.update({ where: { id: trip.id }, data: { monnifyRef: transactionReference } });
  }

  // Notify funded farmer(s).
  const farmers = trip.listing
    ? [trip.listing.farmer]
    : trip.pool?.contributions.map((c) => c.farmer) ?? [];

  await Promise.all(
    farmers.map((f) => {
      const body = "Your crop sale is funded and secured in escrow. Driver will contact you.";
      notify(f.id, "ORDER_FUNDED", "Order funded", body, trip.id);
      return sendSms(f.phoneNumber, body);
    })
  );

  // Notify the assigned driver (if one is already assigned) with the pickup
  // PIN and farmer location. Unassigned loads are claimed later via accept-load.
  if (trip.driver) {
    const pickupLocation = trip.listing?.farmer.locationLabel ?? farmers[0]?.locationLabel ?? "the farm";
    const body = `New load assigned. Pickup PIN: ${trip.pickupPin}. Pick up at ${pickupLocation}.`;
    notify(trip.driver.id, "LOAD_ASSIGNED", "New load assigned", body, trip.id);
    await sendSms(trip.driver.phoneNumber, body);
  }
}

// POST /api/payments/confirm-pickup  (TRANSPORTER only)
export async function confirmPickup(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, pin } = confirmPickupSchema.parse(req.body);

    const trip = await prisma.escrowTrip.findUnique({
      where: { id: escrowTripId },
      include: { buyer: true },
    });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.driverId !== req.user!.userId) {
      return res.status(403).json({ error: "You are not the assigned driver for this trip" });
    }
    if (trip.status !== "FUNDS_LOCKED") {
      return res.status(400).json({ error: `Cannot confirm pickup from status ${trip.status}` });
    }
    if (trip.pickupPin !== pin) {
      return res.status(400).json({ error: "Invalid pickup PIN" });
    }

    const updated = await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { status: "IN_TRANSIT" },
    });

    // The buyer needs this code in hand (not the driver) so they can read it
    // out once the driver actually shows up — see confirmDelivery, now
    // callable by the driver themselves at the ARRIVED stage.
    const pickupBody = `Your order is on its way! When your driver arrives, give them this code to confirm delivery: ${trip.deliveryPin}`;
    notify(trip.buyer.id, "ORDER_IN_TRANSIT", "Order on its way", pickupBody, trip.id);
    await sendSms(trip.buyer.phoneNumber, pickupBody);
    return res.json({ success: true, status: updated.status });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/confirm-arrival  (TRANSPORTER only) — marks the driver
// as physically at the delivery address, no PIN required. Sits between
// IN_TRANSIT and DELIVERED so the buyer/farmer see "arrived, waiting for the
// code" rather than the driver silently entering the PIN with no lead-up.
export async function confirmArrival(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId } = confirmArrivalSchema.parse(req.body);

    const trip = await prisma.escrowTrip.findUnique({
      where: { id: escrowTripId },
      include: { buyer: true },
    });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.driverId !== req.user!.userId) {
      return res.status(403).json({ error: "You are not the assigned driver for this trip" });
    }
    if (trip.status !== "IN_TRANSIT") {
      return res.status(400).json({ error: `Cannot confirm arrival from status ${trip.status}` });
    }

    const updated = await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { status: "ARRIVED" },
    });

    const arrivedBody = "Your driver has arrived. Share your delivery code with them to confirm receipt.";
    notify(trip.buyer.id, "DRIVER_ARRIVED", "Driver has arrived", arrivedBody, trip.id);
    await sendSms(trip.buyer.phoneNumber, arrivedBody);
    return res.json({ success: true, status: updated.status });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/confirm-delivery  (BUYER or the assigned TRANSPORTER) —
// in person, the buyer reads their delivery PIN to the driver, who types it
// in on their own order page; the buyer can alternatively enter it
// themselves via /buyer/confirm-delivery/:id. Either way this is the single
// action that verifies the code AND releases escrow, same as before.
export async function confirmDelivery(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, pin } = confirmDeliverySchema.parse(req.body);

    const trip = await prisma.escrowTrip.findUnique({
      where: { id: escrowTripId },
      include: {
        listing: { include: { farmer: true } },
        pool: { include: { contributions: { include: { farmer: true } } } },
        driver: true,
      },
    });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    const userId = req.user!.userId;
    if (trip.buyerId !== userId && trip.driverId !== userId) {
      return res.status(403).json({ error: "You are not a party to this trip" });
    }
    if (trip.status !== "ARRIVED") {
      return res.status(400).json({ error: `Cannot confirm delivery from status ${trip.status}` });
    }
    if (trip.deliveryPin !== pin) {
      return res.status(400).json({ error: "Invalid delivery PIN" });
    }

    const farmerPayout = Number(trip.farmerPayout);
    const logisticsFee = Number(trip.logisticsFee);

    // Mark delivered before releasing funds.
    await prisma.escrowTrip.update({ where: { id: trip.id }, data: { status: "DELIVERED" } });

    // Compute each farmer's gross share, then deduct THEIR OWN current
    // subscription tier's commission+VAT — a pooled order can have several
    // farmers, each on a different tier, so this can't be a single
    // trip-level number the way the buyer/transporter fee is.
    type Share = {
      farmer: { id: string; phoneNumber: string | null; accountNumber: string | null; bankCode: string | null };
      gross: number;
      serviceFee: number;
      vat: number;
      net: number;
    };
    const farmerShares: Share[] = [];

    if (trip.listing) {
      const p = netPayout(farmerPayout, effectiveTier(trip.listing.farmer));
      farmerShares.push({ farmer: trip.listing.farmer, gross: p.gross, serviceFee: p.commission, vat: p.vat, net: p.net });
    } else if (trip.pool) {
      const totalWeight = trip.pool.currentWeightKg;
      for (const c of trip.pool.contributions) {
        const pct = totalWeight > 0 ? c.weightKg / totalWeight : 0;
        const p = netPayout(farmerPayout * pct, effectiveTier(c.farmer));
        farmerShares.push({ farmer: c.farmer, gross: p.gross, serviceFee: p.commission, vat: p.vat, net: p.net });
      }
    }

    // Let the farmer(s) know right away that delivery happened — distinct
    // from (and sent ahead of) the payout SMS further below, since that one
    // only fires once the actual disbursement completes.
    await Promise.all(
      farmerShares.map((s) => {
        const body = "Delivered! The buyer has confirmed receipt of their order. Payment is being released to your wallet.";
        notify(s.farmer.id, "ORDER_DELIVERED", "Order delivered", body, trip.id);
        return sendSms(s.farmer.phoneNumber, body);
      })
    );

    // Transporter's own commission+VAT, at THEIR current tier — computed now
    // (not at checkout) since the assigned driver, and their tier, may not
    // have been known when the buyer paid.
    const transporterPayout = trip.driver ? netPayout(logisticsFee, effectiveTier(trip.driver)) : null;

    // Build the Monnify payout array (farmers + driver), using each
    // recipient's NET amount. Recipients missing bank details are skipped
    // from the disbursement but still credited in-wallet.
    const payouts: monnify.PayoutRecipient[] = [];
    for (const s of farmerShares) {
      if (s.farmer.accountNumber && s.farmer.bankCode && s.net > 0) {
        payouts.push({
          accountNumber: s.farmer.accountNumber,
          bankCode: s.farmer.bankCode,
          amount: s.net,
          narration: "Farm2Me crop sale payout",
        });
      }
    }
    if (trip.driver?.accountNumber && trip.driver.bankCode && transporterPayout && transporterPayout.net > 0) {
      payouts.push({
        accountNumber: trip.driver.accountNumber,
        bankCode: trip.driver.bankCode,
        amount: transporterPayout.net,
        narration: "Farm2Me logistics payout",
      });
    }

    let payoutResult: monnify.SplitPayoutResult | null = null;
    if (payouts.length > 0) {
      payoutResult = await monnify.initiateSplitPayout(payouts);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[payout] trip ${trip.id}: no recipients had bank details; crediting wallets only`);
    }

    // Release escrow, persist the transporter's fee breakdown, credit wallets
    // atomically (all with NET amounts).
    await prisma.$transaction([
      prisma.escrowTrip.update({
        where: { id: trip.id },
        data: {
          status: "RELEASED",
          ...(transporterPayout
            ? {
                transporterServiceFee: transporterPayout.commission,
                transporterVat: transporterPayout.vat,
                transporterPayout: transporterPayout.net,
              }
            : {}),
        },
      }),
      ...farmerShares.map((s) =>
        prisma.user.update({
          where: { id: s.farmer.id },
          data: { walletBalance: { increment: s.net } },
        })
      ),
      ...(trip.driver && transporterPayout
        ? [
            prisma.user.update({
              where: { id: trip.driver.id },
              data: { walletBalance: { increment: transporterPayout.net } },
            }),
          ]
        : []),
    ]);

    // Notify recipients of their payout.
    await Promise.all([
      ...farmerShares.map((s) => {
        const body = `Payout released: ₦${s.net.toLocaleString()} for your Farm2Me sale.`;
        notify(s.farmer.id, "PAYOUT_RELEASED", "Payout released", body, trip.id);
        return sendSms(s.farmer.phoneNumber, body);
      }),
      trip.driver && transporterPayout && transporterPayout.net > 0
        ? (() => {
            const body = `Logistics payout released: ₦${transporterPayout.net.toLocaleString()}.`;
            notify(trip.driver!.id, "PAYOUT_RELEASED", "Payout released", body, trip.id);
            return sendSms(trip.driver!.phoneNumber, body);
          })()
        : Promise.resolve(false),
    ]);

    return res.json({
      success: true,
      status: "RELEASED",
      payout: {
        farmers: farmerShares.map((s) => ({
          farmerId: s.farmer.id,
          gross: s.gross,
          serviceFee: s.serviceFee,
          vat: s.vat,
          net: s.net,
        })),
        driver: trip.driverId && transporterPayout
          ? {
              driverId: trip.driverId,
              gross: transporterPayout.gross,
              serviceFee: transporterPayout.commission,
              vat: transporterPayout.vat,
              net: transporterPayout.net,
            }
          : null,
        batchReference: payoutResult?.batchReference ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/payments/my-orders  (BUYER only) — the signed-in buyer's purchase history.
export async function myOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const trips = await prisma.escrowTrip.findMany({
      where: { buyerId: req.user!.userId },
      include: {
        listing: { select: { cropType: true, weightKg: true, farmer: { select: { fullName: true } } } },
        pool: { select: { contractName: true } },
        driver: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      data: trips.map((t) => ({
        id: t.id,
        item: t.listing ? `${t.listing.cropType} · ${t.listing.weightKg}kg` : t.pool?.contractName ?? "Village pool order",
        party: t.listing?.farmer.fullName ?? t.pool?.contractName ?? "Farm2Me",
        status: t.status,
        totalAmount: t.totalAmount,
        createdAt: t.createdAt,
        // Delivery — the farmer arranges this after the order is placed (see
        // POST /transport/assign-driver), so it's often still unset here.
        logisticsFee: t.logisticsFee,
        driverId: t.driverId,
        driverName: t.driver?.fullName ?? null,
        driverPhone: t.driver?.phoneNumber ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/payments/my-deals  (FARMER only) — trips where this farmer is the
// seller, either directly (own listing) or via a Village Pool contribution.
export async function myDeals(req: Request, res: Response, next: NextFunction) {
  try {
    const farmerId = req.user!.userId;
    const trips = await prisma.escrowTrip.findMany({
      where: {
        OR: [{ listing: { farmerId } }, { pool: { contributions: { some: { farmerId } } } }],
      },
      include: {
        listing: { select: { cropType: true, weightKg: true } },
        pool: { select: { contractName: true, currentWeightKg: true } },
        buyer: { select: { fullName: true, phoneNumber: true, locationLabel: true, locationLat: true, locationLng: true } },
        driver: { select: { id: true, fullName: true, phoneNumber: true } },
        offers: {
          where: { status: "PENDING" },
          include: { driver: { select: { fullName: true, isVerified: true } } },
          orderBy: { amount: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      data: trips.map((t) => ({
        id: t.id,
        item: t.listing ? `${t.listing.cropType} · ${t.listing.weightKg}kg` : t.pool?.contractName ?? "Village pool order",
        cropType: t.listing?.cropType ?? t.pool?.contractName ?? "Produce",
        weightKg: t.listing?.weightKg ?? t.pool?.currentWeightKg ?? null,
        party: t.buyer.fullName,
        status: t.status,
        // A pool trip splits farmerPayout across contributors by weight share;
        // this list shows the trip's full amount, the same simplification the
        // "my listings" view already makes for pooled produce.
        amount: t.farmerPayout,
        createdAt: t.createdAt,
        // Where the order needs to go, and who's carrying it (if anyone yet)
        // — lets the farmer post this order to the load board with a
        // suggested fee (see POST /transport/dispatch).
        deliveryLocation: t.buyer.locationLabel,
        deliveryLat: t.buyer.locationLat,
        deliveryLng: t.buyer.locationLng,
        logisticsFee: t.logisticsFee,
        dispatched: t.dispatchedAt != null,
        driverId: t.driverId,
        driverName: t.driver?.fullName ?? null,
        driverPhone: t.driver?.phoneNumber ?? null,
        buyerPhone: t.buyer.phoneNumber,
        // A quick, no-map way for the farmer to see the trip is actually
        // moving — see FarmerDashboard's "Track" line. Full live map is
        // still one tap away at /orders/:id for anyone who wants it.
        driverLocationAt: t.driverLocationAt,
        // Incoming InDrive-style counter-offers from transporters (see
        // POST /transport/loads/:id/offers), cheapest first.
        offers: t.offers.map((o) => ({
          id: o.id,
          driverName: o.driver.fullName,
          isVerified: o.driver.isVerified,
          amount: o.amount,
        })),
      })),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/raise-dispute  (BUYER only)
export async function raiseDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, reason, evidenceUrls } = raiseDisputeSchema.parse(req.body);

    const trip = await prisma.escrowTrip.findUnique({ where: { id: escrowTripId } });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.buyerId !== req.user!.userId) {
      return res.status(403).json({ error: "You are not the buyer for this trip" });
    }
    if (trip.status !== "IN_TRANSIT" && trip.status !== "ARRIVED" && trip.status !== "DELIVERED") {
      return res.status(400).json({ error: "Disputes can only be raised while in transit or after delivery" });
    }
    // For delivered trips, enforce the 24-hour dispute window (updatedAt marks
    // when the trip was set to DELIVERED).
    if (trip.status === "DELIVERED" && Date.now() - trip.updatedAt.getTime() > DISPUTE_WINDOW_MS) {
      return res.status(400).json({ error: "Dispute window (24 hours after delivery) has closed" });
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: { escrowTripId, raisedById: req.user!.userId, reason, evidenceUrls },
      });
      await tx.escrowTrip.update({ where: { id: escrowTripId }, data: { status: "DISPUTED" } });
      return created;
    });

    // Production: replace with an email / Slack webhook to the ops team.
    // eslint-disable-next-line no-console
    console.error(
      `[ADMIN ALERT] Dispute ${dispute.id} raised on trip ${escrowTripId} by ${req.user!.userId}: ${reason}`
    );

    return res.status(201).json({ success: true, dispute });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments/tip  (BUYER only) — an optional, one-off tip for the
// transporter who delivered the order, only once the trip is fully RELEASED
// (delivery confirmed, escrow paid out) so a buyer only ever tips after
// seeing the job through. Goes through Monnify like a wallet top-up — the
// driver's wallet is credited on the webhook (see handleSuccessfulTip), not
// here, so it survives a buyer closing the checkout tab.
export async function createTip(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, amount } = createTipSchema.parse(req.body);
    const buyerId = req.user!.userId;

    const trip = await prisma.escrowTrip.findUnique({ where: { id: escrowTripId } });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.buyerId !== buyerId) {
      return res.status(403).json({ error: "You are not the buyer for this trip" });
    }
    if (trip.status !== "RELEASED") {
      return res.status(400).json({ error: "You can only tip after delivery is complete" });
    }
    if (!trip.driverId) {
      return res.status(400).json({ error: "This order had no transporter to tip" });
    }

    const existing = await prisma.tip.findUnique({ where: { tripId: escrowTripId } });
    if (existing) {
      return res.status(409).json({ error: "You've already tipped this order" });
    }

    const buyer = await prisma.user.findUnique({ where: { id: buyerId } });
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });

    const tip = await prisma.tip.create({
      data: { tripId: escrowTripId, buyerId, driverId: trip.driverId, amount, status: "PENDING" },
    });

    const reference = `F2M-TIP-${tip.id}`;
    const init = await monnify.initializeTransaction(
      amount,
      customerEmailFor(buyer),
      buyer.fullName,
      reference,
      { tipId: tip.id }
    );
    await prisma.tip.update({ where: { id: tip.id }, data: { monnifyRef: init.transactionReference } });

    return res.status(201).json({ tipId: tip.id, checkoutUrl: init.checkoutUrl });
  } catch (err) {
    return next(err);
  }
}

// GET /api/payments/tip/:escrowTripId  (BUYER only) — has this buyer already
// tipped this order? Lets the order page show "You tipped ₦X" instead of the
// tip form once one exists, without re-deriving it from the trip status.
export async function getTip(req: Request, res: Response, next: NextFunction) {
  try {
    const tip = await prisma.tip.findUnique({
      where: { tripId: String(req.params.escrowTripId) },
      select: { amount: true, status: true, buyerId: true },
    });
    if (tip && tip.buyerId !== req.user!.userId) {
      return res.status(403).json({ error: "You are not the buyer for this trip" });
    }
    return res.json({ tip: tip ? { amount: tip.amount, status: tip.status } : null });
  } catch (err) {
    return next(err);
  }
}
