import { Router } from "express";
import {
  createPool,
  listPools,
  getPool,
  getMyContribution,
  withdrawContribution,
} from "../controllers/pool.controller";
import { authenticate, authenticateOptional, roleGuard } from "../middleware/auth.middleware";

const router = Router();

// Public — authenticateOptional attaches req.user when signed in, so
// far-away results (see listPools) can include a contact phone number for
// logged-in users without requiring a login just to browse.
router.get("/", authenticateOptional, listPools);
router.get("/:id", getPool);

// Protected
router.post("/create", authenticate, roleGuard(["BUYER", "FARMER"]), createPool);
router.get("/:id/my-contribution", authenticate, roleGuard(["FARMER"]), getMyContribution);
router.delete("/:poolId/withdraw", authenticate, roleGuard(["FARMER"]), withdrawContribution);

export default router;
