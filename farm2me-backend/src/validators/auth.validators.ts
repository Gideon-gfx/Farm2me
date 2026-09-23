import { z } from "zod";
import { isValidNigerianPhone } from "../utils/phone";

const nigerianPhone = z
  .string()
  .min(1, "Phone number is required")
  .refine(isValidNigerianPhone, "Invalid Nigerian phone number (use +234 or 0 prefix)");

// POST /api/auth/request-otp
export const requestOtpSchema = z.object({
  phoneNumber: nigerianPhone,
});

// Contact phone number collected at signup — required for both signup
// methods (email/password and Google) but never used to verify the account;
// it exists so counterparties can call a farmer/buyer/transporter directly
// for follow-ups. Loosely validated (digits, optional leading +) since local
// formatting rules vary too much across countries to enforce more strictly.
const contactPhone = z
  .string()
  .trim()
  .min(7, "Phone number is required")
  .regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid phone number (digits only, e.g. +234803...)");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^a-zA-Z0-9]/, "Password must include a special character");

// POST /api/auth/signup
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password,
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: contactPhone,
  role: z.enum(["FARMER", "BUYER", "TRANSPORTER"]),
});

// POST /api/auth/login
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// POST /api/auth/google
export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
  // role/phoneNumber are required only for a first-time signup — an
  // already-existing account logs straight in without them. The frontend
  // always collects both before the Google button is even clickable, so
  // these should always be present on a real request.
  role: z.enum(["FARMER", "BUYER", "TRANSPORTER"]).optional(),
  phoneNumber: contactPhone.optional(),
});

// POST /api/auth/link-phone — attaches a verified phone number to the
// signed-in user's account (e.g. a Google-only signup adding one later).
export const linkPhoneSchema = z.object({
  phoneNumber: nigerianPhone,
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

// POST /api/auth/update-location
export const updateLocationSchema = z.object({
  locationLat: z.number().min(-90).max(90),
  locationLng: z.number().min(-180).max(180),
  locationLabel: z.string().min(1).optional(),
});

// POST /api/auth/forgot-password — `app` picks which frontend's URL the
// reset link points to (see env.appUrls); it's an enum rather than a
// caller-supplied URL so a request can't be used to embed an arbitrary link
// in an email sent to someone else's inbox.
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  app: z.enum(["web", "admin"]).default("web"),
});

// POST /api/auth/reset-password
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "token is required"),
  password,
});

// PATCH /api/auth/profile — every field optional since this is a partial
// update; phoneNumber reuses the same loose, unverified contactPhone rule as
// signup (changing it here never requires OTP, same as at signup). farmName
// is FARMER-only — the controller ignores it for every other role.
export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Full name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  phoneNumber: contactPhone.optional(),
  // Empty string clears it back to the default (falls back to fullName).
  farmName: z
    .string()
    .trim()
    .max(80, "Farm name is too long")
    .refine((v) => v.length === 0 || v.length >= 2, "Farm name is too short")
    .optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type LinkPhoneInput = z.infer<typeof linkPhoneSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
