import { z } from "zod";
import { MAX_SEARCH_RADIUS_KM } from "../config/fees";

const MIN_LEAD_DAYS = 3;
const MIN_RADIUS_KM = 5;
const MAX_RADIUS_KM = MAX_SEARCH_RADIUS_KM;

// The earliest allowed deadline, as a calendar day rather than an exact
// 72-hour countdown — both frontends offer today+MIN_LEAD_DAYS as the
// earliest selectable date (a date-only value, midnight UTC once
// serialized), so comparing against Date.now() + 3*24h here would reject
// that same date for anyone who submits later in the day than the moment
// this function runs, and always rejects the timezone-shifted date entirely
// for callers behind UTC. Truncating both sides to a UTC calendar day makes
// "at least 3 days out" mean what it says regardless of time-of-day.
function earliestAllowedDeadline(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + MIN_LEAD_DAYS);
  return d;
}

// POST /api/pools/create
export const createPoolSchema = z.object({
  contractName: z.string().min(1, "contractName is required"),
  cropType: z.string().min(1, "cropType is required"),
  targetWeightKg: z.coerce.number().positive("targetWeightKg must be > 0"),
  pricePerKg: z.coerce.number().positive("pricePerKg must be > 0"),
  deadline: z.coerce
    .date({ message: "deadline must be a valid ISO date" })
    .refine(
      (d) => d.getTime() >= earliestAllowedDeadline().getTime(),
      `deadline must be at least ${MIN_LEAD_DAYS} days in the future`
    ),
  // How far around the creator's location this pool is discoverable —
  // see pool.controller.ts createPool/listPools.
  radiusKm: z.coerce
    .number()
    .min(MIN_RADIUS_KM, `radiusKm must be at least ${MIN_RADIUS_KM}`)
    .max(MAX_RADIUS_KM, `radiusKm must be at most ${MAX_RADIUS_KM}`),
  // Free-text detail the creator specifies (e.g. which poultry breed, which
  // feed) — required by the frontend for categories that need it, optional
  // here since it doesn't apply to most crop types.
  subType: z.string().trim().min(1).max(150).optional(),
});

// GET /api/pools query params
export const listPoolsSchema = z
  .object({
    cropType: z.string().min(1).optional(),
    status: z.enum(["OPEN", "LOCKED", "IN_TRANSIT", "FULFILLED", "CANCELLED"]).optional(),
    // The viewer's current location — pools with a radius are only included
    // when the viewer falls within it (see listPools). Omit either to skip
    // radius filtering entirely (legacy behaviour: every pool is returned).
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: "lat and lng must be provided together",
  });

export type CreatePoolInput = z.infer<typeof createPoolSchema>;
export type ListPoolsInput = z.infer<typeof listPoolsSchema>;
