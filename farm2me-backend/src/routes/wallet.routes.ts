import { Router } from "express";
import { initiateDeposit, myWallet } from "../controllers/wallet.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Protected — any authenticated role has a wallet.
router.get("/", authenticate, myWallet);
router.post("/deposit", authenticate, initiateDeposit);

export default router;
