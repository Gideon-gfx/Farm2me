import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { slugify } from "../../lib/slug";

// Bare "/buyer" (used by ROLE_HOME and any older links) bounces straight to
// the personalized "/buyer/:name" dashboard route.
export default function BuyerHomeRedirect() {
  const { user } = useAuth();
  if (!user) return null;
  return <Navigate to={`/buyer/${slugify(user.fullName)}`} replace />;
}
