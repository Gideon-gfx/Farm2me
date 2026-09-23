import crypto from "crypto";
import { env } from "../config/env";

// Monnify integration.
// Docs: https://developers.monnify.com/
//
// When MONNIFY_API_KEY/secret are not configured (local dev) the service
// short-circuits with mocked responses and logs, so the escrow flow remains
// testable offline. Real calls are made as soon as credentials are present.

const AUTH_PATH = "/api/v1/auth/login";
const INIT_TX_PATH = "/api/v1/merchant/transactions/init-transaction";
const DISBURSEMENT_PATH = "/api/v2/disbursements/batch";

function isConfigured(): boolean {
  return Boolean(env.monnify.apiKey && env.monnify.clientSecret && env.monnify.baseUrl);
}

// --- access-token cache ---
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

/**
 * Authenticates with Monnify and caches the access token for 55 minutes
 * (Monnify tokens live 60 minutes — we refresh early to avoid edge expiry).
 */
export async function authenticateMonnify(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const basic = Buffer.from(`${env.monnify.apiKey}:${env.monnify.clientSecret}`).toString("base64");
  const res = await fetch(`${env.monnify.baseUrl}${AUTH_PATH}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monnify auth failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { responseBody?: { accessToken?: string } };
  const token = json.responseBody?.accessToken;
  if (!token) throw new Error("Monnify auth returned no accessToken");

  cachedToken = token;
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return token;
}

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await authenticateMonnify();
  return fetch(`${env.monnify.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export interface InitTransactionResult {
  checkoutUrl: string;
  transactionReference: string;
  paymentReference: string;
  mocked?: boolean;
}

/**
 * Initialises a hosted-checkout transaction and returns the checkout URL.
 */
export async function initializeTransaction(
  amount: number,
  customerEmail: string,
  customerName: string,
  reference: string,
  metadata: Record<string, unknown>
): Promise<InitTransactionResult> {
  if (!isConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(`[monnify] (not configured) mock init-transaction ref=${reference} amount=${amount}`);
    return {
      checkoutUrl: `https://sandbox.monnify.com/checkout/MOCK-${reference}`,
      transactionReference: `MOCK-TX-${reference}`,
      paymentReference: reference,
      mocked: true,
    };
  }

  const res = await authedFetch(INIT_TX_PATH, {
    method: "POST",
    body: JSON.stringify({
      amount,
      customerName,
      customerEmail,
      paymentReference: reference,
      paymentDescription: "Farm2Me escrow funding",
      currencyCode: "NGN",
      contractCode: env.monnify.contractCode,
      redirectUrl: env.monnify.redirectUrl || undefined,
      metaData: metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monnify init-transaction failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    responseBody?: { checkoutUrl?: string; transactionReference?: string; paymentReference?: string };
  };
  const rb = json.responseBody;
  if (!rb?.checkoutUrl || !rb.transactionReference) {
    throw new Error("Monnify init-transaction returned an incomplete response");
  }

  return {
    checkoutUrl: rb.checkoutUrl,
    transactionReference: rb.transactionReference,
    paymentReference: rb.paymentReference ?? reference,
  };
}

/**
 * Queries the status of a transaction by its Monnify transaction reference.
 */
export async function verifyTransaction(transactionReference: string): Promise<{
  paymentStatus: string;
  amountPaid?: number;
  raw: unknown;
}> {
  const encoded = encodeURIComponent(transactionReference);
  const res = await authedFetch(`/api/v2/transactions/${encoded}`, { method: "GET" });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monnify verify failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    responseBody?: { paymentStatus?: string; amountPaid?: number };
  };
  return {
    paymentStatus: json.responseBody?.paymentStatus ?? "UNKNOWN",
    amountPaid: json.responseBody?.amountPaid,
    raw: json,
  };
}

export interface PayoutRecipient {
  accountNumber: string;
  bankCode: string;
  amount: number;
  narration: string;
}

export interface SplitPayoutResult {
  batchReference: string;
  totalAmount: number;
  recipientCount: number;
  mocked?: boolean;
  raw?: unknown;
}

/**
 * Initiates a bulk (split) disbursement — one transfer per recipient.
 */
export async function initiateSplitPayout(payouts: PayoutRecipient[]): Promise<SplitPayoutResult> {
  if (payouts.length === 0) {
    throw new Error("initiateSplitPayout called with no recipients");
  }

  const batchReference = `F2M-BATCH-${crypto.randomUUID()}`;
  const totalAmount = payouts.reduce((sum, p) => sum + p.amount, 0);

  if (!isConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[monnify] (not configured) mock split payout ${batchReference}: ` +
        payouts.map((p) => `${p.accountNumber}/${p.bankCode}=₦${p.amount}`).join(", ")
    );
    return { batchReference, totalAmount, recipientCount: payouts.length, mocked: true };
  }

  const res = await authedFetch(DISBURSEMENT_PATH, {
    method: "POST",
    body: JSON.stringify({
      title: "Farm2Me escrow release",
      batchReference,
      narration: "Farm2Me payout",
      sourceAccountNumber: env.monnify.walletAccountNumber,
      onValidationFailure: "CONTINUE",
      notificationInterval: 25,
      transactionList: payouts.map((p, i) => ({
        amount: p.amount,
        reference: `${batchReference}-${i}`,
        narration: p.narration,
        destinationBankCode: p.bankCode,
        destinationAccountNumber: p.accountNumber,
        currency: "NGN",
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monnify disbursement failed (${res.status}): ${body}`);
  }

  const raw = await res.json().catch(() => ({}));
  return { batchReference, totalAmount, recipientCount: payouts.length, raw };
}

/**
 * Verifies a Monnify webhook signature: HMAC-SHA512 of the raw request body,
 * keyed with the client secret, compared (constant-time) to the header value.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!signature || !env.monnify.clientSecret) return false;
  const computed = crypto
    .createHmac("sha512", env.monnify.clientSecret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
