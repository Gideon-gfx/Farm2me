import { z } from "zod";

// POST /api/transport/accept-load
export const acceptLoadSchema = z.object({
  escrowTripId: z.string().uuid(),
});

// POST /api/transport/dispatch — the farmer posts one of their paid,
// unassigned orders to the load board with a confirmed pickup note and a
// suggested fee (capped in the controller at what the buyer already paid
// for delivery).
export const dispatchLoadSchema = z.object({
  escrowTripId: z.string().uuid(),
  pickupLabel: z.string().trim().min(1).max(200).optional(),
  suggestedFee: z.coerce.number().positive("suggestedFee must be > 0"),
});

// POST /api/transport/loads/:escrowTripId/offers  (TRANSPORTER only) — the
// InDrive-style "name your price" counter-offer on an open load. Bounded
// above by the load's posted fee in the controller (already-collected money
// can't be exceeded), not here, since that requires reading the trip first.
export const makeOfferSchema = z.object({
  amount: z.coerce.number().positive("amount must be > 0"),
});

export type AcceptLoadInput = z.infer<typeof acceptLoadSchema>;
export type DispatchLoadInput = z.infer<typeof dispatchLoadSchema>;
export type MakeOfferInput = z.infer<typeof makeOfferSchema>;

// POST /api/transport/quote-requests  (FARMER only) — arranging transport
// for produce that isn't tied to any listing/buyer/escrow sale (e.g. taking
// a harvest to a market the farmer picked themselves).
export const createTransportRequestSchema = z.object({
  destinationLabel: z.string().trim().min(1).max(200),
  destinationLat: z.coerce.number().optional(),
  destinationLng: z.coerce.number().optional(),
  itemDescription: z.string().trim().min(1).max(200),
  weightKg: z.coerce.number().positive("weightKg must be > 0"),
});

// POST /api/transport/quote-requests/:requestId/quote  (TRANSPORTER only) —
// a driver's first quote, or a fresh counter after the farmer's offer.
export const submitQuoteSchema = z.object({
  amount: z.coerce.number().positive("amount must be > 0"),
});

// POST /api/transport/quotes/:quoteId/counter  (FARMER only) — bounded to
// +/-500 of the quote's current amount in the controller (needs to read the
// existing quote first), not here.
export const counterQuoteSchema = z.object({
  amount: z.coerce.number().positive("amount must be > 0"),
});

export type CreateTransportRequestInput = z.infer<typeof createTransportRequestSchema>;
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;
export type CounterQuoteInput = z.infer<typeof counterQuoteSchema>;
