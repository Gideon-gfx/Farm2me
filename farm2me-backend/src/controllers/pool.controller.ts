import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { haversineKm } from "../utils/geo";
import { FAR_LISTING_THRESHOLD_KM } from "../config/fees";
import { createPoolSchema, listPoolsSchema } from "../validators/pool.validators";

function percentageFilled(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 10000) / 100);
}

// POST /api/pools/create  (BUYER or FARMER)
//
// A buyer creates a pool as a demand contract (they set the quantity/price
// they're offering for). A farmer can also start one — for a crop or an
// animal — but only when there's no *reachable* open pool already listed for
// it (see radius check below); otherwise they should join the existing one
// instead of fragmenting supply. A farmer-created pool has no buyer yet
// (buyerId is null); any buyer can still fund it via the normal checkout
// flow, same as a buyer-created one.
//
// Every pool has an origin (the creator's own location) and a 5-10km radius
// (see createPoolSchema) — only used to decide which pools show up for a
// given viewer in listPools; it isn't a hard access boundary (same
// convention as the existing lat/lng/radiusKm search on GET /listings).
export async function createPool(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createPoolSchema.parse(req.body);
    const isFarmer = req.user!.role === "FARMER";

    const creator = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!creator || creator.locationLat == null || creator.locationLng == null) {
      return res.status(400).json({
        error: "Set your location on your profile before creating a pool — it defines the pool's origin.",
      });
    }

    if (isFarmer) {
      const openForCrop = await prisma.villagePool.findMany({
        where: { cropType: { equals: data.cropType, mode: "insensitive" }, status: "OPEN" },
      });
      const reachable = openForCrop.find((p) => {
        // A pool with no origin/radius predates this feature — treat it as
        // global (always reachable) rather than silently letting it be
        // duplicated.
        if (p.originLat == null || p.originLng == null || p.radiusKm == null) return true;
        return haversineKm(creator.locationLat!, creator.locationLng!, p.originLat, p.originLng) <= p.radiusKm;
      });
      if (reachable) {
        return res.status(409).json({
          error: `An open pool for ${data.cropType} already exists in your area — join that one instead of creating a new one.`,
          poolId: reachable.id,
        });
      }
    }

    const pool = await prisma.villagePool.create({
      data: {
        contractName: data.contractName,
        cropType: data.cropType,
        subType: data.subType,
        targetWeightKg: data.targetWeightKg,
        pricePerKg: data.pricePerKg,
        deadline: data.deadline,
        radiusKm: data.radiusKm,
        originLat: creator.locationLat,
        originLng: creator.locationLng,
        buyerId: isFarmer ? null : req.user!.userId,
        createdByFarmerId: isFarmer ? req.user!.userId : null,
        status: "OPEN",
      },
    });

    return res.status(201).json({ pool });
  } catch (err) {
    return next(err);
  }
}

// GET /api/pools  (public, paginated)
//
// When the caller sends lat/lng (their current location), pools that were
// created with a radius are only included if the caller falls within it —
// pools with no origin/radius (created before this feature, or never given
// one) are always included. Without lat/lng at all, no radius filtering
// happens (every pool is returned, same as before this feature existed).
//
// Beyond FAR_LISTING_THRESHOLD_KM (200km — same state or a different one),
// pools are surfaced separately in `farData` regardless of their own radius,
// so someone with no local matches can still find and call a distant party.
// Far results include a contact phone number, but only for signed-in callers
// (authenticateOptional on this route) — anonymous browsing doesn't get it.
export async function listPools(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listPoolsSchema.parse(req.query);

    const where: Prisma.VillagePoolWhereInput = {};
    if (q.cropType) where.cropType = { equals: q.cropType, mode: "insensitive" };
    if (q.status) where.status = q.status;

    const hasViewerLocation = q.lat !== undefined && q.lng !== undefined;
    const canSeeContact = Boolean(req.user);

    const include = {
      buyer: { select: { fullName: true, phoneNumber: true } },
      createdByFarmer: { select: { fullName: true, farmName: true, phoneNumber: true } },
      _count: { select: { contributions: true } },
    } as const;

    const shape = (p: Prisma.VillagePoolGetPayload<{ include: typeof include }>, distanceKm?: number | null) => ({
      id: p.id,
      contractName: p.contractName,
      cropType: p.cropType,
      subType: p.subType,
      targetWeightKg: p.targetWeightKg,
      currentWeightKg: p.currentWeightKg,
      percentageFilled: percentageFilled(p.currentWeightKg, p.targetWeightKg),
      deadline: p.deadline,
      status: p.status,
      pricePerKg: p.pricePerKg,
      radiusKm: p.radiusKm,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      // Farmer-created pools have no buyer yet — awaiting one to fund it.
      // createdByFarmerName prefers the farmer's public farm name over their
      // personal one, same as listings (see shapeListing).
      buyerName: p.buyer?.fullName ?? null,
      createdByFarmerName: p.createdByFarmer ? p.createdByFarmer.farmName || p.createdByFarmer.fullName : null,
      contributorCount: p._count.contributions,
    });

    const farShape = (p: Prisma.VillagePoolGetPayload<{ include: typeof include }>, distanceKm: number) => ({
      ...shape(p, distanceKm),
      contactPhone: canSeeContact ? p.buyer?.phoneNumber ?? p.createdByFarmer?.phoneNumber ?? null : null,
    });

    if (hasViewerLocation) {
      // Radius is per-pool (not a fixed search distance), so this has to be
      // filtered in memory rather than with a single SQL bounding box.
      const candidates = await prisma.villagePool.findMany({ where, include });
      const withDistance = candidates.map((p) => ({
        pool: p,
        distanceKm:
          p.originLat != null && p.originLng != null ? haversineKm(q.lat!, q.lng!, p.originLat, p.originLng) : null,
      }));

      const near = withDistance.filter(
        ({ pool: p, distanceKm }) => p.radiusKm == null || distanceKm == null || distanceKm <= p.radiusKm
      );
      const far = withDistance.filter(
        ({ distanceKm }) => distanceKm != null && distanceKm > FAR_LISTING_THRESHOLD_KM
      );

      // Closer pools first; pools with no location (so distance is unknown)
      // sort after every located one, then by deadline within each group.
      near.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return a.pool.deadline.getTime() - b.pool.deadline.getTime();
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
      far.sort((a, b) => a.distanceKm! - b.distanceKm!);

      const total = near.length;
      const start = (q.page - 1) * q.limit;
      const data = near.slice(start, start + q.limit).map(({ pool: p, distanceKm }) => shape(p, distanceKm));
      // Nationwide fallback list — capped, since it's a "browse for a lead"
      // view rather than a paginated primary result set.
      const farData = far.slice(0, 30).map(({ pool: p, distanceKm }) => farShape(p, distanceKm!));

      return res.json({
        data,
        farData,
        pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
      });
    }

    const [total, pools] = await Promise.all([
      prisma.villagePool.count({ where }),
      prisma.villagePool.findMany({
        where,
        orderBy: { deadline: "asc" }, // most urgent first
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include,
      }),
    ]);

    return res.json({
      data: pools.map((p) => shape(p)),
      farData: [],
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/pools/:id  (public) — full detail with privacy-safe contributions
export async function getPool(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = await prisma.villagePool.findUnique({
      where: { id: String(req.params.id) },
      include: {
        buyer: { select: { id: true, fullName: true } },
        createdByFarmer: { select: { fullName: true, farmName: true } },
        contributions: {
          include: { farmer: { select: { fullName: true, farmName: true, locationLabel: true } } },
          orderBy: { confirmedAt: "desc" },
        },
      },
    });

    if (!pool) return res.status(404).json({ error: "Pool not found" });

    const { contributions, ...rest } = pool;
    return res.json({
      pool: {
        ...rest,
        percentageFilled: percentageFilled(pool.currentWeightKg, pool.targetWeightKg),
        contributorCount: contributions.length,
        // Farmer-created pools have no buyer yet — awaiting one to fund it.
        // Both names prefer the farmer's public farm name over their
        // personal one, same as listings (see shapeListing).
        buyerName: pool.buyer?.fullName ?? null,
        createdByFarmerName: pool.createdByFarmer ? pool.createdByFarmer.farmName || pool.createdByFarmer.fullName : null,
        // Deliberately omit farmerId for privacy.
        contributions: contributions.map((c) => ({
          farmerName: c.farmer.farmName || c.farmer.fullName,
          locationLabel: c.farmer.locationLabel,
          weightKg: c.weightKg,
          confirmedAt: c.confirmedAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/pools/:id/my-contribution  (FARMER only)
export async function getMyContribution(req: Request, res: Response, next: NextFunction) {
  try {
    const contribution = await prisma.poolContribution.findFirst({
      where: { poolId: String(req.params.id), farmerId: req.user!.userId },
    });

    if (!contribution) {
      return res.status(404).json({ error: "No contribution found for this pool" });
    }
    return res.json({ contribution });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/pools/:poolId/withdraw  (FARMER only)
export async function withdrawContribution(req: Request, res: Response, next: NextFunction) {
  try {
    const poolId = String(req.params.poolId);
    const farmerId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const pool = await tx.villagePool.findUnique({ where: { id: poolId } });
      if (!pool) return { ok: false as const, status: 404, message: "Pool not found" };
      if (pool.status !== "OPEN") {
        return { ok: false as const, status: 400, message: "Pool is no longer open; cannot withdraw" };
      }

      const tripCount = await tx.escrowTrip.count({ where: { poolId } });
      if (tripCount > 0) {
        return { ok: false as const, status: 400, message: "An escrow trip exists for this pool; cannot withdraw" };
      }

      const contribution = await tx.poolContribution.findFirst({ where: { poolId, farmerId } });
      if (!contribution) {
        return { ok: false as const, status: 404, message: "You have no contribution to withdraw" };
      }

      await tx.poolContribution.delete({ where: { id: contribution.id } });
      const updatedPool = await tx.villagePool.update({
        where: { id: poolId },
        data: { currentWeightKg: { decrement: contribution.weightKg } },
      });

      return { ok: true as const, updatedPool, withdrawnWeightKg: contribution.weightKg };
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    return res.json({
      success: true,
      withdrawnWeightKg: result.withdrawnWeightKg,
      pool: {
        id: result.updatedPool.id,
        status: result.updatedPool.status,
        currentWeightKg: result.updatedPool.currentWeightKg,
        targetWeightKg: result.updatedPool.targetWeightKg,
        percentageFilled: percentageFilled(
          result.updatedPool.currentWeightKg,
          result.updatedPool.targetWeightKg
        ),
      },
    });
  } catch (err) {
    return next(err);
  }
}
