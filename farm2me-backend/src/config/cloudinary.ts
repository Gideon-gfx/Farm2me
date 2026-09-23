import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

// The Cloudinary SDK reads CLOUDINARY_URL from the environment automatically,
// but we configure explicitly so behaviour is obvious and testable.
// Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
if (env.cloudinaryUrl) {
  cloudinary.config({ secure: true });
} else {
  // eslint-disable-next-line no-console
  console.warn("[cloudinary] CLOUDINARY_URL not set — image uploads will fail until configured.");
}

export { cloudinary };
export default cloudinary;
