import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendSms } from "../services/infobip.service";
import { notify } from "../services/notification.service";
import { haversineKm } from "../utils/geo";
import {
  createTransportRequestSchema,
  submitQuoteSchema,
  counterQuoteSchema,
} from "../validators/transport.validators";

const PROXIMITY_RADIUS_KM = 100;
// A driver's quote can be nudged by the farmer up to this much either way —
// the stepper's hard bound, in ₦100 steps (see mobile QuoteCard).
const NEGOTIATION_BAND = 500;

function shapeQuote(q: {
  id: string;
  amount: Prisma.Decimal;
  proposedBy: string;
  status: string;
  updatedAt: Date;
  driver: { id: string; fullName: string; phoneNumber: string | null; locationLabel: string | null; avatarUrl: string | null; isVerified: boolean };
}) {
  return {
    id: q.id,
    driverId: q.driver.id,
    driverName: q.driver.fullName,
    driverPhone: q.driver.phoneNumber,
    driverLocationLabel: q.driver.locationLabel,
    driverAvatarUrl: q.driver.avatarUrl,
    driverIsVerified: q.driver.isVerified,
    amount: q.amount,
    proposedBy: q.proposedBy,
    status: q.status,
    minAmount: Math.max(100, Math.round(Number(q.amount) - NEGOTIATION_BAND)),
    maxAmount: Math.round(Number(q.amount) + NEGOTIATION_BAND),
    updatedAt: q.updatedAt,
  };
}

// POST /api/transport/quote-requests  (FARMER only) — broadcasts to nearby
// transporters, same proximity convention as GET /transport/nearby-drivers.
export async function createTransportRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createTransportRequestSchema.parse(req.body);
    const farmerId = req.user!.userId;

    const request = await prisma.transportRequest.create({
      data: {
        farmerId,
        destinationLabel: data.destinationLabel,
        destinationLat: data.destinationLat,
        destinationLng: data.destinationLng,
        itemDescription: data.itemDescription,
        weightKg: data.weightKg,
      },
    });

    const farmer = await prisma.user.findUnique({ where: { id: farmerId } });
    if (farmer?.locationLat != null && farmer?.locationLng != null) {
      const nearby = await prisma.user.findMany({
        where: { role: "TRANSPORTER", isSuspended: false, locationLat: { not: null }, locationLng: { not: null } },
        select: { id: true, phoneNumber: true, locationLat: true, locationLng: true },
      });
      const toNotify = nearby.filter(
        (d) => haversineKm(farmer.locationLat!, farmer.locationLng!, d.locationLat!, d.locationLng!) <= PROXIMITY_RADIUS_KM
      );
      const body = `A farmer wants to deliver ${data.weightKg}kg of ${data.itemDescription} to ${data.destinationLabel}. Check the app to quote your price.`;
      await Promise.all(
        toNotify.map((d) => {
          notify(d.id, "TRANSPORT_REQUEST", "Delivery requested nearby", body, undefined);
          return sendSms(d.phoneNumber, body);
        })
      );
    }

    return res.status(201).json({ request });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/quote-requests/:id  (FARMER only, own request) — the
// farmer's live view of every driver's current quote.
export async function getTransportRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const request = await prisma.transportRequest.findUnique({
      where: { id: String(id) },
      include: {
        quotes: {
          where: { status: { not: "REJECTED" } },
          include: {
            driver: {
              select: { id: true, fullName: true, phoneNumber: true, locationLabel: true, avatarUrl: true, isVerified: true, locationLat: true, locationLng: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!request || request.farmerId !== req.user!.userId) {
      return res.status(404).json({ error: "Transport request not found" });
    }

    return res.json({
      request: {
        id: request.id,
        destinationLabel: request.destinationLabel,
        itemDescription: request.itemDescription,
        weightKg: request.weightKg,
        status: request.status,
        driverId: request.driverId,
        agreedAmount: request.agreedAmount,
        createdAt: request.createdAt,
      },
      quotes: request.quotes.map((q) => shapeQuote(q)),
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/quote-requests  (FARMER only) — the farmer's own open
// requests, for resuming after leaving the screen.
export async function myTransportRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const requests = await prisma.transportRequest.findMany({
      where: { farmerId: req.user!.userId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ data: requests });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/quote-requests/:id/cancel  (FARMER only, own request)
export async function cancelTransportRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const request = await prisma.transportRequest.findUnique({ where: { id: String(id) } });
    if (!request || request.farmerId !== req.user!.userId) {
      return res.status(404).json({ error: "Transport request not found" });
    }
    if (request.status !== "OPEN") {
      return res.status(400).json({ error: "This request is no longer open" });
    }
    await prisma.transportRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/quote-requests/nearby  (TRANSPORTER only) — open
// requests near the driver, mirroring availableLoads' proximity filter.
export async function nearbyTransportRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const driver = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const hasLocation = driver?.locationLat != null && driver?.locationLng != null;

    const requests = await prisma.transportRequest.findMany({
      where: { status: "OPEN" },
      include: {
        farmer: { select: { fullName: true, farmName: true, locationLat: true, locationLng: true, locationLabel: true } },
        quotes: { where: { driverId: req.user!.userId } },
      },
      orderBy: { createdAt: "desc" },
    });

    const shaped = requests
      .map((r) => {
        const distanceKm =
          hasLocation && r.farmer.locationLat != null && r.farmer.locationLng != null
            ? haversineKm(driver!.locationLat!, driver!.locationLng!, r.farmer.locationLat, r.farmer.locationLng)
            : null;
        return {
          id: r.id,
          destinationLabel: r.destinationLabel,
          itemDescription: r.itemDescription,
          weightKg: r.weightKg,
          farmerName: r.farmer.farmName || r.farmer.fullName,
          pickupLocationLabel: r.farmer.locationLabel,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
          myQuote: r.quotes[0] ? shapeQuote({ ...r.quotes[0], driver: { id: req.user!.userId, fullName: "", phoneNumber: null, locationLabel: null, avatarUrl: null, isVerified: false } }) : null,
        };
      })
      .filter((r) => r.distanceKm == null || r.distanceKm <= PROXIMITY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return res.json({ data: shaped });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/quote-requests/:id/quote  (TRANSPORTER only) — the
// driver's first quote, or a fresh counter after the farmer's offer. Upsert
// since it's one mutable row per (request, driver) — see schema comment.
export async function submitQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { amount } = submitQuoteSchema.parse(req.body);
    const driverId = req.user!.userId;

    const request = await prisma.transportRequest.findUnique({ where: { id: String(id) } });
    if (!request || request.status !== "OPEN") {
      return res.status(400).json({ error: "This request is no longer open" });
    }

    const quote = await prisma.transportQuote.upsert({
      where: { requestId_driverId: { requestId: request.id, driverId } },
      create: { requestId: request.id, driverId, amount, proposedBy: "DRIVER", status: "PENDING" },
      update: { amount, proposedBy: "DRIVER", status: "PENDING" },
    });

    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    const body = `A driver quoted ₦${Number(amount).toLocaleString()} for delivery to ${request.destinationLabel}.`;
    notify(request.farmerId, "QUOTE_RECEIVED", "New delivery quote", body, undefined);
    const farmer = await prisma.user.findUnique({ where: { id: request.farmerId } });
    if (farmer) sendSms(farmer.phoneNumber, body);

    return res.json({ quote: shapeQuote({ ...quote, driver: { id: driverId, fullName: driver?.fullName ?? "", phoneNumber: driver?.phoneNumber ?? null, locationLabel: driver?.locationLabel ?? null, avatarUrl: driver?.avatarUrl ?? null, isVerified: driver?.isVerified ?? false } }) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/quotes/:quoteId/counter  (FARMER only) — the "-/+"
// stepper's "Request" action: proposes a new amount within +/-500 of the
// quote's CURRENT amount (recalculated each round, not the original quote).
export async function counterQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { quoteId } = req.params;
    const { amount } = counterQuoteSchema.parse(req.body);

    const quote = await prisma.transportQuote.findUnique({
      where: { id: String(quoteId) },
      include: { request: true, driver: true },
    });
    if (!quote || quote.request.farmerId !== req.user!.userId) {
      return res.status(404).json({ error: "Quote not found" });
    }
    if (quote.request.status !== "OPEN" || quote.status !== "PENDING") {
      return res.status(400).json({ error: "This quote is no longer open for negotiation" });
    }

    const min = Number(quote.amount) - NEGOTIATION_BAND;
    const max = Number(quote.amount) + NEGOTIATION_BAND;
    if (amount < min) return res.status(400).json({ error: `That's too low — the lowest you can offer here is ₦${Math.round(min).toLocaleString()}` });
    if (amount > max) return res.status(400).json({ error: `That's too high — the most you need to offer here is ₦${Math.round(max).toLocaleString()}` });

    const updated = await prisma.transportQuote.update({
      where: { id: quote.id },
      data: { amount, proposedBy: "FARMER" },
    });

    const body = `The farmer countered with ₦${Number(amount).toLocaleString()} for delivery to ${quote.request.destinationLabel}. Accept or send a new price.`;
    notify(quote.driverId, "QUOTE_COUNTERED", "Farmer countered your quote", body, undefined);
    sendSms(quote.driver.phoneNumber, body);

    return res.json({ quote: shapeQuote({ ...updated, driver: quote.driver }) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/quotes/:quoteId/accept  (FARMER or the quote's own
// TRANSPORTER) — accepts whatever amount is CURRENTLY on the table. You
// can't accept your own last proposal (nothing to agree to yet).
export async function acceptQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { quoteId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.transportQuote.findUnique({
        where: { id: String(quoteId) },
        include: { request: true, driver: true },
      });
      if (!quote) return { ok: false as const, status: 404, message: "Quote not found" };

      const isFarmer = role === "FARMER" && quote.request.farmerId === userId;
      const isDriver = role === "TRANSPORTER" && quote.driverId === userId;
      if (!isFarmer && !isDriver) {
        return { ok: false as const, status: 403, message: "You're not a party to this quote" };
      }
      if (quote.request.status !== "OPEN" || quote.status !== "PENDING") {
        return { ok: false as const, status: 400, message: "This quote is no longer open" };
      }
      if ((isFarmer && quote.proposedBy === "FARMER") || (isDriver && quote.proposedBy === "DRIVER")) {
        return { ok: false as const, status: 400, message: "Waiting on the other side to respond to your own offer" };
      }

      const farmer = await tx.user.findUnique({ where: { id: quote.request.farmerId } });
      if (!farmer) return { ok: false as const, status: 404, message: "Farmer not found" };
      if (Number(farmer.walletBalance) < Number(quote.amount)) {
        return { ok: false as const, status: 400, message: "Insufficient wallet balance to accept this amount" };
      }

      await tx.user.update({ where: { id: farmer.id }, data: { walletBalance: { decrement: quote.amount } } });
      await tx.transportQuote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
      await tx.transportQuote.updateMany({
        where: { requestId: quote.requestId, id: { not: quote.id }, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      await tx.transportRequest.update({
        where: { id: quote.requestId },
        data: { status: "ACCEPTED", driverId: quote.driverId, agreedAmount: quote.amount },
      });

      return {
        ok: true as const,
        farmerId: quote.request.farmerId,
        driverId: quote.driverId,
        driverName: quote.driver.fullName,
        driverPhone: quote.driver.phoneNumber,
        farmerPhone: farmer.phoneNumber,
        amount: quote.amount,
        destinationLabel: quote.request.destinationLabel,
      };
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    const amountStr = Number(result.amount).toLocaleString();
    notify(result.farmerId, "QUOTE_ACCEPTED", "Delivery request accepted", `${result.driverName} accepted your request for ₦${amountStr}.`, undefined);
    notify(result.driverId, "QUOTE_ACCEPTED", "Your quote was accepted", `Your ₦${amountStr} quote for delivery to ${result.destinationLabel} was accepted.`, undefined);
    sendSms(result.farmerPhone, `${result.driverName} accepted your request for ₦${amountStr}.`);
    sendSms(result.driverPhone, `Your ₦${amountStr} quote for delivery to ${result.destinationLabel} was accepted.`);

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}
