import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "../lib/auth";
import { slugify } from "../lib/slug";
import Sidebar from "./Sidebar";

// Desktop app shell for signed-in pages: dark sidebar nav + a light content
// area, matching the prototype's layout. On mobile-width viewports the
// sidebar becomes an off-canvas drawer, opened via the hamburger button in
// the header (see Sidebar's md: breakpoint overrides).
export default function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  // Each dashboard page mounts its own AppShell, so this preference is
  // persisted rather than kept in plain state — otherwise it'd reset to
  // expanded on every navigation.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("farm2me.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("farm2me.sidebar.collapsed", next ? "1" : "0");
      } catch {
        // Private browsing etc. — collapse still works for this page load.
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-white px-4 py-3.5 sm:px-6">
          <button
            onClick={() => setNavOpen(true)}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-primary-dark hover:bg-background md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          {user && (
            <Link
              to={user.role === "FARMER" ? `/farmer/${slugify(user.fullName)}/profile` : "/profile"}
              className="ml-auto flex items-center gap-2.5"
            >
              <div className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-extrabold text-[#F5EFE2]">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  user.fullName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <div className="text-sm font-extrabold leading-tight text-primary-dark">{user.fullName}</div>
                <div className="text-[10.5px] text-muted">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</div>
              </div>
            </Link>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
