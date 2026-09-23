import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createListingSchema, updateListingSchema, listListingsSchema } from "../validators/listing.validators";
import { MAX_SEARCH_RADIUS_KM } from "../config/fees";

// Great-circle distance between two coordinates, in kilometres.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/listings/create  (FARMER only, multipart/form-data)
export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createListingSchema.parse(req.body);
    const farmerId = req.user!.userId;

    // multer-storage-cloudinary puts the Cloudinary secure_url on `file.path`.
    // .fields() shapes req.files as { images?: File[], videos?: File[] }.
    const filesByField = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const imageUrls = (filesByField.images ?? []).map((f) => f.path);
    const videoUrls = (filesByField.videos ?? []).map((f) => f.path);

    const totalPrice = data.weightKg * data.pricePerKg;

    if (data.isPooled && data.poolId) {
      const poolId = data.poolId;

      const result = await prisma.$transaction(async (tx) => {
        const pool = await tx.villagePool.findUnique({ where: { id: poolId } });
        if (!pool) throw new HttpError(404, "Pool not found");
        if (pool.status !== "OPEN") throw new HttpError(400, "Pool is not open for contributions");
        if (pool.deadline.getTime() < Date.now()) throw new HttpError(400, "Pool deadline has passed");

        const listing = await tx.listing.create({
          data: {
            farmerId,
            cropType: data.cropType,
            weightKg: data.weightKg,
            pricePerKg: data.pricePerKg,
            totalPrice,
            grade: data.grade,
            imageUrls,
            videoUrls,
            isPooled: true,
            poolId,
            ...(data.locationLabel ? { locationLabel: data.locationLabel } : {}),
            ...(data.locationLat !== undefined ? { locationLat: data.locationLat, locationLng: data.locationLng } : {}),
          },
        });

        await tx.poolContribution.create({
          data: { poolId, farmerId, weightKg: data.weightKg },
        });

        const updatedPool = await tx.villagePool.update({
          where: { id: poolId },
          data: { currentWeightKg: { increment: data.weightKg } },
        });

        let poolStatus = updatedPool.status;
        if (updatedPool.currentWeightKg >= updatedPool.targetWeightKg) {
          const locked = await tx.villagePool.update({
            where: { id: poolId },
            data: { status: "LOCKED" },
          });
          poolStatus = locked.status;
          // eslint-disable-next-line no-console
          console.log(
            `[pool ${poolId}] target reached (${updatedPool.currentWeightKg}/${updatedPool.targetWeightKg}kg) — LOCKED and ready for transport matching`
          );
        }

        return { listing, poolStatus, poolCurrentWeightKg: updatedPool.currentWeightKg };
      });

      return res.status(201).json(result);
    }

    // Non-pooled listing.
    const listing = await prisma.listing.create({
      data: {
        farmerId,
        cropType: data.cropType,
        weightKg: data.weightKg,
        pricePerKg: data.pricePerKg,
        totalPrice,
        minOrderKg: data.minOrderKg,
        grade: data.grade,
        imageUrls,
        videoUrls,
        isPooled: false,
        ...(data.locationLabel ? { locationLabel: data.locationLabel } : {}),
        ...(data.locationLat !== undefined ? { locationLat: data.locationLat, locationLng: data.locationLng } : {}),
      },
    });

    return res.status(201).json({ listing });
  } catch (err) {
    return next(err);
  }
}

// GET /api/listings  (public, paginated + filterable)
//
// When the caller sends a viewer lat/lng, listings are sorted nearest-first
// and — beyond the search radius (100km by default, or `radiusKm`) — every
// remaining located listing is surfaced separately in `farData`, so a buyer
// with no local supply can still browse and buy from a farmer further away
// (similar fallback pattern to GET /pools, though pools still gate their far
// bucket on FAR_LISTING_THRESHOLD_KM specifically). Without lat/lng,
// behaviour is unchanged: every matching listing is returned newest-first,
// farData empty.
export async function listListings(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listListingsSchema.parse(req.query);

    const where: Prisma.ListingWhereInput = { status: "ACTIVE" };
    if (q.cropType) where.cropType = { equals: q.cropType, mode: "insensitive" };
    if (q.grade) where.grade = q.grade;
    if (q.isPooled !== undefined) where.isPooled = q.isPooled;

    const hasViewerLocation = q.lat !== undefined && q.lng !== undefined;

    const farmerSelect = {
      select: { fullName: true, farmName: true, locationLabel: true, locationLat: true, locationLng: true },
    } as const;

    if (hasViewerLocation) {
      // Radius is a viewer-requested search filter (not stored per-listing),
      // so this has to be sorted/filtered in memory rather than a single SQL
      // bounding box — same approach GET /pools already uses.
      const radiusKm = q.radiusKm ?? MAX_SEARCH_RADIUS_KM;
      const candidates = await prisma.listing.findMany({
        where,
        include: { farmer: farmerSelect },
      });

      const withDistance = candidates.map((l) => {
        // A listing's own location (produce stored elsewhere) wins over the
        // farmer's registered address for distance/sorting purposes too.
        const lat = l.locationLat ?? l.farmer.locationLat;
        const lng = l.locationLng ?? l.farmer.locationLng;
        return {
          listing: l,
          distanceKm: lat != null && lng != null ? haversineKm(q.lat!, q.lng!, lat, lng) : null,
        };
      });

      const near = withDistance.filter(({ distanceKm }) => distanceKm == null || distanceKm <= radiusKm);
      // Everything else located goes in "far" — previously this only kicked
      // in beyond a separate, larger threshold, silently dropping any
      // listing between the near radius and that threshold (e.g. 100–200km
      // away) from both buckets entirely.
      const far = withDistance.filter(({ distanceKm }) => distanceKm != null && distanceKm > radiusKm);

      // Closer listings first; listings with no farmer location (so distance
      // is unknown) sort after every located one, then by recency.
      near.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return b.listing.createdAt.getTime() - a.listing.createdAt.getTime();
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
      far.sort((a, b) => a.distanceKm! - b.distanceKm!);

      const total = near.length;
      const start = (q.page - 1) * q.limit;
      const items = near.slice(start, start + q.limit).map(({ listing, distanceKm }) => shapeListing(listing, distanceKm));
      // Nationwide fallback — capped, since it's a "browse for a lead" view
      // rather than a paginated primary result set.
      const farData = far.slice(0, 30).map(({ listing, distanceKm }) => shapeListing(listing, distanceKm));

      return res.json({ ...buildPage(items, total, q.page, q.limit), farData });
    }

    const [total, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { farmer: farmerSelect },
      }),
    ]);

    return res.json({ ...buildPage(rows.map((r) => shapeListing(r)), total, q.page, q.limit), farData: [] });
  } catch (err) {
    return next(err);
  }
}

// GET /api/listings/:id  (public)
export async function getListing(req: Request, res: Response, next: NextFunction) {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: String(req.params.id) },
      include: {
        farmer: {
          select: {
            id: true,
            fullName: true,
            farmName: true,
            phoneNumber: true,
            locationLabel: true,
            locationLat: true,
            locationLng: true,
            isVerified: true,
            avatarUrl: true,
          },
        },
        pool: true,
      },
    });

    if (!listing) return res.status(404).json({ error: "Listing not found" });
    return res.json({ listing });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/listings/:id  (FARMER only, own listing only)
export async function deleteListing(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const listing = await prisma.listing.findUnique({ where: { id } });

    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.farmerId !== req.user!.userId) {
      return res.status(403).json({ error: "You can only delete your own listings" });
    }
    if (listing.status !== "ACTIVE") {
      return res.status(400).json({ error: "Only ACTIVE listings can be deleted" });
    }

    const tripCount = await prisma.escrowTrip.count({ where: { listingId: id } });
    if (tripCount > 0) {
      return res.status(400).json({ error: "Listing is part of an escrow trip and cannot be deleted" });
    }

    await prisma.$transaction(async (tx) => {
      if (listing.isPooled && listing.poolId) {
        const poolId = listing.poolId;

        // Remove this farmer's matching contribution from the pool ledger.
        const contribution = await tx.poolContribution.findFirst({
          where: { poolId, farmerId: listing.farmerId, weightKg: listing.weightKg },
        });
        if (contribution) {
          await tx.poolContribution.delete({ where: { id: contribution.id } });
        }

        const pool = await tx.villagePool.update({
          where: { id: poolId },
          data: { currentWeightKg: { decrement: listing.weightKg } },
        });

        // If a LOCKED pool drops back below target, reopen it for contributions.
        if (pool.status === "LOCKED" && pool.currentWeightKg < pool.targetWeightKg) {
          await tx.villagePool.update({ where: { id: poolId }, data: { status: "OPEN" } });
        }
      }

      await tx.listing.delete({ where: { id } });
    });

    return res.json({ success: true, message: "Listing deleted" });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/listings/:id  (FARMER only, own listing)
//
// Same safety bar as delete — only a plain ACTIVE, unpooled listing with no
// escrow trip yet can be edited, since a pooled listing's weight is already
// reflected in the pool's ledger and an escrowed one has a buyer's money
// already committed against its current numbers.
export async function updateListing(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const data = updateListingSchema.parse(req.body);

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (listing.farmerId !== req.user!.userId) {
      return res.status(403).json({ error: "You can only edit your own listings" });
    }
    if (listing.status !== "ACTIVE") {
      return res.status(400).json({ error: "Only ACTIVE listings can be edited" });
    }
    if (listing.isPooled) {
      return res.status(400).json({ error: "Pooled listings can't be edited — remove it from the pool first" });
    }

    const tripCount = await prisma.escrowTrip.count({ where: { listingId: id } });
    if (tripCount > 0) {
      return res.status(400).json({ error: "Listing is part of an escrow trip and cannot be edited" });
    }

    const weightKg = data.weightKg ?? Number(listing.weightKg);
    const pricePerKg = data.pricePerKg ?? Number(listing.pricePerKg);
    const minOrderKg = data.minOrderKg ?? listing.minOrderKg;

    if (minOrderKg > weightKg) {
      return res.status(400).json({ error: "minOrderKg can't be more than the total weight" });
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        ...(data.cropType ? { cropType: data.cropType } : {}),
        ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
        ...(data.pricePerKg !== undefined ? { pricePerKg: data.pricePerKg } : {}),
        ...(data.minOrderKg !== undefined ? { minOrderKg: data.minOrderKg } : {}),
        ...(data.grade ? { grade: data.grade } : {}),
        // Empty string clears the override back to the farmer's own profile
        // location; a non-empty one sets/replaces it.
        ...(data.locationLabel !== undefined ? { locationLabel: data.locationLabel || null } : {}),
        ...(data.locationLat !== undefined ? { locationLat: data.locationLat, locationLng: data.locationLng } : {}),
        // Recompute whenever either factor changes.
        ...(data.weightKg !== undefined || data.pricePerKg !== undefined
          ? { totalPrice: weightKg * pricePerKg }
          : {}),
      },
    });

    return res.json({ listing: updated });
  } catch (err) {
    return next(err);
  }
}

// --- helpers ---

type ListingWithFarmer = Prisma.ListingGetPayload<{
  include: {
    farmer: { select: { fullName: true; farmName: true; locationLabel: true; locationLat: true; locationLng: true } };
  };
}>;

function shapeListing(l: ListingWithFarmer, distanceKm?: number | null) {
  const { farmer, ...listing } = l;
  return {
    ...listing,
    // The farmer's chosen public farm name, falling back to their personal
    // name when they haven't set one — this is what buyers see everywhere
    // a listing surfaces (search results, cards, detail page).
    farmerName: farmer.farmName || farmer.fullName,
    // A listing's own location (set when the produce isn't at the farmer's
    // registered address) wins; otherwise fall back to the farmer's own
    // saved profile location. Approximate coordinates only — used to plot
    // nearby farms on the product page's map, same privacy trade-off as
    // showing an area pin instead of the exact address.
    locationLabel: listing.locationLabel ?? farmer.locationLabel,
    locationLat: listing.locationLat ?? farmer.locationLat,
    locationLng: listing.locationLng ?? farmer.locationLng,
    // Present only when the list was requested with a viewer lat/lng.
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
  };
}

function buildPage<T>(items: T[], total: number, page: number, limit: number) {
  return {
    data: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// Lightweight HTTP error carrying a status code, surfaced by the error handler.
class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
