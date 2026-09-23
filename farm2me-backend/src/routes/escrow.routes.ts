import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// Generates a 4-digit numeric PIN for pickup/delivery confirmation.
function generatePin(): string {
  return (crypto.randomInt(0, 10000)).toString().padStart(4, "0");
}

const createSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    poolId: z.string().uuid().optional(),
    driverId: z.string().uuid(),
    totalAmount: z.number().positive(),
    logisticsFee: z.number().min(0),
    platformFee: z.number().min(0),
  })
  .refine((d) => d.listingId || d.poolId, {
    message: "Either listingId or poolId is required",
  });

// A buyer funds an escrow trip; funds are locked until delivery is confirmed.
router.post("/", authenticate, authorize("BUYER"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const farmerPayout = data.totalAmount - data.logisticsFee - data.platformFee;

    const trip = await prisma.escrowTrip.create({
      data: {
        listingId: data.listingId,
        poolId: data.poolId,
        driverId: data.driverId,
        buyerId: req.user!.userId,
        totalAmount: data.totalAmount,
        logisticsFee: data.logisticsFee,
        platformFee: data.platformFee,
        farmerPayout,
        pickupPin: generatePin(),
        deliveryPin: generatePin(),
        status: "FUNDS_LOCKED",
      },
    });

    res.status(201).json(trip);
  } catch (err) {
    next(err);
  }
});

// Trip detail for any party involved in the trip (buyer, driver, or a farmer
// whose listing / pool contribution is being delivered). Used by the mobile
// ActiveOrder screen to render the PIN, status timeline, and driver location.
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const farmerInfo = {
      select: { fullName: true, phoneNumber: true, locationLat: true, locationLng: true, locationLabel: true },
    };
    const trip = await prisma.escrowTrip.findUnique({
      where: { id: String(req.params.id) },
      include: {
        listing: { select: { farmerId: true, cropType: true, weightKg: true, farmer: farmerInfo } },
        pool: {
          include: { contributions: { select: { farmerId: true, farmer: farmerInfo } } },
        },
        buyer: { select: { fullName: true, phoneNumber: true, locationLat: true, locationLng: true, locationLabel: true } },
        driver: { select: { fullName: true, phoneNumber: true } },
      },
    });
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const uid = req.user!.userId;
    const isBuyer = trip.buyerId === uid;
    const isDriver = trip.driverId === uid;
    const isFarmer =
      trip.listing?.farmerId === uid ||
      (trip.pool?.contributions.some((c) => c.farmerId === uid) ?? false);
    const isAdmin = req.user!.role === "ADMIN";

    if (!isBuyer && !isDriver && !isFarmer && !isAdmin) {
      return res.status(403).json({ error: "You are not a party to this trip" });
    }

    // Pickup = farmer location (listing farmer, or first pool contributor);
    // delivery = buyer location.
    const pickupFarmer = trip.listing?.farmer ?? trip.pool?.contributions[0]?.farmer ?? null;
    const pickup = {
      lat: pickupFarmer?.locationLat ?? null,
      lng: pickupFarmer?.locationLng ?? null,
      label: pickupFarmer?.locationLabel ?? null,
    };
    const delivery = {
      lat: trip.buyer.locationLat,
      lng: trip.buyer.locationLng,
      label: trip.buyer.locationLabel,
    };

    return res.json({
      pickup,
      delivery,
      id: trip.id,
      status: trip.status,
      item: trip.listing
        ? `${trip.listing.cropType} · ${trip.listing.weightKg}kg`
        : trip.pool?.contractName ?? "Village pool order",
      // Phone numbers are shown to every party already on the trip together
      // (buyer/farmer/driver/admin — the isBuyer/isDriver/isFarmer/isAdmin
      // check above already gates this whole response) so they can call each
      // other directly for pickup/delivery follow-ups outside the app.
      buyerName: trip.buyer.fullName,
      buyerPhone: trip.buyer.phoneNumber,
      farmerName: pickupFarmer?.fullName ?? null,
      farmerPhone: pickupFarmer?.phoneNumber ?? null,
      driverName: trip.driver?.fullName ?? null,
      driverPhone: trip.driver?.phoneNumber ?? null,
      // Rating targets — 1 entry for a single-listing trip, N for a pooled
      // one with several contributing farmers. Used by the buyer-side rating
      // UI once the trip is RELEASED (see ratings.routes.ts).
      farmerIds: trip.listing
        ? [trip.listing.farmerId]
        : trip.pool?.contributions.map((c) => c.farmerId) ?? [],
      driverId: trip.driverId,
      // Pickup PIN is shown to the farmer/driver; delivery PIN only to the buyer.
      pickupPin: trip.pickupPin,
      deliveryPin: isBuyer || isAdmin ? trip.deliveryPin : undefined,
      logisticsFee: trip.logisticsFee,
      totalAmount: trip.totalAmount,
      farmerPayout: trip.farmerPayout,
      driverLat: trip.driverLat,
      driverLng: trip.driverLng,
      driverLocationAt: trip.driverLocationAt,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    });
  } catch (err) {
    return next(err);
  }
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Assigned driver reports their current GPS position (polled by the buyer/farmer).
router.post("/:id/location", authenticate, authorize("TRANSPORTER"), async (req, res, next) => {
  try {
    const { lat, lng } = locationSchema.parse(req.body);
    const trip = await prisma.escrowTrip.findUnique({ where: { id: String(req.params.id) } });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.driverId !== req.user!.userId) {
      return res.status(403).json({ error: "You are not the assigned driver for this trip" });
    }

    const updated = await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { driverLat: lat, driverLng: lng, driverLocationAt: new Date() },
      select: { id: true, driverLat: true, driverLng: true, driverLocationAt: true },
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

const confirmSchema = z.object({ pin: z.string().length(4) });

// Driver confirms pickup with the pickup PIN -> trip moves to IN_TRANSIT.
router.post("/:id/pickup", authenticate, authorize("TRANSPORTER"), async (req, res, next) => {
  try {
    const { pin } = confirmSchema.parse(req.body);
    const trip = await prisma.escrowTrip.findUnique({ where: { id: String(req.params.id) } });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.pickupPin !== pin) return res.status(400).json({ error: "Invalid pickup PIN" });

    const updated = await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { status: "IN_TRANSIT" },
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

// Buyer confirms delivery with the delivery PIN -> funds RELEASED to farmer.
router.post("/:id/deliver", authenticate, authorize("BUYER"), async (req, res, next) => {
  try {
    const { pin } = confirmSchema.parse(req.body);
    const trip = await prisma.escrowTrip.findUnique({ where: { id: String(req.params.id) } });
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.deliveryPin !== pin) return res.status(400).json({ error: "Invalid delivery PIN" });

    const updated = await prisma.escrowTrip.update({
      where: { id: trip.id },
      data: { status: "RELEASED" },
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

export default router;
