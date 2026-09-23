import { Router } from "express";
import {
  getOverview,
  listDisputes,
  getDispute,
  resolveDispute,
  pendingTransporters,
  approveUser,
  suspendUser,
  inTransitTrips,
} from "../controllers/admin.controller";
import { authenticate, roleGuard } from "../middleware/auth.middleware";

const router = Router();

// Every admin route requires an authenticated ADMIN.
router.use(authenticate, roleGuard(["ADMIN"]));

// 1. Overview
router.get("/overview", getOverview);

// 2. Disputes
router.get("/disputes", listDisputes);
router.get("/disputes/:id", getDispute);
router.post("/disputes/:id/resolve", resolveDispute);

// 3. Transporter verification
router.get("/transporters/pending", pendingTransporters);
router.post("/users/:id/approve", approveUser);
router.post("/users/:id/suspend", suspendUser);

// 4. Live escrow tracker
router.get("/escrow/in-transit", inTransitTrips);

export default router;
