import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { sendOtpSms } from "../services/infobip.service";
import { sendEmail, isEmailConfigured, buildWelcomeEmail, buildPasswordResetEmail } from "../services/email.service";
import { normalizeNigerianPhone } from "../utils/phone";
import {
  requestOtpSchema,
  linkPhoneSchema,
  updateLocationSchema,
  signupSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "../validators/auth.validators";
import type { AuthPayload } from "../middleware/auth.middleware";

const PASSWORD_SALT_ROUNDS = 10;

const googleClient = new OAuth2Client(env.google.clientId);

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const JWT_TTL = "90d";

// QA convenience: normally one phone number maps to exactly one account
// forever (its role is set on first signup and never changes — see below).
// These numbers are exempt, so a tester can verify-otp with the same number
// under FARMER, then BUYER, then TRANSPORTER and get three independent
// accounts instead of being silently kept on whichever role signed up first.
// +234 801 111 1111 sits in a real MTN range, but the all-repeating-digit
// pattern is standard telco reserved/test-range convention and won't be
// issued to an actual subscriber.
const TEST_MULTI_ROLE_PHONES = new Set(["+2348011111111"]);

// Fixed, publicly-known OTP for TEST_MULTI_ROLE_PHONES — no need to read logs
// or API responses, just always type this. Never used for a real number: the
// random path below is untouched for everyone else. It's also always echoed
// back in the request-otp response regardless of whether a real SMS provider
// is configured, since it's not a secret — it's a fixed, shared test code.
const TEST_OTP = "123456";

interface OtpEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
}

/**
 * In-memory OTP store. Keyed by the normalised E.164 phone number.
 *
 * ⚠️ PRODUCTION: replace this Map with Redis (e.g. `SETEX otp:<phone> 600 <otp>`).
 * A process-local Map does not survive restarts and does not work across
 * horizontally-scaled instances. Redis also gives us atomic TTL expiry and
 * shared attempt counters.
 */
const otpStore = new Map<string, OtpEntry>();

/** Cryptographically-random 6-digit numeric OTP (000000–999999), except the
 * fixed TEST_OTP for TEST_MULTI_ROLE_PHONES numbers. */
function generateOtp(phone: string): string {
  if (TEST_MULTI_ROLE_PHONES.has(phone)) return TEST_OTP;
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function signSession(user: { id: string; role: string; phoneNumber: string | null }) {
  const payload: AuthPayload = {
    userId: user.id,
    role: user.role as AuthPayload["role"],
    phoneNumber: user.phoneNumber,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: JWT_TTL });
}

// Never send the bcrypt hash to a client — every response that includes a
// user object must go through this first.
function omitPassword<T extends { passwordHash?: string | null }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash, ...rest } = user;
  return rest;
}

// POST /api/auth/request-otp
export async function requestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = requestOtpSchema.parse(req.body);
    const phone = normalizeNigerianPhone(phoneNumber);

    const isTestNumber = TEST_MULTI_ROLE_PHONES.has(phone);
    const otp = generateOtp(phone);
    otpStore.set(phone, {
      otp,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });

    // The test number's OTP is fixed and already known — no point spending a
    // real SMS credit (or waiting on Infobip) to deliver it.
    if (!isTestNumber) {
      await sendOtpSms(phone, otp);
    }

    // Never reveal the OTP in the response — except in local dev, where
    // Infobip isn't configured and the SMS is only ever printed to the server
    // console, which the frontend has no way to read — or for the fixed test
    // number, where it's not a secret to begin with.
    return res.status(200).json({
      success: true,
      message: "OTP sent",
      phoneNumber: phone,
      expiresInSeconds: OTP_TTL_MS / 1000,
      ...(isTestNumber || !env.infobip.apiKey ? { devOtp: otp } : {}),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/signup
//
// Email/password signup — the "manual" counterpart to Google sign-in while
// phone/OTP is disabled for sign-up. Rejects an email already in use by
// another account (whether that account was created via Google or password).
// phoneNumber is compulsory here but purely informational — it's never used
// to verify the account (verification is the email/password itself), just
// stored so counterparties can call the user directly for follow-ups.
export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, fullName, phoneNumber, role } = signupSchema.parse(req.body);

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const existingPhone = await prisma.user.findFirst({ where: { phoneNumber, role } });
    if (existingPhone) {
      return res.status(409).json({ error: "This phone number is already registered for this role" });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, fullName, phoneNumber, role, isVerified: true },
    });

    // Best-effort — a welcome email failing to send must never block signup
    // itself (same convention as every other notification in this app).
    const welcome = buildWelcomeEmail(fullName, role);
    sendEmail(email, welcome.subject, welcome.html).catch(() => {});

    const token = signSession(user);
    return res.status(201).json({ token, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signSession(user);
    return res.status(200).json({ token, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/google
//
// Verifies the Google ID token from the frontend's "Continue with Google"
// button. A *returning* user (matched by googleId or, failing that, email) is
// logged straight in — role/phoneNumber are ignored for them. A first-time
// Google user is created right here; phoneNumber is compulsory for that new
// account (like signup) but is never used to verify it — Google already
// verifies the identity.
export async function googleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const { idToken, role, phoneNumber } = googleAuthSchema.parse(req.body);
    if (!env.google.clientId) {
      return res.status(503).json({ error: "Google sign-in is not configured" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token" });
    }
    const { sub: googleId, email, name } = payload;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (existing) {
      if (!existing.googleId) {
        await prisma.user.update({ where: { id: existing.id }, data: { googleId, email } });
      }
      const token = signSession(existing);
      return res.status(200).json({ token, user: omitPassword(existing) });
    }

    // First time this Google identity has signed in — create the account now.
    // role and phoneNumber are the only things we still need from the
    // frontend (both are already collected client-side before the Google
    // button is even clickable).
    if (!role) {
      return res.status(400).json({ error: "role is required to create a new account" });
    }
    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required to create a new account" });
    }

    const existingPhone = await prisma.user.findFirst({ where: { phoneNumber, role } });
    if (existingPhone) {
      return res.status(409).json({ error: "This phone number is already registered for this role" });
    }

    const user = await prisma.user.create({
      data: {
        googleId,
        email,
        fullName: name ?? email,
        phoneNumber,
        role,
        // Google already verifies the email/identity; no separate OTP step
        // applies here the way it does for phone signup.
        isVerified: true,
      },
    });

    const welcome = buildWelcomeEmail(user.fullName, role);
    sendEmail(email, welcome.subject, welcome.html).catch(() => {});

    const token = signSession(user);
    return res.status(201).json({ token, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/link-phone (protected)
//
// Attaches a verified phone number to the signed-in user's account — the
// path a Google-only signup uses to add one later. Reuses the same OTP store
// as request-otp/verify-otp: call POST /auth/request-otp for the phone
// number first, then this with the code it sends.
export async function linkPhone(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber, otp } = linkPhoneSchema.parse(req.body);
    const phone = normalizeNigerianPhone(phoneNumber);

    const entry = otpStore.get(phone);
    if (!entry) {
      return res.status(400).json({ error: "No OTP requested for this number" });
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ error: "OTP has expired, please request a new one" });
    }
    if (entry.attempts >= 5) {
      otpStore.delete(phone);
      return res.status(429).json({ error: "Too many failed attempts, request a new OTP" });
    }
    if (entry.otp !== otp) {
      entry.attempts += 1;
      return res.status(400).json({ error: "Invalid OTP" });
    }
    otpStore.delete(phone);

    const me = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!me) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Same one-account-per-phone rule signup enforces, with the same QA
    // exemption for TEST_MULTI_ROLE_PHONES.
    if (!TEST_MULTI_ROLE_PHONES.has(phone)) {
      const holder = await prisma.user.findFirst({ where: { phoneNumber: phone } });
      if (holder && holder.id !== me.id) {
        return res.status(409).json({ error: "This phone number is already linked to another account" });
      }
    }

    const user = await prisma.user.update({
      where: { id: me.id },
      data: { phoneNumber: phone },
    });
    return res.status(200).json({ success: true, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/update-location (protected)
export async function updateLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { locationLat, locationLng, locationLabel } = updateLocationSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { locationLat, locationLng, locationLabel },
    });

    return res.status(200).json({ success: true, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/auth/profile (protected) — partial update of the signed-in
// user's own name/email/phone. Rejects an email or (phone, role) pair
// already claimed by a *different* account, mirroring the same checks
// signup enforces.
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { fullName, email, phoneNumber, farmName } = updateProfileSchema.parse(req.body);
    const userId = req.user!.userId;

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== userId) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
    }
    if (phoneNumber) {
      const existing = await prisma.user.findFirst({ where: { phoneNumber, role: req.user!.role } });
      if (existing && existing.id !== userId) {
        return res.status(409).json({ error: "This phone number is already registered for this role" });
      }
    }

    // farmName is FARMER-only — silently ignored for every other role rather
    // than erroring, since the field is harmless to send-and-drop.
    const isFarmer = req.user!.role === "FARMER";

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(email ? { email } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(isFarmer && farmName !== undefined ? { farmName: farmName === "" ? null : farmName } : {}),
      },
    });

    return res.status(200).json({ success: true, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// POST /api/auth/forgot-password (public)
//
// Always responds with the same generic message whether or not the email
// matches an account, so this can't be used to enumerate registered emails.
// `app` picks which frontend's URL the link points to (see env.appUrls) —
// deliberately an enum, not a caller-supplied URL, since it ends up embedded
// in an email sent to the account owner.
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, app } = forgotPasswordSchema.parse(req.body);
    const genericResponse = {
      success: true,
      message: "If an account exists for that email, a password reset link has been sent.",
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token, resetPasswordExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const resetUrl = `${env.appUrls[app]}/reset-password?token=${token}`;
    const { subject, html } = buildPasswordResetEmail(resetUrl);
    const { delivered } = await sendEmail(email, subject, html);

    // Local dev (no SMTP_HOST configured): the email was only logged to the
    // console, not actually delivered, so hand the link back directly — same
    // convention as request-otp's devOtp. Never done when a real provider is
    // configured, since the response would then leak whether the email
    // matched an account.
    return res.status(200).json({
      ...genericResponse,
      ...(!isEmailConfigured ? { devResetUrl: resetUrl } : {}),
      delivered,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/reset-password (public)
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { resetPasswordToken: token } });
    if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: "This reset link is invalid or has expired" });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpiresAt: null },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/photo (protected, multipart/form-data, field "photo")
//
// A real photo the user picked (camera or gallery) — not a generated
// avatar. multer-storage-cloudinary already resized/cropped it to a square
// headshot and put the resulting secure_url on `req.file.path` (see
// uploadProfilePhoto in middleware/upload.ts).
export async function uploadProfilePhotoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No photo was uploaded" });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarUrl: file.path },
    });

    return res.status(200).json({ success: true, user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}

// GET /api/auth/profile (protected)
export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json({ user: omitPassword(user) });
  } catch (err) {
    return next(err);
  }
}
