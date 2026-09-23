import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

// GET /api/notifications?page=&limit=  (authenticated)
export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      data: notifications,
      unreadCount,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/notifications/:id/read  (authenticated) — a farmer/buyer/driver
// marking one notification as seen, e.g. on tap.
export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      return res.status(404).json({ error: "Notification not found" });
    }

    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// POST /api/notifications/read-all  (authenticated) — "mark all as read",
// e.g. when the notifications screen is opened.
export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}
