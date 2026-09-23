import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CheckCircle2, LayoutDashboard, LogOut, PanelLeftClose, Scale, Truck, Wheat } from "lucide-react";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/disputes", label: "Disputes", icon: Scale },
  { to: "/verification", label: "Verification", icon: CheckCircle2 },
  { to: "/escrow", label: "Live Escrow", icon: Truck },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen">
      <aside className={`shrink-0 bg-primary text-white flex flex-col transition-all ${open ? "w-60" : "w-[68px]"}`}>
        <div className={`flex items-center px-4 py-5 ${open ? "justify-between" : "justify-center"}`}>
          {open ? (
            <>
              <div className="text-2xl font-bold">🌾 Farm2Me</div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white shrink-0"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={20} />
              </button>
            </>
          ) : (
            <button onClick={() => setOpen(true)} className="text-white/70 hover:text-white" title="Expand sidebar">
              <Wheat size={24} />
            </button>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  open ? "" : "justify-center"
                } ${isActive ? "bg-white/15" : "hover:bg-white/10 text-white/80"}`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {open && item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 text-sm">
          {open && (
            <>
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-white/60 text-xs mb-3">{user?.phoneNumber}</div>
            </>
          )}
          <button
            onClick={logout}
            title="Sign out"
            className={`flex items-center gap-2 text-red-400 hover:text-red-300 font-medium ${
              open ? "" : "w-full justify-center"
            }`}
          >
            <LogOut size={16} />
            {open && "Sign out"}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
