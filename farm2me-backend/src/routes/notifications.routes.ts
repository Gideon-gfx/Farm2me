import { Router } from "express";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../controllers/notification.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, listNotifications);
router.post("/read-all", authenticate, markAllNotificationsRead);
router.post("/:id/read", authenticate, markNotificationRead);

export default router;
