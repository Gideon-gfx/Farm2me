import { NextFunction, Request, Response, Router } from "express";
import { MulterError } from "multer";
import {
  requestOtp,
  signup,
  login,
  googleAuth,
  linkPhone,
  updateLocation,
  getProfile,
  updateProfile,
  uploadProfilePhotoHandler,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { uploadProfilePhoto } from "../middleware/upload";

const router = Router();

// Runs the Cloudinary upload and normalises Multer errors into 400 responses
// — same convention as listings.routes.ts's handleUpload.
function handlePhotoUpload(req: Request, res: Response, next: NextFunction) {
  uploadProfilePhoto(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Photo must be 10MB or smaller" : err.message;
      return res.status(400).json({ error: message });
    }
    if (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    return next();
  });
}

// Public
router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);

// Used only by the post-signup "add a phone number" flow (see /link-phone) —
// phone/OTP is not a sign-up/sign-in method for the time being.
router.post("/request-otp", requestOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Protected
router.post("/link-phone", authenticate, linkPhone);
router.post("/update-location", authenticate, updateLocation);
router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.post("/photo", authenticate, handlePhotoUpload, uploadProfilePhotoHandler);

export default router;
