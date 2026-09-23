import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { sendSms } from "../services/infobip.service";

const CRATE_CAPACITY_KG = 50;

// Escrow statuses whose funds are still held by the platform.
const LOCKED_STATUSES = ["FUNDS_LOCKED", "IN_TRANSIT", "ARRIVED", "DISPUTED"] as const;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// 1. Dashboard overview
// ---------------------------------------------------------------------------
export async function getOverview(_req: Request, res: Response, next: NextFunction) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [totalUsers, activeListings, escrowAgg, completedTripsToday, recentTrips, listingsByCrop] =
      await Promise.all([
        prisma.user.count(),
        prisma.listing.count({ where: { status: "ACTIVE" } }),
        prisma.escrowTrip.aggregate({
          _sum: { totalAmount: true },
          where: { status: { in: [...LOCKED_STATUSES] } },
        }),
        prisma.escrowTrip.count({
          where: { status: "RELEASED", updatedAt: { gte: startOfToday() } },
        }),
        prisma.escrowTrip.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true, totalAmount: true },
        }),
        prisma.listing.groupBy({ by: ["cropType"], _count: { _all: true } }),
      ]);

    // Bucket transaction volume by day for the last 30 days (zero-filled).
    const volumeByDay = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      volumeByDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of recentTrips) {
      const key = t.createdAt.toISOString().slice(0, 10);
      if (volumeByDay.has(key)) {
        volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + Number(t.totalAmount));
      }
    }

    return res.json({
      stats: {
        totalUsers,
        activeListings,
        fundsInEscrow: Number(escrowAgg._sum.totalAmount ?? 0),
        completedTripsToday,
      },
      dailyVolume: Array.from(volumeByDay.entries()).map(([date, volume]) => ({ date, volume })),
      listingsByCrop: listingsByCrop.map((g) => ({ cropType: g.cropType, count: g._count._all })),
    });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// 2. Dispute resolution
// ---------------------------------------------------------------------------
const listDisputesSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
});

export async function listDisputes(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = listDisputesSchema.parse(req.query);
    const disputes = await prisma.dispute.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        raisedBy: { select: { fullName: true, role: true } },
        escrowTrip: { select: { id: true, totalAmount: true, status: true } },
      },
    });
    return res.json({ data: disputes });
  } catch (err) {
    return next(err);
  }
}

export async function getDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: String(req.params.id) },
      include: {
        raisedBy: { select: { id: true, fullName: true, role: true } },
        escrowTrip: {
          include: {
            buyer: { select: { id: true, fullName: true } },
            driver: { select: { id: true, fullName: true } },
            listing: { include: { farmer: { select: { id: true, fullName: true } } } },
            pool: { include: { contributions: { include: { farmer: { select: { id: true, fullName: true } } } } } },
          },
        },
      },
    });
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });

    const trip = dispute.escrowTrip;
    const farmers = trip.listing
      ? [trip.listing.farmer]
      : trip.pool?.contributions.map((c) => c.farmer) ?? [];

    return res.json({
      id: dispute.id,
      reason: dispute.reason,
      evidenceUrls: dispute.evidenceUrls,
      status: dispute.status,
      resolution: dispute.resolution,
      createdAt: dispute.createdAt,
      amountAtStake: Number(trip.totalAmount),
      escrowStatus: trip.status,
      parties: {
        buyer: trip.buyer,
        driver: trip.driver,
        farmers,
        raisedBy: dispute.raisedBy,
      },
    });
  } catch (err) {
    return next(err);
  }
}

const resolveSchema = z.object({
  ruling: z.enum(["BUYER", "FARMER"]),
  notes: z.string().min(1, "Resolution notes are required"),
});

export async function resolveDispute(req: Request, res: Response, next: NextFunction) {
  try {
    const { ruling, notes } = resolveSchema.parse(req.body);
    const dispute = await prisma.dispute.findUnique({
      where: { id: String(req.params.id) },
      include: {
        escrowTrip: {
          include: {
            listing: { select: { farmerId: true } },
            pool: { include: { contributions: true } },
          },
        },
      },
    });
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });
    if (dispute.status === "RESOLVED") {
      return res.status(400).json({ error: "Dispute already resolved" });
    }

    const trip = dispute.escrowTrip;
    const totalAmount = Number(trip.totalAmount);
    const farmerPayout = Number(trip.farmerPayout);

    const farmerIds = trip.listing
      ? [trip.listing.farmerId]
      : trip.pool?.contributions.map((c) => c.farmerId) ?? [];

    await prisma.$transaction(async (tx) => {
      if (ruling === "BUYER") {
        // Refund the buyer the full escrow amount; penalise the farmer(s).
        await tx.user.update({
          where: { id: trip.buyerId },
          data: { walletBalance: { increment: totalAmount } },
        });
        if (farmerIds.length) {
          await tx.user.updateMany({
            where: { id: { in: farmerIds } },
            data: { isFlagged: true, flagReason: "Lost dispute (buyer favour)" },
          });
        }
      } else {
        // Release the goods value to the farmer(s); penalise the driver.
        const totalWeight = trip.pool?.currentWeightKg ?? 0;
        if (trip.pool && totalWeight > 0) {
          for (const c of trip.pool.contributions) {
            const share = Math.round(farmerPayout * (c.weightKg / totalWeight) * 100) / 100;
            await tx.user.update({
              where: { id: c.farmerId },
              data: { walletBalance: { increment: share } },
            });
          }
        } else if (farmerIds.length) {
          await tx.user.update({
            where: { id: farmerIds[0] },
            data: { walletBalance: { increment: farmerPayout } },
          });
        }
        if (trip.driverId) {
          await tx.user.update({
            where: { id: trip.driverId },
            data: { isFlagged: true, flagReason: "Lost dispute (farmer favour)" },
          });
        }
      }

      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: "RESOLVED", resolution: `[${ruling}] ${notes}` },
      });
      await tx.escrowTrip.update({ where: { id: trip.id }, data: { status: "RELEASED" } });
    });

    return res.json({ success: true, ruling });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// 3. Transporter verification
// ---------------------------------------------------------------------------
export async function pendingTransporters(_req: Request, res: Response, next: NextFunction) {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: "TRANSPORTER", isVerified: false, isSuspended: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, fullName: true, phoneNumber: true, createdAt: true },
    });
    return res.json({ data: drivers });
  } catch (err) {
    return next(err);
  }
}

export async function approveUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { isVerified: true, isSuspended: false },
      select: { id: true, fullName: true, isVerified: true },
    });
    await sendSms(
      (await prisma.user.findUnique({ where: { id: user.id }, select: { phoneNumber: true } }))!.phoneNumber,
      "Your Farm2Me driver account is verified. You can now accept loads."
    );
    return res.json({ success: true, user });
  } catch (err) {
    return next(err);
  }
}

export async function suspendUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { isSuspended: true, isVerified: false },
      select: { id: true, fullName: true, isSuspended: true },
    });
    return res.json({ success: true, user });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Live escrow tracker
// ---------------------------------------------------------------------------
export async function inTransitTrips(_req: Request, res: Response, next: NextFunction) {
  try {
    const trips = await prisma.escrowTrip.findMany({
      where: { status: { in: ["IN_TRANSIT", "ARRIVED"] } },
      orderBy: { updatedAt: "asc" },
      include: {
        buyer: { select: { fullName: true, locationLabel: true } },
        driver: { select: { fullName: true } },
        listing: { include: { farmer: { select: { locationLabel: true } } } },
        pool: { select: { cropType: true, currentWeightKg: true, contractName: true } },
      },
    });

    const now = Date.now();
    const data = trips.map((t) => {
      const cargo = t.listing
        ? `${t.listing.weightKg}kg ${t.listing.cropType} (Grade ${t.listing.grade})`
        : t.pool
        ? `${t.pool.currentWeightKg}kg ${t.pool.cropType} (pooled)`
        : "Unknown cargo";
      const pickup = t.listing?.farmer.locationLabel ?? t.pool?.contractName ?? "Farm";
      // updatedAt approximates when the trip entered IN_TRANSIT.
      const hoursInTransit = Math.round(((now - t.updatedAt.getTime()) / 3_600_000) * 10) / 10;
      const band = hoursInTransit > 48 ? "red" : hoursInTransit >= 24 ? "amber" : "green";
      return {
        escrowTripId: t.id,
        cargo,
        requiredCrates: Math.ceil(
          (t.listing?.weightKg ?? t.pool?.currentWeightKg ?? 0) / CRATE_CAPACITY_KG
        ),
        route: { pickup, dropoff: t.buyer.locationLabel ?? "Buyer" },
        driverName: t.driver?.fullName ?? "Unassigned",
        buyerName: t.buyer.fullName,
        amountLocked: Number(t.totalAmount),
        hoursInTransit,
        band,
      };
    });

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}
