import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

// Real SMTP transactional email via Nodemailer (docs:
// https://nodemailer.com/smtp/). Works with any SMTP provider — Gmail (with
// an app password), SendGrid/Mailgun/SES SMTP credentials, Mailtrap for
// testing, etc — configured entirely through SMTP_* env vars.
//
// When SMTP_HOST is not configured (e.g. local dev with no mail provider
// set up), sends short-circuit and log to the console instead of hitting
// the network, so signup/password-reset stay testable offline — same
// convention as sendOtpSms/sendSms in infobip.service.ts.
export const isEmailConfigured = Boolean(env.smtp.host);

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export interface SendEmailResult {
  delivered: boolean;
  providerRef?: string;
}

/**
 * Sends a transactional HTML email via SMTP (Nodemailer).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  if (!isEmailConfigured) {
    // eslint-disable-next-line no-console
    console.warn(`[email] (not configured) would send to ${to}: "${subject}"\n${html}`);
    return { delivered: false };
  }

  try {
    const info = await getTransporter().sendMail({
      from: env.smtp.fromEmail,
      to,
      subject,
      html,
    });
    return { delivered: true, providerRef: info.messageId };
  } catch (err) {
    // Never let an email hiccup break the calling flow (matches sendSms) —
    // e.g. forgot-password must still respond success either way, to avoid
    // leaking whether an account exists via a delivery-failure branch.
    // eslint-disable-next-line no-console
    console.error(`[email] send to ${to} failed:`, err);
    return { delivered: false };
  }
}

// ---------------------------------------------------------------------------
// Branded HTML templates
// ---------------------------------------------------------------------------

// Shared wrapper so every transactional email looks like it came from the
// same product — cream background, forest-green header, gold accent button,
// matching the web/mobile apps' own colour palette.
function emailLayout(preheader: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Farm2Me</title>
  </head>
  <body style="margin:0; padding:0; background-color:#EAE7DF; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none; max-height:0; overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EAE7DF; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#F7F5EF; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="background-color:#24352A; padding:28px 32px; text-align:center;">
                <div style="font-size:22px; font-weight:800; color:#F5EFE2; letter-spacing:0.3px;">
                  Farm<span style="color:#D9A441;">2</span>me
                </div>
                <div style="margin-top:4px; font-size:10.5px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#8FBF9C;">
                  Farmers &middot; Movers &middot; Buyers
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; border-top:1px solid rgba(0,0,0,0.07); text-align:center;">
                <div style="font-size:11.5px; color:#8A8578;">
                  You're receiving this because you have a Farm2Me account.<br />
                  &copy; ${new Date().getFullYear()} Farm2Me. Payments protected by Farm2Me Escrow.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;">
    <tr>
      <td style="border-radius:10px; background-color:#D9A441;">
        <a href="${href}" style="display:inline-block; padding:13px 28px; font-size:14.5px; font-weight:700; color:#3E2D1A; text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

const ROLE_COPY: Record<string, { headline: string; body: string }> = {
  FARMER: {
    headline: "list your first harvest",
    body: "Add a produce listing with a few photos, and buyers nearby can start ordering — every sale is protected by escrow until you confirm delivery.",
  },
  BUYER: {
    headline: "browse the market",
    body: "Search fresh produce from verified farmers near you, and pay safely — your money stays in escrow until your order is delivered.",
  },
  TRANSPORTER: {
    headline: "find your first load",
    body: "Check the load board for deliveries near your route, negotiate a fee if you'd like, and get paid as soon as a delivery is confirmed.",
  },
};

/**
 * Welcome email sent right after a new account is created (email/password
 * signup, or a brand-new Google sign-in) — confirms the account exists and
 * points the new user at their very next action for their specific role.
 */
export function buildWelcomeEmail(fullName: string, role: string): { subject: string; html: string } {
  const firstName = fullName.trim().split(/\s+/)[0] || "there";
  const copy = ROLE_COPY[role] ?? ROLE_COPY.BUYER;

  const body = `
    <div style="font-size:19px; font-weight:800; color:#24352A;">Welcome to Farm2Me, ${firstName}! 🌾</div>
    <p style="margin:14px 0 0; font-size:14.5px; line-height:1.6; color:#24352A;">
      Your account is ready. You're all set to ${copy.headline} — ${copy.body}
    </p>
    <p style="margin:18px 0 0; font-size:14.5px; line-height:1.6; color:#24352A;">
      Every order on Farm2Me is held in escrow, so payment only ever reaches the other party once delivery is confirmed — for farmers, buyers and transporters alike.
    </p>
    <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#8A8578;">
      Didn't create this account? You can safely ignore this email.
    </p>
  `;

  return {
    subject: "Welcome to Farm2Me — your account is ready",
    html: emailLayout("Your Farm2Me account is ready.", body),
  };
}

/**
 * Password reset email — same branded layout as the welcome email, kept
 * separate from auth.controller.ts's own copy so both templates stay
 * visually consistent in one place.
 */
export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  const body = `
    <div style="font-size:19px; font-weight:800; color:#24352A;">Reset your password</div>
    <p style="margin:14px 0 0; font-size:14.5px; line-height:1.6; color:#24352A;">
      Someone (hopefully you) asked to reset the password on this Farm2Me account. This link expires in 1 hour.
    </p>
    ${emailButton("Choose a new password", resetUrl)}
    <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#8A8578;">
      Didn't request this? You can safely ignore this email — your password won't change.
    </p>
  `;

  return {
    subject: "Reset your Farm2Me password",
    html: emailLayout("Reset your Farm2Me password — link expires in 1 hour.", body),
  };
}
