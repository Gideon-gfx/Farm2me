import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createRatingSchema, createGeneralRatingSchema } from "../validators/rating.validators";

// POST /api/ratings  (BUYER only) — rate a farmer or transporter who helped
// fulfil one of the buyer's own completed orders. Only allowed once the trip
// is RELEASED (the order actually happened and paid out), and only for a
// party who was actually on that trip — enforced below rather than trusted
// from the client.
export async function createRating(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, rateeId, rating, comment } = createRatingSchema.parse(req.body);
    const raterId = req.user!.userId;

    const trip = await prisma.escrowTrip.findUnique({
      where: { id: escrowTripId },
      include: {
        listing: { select: { farmerId: true } },
        pool: { include: { contributions: { select: { farmerId: true } } } },
      },
    });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.buyerId !== raterId) {
      return res.status(403).json({ error: "You are not the buyer for this trip" });
    }
    if (trip.status !== "RELEASED") {
      return res.status(400).json({ error: "You can only rate an order once it's completed" });
    }

    const validRateeIds = new Set<string>([
      ...(trip.listing ? [trip.listing.farmerId] : []),
      ...(trip.pool?.contributions.map((c) => c.farmerId) ?? []),
      ...(trip.driverId ? [trip.driverId] : []),
    ]);
    if (!validRateeIds.has(rateeId)) {
      return res.status(400).json({ error: "This person wasn't part of that order" });
    }

    const created = await prisma.rating.create({
      data: { tripId: escrowTripId, raterId, rateeId, rating, comment },
    });

    return res.status(201).json({ rating: created });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "You've already rated this person for this order" });
    }
    return next(err);
  }
}

// GET /api/ratings/user/:userId  (public) — average + recent ratings, shown
// on a farmer/transporter's profile card so counterparties can gauge trust
// before dealing with them.
export async function getUserRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);

    const [agg, recent] = await Promise.all([
      prisma.rating.aggregate({
        where: { rateeId: userId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.rating.findMany({
        where: { rateeId: userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { rater: { select: { fullName: true } } },
      }),
    ]);

    return res.json({
      average: agg._avg.rating ?? 0,
      count: agg._count.rating,
      ratings: recent.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        raterName: r.rater.fullName,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/ratings/general  (BUYER only) — a product-page review, not tied
// to a specific completed order (unlike POST /api/ratings, which requires a
// RELEASED trip). One per buyer per farmer/transporter, enforced here since
// a null tripId can't be deduped by the trip-scoped unique index.
export async function createGeneralRating(req: Request, res: Response, next: NextFunction) {
  try {
    const { rateeId, rating, comment } = createGeneralRatingSchema.parse(req.body);
    const raterId = req.user!.userId;

    if (rateeId === raterId) {
      return res.status(400).json({ error: "You can't rate yourself" });
    }

    const existing = await prisma.rating.findFirst({
      where: { tripId: null, raterId, rateeId },
    });
    if (existing) {
      return res.status(409).json({ error: "You've already reviewed this person" });
    }

    const created = await prisma.rating.create({
      data: { tripId: null, raterId, rateeId, rating, comment },
    });

    return res.status(201).json({ rating: created });
  } catch (err) {
    return next(err);
  }
}

// GET /api/ratings/trip/:tripId/mine  (protected) — which rateeIds the
// signed-in caller has already rated for this trip, so the UI can hide
// "rate" controls for people already rated.
export async function getMyRatingsForTrip(req: Request, res: Response, next: NextFunction) {
  try {
    const tripId = String(req.params.tripId);
    const ratings = await prisma.rating.findMany({
      where: { tripId, raterId: req.user!.userId },
      select: { rateeId: true, rating: true, comment: true },
    });
    return res.json({ ratings });
  } catch (err) {
    return next(err);
  }
}
