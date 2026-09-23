import { z } from "zod";

// POST /api/payments/initialize — exactly one of listingId / poolId.
export const initializePaymentSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    poolId: z.string().uuid().optional(),
    // Optional: a buyer may pre-assign a driver, or leave it for a transporter
    // to claim the load via /api/transport/accept-load.
    driverId: z.string().uuid().optional(),
    // How much of a listing's weight to buy — only meaningful with
    // listingId (a pool order always buys the pool's full current weight).
    // Left unset, the controller defaults it to the listing's full weight so
    // existing "buy the whole listing" callers keep working unchanged.
    quantityKg: z.coerce.number().positive("quantityKg must be > 0").optional(),
  })
  .refine((d) => Boolean(d.listingId) !== Boolean(d.poolId), {
    message: "Provide exactly one of listingId or poolId",
  });

const pin = z.string().regex(/^\d{4}$/, "pin must be 4 digits");

export const confirmPickupSchema = z.object({
  escrowTripId: z.string().uuid(),
  pin,
});

export const confirmDeliverySchema = z.object({
  escrowTripId: z.string().uuid(),
  pin,
});

// POST /api/payments/confirm-arrival — no PIN needed, just marks the
// transporter as physically at the delivery address (see confirmArrival).
export const confirmArrivalSchema = z.object({
  escrowTripId: z.string().uuid(),
});

export const raiseDisputeSchema = z.object({
  escrowTripId: z.string().uuid(),
  reason: z.string().min(3, "reason is required"),
  evidenceUrls: z.array(z.string().url()).default([]),
});

// POST /api/payments/tip — a buyer's optional one-off tip for the
// transporter who delivered their order (only once the trip is RELEASED).
export const createTipSchema = z.object({
  escrowTripId: z.string().uuid(),
  amount: z.coerce.number().positive("amount must be > 0"),
});

export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;
export type ConfirmPickupInput = z.infer<typeof confirmPickupSchema>;
export type ConfirmDeliveryInput = z.infer<typeof confirmDeliverySchema>;
export type ConfirmArrivalInput = z.infer<typeof confirmArrivalSchema>;
export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>;
export type CreateTipInput = z.infer<typeof createTipSchema>;
