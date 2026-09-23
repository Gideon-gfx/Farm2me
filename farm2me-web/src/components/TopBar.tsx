import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { FarmLeafIcon, FarmWordmark } from "./Logo";
import { ROLE_HOME } from "../lib/types";
import { slugify } from "../lib/slug";

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const profilePath = user?.role === "FARMER" ? `/farmer/${slugify(user.fullName)}/profile` : "/profile";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <FarmLeafIcon size={28} />
          <FarmWordmark size="text-lg" />
        </Link>

        {user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-extrabold text-[#F5EFE2]"
              aria-label="Account menu"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                user.fullName.slice(0, 1).toUpperCase()
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-white py-1.5 shadow-lg">
                <div className="border-b border-border px-4 py-2.5">
                  <div className="truncate text-sm font-extrabold text-primary-dark">{user.fullName}</div>
                  <div className="text-xs text-muted">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</div>
                </div>
                <Link
                  to={ROLE_HOME[user.role]}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-background"
                >
                  My dashboard
                </Link>
                <Link
                  to={profilePath}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-semibold text-primary-dark hover:bg-background"
                >
                  Profile
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    navigate("/");
                  }}
                  className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm font-semibold text-danger hover:bg-background"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <nav className="flex items-center gap-5 text-sm">
            <Link to="/pools" className="hidden font-semibold text-primary-dark hover:text-primary sm:inline">
              Village Pools
            </Link>
            <Link to="/subscription" className="hidden font-semibold text-primary-dark hover:text-primary sm:inline">
              Plans
            </Link>
            <Link to="/auth" className="btn-ink !min-h-0 !px-5 !py-2">
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
