import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { slugify } from "../../lib/slug";

// Bare "/farmer" (used by ROLE_HOME and any older links) bounces straight to
// the personalized "/farmer/:name" dashboard route.
export default function FarmerHomeRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={`/farmer/${slugify(user.fullName)}`} replace />;
}
