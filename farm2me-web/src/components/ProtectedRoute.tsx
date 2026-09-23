import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { ROLE_HOME } from "../lib/types";

// Gate that requires a logged-in user; optionally restricts to specific roles.
export default function ProtectedRoute({
  allow,
  children,
}: {
  allow?: Role[];
  children: ReactNode;
}) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Preserve where they were headed so /auth can bounce them back.
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }
  return <>{children}</>;
}
