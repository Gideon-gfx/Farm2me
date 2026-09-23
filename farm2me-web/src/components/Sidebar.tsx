import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CreditCard,
  Home,
  ListChecks,
  LogOut,
  PanelLeftClose,
  Phone,
  Plus,
  Truck,
  Users,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { naira } from "../lib/format";
import { slugify } from "../lib/slug";
import { FarmLeafIcon, FarmWordmark } from "./Logo";
import type { Role, User } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
}

const WALLET_ITEM: NavItem = { to: "/wallet", label: "Wallet", icon: WalletIcon, match: (p) => p === "/wallet" };

// Farmer's, Buyer's and Transporter's own pages live nested under
// /farmer/:name, /buyer/:name and /transporter/:name respectively (see
// FarmerLayout/BuyerLayout/TransporterLayout) so the sidebar stays mounted
// while navigating between them — this needs the current user to build
// those links, unlike ADMIN's static one.
function navForUser(user: User): NavItem[] {
  if (user.role === "FARMER") {
    const base = `/farmer/${slugify(user.fullName)}`;
    return [
      { to: base, label: "My Farm", icon: Home, match: (p) => p === base },
      { to: `${base}/listings/new`, label: "Add Listing", icon: Plus, match: (p) => p.startsWith(`${base}/listings`) },
      { to: `${base}/pools`, label: "Village Pools", icon: Users, match: (p) => p.startsWith(`${base}/pools`) },
      { to: `${base}/find-driver`, label: "Find a driver", icon: Truck, match: (p) => p.startsWith(`${base}/find-driver`) },
      WALLET_ITEM,
      { to: `${base}/plans`, label: "Plans", icon: CreditCard, match: (p) => p === `${base}/plans` },
    ];
  }
  if (user.role === "BUYER") {
    const base = `/buyer/${slugify(user.fullName)}`;
    return [
      { to: base, label: "Market", icon: Home, match: (p) => p === base || p.startsWith("/listings") },
      { to: `${base}/orders`, label: "Orders", icon: Truck, match: (p) => p.startsWith(`${base}/orders`) },
      { to: `${base}/pools`, label: "Village Pools", icon: Users, match: (p) => p.startsWith(`${base}/pools`) },
      WALLET_ITEM,
      { to: `${base}/plans`, label: "Plans", icon: CreditCard, match: (p) => p === `${base}/plans` },
    ];
  }
  if (user.role === "TRANSPORTER") {
    const base = `/transporter/${slugify(user.fullName)}`;
    return [
      { to: base, label: "Jobs", icon: Home, match: (p) => p === base },
      WALLET_ITEM,
      { to: `${base}/plans`, label: "Plans", icon: CreditCard, match: (p) => p === `${base}/plans` },
    ];
  }
  return NAV_BY_ROLE[user.role];
}

const NAV_BY_ROLE: Record<Exclude<Role, "FARMER" | "BUYER" | "TRANSPORTER">, NavItem[]> = {
  ADMIN: [{ to: "/buyer", label: "Market", icon: ListChecks, match: (p) => p === "/buyer" }],
};

interface SidebarProps {
  // Drive the off-canvas drawer on mobile-width viewports — on md+ screens
  // the sidebar is always visible and part of the flex layout, so these are
  // simply ignored there.
  open?: boolean;
  onClose?: () => void;
  // Drive the icon-only collapsed rail on md+ screens — ignored on mobile,
  // where the drawer is either fully open or fully closed via open/onClose.
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function Sidebar({ open = false, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;
  const items = navForUser(user);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-none flex-col bg-primary-dark p-3.5 transition-all duration-200 md:static md:z-auto md:translate-x-0 ${
          collapsed ? "md:w-[76px]" : "md:w-56"
        } ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`flex items-center pb-4 ${collapsed ? "md:justify-center" : "justify-between px-2"}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? "md:hidden" : ""}`}>
            <FarmLeafIcon size={30} dark />
            <FarmWordmark size="text-lg" dark />
          </div>
          {collapsed && (
            <button
              onClick={onToggleCollapsed}
              title="Expand sidebar"
              className="hidden text-[#8FBF9C] hover:text-white md:block"
            >
              <FarmLeafIcon size={28} dark />
            </button>
          )}
          <div className="flex items-center gap-1">
            {!collapsed && (
              <button
                onClick={onToggleCollapsed}
                title="Collapse sidebar"
                className="hidden text-[#8FBF9C] hover:text-white md:block"
              >
                <PanelLeftClose size={18} />
              </button>
            )}
            <button onClick={onClose} className="text-[#8FBF9C] md:hidden">
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon, match }) => {
            const active = match(location.pathname);
            return (
              <Link
                key={to}
                to={to}
                onClick={onClose}
                title={label}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  collapsed ? "md:justify-center md:px-0" : ""
                } ${active ? "bg-white/10 text-[#F5EFE2]" : "text-[#8FBF9C] hover:bg-white/5"}`}
              >
                <Icon size={18} className="flex-none" />
                <span className={collapsed ? "md:hidden" : ""}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          {!user.phoneNumber && (
            <Link
              to="/account/add-phone"
              onClick={onClose}
              title="Add your phone number"
              className={`flex items-center gap-2.5 rounded-2xl bg-accent/15 p-3.5 text-xs font-bold text-accent hover:bg-accent/25 ${
                collapsed ? "md:justify-center" : ""
              }`}
            >
              <Phone size={16} className="flex-none" />
              <span className={collapsed ? "md:hidden" : ""}>Add your phone number</span>
            </Link>
          )}
          <Link
            to="/wallet"
            onClick={onClose}
            title="Wallet balance"
            className={`block rounded-2xl bg-white/[.06] p-3.5 hover:bg-white/[.1] ${collapsed ? "md:text-center" : ""}`}
          >
            <div className={`text-[9.5px] font-bold uppercase tracking-widest text-[#8FBF9C] ${collapsed ? "md:hidden" : ""}`}>
              Wallet balance
            </div>
            <div className="mt-1 text-lg font-extrabold text-[#F5EFE2]">
              {collapsed ? <WalletIcon size={18} className="mx-auto hidden md:block" /> : null}
              <span className={collapsed ? "md:hidden" : ""}>{naira(user.walletBalance)}</span>
            </div>
          </Link>
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            title="Sign out"
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#8FBF9C] hover:bg-white/5 ${
              collapsed ? "md:justify-center" : ""
            }`}
          >
            <LogOut size={18} className="flex-none" />
            <span className={collapsed ? "md:hidden" : ""}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
