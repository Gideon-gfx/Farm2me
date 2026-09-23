import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { slugify } from "../../lib/slug";

// Bare "/transporter" (used by ROLE_HOME and any older links) bounces
// straight to the personalized "/transporter/:name" dashboard route.
export default function TransporterHomeRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={`/transporter/${slugify(user.fullName)}`} replace />;
}
