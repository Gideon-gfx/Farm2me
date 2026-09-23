import multer from "multer";
import { Request } from "express";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinary } from "../config/cloudinary";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — ceiling for the bigger (video) files; multer applies one limit across fields
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);

// `folder`/`allowed_formats`/`resource_type` are valid Cloudinary upload
// options but get dropped by the library's strict Params type (Cloudinary's
// index signature filters them out), so we widen the cast here. Branches on
// fieldname since photos and videos need different Cloudinary settings.
const storage = new CloudinaryStorage({
  cloudinary,
  params: (_req, file) => {
    const isVideo = file.fieldname === "videos";
    return {
      folder: isVideo ? "farm2me/listings/videos" : "farm2me/listings",
      resource_type: isVideo ? "video" : "image",
      allowed_formats: isVideo ? ["mp4", "mov", "webm"] : ["jpg", "jpeg", "png", "webp"],
      ...(isVideo ? {} : { transformation: [{ quality: "auto", fetch_format: "auto" }] }),
    } as Record<string, unknown>;
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const isVideo = file.fieldname === "videos";
  const allowed = isVideo ? ALLOWED_VIDEO_MIME : ALLOWED_IMAGE_MIME;
  if (allowed.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(isVideo ? "Only MP4, MOV and WEBM videos are allowed" : "Only JPEG, PNG and WEBP images are allowed"));
  }
}

// No cap on how many photos/videos a listing can carry — only the per-file
// size limit above bounds a single upload.
export const uploadListingMedia = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).fields([{ name: "images" }, { name: "videos" }]);

// A user's real profile photo (camera or gallery) — a single image, its own
// Cloudinary folder, and a tighter size cap than listing media since it's
// just a headshot.
const PHOTO_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: () =>
    ({
      folder: "farm2me/profile-photos",
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }, { quality: "auto", fetch_format: "auto" }],
    }) as Record<string, unknown>,
});

function photoFileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG and WEBP images are allowed"));
  }
}

// Accepts a single file under "photo".
export const uploadProfilePhoto = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: PHOTO_MAX_FILE_SIZE, files: 1 },
}).single("photo");
