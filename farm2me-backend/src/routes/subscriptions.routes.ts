import { Router } from "express";
import { listPlans, myPlan, upgradeSubscription } from "../controllers/subscription.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Public
router.get("/plans", listPlans);

// Protected — any authenticated role can hold a subscription.
router.get("/me", authenticate, myPlan);
router.post("/upgrade", authenticate, upgradeSubscription);

export default router;
