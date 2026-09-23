import { env } from "../config/env";

// Infobip SMS integration.
// Docs: https://www.infobip.com/docs/api/channels/sms/sms-messaging/outbound-sms/send-sms-message
//
// We generate and verify the OTP ourselves (see auth.controller) and just
// deliver it as plain SMS text — deliberately NOT Infobip's separate 2FA/PIN
// product, which would generate and verify its own PIN server-side and stop
// matching what auth.controller compares against.
//
// baseUrl is account-specific (provisioned per Infobip customer, e.g.
// "xxxxxxx.api.infobip.com") — there's no shared default the way Termii had
// one, so it must be set explicitly.
const SMS_SEND_PATH = "/sms/2/text/advanced";

export interface SendOtpResult {
  delivered: boolean;
  providerRef?: string;
}

interface InfobipSendResult {
  ok: boolean;
  messageId?: string;
  status?: number;
  body?: string;
}

async function send(phoneNumber: string, text: string): Promise<InfobipSendResult> {
  // Infobip expects the destination in international format without a
  // leading "+" (e.g. "2348031234567").
  const to = phoneNumber.replace(/^\+/, "");

  const res = await fetch(`${env.infobip.baseUrl}${SMS_SEND_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `App ${env.infobip.apiKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          destinations: [{ to }],
          from: env.infobip.senderId,
          text,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }

  const data = (await res.json().catch(() => ({}))) as {
    messages?: { messageId?: string }[];
  };
  return { ok: true, messageId: data.messages?.[0]?.messageId };
}

/**
 * Sends a one-time PIN to a phone number via Infobip.
 *
 * When INFOBIP_API_KEY (or INFOBIP_BASE_URL) is not configured (e.g. local
 * dev), the call short-circuits and logs instead of hitting the network, so
 * the auth flow remains testable.
 */
export async function sendOtpSms(phoneNumber: string, otp: string): Promise<SendOtpResult> {
  if (!env.infobip.apiKey || !env.infobip.baseUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      `[infobip] not configured — skipping real SMS. OTP for ${phoneNumber} is ${otp}`
    );
    return { delivered: false };
  }

  const result = await send(phoneNumber, `Your Farm2Me verification code is ${otp}. It expires in 10 minutes.`);
  if (!result.ok) {
    throw new Error(`Infobip OTP send failed (${result.status}): ${result.body}`);
  }
  return { delivered: true, providerRef: result.messageId };
}

/**
 * Sends a plain transactional SMS via Infobip.
 *
 * Like {@link sendOtpSms}, this short-circuits and logs when Infobip isn't
 * configured so notification-driven flows remain testable offline. Failures
 * are swallowed (logged) — an SMS hiccup must never break an escrow state change.
 *
 * phoneNumber is nullable because a Google-only signup may not have one yet
 * (see the User schema) — callers don't need to guard every call site
 * themselves, this just no-ops.
 */
export async function sendSms(phoneNumber: string | null, message: string): Promise<boolean> {
  if (!phoneNumber) return false;
  if (!env.infobip.apiKey || !env.infobip.baseUrl) {
    // eslint-disable-next-line no-console
    console.warn(`[infobip] (not configured) SMS to ${phoneNumber}: ${message}`);
    return false;
  }

  try {
    const result = await send(phoneNumber, message);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[infobip] SMS to ${phoneNumber} failed (${result.status}): ${result.body}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[infobip] SMS to ${phoneNumber} threw:`, err);
    return false;
  }
}
