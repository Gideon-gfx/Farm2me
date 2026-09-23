import { NextFunction, Request, Response, Router } from "express";
import { MulterError } from "multer";
import {
  createListing,
  listListings,
  getListing,
  updateListing,
  deleteListing,
} from "../controllers/listing.controller";
import { authenticate, roleGuard } from "../middleware/auth.middleware";
import { uploadListingMedia } from "../middleware/upload";

const router = Router();

// Runs the Cloudinary upload and normalises Multer errors into 400 responses.
function handleUpload(req: Request, res: Response, next: NextFunction) {
  uploadListingMedia(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Each file must be 50MB or smaller" : err.message;
      return res.status(400).json({ error: message });
    }
    if (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    return next();
  });
}

// Public
router.get("/", listListings);
router.get("/:id", getListing);

// Protected — FARMER only
router.post("/create", authenticate, roleGuard(["FARMER"]), handleUpload, createListing);
router.patch("/:id", authenticate, roleGuard(["FARMER"]), updateListing);
router.delete("/:id", authenticate, roleGuard(["FARMER"]), deleteListing);

export default router;
