import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

// 404 handler for unmatched routes.
export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// Centralised error handler. Must be registered last.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }

  // Errors carrying an explicit HTTP status code (e.g. HttpError, Multer errors).
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return res.status(status).json({ error: err instanceof Error ? err.message : "Request error" });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ error: message });
}
