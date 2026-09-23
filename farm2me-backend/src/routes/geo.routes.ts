import { Router } from "express";
import { searchAddressHandler } from "../controllers/geo.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/search", authenticate, searchAddressHandler);

export default router;
