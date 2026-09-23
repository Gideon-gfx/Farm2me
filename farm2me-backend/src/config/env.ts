import dotenv from "dotenv";

dotenv.config();

// Centralised, validated access to environment variables.
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  monnify: {
    apiKey: process.env.MONNIFY_API_KEY ?? "",
    clientSecret: process.env.MONNIFY_CLIENT_SECRET ?? "",
    baseUrl: process.env.MONNIFY_BASE_URL ?? "",
    contractCode: process.env.MONNIFY_CONTRACT_CODE ?? "",
    walletAccountNumber: process.env.MONNIFY_WALLET_ACCOUNT ?? "",
    redirectUrl: process.env.MONNIFY_REDIRECT_URL ?? "",
  },
  infobip: {
    apiKey: process.env.INFOBIP_API_KEY ?? "",
    // Account-specific — Infobip provisions a unique base URL per customer
    // (e.g. "xxxxxxx.api.infobip.com"), unlike Termii's shared endpoint.
    baseUrl: process.env.INFOBIP_BASE_URL ?? "",
    senderId: process.env.INFOBIP_SENDER_ID ?? "Farm2Me",
  },
  cloudinaryUrl: process.env.CLOUDINARY_URL ?? "",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  },
  // Real SMTP delivery via Nodemailer — works with any provider (Gmail app
  // password, SendGrid/Mailgun/SES SMTP credentials, Mailtrap for testing,
  // etc). Unconfigured (no SMTP_HOST) falls back to logging the email to the
  // console instead of sending it, same convention as the other external
  // services in this app (Monnify, Infobip, Cloudinary).
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    // Most providers (Gmail, SendGrid, Mailgun) use STARTTLS on 587 rather
    // than implicit TLS — only flip this on for a provider on port 465.
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    fromEmail: process.env.SMTP_FROM_EMAIL ?? "Farm2Me <no-reply@farm2me.com>",
  },
  // Where a "forgot password" email's reset link points, keyed by which app
  // requested it — a small server-side allowlist rather than trusting a
  // caller-supplied URL, since that URL ends up embedded in an email sent to
  // the account owner.
  appUrls: {
    web: process.env.WEB_APP_URL ?? "http://localhost:5173",
    admin: process.env.ADMIN_APP_URL ?? "http://localhost:5266/admin",
  },
};

export default env;
