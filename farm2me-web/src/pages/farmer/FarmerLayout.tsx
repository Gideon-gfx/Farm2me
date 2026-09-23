import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { slugify } from "../../lib/slug";
import AppShell from "../../components/AppShell";

// Parent layout for every /farmer/:name/* route — mounts AppShell (and its
// Sidebar) exactly once, so navigating between "My Farm", "Add Listing" and
// "Plans" swaps only the <Outlet/> content instead of remounting the whole
// shell like separate top-level routes would.
//
// :name is a cosmetic slug of the signed-in farmer's own name, not a lookup
// key — the page always renders the current session's own data. If it's
// stale (e.g. after a name change) or wrong, this redirects to the correct
// one rather than 404ing or silently working with the wrong label.
export default function FarmerLayout() {
  const { user } = useAuth();
  const { name } = useParams<{ name: string }>();
  const location = useLocation();

  if (!user) return null;

  const mySlug = slugify(user.fullName);
  if (name !== mySlug) {
    const rest = location.pathname.slice(`/farmer/${name}`.length);
    return <Navigate to={`/farmer/${mySlug}${rest}`} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
