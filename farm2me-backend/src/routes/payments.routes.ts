import { Router } from "express";
import {
  initializePayment,
  quotePayment,
  monnifyWebhook,
  confirmPickup,
  confirmArrival,
  confirmDelivery,
  raiseDispute,
  myOrders,
  myDeals,
  createTip,
  getTip,
} from "../controllers/payment.controller";
import { authenticate, roleGuard } from "../middleware/auth.middleware";

const router = Router();

// Public — Monnify calls this; signature is verified inside the handler.
router.post("/webhook", monnifyWebhook);

// Protected
router.post("/quote", authenticate, roleGuard(["BUYER"]), quotePayment);
router.post("/initialize", authenticate, roleGuard(["BUYER"]), initializePayment);
router.post("/confirm-pickup", authenticate, roleGuard(["TRANSPORTER"]), confirmPickup);
router.post("/confirm-arrival", authenticate, roleGuard(["TRANSPORTER"]), confirmArrival);
// Either the buyer (their own confirm-delivery page) or the assigned
// transporter (typing the code the buyer read out to them) can call this.
router.post("/confirm-delivery", authenticate, roleGuard(["BUYER", "TRANSPORTER"]), confirmDelivery);
router.post("/raise-dispute", authenticate, roleGuard(["BUYER"]), raiseDispute);
router.get("/my-orders", authenticate, roleGuard(["BUYER"]), myOrders);
router.get("/my-deals", authenticate, roleGuard(["FARMER"]), myDeals);
router.post("/tip", authenticate, roleGuard(["BUYER"]), createTip);
router.get("/tip/:escrowTripId", authenticate, roleGuard(["BUYER"]), getTip);

export default router;
