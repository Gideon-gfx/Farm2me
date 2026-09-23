import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

export type UserRole = "FARMER" | "BUYER" | "TRANSPORTER" | "ADMIN";

// Shape of the data we sign into / read out of the JWT.
export interface AuthPayload {
  userId: string;
  role: UserRole;
  phoneNumber: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Extracts a Bearer token from the Authorization header, verifies it, and
 * attaches the decoded payload to `req.user`. Rejects with 401 otherwise.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length).trim();
  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    // Re-check the account on every request: a long-lived (90-day) token must
    // not keep working after the account is deleted or suspended. The DB role is
    // authoritative over the token's (handles role changes too).
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, phoneNumber: true, isSuspended: true },
    });
    if (!user) {
      return res.status(401).json({ error: "Account no longer exists" });
    }
    if (user.isSuspended) {
      return res.status(403).json({ error: "Account suspended" });
    }

    req.user = { userId: user.id, role: user.role, phoneNumber: user.phoneNumber };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Like {@link authenticate}, but never rejects — attaches req.user when a
 * valid token is present, otherwise just calls next() with req.user left
 * undefined. For public endpoints that show a bit more to signed-in users
 * (e.g. a far-away pool's contact phone number) without requiring a login to
 * browse at all.
 */
export async function authenticateOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, phoneNumber: true, isSuspended: true },
    });
    if (user && !user.isSuspended) {
      req.user = { userId: user.id, role: user.role, phoneNumber: user.phoneNumber };
    }
  } catch {
    // Invalid/expired token on a public route — treat as anonymous rather
    // than rejecting the request.
  }
  return next();
}

/**
 * Role-guard helper. Pass an array of allowed roles; must run after
 * {@link authenticate}.
 *
 *   router.post("/", authenticate, roleGuard(["FARMER"]), handler)
 */
export function roleGuard(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}

/** Variadic convenience wrapper around {@link roleGuard}. */
export function authorize(...allowedRoles: UserRole[]) {
  return roleGuard(allowedRoles);
}
