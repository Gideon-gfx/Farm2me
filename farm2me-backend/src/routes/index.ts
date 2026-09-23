import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import listingsRoutes from "./listings.routes";
import poolsRoutes from "./pools.routes";
import escrowRoutes from "./escrow.routes";
import disputesRoutes from "./disputes.routes";
import paymentsRoutes from "./payments.routes";
import subscriptionsRoutes from "./subscriptions.routes";
import walletRoutes from "./wallet.routes";
import ratingsRoutes from "./ratings.routes";
import transportRoutes from "./transport.routes";
import adminRoutes from "./admin.routes";
import notificationsRoutes from "./notifications.routes";
import geoRoutes from "./geo.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/listings", listingsRoutes);
router.use("/pools", poolsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/subscriptions", subscriptionsRoutes);
router.use("/wallet", walletRoutes);
router.use("/ratings", ratingsRoutes);
router.use("/transport", transportRoutes);
router.use("/admin", adminRoutes);
router.use("/escrow", escrowRoutes);
router.use("/disputes", disputesRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/geo", geoRoutes);

export default router;
