// Backwards-compatible re-export. The canonical implementation now lives in
// auth.middleware.ts; this file is kept so existing imports of
// "../middleware/auth" continue to resolve.
export * from "./auth.middleware";
export type { AuthPayload, UserRole } from "./auth.middleware";
