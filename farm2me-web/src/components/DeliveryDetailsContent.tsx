import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { MapPin, Pencil, Phone, Truck } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira, statusBadge } from "../lib/format";
import { geocodeAddress } from "../lib/location";
import type { User } from "../lib/types";
import Spinner from "./Spinner";

interface DeliveryOrder {
  id: string;
  item: string;
  party: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
  logisticsFee?: string | number;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}

// Buyer-facing order list — the farmer arranges a driver after the order is
// placed (see the farmer's "Find a driver" flow), so this is where a buyer
// sees who's carrying each order and what delivery costs, without having to
// open each order's full tracking page first. Also where they manually set
// the delivery address the farmer sees when dispatching a driver — typed in
// and geocoded rather than pulled from GPS, since a buyer may want deliveries
// sent somewhere other than their current location. It's account-level (see
// geocodeAddress), so editing it here updates it for every pending order.
export default function DeliveryDetailsContent() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-orders-delivery"],
    queryFn: async () => (await api.get<{ data: DeliveryOrder[] }>("/payments/my-orders")).data.data ?? [],
  });

  function startEditing() {
    setAddressInput(user?.locationLabel ?? "");
    setEditing(true);
  }

  async function saveAddress() {
    const query = addressInput.trim();
    if (!query) {
      toast.error("Enter a delivery address");
      return;
    }
    setSaving(true);
    try {
      const match = await geocodeAddress(query);
      if (!match) {
        toast.error("Could not find that address — try adding more detail (city, state)");
        return;
      }
      const { data } = await api.post<{ user: User }>("/auth/update-location", {
        locationLat: match.lat,
        locationLng: match.lng,
        locationLabel: query,
      });
      updateUser(data.user);
      setEditing(false);
      toast.success("Delivery location updated");
    } catch {
      toast.error("Could not update delivery location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-primary-dark">Orders</h1>
      <p className="mt-0.5 text-sm text-muted">Every order you've placed, with delivery status and cost</p>

      <div className="card mt-5 p-4">
        {editing ? (
          <div className="flex items-center gap-3">
            <MapPin size={17} className="flex-none text-primary" />
            <input
              className="input min-w-0 flex-1"
              placeholder="e.g. 12 Ajayi Street, Ikeja, Lagos"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveAddress()}
              autoFocus
            />
            <button onClick={saveAddress} disabled={saving} className="btn-primary !min-h-0 !px-3 !py-1.5 text-xs">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-escrow text-escrow-ink">
              <MapPin size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Delivery location</div>
              <div className="truncate text-sm font-bold text-primary-dark">{user?.locationLabel ?? "Not set"}</div>
            </div>
            <button onClick={startEditing} className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs">
              <Pencil size={12} /> {user?.locationLabel ? "Edit" : "Add"}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="mt-6"><Spinner /></div>
      ) : data && data.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2.5">
          {data.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex items-center gap-4">
                <Link to={`/orders/${o.id}`} className="min-w-0 flex-1">
                  <div className="font-extrabold text-primary-dark hover:underline">{o.item}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {o.party} · {formatDistanceToNow(parseISO(o.createdAt), { addSuffix: true })}
                  </div>
                </Link>
                <span className={`pill ${statusBadge(o.status)}`}>{o.status.replace("_", " ")}</span>
                <span className="w-24 text-right text-sm font-extrabold text-primary-dark">{naira(o.totalAmount)}</span>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-background px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Truck size={15} className="flex-none text-primary" />
                  {o.driverName ? (
                    <span className="font-bold text-primary-dark">{o.driverName}</span>
                  ) : (
                    <span className="text-muted">Awaiting a driver from the farmer</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {o.logisticsFee != null && (
                    <span className="text-sm font-extrabold text-primary-dark">{naira(o.logisticsFee)}</span>
                  )}
                  {o.driverPhone && (
                    <a href={`tel:${o.driverPhone}`} className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs">
                      <Phone size={12} /> Call
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card mt-5 p-10 text-center text-sm text-muted">
          Delivery info for your orders will appear here once you've placed one.
        </div>
      )}
    </div>
  );
}
