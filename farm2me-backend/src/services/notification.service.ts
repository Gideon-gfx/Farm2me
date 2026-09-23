import { prisma } from "../lib/prisma";

// Creates an in-app notification alongside (never instead of) the existing
// SMS send at the same trigger point — same fire-and-forget convention as
// sendSms/sendEmail: never let a notification failure break the calling
// flow (a payout releasing, an order funding, etc. must still succeed).
export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
  escrowTripId?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body, escrowTripId },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[notification] failed to create for user ${userId}:`, err);
  }
}
