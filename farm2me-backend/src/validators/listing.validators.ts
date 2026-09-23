import { z } from "zod";
import { MAX_SEARCH_RADIUS_KM } from "../config/fees";

// Form-data sends everything as strings. Accept real booleans or the
// strings "true"/"false" (z.coerce.boolean treats "false" as true, so we
// can't use it here).
const booleanish = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true");

// POST /api/listings/create  (multipart/form-data)
export const createListingSchema = z
  .object({
    cropType: z.string().min(1, "cropType is required"),
    weightKg: z.coerce.number().positive("weightKg must be > 0"),
    pricePerKg: z.coerce.number().positive("pricePerKg must be > 0"),
    // Smallest quantity a buyer can order — defaults to 1kg (effectively no
    // minimum) when the farmer doesn't set one.
    minOrderKg: z.coerce.number().positive("minOrderKg must be > 0").default(1),
    grade: z.enum(["GRADE_A", "GRADE_B", "GRADE_C"]),
    isPooled: booleanish.default(false),
    poolId: z.string().uuid().optional(),
    // Where this specific batch of produce actually is — left unset, every
    // pickup/distance calculation falls back to the farmer's own saved
    // profile location instead (see shapeListing/pickupCoords/describeCargo).
    locationLabel: z.string().trim().min(1).max(300).optional(),
    locationLat: z.coerce.number().min(-90).max(90).optional(),
    locationLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((d) => d.minOrderKg <= d.weightKg, {
    message: "minOrderKg can't be more than the total weight",
    path: ["minOrderKg"],
  })
  .refine((d) => (d.locationLat === undefined) === (d.locationLng === undefined), {
    message: "locationLat and locationLng must be provided together",
    path: ["locationLat"],
  });

// PATCH /api/listings/:id — every field optional (partial update). Images,
// pooling and cropType-driven pool matching aren't editable here; the
// controller also only allows this on a plain ACTIVE, unpooled listing with
// no escrow trip yet (same safety bar as delete).
export const updateListingSchema = z
  .object({
    cropType: z.string().min(1, "cropType is required").optional(),
    weightKg: z.coerce.number().positive("weightKg must be > 0").optional(),
    pricePerKg: z.coerce.number().positive("pricePerKg must be > 0").optional(),
    minOrderKg: z.coerce.number().positive("minOrderKg must be > 0").optional(),
    grade: z.enum(["GRADE_A", "GRADE_B", "GRADE_C"]).optional(),
    // Passing an empty string for locationLabel clears the override back to
    // the farmer's own profile location.
    locationLabel: z.string().trim().max(300).optional(),
    locationLat: z.coerce.number().min(-90).max(90).optional(),
    locationLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((d) => (d.locationLat === undefined) === (d.locationLng === undefined), {
    message: "locationLat and locationLng must be provided together",
    path: ["locationLat"],
  });

// GET /api/listings query params
export const listListingsSchema = z
  .object({
    cropType: z.string().min(1).optional(),
    grade: z.enum(["GRADE_A", "GRADE_B", "GRADE_C"]).optional(),
    isPooled: booleanish.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(MAX_SEARCH_RADIUS_KM).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
    message: "lat and lng must be provided together",
  });

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListListingsInput = z.infer<typeof listListingsSchema>;
