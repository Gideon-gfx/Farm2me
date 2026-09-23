import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

const createSchema = z.object({
  escrowTripId: z.string().uuid(),
  reason: z.string().min(3),
  evidenceUrls: z.array(z.string().url()).default([]),
});

// Any party to a trip can raise a dispute; it also flags the trip as DISPUTED.
router.post("/", authenticate, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          escrowTripId: data.escrowTripId,
          raisedById: req.user!.userId,
          reason: data.reason,
          evidenceUrls: data.evidenceUrls,
        },
      });
      await tx.escrowTrip.update({
        where: { id: data.escrowTripId },
        data: { status: "DISPUTED" },
      });
      return created;
    });
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
});

const resolveSchema = z.object({ resolution: z.string().min(3) });

// Admin resolves a dispute.
router.post("/:id/resolve", authenticate, authorize("ADMIN"), async (req, res, next) => {
  try {
    const { resolution } = resolveSchema.parse(req.body);
    const dispute = await prisma.dispute.update({
      where: { id: String(req.params.id) },
      data: { resolution, status: "RESOLVED" },
    });
    res.json(dispute);
  } catch (err) {
    next(err);
  }
});

export default router;
