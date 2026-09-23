import { z } from "zod";

// POST /api/ratings
export const createRatingSchema = z.object({
  escrowTripId: z.string().uuid(),
  rateeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

// POST /api/ratings/general — a product-page review not tied to a specific
// completed order (see createGeneralRating).
export const createGeneralRatingSchema = z.object({
  rateeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type CreateGeneralRatingInput = z.infer<typeof createGeneralRatingSchema>;
