import { Router } from "express";
import {
  availableLoads,
  acceptLoad,
  myLoads,
  nearbyFarms,
  nearbyDrivers,
  dispatchLoad,
  makeOffer,
  myOffers,
  acceptDeliveryOffer,
  rejectDeliveryOffer,
} from "../controllers/transport.controller";
import {
  createTransportRequest,
  getTransportRequest,
  myTransportRequests,
  cancelTransportRequest,
  nearbyTransportRequests,
  submitQuote,
  counterQuote,
  acceptQuote,
} from "../controllers/transportRequest.controller";
import { authenticate, roleGuard } from "../middleware/auth.middleware";

const router = Router();

// Farmer-facing routes — registered before the blanket TRANSPORTER guard
// below so they get their own role check instead.
router.get("/nearby-drivers", authenticate, roleGuard(["FARMER"]), nearbyDrivers);
router.post("/dispatch", authenticate, roleGuard(["FARMER"]), dispatchLoad);
router.post("/offers/:offerId/accept", authenticate, roleGuard(["FARMER"]), acceptDeliveryOffer);
router.post("/offers/:offerId/reject", authenticate, roleGuard(["FARMER"]), rejectDeliveryOffer);

// Farmer self-arranged delivery — negotiating with drivers over produce
// transport that isn't tied to a buyer/listing/escrow sale.
router.post("/quote-requests", authenticate, roleGuard(["FARMER"]), createTransportRequest);
router.get("/quote-requests", authenticate, roleGuard(["FARMER"]), myTransportRequests);
router.get("/quote-requests/nearby", authenticate, roleGuard(["TRANSPORTER"]), nearbyTransportRequests);
router.get("/quote-requests/:id", authenticate, roleGuard(["FARMER"]), getTransportRequest);
router.post("/quote-requests/:id/cancel", authenticate, roleGuard(["FARMER"]), cancelTransportRequest);
router.post("/quote-requests/:id/quote", authenticate, roleGuard(["TRANSPORTER"]), submitQuote);
router.post("/quotes/:quoteId/counter", authenticate, roleGuard(["FARMER"]), counterQuote);
// Either side can accept whatever's currently on the table — see
// acceptQuote's own role check inside the controller.
router.post("/quotes/:quoteId/accept", authenticate, roleGuard(["FARMER", "TRANSPORTER"]), acceptQuote);

router.use(authenticate, roleGuard(["TRANSPORTER"]));

router.get("/available-loads", availableLoads);
router.post("/accept-load", acceptLoad);
router.get("/my-loads", myLoads);
router.get("/nearby-farms", nearbyFarms);
router.post("/loads/:escrowTripId/offers", makeOffer);
router.get("/my-offers", myOffers);

export default router;
