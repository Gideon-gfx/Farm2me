import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { slugify } from "../../lib/slug";
import AppShell from "../../components/AppShell";

// Parent layout for every /buyer/:name/* route — mounts AppShell (and its
// Sidebar) exactly once, so navigating between "Market", "Village Pools" and
// "Plans" swaps only the <Outlet/> content instead of remounting the whole
// shell like separate top-level routes would. Mirrors FarmerLayout.
//
// :name is a cosmetic slug of the signed-in user's own name, not a lookup
// key — the page always renders the current session's own data. If it's
// stale (e.g. after a name change) or wrong, this redirects to the correct
// one rather than 404ing or silently working with the wrong label.
export default function BuyerLayout() {
  const { user } = useAuth();
  const { name } = useParams<{ name: string }>();
  const location = useLocation();

  if (!user) return null;

  const mySlug = slugify(user.fullName);
  if (name !== mySlug) {
    const rest = location.pathname.slice(`/buyer/${name}`.length);
    return <Navigate to={`/buyer/${mySlug}${rest}`} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
