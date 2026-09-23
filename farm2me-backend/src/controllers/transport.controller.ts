import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendSms } from "../services/infobip.service";
import { notify } from "../services/notification.service";
import { haversineKm } from "../utils/geo";
import { round2 } from "../services/fees.service";
import { acceptLoadSchema, dispatchLoadSchema, makeOfferSchema } from "../validators/transport.validators";

const CRATE_CAPACITY_KG = 50;
const PROXIMITY_RADIUS_KM = 100;

// A trip loaded with everything needed to describe a load.
const tripInclude = {
  listing: { include: { farmer: true } },
  pool: { include: { contributions: { include: { farmer: true } } } },
  buyer: true,
} satisfies Prisma.EscrowTripInclude;

type TripWithRelations = Prisma.EscrowTripGetPayload<{ include: typeof tripInclude }>;

interface CargoInfo {
  cargoDescription: string;
  totalWeightKg: number;
  requiredCrates: number;
  listingGrade: string | null;
  pickupLocation: string | null;
  pickupCoords: { lat: number; lng: number } | null;
  deadline: Date | null;
}

function describeCargo(trip: TripWithRelations): CargoInfo {
  if (trip.listing) {
    const { weightKg, cropType, grade, farmer, locationLabel, locationLat, locationLng } = trip.listing;
    // A listing's own location (produce stored elsewhere) wins over the
    // farmer's registered address; the farmer's dispatch-time pickup note
    // (see POST /transport/dispatch) wins over both when set, since it's the
    // most specific and most recent thing they typed for this exact trip.
    const lat = locationLat ?? farmer.locationLat;
    const lng = locationLng ?? farmer.locationLng;
    return {
      cargoDescription: `${weightKg}kg ${cropType} (Grade ${grade})`,
      totalWeightKg: weightKg,
      requiredCrates: Math.ceil(weightKg / CRATE_CAPACITY_KG),
      listingGrade: grade,
      pickupLocation: trip.pickupOverrideLabel ?? locationLabel ?? farmer.locationLabel,
      pickupCoords: lat != null && lng != null ? { lat, lng } : null,
      deadline: null,
    };
  }

  if (trip.pool) {
    const weight = trip.pool.currentWeightKg;
    const firstFarmer = trip.pool.contributions[0]?.farmer ?? null;
    return {
      cargoDescription: `${weight}kg ${trip.pool.cropType} (pooled, ${trip.pool.contributions.length} farmers)`,
      totalWeightKg: weight,
      requiredCrates: Math.ceil(weight / CRATE_CAPACITY_KG),
      listingGrade: null,
      pickupLocation: trip.pickupOverrideLabel ?? firstFarmer?.locationLabel ?? trip.pool.contractName,
      pickupCoords:
        firstFarmer?.locationLat != null && firstFarmer?.locationLng != null
          ? { lat: firstFarmer.locationLat, lng: firstFarmer.locationLng }
          : null,
      deadline: trip.pool.deadline,
    };
  }

  return {
    cargoDescription: "Unknown cargo",
    totalWeightKg: 0,
    requiredCrates: 0,
    listingGrade: null,
    pickupLocation: null,
    pickupCoords: null,
    deadline: null,
  };
}

// GET /api/transport/available-loads  (TRANSPORTER only)
export async function availableLoads(req: Request, res: Response, next: NextFunction) {
  try {
    const transporter = await prisma.user.findUnique({ where: { id: req.user!.userId } });

    const trips = await prisma.escrowTrip.findMany({
      // Only loads the farmer has actively posted (see POST
      // /transport/dispatch) — a paid, unassigned trip is otherwise not yet
      // visible to any transporter.
      where: { status: "FUNDS_LOCKED", driverId: null, dispatchedAt: { not: null } },
      orderBy: { dispatchedAt: "asc" },
      include: tripInclude,
    });

    const hasLocation = transporter?.locationLat != null && transporter?.locationLng != null;

    const loads = trips
      .map((trip) => {
        const cargo = describeCargo(trip);
        let distanceKm: number | null = null;
        if (hasLocation && cargo.pickupCoords) {
          distanceKm = haversineKm(
            transporter!.locationLat!,
            transporter!.locationLng!,
            cargo.pickupCoords.lat,
            cargo.pickupCoords.lng
          );
        }
        return {
          escrowTripId: trip.id,
          cargoDescription: cargo.cargoDescription,
          pickupLocation: cargo.pickupLocation,
          dropoffLocation: trip.buyer.locationLabel,
          logisticsFee: trip.logisticsFee,
          requiredCrates: cargo.requiredCrates,
          listingGrade: cargo.listingGrade,
          deadline: cargo.deadline,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
          // Coordinates for the load-board map pins/route line.
          pickupLat: cargo.pickupCoords?.lat ?? null,
          pickupLng: cargo.pickupCoords?.lng ?? null,
          dropoffLat: trip.buyer.locationLat,
          dropoffLng: trip.buyer.locationLng,
        };
      })
      // Proximity filter only applies when the transporter has a location set.
      .filter((load) => !hasLocation || load.distanceKm == null || load.distanceKm <= PROXIMITY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return res.json({ data: loads, count: loads.length });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/accept-load  (TRANSPORTER only)
// Accepting no longer assigns the driver outright — the farmer has the last
// word on every load, whether a driver takes it at the posted fee or
// negotiates one down (see makeOffer/acceptDeliveryOffer). "Accept load" is
// just a same-shape offer at the full posted fee, so both paths end up in
// the exact same farmer approval queue on their "My deals" page.
export async function acceptLoad(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId } = acceptLoadSchema.parse(req.body);
    const driverId = req.user!.userId;

    const trip = await prisma.escrowTrip.findUnique({
      where: { id: escrowTripId },
      include: { listing: { include: { farmer: true } }, pool: { include: { contributions: { include: { farmer: true } } } } },
    });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.status !== "FUNDS_LOCKED") {
      return res.status(400).json({ error: "This load is no longer available" });
    }
    if (trip.driverId) {
      return res.status(409).json({ error: "This load has already been accepted" });
    }

    await prisma.deliveryOffer.upsert({
      where: { tripId_driverId: { tripId: escrowTripId, driverId } },
      create: { tripId: escrowTripId, driverId, amount: trip.logisticsFee, status: "PENDING" },
      update: { amount: trip.logisticsFee, status: "PENDING" },
    });

    const farmers = trip.listing ? [trip.listing.farmer] : trip.pool?.contributions.map((c) => c.farmer) ?? [];
    await Promise.all(
      farmers.map((f) => {
        const body = "A transporter wants to take your delivery at the posted fee. Approve them in My deals.";
        notify(f.id, "OFFER_RECEIVED", "Driver offer received", body, trip.id);
        return sendSms(f.phoneNumber, body);
      })
    );

    return res.json({ success: true, message: "Sent to the farmer for approval" });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/my-loads  (TRANSPORTER only)
export async function myLoads(req: Request, res: Response, next: NextFunction) {
  try {
    const trips = await prisma.escrowTrip.findMany({
      where: { driverId: req.user!.userId },
      orderBy: { updatedAt: "desc" },
      include: tripInclude,
    });

    const loads = trips.map((trip) => {
      const cargo = describeCargo(trip);
      return {
        escrowTripId: trip.id,
        status: trip.status,
        pickupLocation: cargo.pickupLocation,
        deliveryLocation: trip.buyer.locationLabel,
        // Pickup PIN is only surfaced once the load is actually in transit.
        pickupPin: trip.status === "IN_TRANSIT" ? trip.pickupPin : null,
        logisticsFee: trip.logisticsFee,
        cargoDescription: cargo.cargoDescription,
        requiredCrates: cargo.requiredCrates,
        listingGrade: cargo.listingGrade,
        deadline: cargo.deadline,
        // Coordinates for the live map — pickup/delivery pins plus this
        // driver's own last-reported GPS position (see POST
        // /escrow/:id/location), so an in-transit trip's route/progress
        // shows alongside the open job board rather than only on its own
        // order detail page.
        pickupLat: cargo.pickupCoords?.lat ?? null,
        pickupLng: cargo.pickupCoords?.lng ?? null,
        deliveryLat: trip.buyer.locationLat,
        deliveryLng: trip.buyer.locationLng,
        driverLat: trip.driverLat,
        driverLng: trip.driverLng,
        driverLocationAt: trip.driverLocationAt,
      };
    });

    return res.json({ data: loads, count: loads.length });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/nearby-farms  (TRANSPORTER only) — every farmer with a
// location on file and at least one ACTIVE listing, for the live map's farm
// pins. Distinct from the load pins above, which only ever show a pickup
// tied to an actual paid escrow trip — this is a broader "who's growing
// what near me" view so a driver can plan ahead, not just react to jobs.
export async function nearbyFarms(req: Request, res: Response, next: NextFunction) {
  try {
    const transporter = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const hasLocation = transporter?.locationLat != null && transporter?.locationLng != null;

    const farmers = await prisma.user.findMany({
      where: {
        role: "FARMER",
        locationLat: { not: null },
        locationLng: { not: null },
        listings: { some: { status: "ACTIVE" } },
      },
      select: {
        id: true,
        fullName: true,
        farmName: true,
        locationLabel: true,
        locationLat: true,
        locationLng: true,
        listings: { where: { status: "ACTIVE" }, select: { cropType: true } },
      },
    });

    const farms = farmers
      .map((f) => {
        let distanceKm: number | null = null;
        if (hasLocation) {
          distanceKm = haversineKm(transporter!.locationLat!, transporter!.locationLng!, f.locationLat!, f.locationLng!);
        }
        return {
          farmerId: f.id,
          farmName: f.farmName || f.fullName,
          locationLabel: f.locationLabel,
          locationLat: f.locationLat,
          locationLng: f.locationLng,
          activeListings: f.listings.length,
          crops: [...new Set(f.listings.map((l) => l.cropType))],
          distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        };
      })
      .filter((f) => !hasLocation || f.distanceKm == null || f.distanceKm <= PROXIMITY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return res.json({ data: farms });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/dispatch  (FARMER only) — the farmer confirms pickup
// details and a suggested fee for one of their paid, unassigned orders and
// posts it to the load board, where every nearby transporter can see it,
// negotiate (see makeOffer), or accept it outright. Before this call the
// trip is invisible to transporters (see availableLoads' dispatchedAt
// filter). Callable again on the same trip (e.g. to fix a typo) as long as
// it's still unassigned — each call just re-posts it.
export async function dispatchLoad(req: Request, res: Response, next: NextFunction) {
  try {
    const { escrowTripId, pickupLabel, suggestedFee } = dispatchLoadSchema.parse(req.body);
    const farmerId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const trip = await tx.escrowTrip.findUnique({
        where: { id: escrowTripId },
        include: { listing: true, pool: { include: { contributions: true } }, buyer: true },
      });
      if (!trip) return { ok: false as const, status: 404, message: "Escrow trip not found" };

      const isSeller =
        trip.listing?.farmerId === farmerId || trip.pool?.contributions.some((c) => c.farmerId === farmerId);
      if (!isSeller) {
        return { ok: false as const, status: 403, message: "You're not a seller on this order" };
      }
      if (trip.status !== "FUNDS_LOCKED") {
        return { ok: false as const, status: 400, message: "This order is no longer awaiting a driver" };
      }
      if (trip.driverId) {
        return { ok: false as const, status: 409, message: "A driver is already assigned to this order" };
      }
      // Never post for more than what the buyer already paid for delivery —
      // a lower suggestion is fine and the savings go straight back to them.
      if (suggestedFee > Number(trip.logisticsFee) + 0.001) {
        return {
          ok: false as const,
          status: 400,
          message: `Suggested fee can't be more than the ₦${trip.logisticsFee} already collected for delivery`,
        };
      }

      const savings = round2(Number(trip.logisticsFee) - suggestedFee);
      await tx.escrowTrip.update({
        where: { id: escrowTripId },
        data: {
          logisticsFee: suggestedFee,
          dispatchedAt: new Date(),
          ...(pickupLabel ? { pickupOverrideLabel: pickupLabel } : {}),
        },
      });
      if (savings > 0) {
        await tx.user.update({ where: { id: trip.buyerId }, data: { walletBalance: { increment: savings } } });
      }

      return { ok: true as const };
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    // Best-effort notification to nearby transporters — the load also just
    // shows up on their board within its normal poll interval regardless.
    const farmer = await prisma.user.findUnique({ where: { id: farmerId } });
    if (farmer?.locationLat != null && farmer?.locationLng != null) {
      const nearby = await prisma.user.findMany({
        where: {
          role: "TRANSPORTER",
          isSuspended: false,
          locationLat: { not: null },
          locationLng: { not: null },
        },
        select: { id: true, phoneNumber: true, locationLat: true, locationLng: true },
      });
      const toNotify = nearby.filter(
        (d) => haversineKm(farmer.locationLat!, farmer.locationLng!, d.locationLat!, d.locationLng!) <= PROXIMITY_RADIUS_KM
      );
      await Promise.all(
        toNotify.map((d) => {
          const body = "New produce delivery job posted near you. Check your Jobs page.";
          notify(d.id, "NEW_JOB", "New delivery job nearby", body, escrowTripId);
          return sendSms(d.phoneNumber, body);
        })
      );
    }

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/loads/:escrowTripId/offers  (TRANSPORTER only) —
// InDrive-style counter-offer: instead of accepting the posted fee outright
// (acceptLoad), a driver can propose a lower one. Bounded at/under the
// trip's current logisticsFee, since that's the amount already collected
// from the buyer — accepting an offer only ever refunds the difference, it
// never asks the buyer for more (see acceptDeliveryOffer). Re-submitting
// updates the driver's existing offer back to PENDING.
export async function makeOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const escrowTripId = String(req.params.escrowTripId);
    const { amount } = makeOfferSchema.parse(req.body);
    const driverId = req.user!.userId;

    const trip = await prisma.escrowTrip.findUnique({ where: { id: escrowTripId } });
    if (!trip) return res.status(404).json({ error: "Escrow trip not found" });
    if (trip.status !== "FUNDS_LOCKED") {
      return res.status(400).json({ error: "This load is no longer open for offers" });
    }
    if (trip.driverId) {
      return res.status(409).json({ error: "This load has already been assigned" });
    }
    if (amount > Number(trip.logisticsFee)) {
      return res.status(400).json({ error: `Offer can't be more than the posted fee (₦${trip.logisticsFee})` });
    }

    const offer = await prisma.deliveryOffer.upsert({
      where: { tripId_driverId: { tripId: escrowTripId, driverId } },
      create: { tripId: escrowTripId, driverId, amount, status: "PENDING" },
      update: { amount, status: "PENDING" },
    });

    return res.status(201).json({ offer });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/my-offers  (TRANSPORTER only) — this driver's own
// pending offers, so the load board can show "Offer sent: ₦X" instead of
// the negotiate box once they've already bid on a load.
export async function myOffers(req: Request, res: Response, next: NextFunction) {
  try {
    const offers = await prisma.deliveryOffer.findMany({
      where: { driverId: req.user!.userId, status: "PENDING" },
      select: { tripId: true, amount: true, status: true },
    });
    return res.json({ data: offers });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/offers/:offerId/accept  (FARMER only) — accepting a
// driver's counter-offer assigns them to the trip at the negotiated fee and
// refunds the buyer the difference from the posted fee straight to their
// wallet (never asks for more than what's already collected). Every other
// pending offer on the same trip is rejected, since the job is now taken.
export async function acceptDeliveryOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const offerId = String(req.params.offerId);
    const farmerId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.deliveryOffer.findUnique({
        where: { id: offerId },
        include: {
          trip: { include: { listing: true, pool: { include: { contributions: true } }, buyer: true } },
          driver: true,
        },
      });
      if (!offer) return { ok: false as const, status: 404, message: "Offer not found" };
      if (offer.status !== "PENDING") {
        return { ok: false as const, status: 400, message: "This offer is no longer pending" };
      }

      const trip = offer.trip;
      const isSeller =
        trip.listing?.farmerId === farmerId || trip.pool?.contributions.some((c) => c.farmerId === farmerId);
      if (!isSeller) {
        return { ok: false as const, status: 403, message: "You're not a seller on this order" };
      }
      if (trip.status !== "FUNDS_LOCKED" || trip.driverId) {
        return { ok: false as const, status: 400, message: "This order is no longer awaiting a driver" };
      }

      const savings = round2(Number(trip.logisticsFee) - Number(offer.amount));

      await tx.escrowTrip.update({
        where: { id: trip.id },
        data: { driverId: offer.driverId, logisticsFee: offer.amount },
      });
      await tx.deliveryOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
      await tx.deliveryOffer.updateMany({
        where: { tripId: trip.id, id: { not: offer.id }, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (savings > 0) {
        await tx.user.update({ where: { id: trip.buyerId }, data: { walletBalance: { increment: savings } } });
      }

      return {
        ok: true as const,
        tripId: trip.id,
        driverId: offer.driverId,
        driverPhone: offer.driver.phoneNumber,
        buyerId: trip.buyerId,
        buyerPhone: trip.buyer.phoneNumber,
        savings,
      };
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    const acceptedBody = "Your delivery offer was accepted! Check your Jobs page.";
    notify(result.driverId, "OFFER_ACCEPTED", "Offer accepted", acceptedBody, result.tripId);
    await sendSms(result.driverPhone, acceptedBody);
    if (result.savings > 0) {
      const savingsBody = `Good news — your negotiated delivery saved you ₦${result.savings}, credited to your wallet.`;
      notify(result.buyerId, "DELIVERY_SAVINGS", "You saved on delivery", savingsBody, result.tripId);
      await sendSms(result.buyerPhone, savingsBody);
    }

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// POST /api/transport/offers/:offerId/reject  (FARMER only)
export async function rejectDeliveryOffer(req: Request, res: Response, next: NextFunction) {
  try {
    const offerId = String(req.params.offerId);
    const farmerId = req.user!.userId;

    const offer = await prisma.deliveryOffer.findUnique({
      where: { id: offerId },
      include: { trip: { include: { listing: true, pool: { include: { contributions: true } } } } },
    });
    if (!offer) return res.status(404).json({ error: "Offer not found" });

    const isSeller =
      offer.trip.listing?.farmerId === farmerId || offer.trip.pool?.contributions.some((c) => c.farmerId === farmerId);
    if (!isSeller) return res.status(403).json({ error: "You're not a seller on this order" });
    if (offer.status !== "PENDING") {
      return res.status(400).json({ error: "This offer is no longer pending" });
    }

    await prisma.deliveryOffer.update({ where: { id: offerId }, data: { status: "REJECTED" } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// GET /api/transport/nearby-drivers  (FARMER only) — lets a farmer browse
// transporters near their farm and call one directly. Always available, not
// gated on having an order to dispatch — dispatching (see POST
// /transport/dispatch) is the separate, order-specific broadcast action.
export async function nearbyDrivers(req: Request, res: Response, next: NextFunction) {
  try {
    const farmer = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    const hasLocation = farmer?.locationLat != null && farmer?.locationLng != null;

    const drivers = await prisma.user.findMany({
      where: {
        role: "TRANSPORTER",
        isSuspended: false,
        locationLat: { not: null },
        locationLng: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        locationLabel: true,
        locationLat: true,
        locationLng: true,
        isVerified: true,
        avatarUrl: true,
        ratingsReceived: { select: { rating: true } },
      },
    });

    const shaped = drivers
      .map((d) => {
        let distanceKm: number | null = null;
        if (hasLocation) {
          distanceKm = haversineKm(farmer!.locationLat!, farmer!.locationLng!, d.locationLat!, d.locationLng!);
        }
        const count = d.ratingsReceived.length;
        const average = count > 0 ? d.ratingsReceived.reduce((sum, r) => sum + r.rating, 0) / count : 0;
        return {
          driverId: d.id,
          fullName: d.fullName,
          phoneNumber: d.phoneNumber,
          locationLabel: d.locationLabel,
          lat: d.locationLat,
          lng: d.locationLng,
          isVerified: d.isVerified,
          avatarUrl: d.avatarUrl,
          ratingAverage: Math.round(average * 10) / 10,
          ratingCount: count,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        };
      })
      .filter((d) => !hasLocation || d.distanceKm == null || d.distanceKm <= PROXIMITY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    return res.json({ data: shaped });
  } catch (err) {
    return next(err);
  }
}
