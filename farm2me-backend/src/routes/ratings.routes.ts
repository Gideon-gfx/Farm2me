import { Router } from "express";
import { createRating, createGeneralRating, getUserRatings, getMyRatingsForTrip } from "../controllers/rating.controller";
import { authenticate, roleGuard } from "../middleware/auth.middleware";

const router = Router();

// Public — shown on a farmer/transporter's profile card.
router.get("/user/:userId", getUserRatings);

// Protected
router.get("/trip/:tripId/mine", authenticate, getMyRatingsForTrip);
router.post("/", authenticate, roleGuard(["BUYER"]), createRating);
router.post("/general", authenticate, roleGuard(["BUYER"]), createGeneralRating);

export default router;
