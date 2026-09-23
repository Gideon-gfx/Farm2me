import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { Check, Pencil, Phone, Plus, Trash2, Truck, Users, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { naira, statusBadge } from "../lib/format";
import { geocodeAddress } from "../lib/location";
import { GRADES, type Grade, type Listing, type User } from "../lib/types";
import Spinner from "../components/Spinner";
import { tintFor } from "../lib/colorTint";

export default function FarmerDashboard() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["my-listings", user?.id],
    queryFn: async () => {
      const { data } = await api.get<{ data: Listing[] }>("/listings", { params: { limit: 100 } });
      return (data.data ?? []).filter((l) => l.farmerId === user?.id);
    },
  });

  const activeCount = (listings ?? []).filter((l) => l.status === "ACTIVE").length;

  async function deleteListing(id: string) {
    if (!window.confirm("Delete this listing? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await api.delete(`/listings/${id}`);
      queryClient.invalidateQueries({ queryKey: ["my-listings", user?.id] });
      toast.success("Listing deleted");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not delete listing");
    } finally {
      setDeletingId(null);
    }
  }

  function startEditingName() {
    setNameInput(user?.farmName ?? "");
    setEditingName(true);
  }

  async function saveFarmName() {
    if (savingName) return;
    setSavingName(true);
    try {
      const { data } = await api.patch<{ user: User }>("/auth/profile", { farmName: nameInput.trim() });
      updateUser(data.user);
      setEditingName(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not save farm name");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          {editingName ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  className="input !py-1.5 text-xl font-extrabold"
                  placeholder="e.g. Amaka's Organic Farm"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveFarmName()}
                  autoFocus
                />
                <button
                  onClick={saveFarmName}
                  disabled={savingName}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50"
                  aria-label="Save farm name"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  disabled={savingName}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted hover:bg-background"
                  aria-label="Cancel"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                Shown to buyers on your listings and in search — leave blank to use your account name.
              </p>
            </>
          ) : (
            <button onClick={startEditingName} className="group flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-primary-dark">{user?.farmName || "My Farm"}</h1>
              <Pencil size={14} className="text-muted opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-0.5 text-sm text-muted">{user?.locationLabel ?? "Your listings & escrow deals"}</p>
        </div>
        <Link to="listings/new" className="btn-primary">
          <Plus size={18} /> Add produce listing
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-extrabold text-primary-dark">{activeCount}</div>
          <div className="mt-1 text-xs text-muted">Active listings</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-extrabold text-primary-dark">{listings?.length ?? 0}</div>
          <div className="mt-1 text-xs text-muted">Total listings</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-extrabold text-accent">{naira(user?.walletBalance ?? 0)}</div>
          <div className="mt-1 text-xs text-muted">Wallet balance</div>
        </div>
      </div>

      <Link to="pools" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
        <Users size={16} /> Browse Village Pools
      </Link>

      <h2 className="mb-3 text-lg font-extrabold text-primary-dark">My listings</h2>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-2.5">
          {(listings ?? []).map((l) => {
            const editable = l.status === "ACTIVE";
            return (
              <div
                key={l.id}
                onClick={() => editable && setEditingListing(l)}
                className={`card flex items-center gap-3.5 p-3.5 ${editable ? "cursor-pointer transition hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]" : ""}`}
                title={editable ? "Click to edit" : undefined}
              >
                <div
                  className="flex h-[50px] w-[50px] flex-none items-center justify-center overflow-hidden rounded-2xl text-sm font-extrabold text-black/35"
                  style={{ backgroundColor: tintFor(l.cropType) }}
                >
                  {l.imageUrls?.[0] ? (
                    <img src={l.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    l.cropType.slice(0, 2)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-primary-dark">{l.cropType}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {naira(l.pricePerKg)}/kg · {l.weightKg}kg · {l.grade.replace("GRADE_", "Grade ")} ·{" "}
                    {format(parseISO(l.createdAt), "d MMM yyyy")}
                    {(l.imageUrls?.length || l.videoUrls?.length) ? (
                      <>
                        {" · "}
                        {l.imageUrls?.length ? `${l.imageUrls.length} photo${l.imageUrls.length > 1 ? "s" : ""}` : ""}
                        {l.imageUrls?.length && l.videoUrls?.length ? ", " : ""}
                        {l.videoUrls?.length ? `${l.videoUrls.length} video${l.videoUrls.length > 1 ? "s" : ""}` : ""}
                      </>
                    ) : (
                      <span className="text-muted/70"> · No media</span>
                    )}
                  </div>
                </div>
                <span className={`pill ${statusBadge(l.status)}`}>{l.status}</span>
                {editable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteListing(l.id);
                    }}
                    disabled={deletingId === l.id}
                    title="Delete listing"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
          {listings?.length === 0 && (
            <div className="card p-10 text-center text-sm text-muted">No listings yet. Create your first one.</div>
          )}
        </div>
      )}

      {editingListing && (
        <EditListingModal
          listing={editingListing}
          onClose={() => setEditingListing(null)}
          onSaved={() => {
            setEditingListing(null);
            queryClient.invalidateQueries({ queryKey: ["my-listings", user?.id] });
          }}
        />
      )}

      <MyDeals />
    </>
  );
}

function EditListingModal({
  listing,
  onClose,
  onSaved,
}: {
  listing: Listing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cropType, setCropType] = useState(listing.cropType);
  const [weightKg, setWeightKg] = useState(String(listing.weightKg));
  const [pricePerKg, setPricePerKg] = useState(String(listing.pricePerKg));
  const [minOrderKg, setMinOrderKg] = useState(String(listing.minOrderKg ?? 1));
  const [grade, setGrade] = useState<Grade>(listing.grade);
  const [saving, setSaving] = useState(false);

  const originalLocation = listing.locationLabel ?? "";
  const [locationInput, setLocationInput] = useState(originalLocation);
  const [resolvedLocation, setResolvedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const locationDirty = locationInput.trim() !== originalLocation;

  async function confirmLocation() {
    const query = locationInput.trim();
    if (!query) return;
    setGeocoding(true);
    try {
      const match = await geocodeAddress(query);
      if (!match) {
        toast.error("Could not find that address — try adding more detail (city, state)");
        return;
      }
      setResolvedLocation({ lat: match.lat, lng: match.lng });
      toast.success("Location confirmed");
    } catch {
      toast.error("Could not look up that address");
    } finally {
      setGeocoding(false);
    }
  }

  const media = [
    ...(listing.imageUrls ?? []).map((url) => ({ type: "image" as const, url })),
    ...(listing.videoUrls ?? []).map((url) => ({ type: "video" as const, url })),
  ];
  const [activeMedia, setActiveMedia] = useState(0);
  const current = media[activeMedia];

  const weight = Number(weightKg);
  const price = Number(pricePerKg);
  const minOrder = Number(minOrderKg);
  const canSave =
    cropType.trim().length > 0 &&
    weight > 0 &&
    price > 0 &&
    minOrder > 0 &&
    minOrder <= weight &&
    !(locationDirty && locationInput.trim() && !resolvedLocation);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await api.patch(`/listings/${listing.id}`, {
        cropType: cropType.trim(),
        weightKg: weight,
        pricePerKg: price,
        minOrderKg: minOrder,
        grade,
        ...(locationDirty
          ? {
              locationLabel: locationInput.trim(),
              ...(resolvedLocation ? { locationLat: resolvedLocation.lat, locationLng: resolvedLocation.lng } : {}),
            }
          : {}),
      });
      toast.success("Listing updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not update listing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-primary-dark">Edit listing</h3>
          <button onClick={onClose} className="text-muted">
            <X size={20} />
          </button>
        </div>

        {media.length > 0 ? (
          <div className="mb-4">
            <div className="aspect-video overflow-hidden rounded-xl bg-background">
              {current?.type === "image" ? (
                <img src={current.url} alt="" className="h-full w-full object-cover" />
              ) : current?.type === "video" ? (
                <video src={current.url} controls className="h-full w-full bg-black" />
              ) : null}
            </div>
            {media.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {media.map((m, i) => (
                  <button
                    key={m.url}
                    onClick={() => setActiveMedia(i)}
                    className={`relative h-14 w-14 flex-none overflow-hidden rounded-lg border-2 ${
                      i === activeMedia ? "border-accent" : "border-transparent"
                    }`}
                  >
                    {m.type === "image" ? (
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={m.url} className="h-full w-full bg-black object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-xl bg-background p-3 text-center text-xs text-muted">
            No photos or videos on this listing.
          </div>
        )}

        <label className="mb-1 block text-sm font-bold text-primary-dark">Crop / animal type</label>
        <input className="input" value={cropType} onChange={(e) => setCropType(e.target.value)} />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-primary-dark">Weight (kg)</label>
            <input
              className="input"
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-primary-dark">Price per kg (₦)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
            />
          </div>
        </div>

        <label className="mb-1 mt-3 block text-sm font-bold text-primary-dark">
          Lowest quantity a buyer can order (kg)
        </label>
        <input
          className="input"
          type="number"
          step="0.1"
          value={minOrderKg}
          onChange={(e) => setMinOrderKg(e.target.value)}
        />

        <label className="mb-1 mt-3 block text-sm font-bold text-primary-dark">Produce location</label>
        <div className="flex items-center gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder="Leave blank to use your farm's saved address"
            value={locationInput}
            onChange={(e) => {
              setLocationInput(e.target.value);
              setResolvedLocation(null);
            }}
          />
          {locationDirty && locationInput.trim() && (
            <button
              type="button"
              onClick={confirmLocation}
              disabled={geocoding}
              className="btn-outline !min-h-0 !px-3 !py-2.5 text-xs"
            >
              {geocoding ? "Finding…" : "Confirm"}
            </button>
          )}
        </div>
        {locationDirty && locationInput.trim() && resolvedLocation && (
          <p className="mt-1 text-xs font-bold text-primary">✓ Location confirmed</p>
        )}

        <div className="mt-3 flex items-center justify-between rounded-xl bg-background px-4 py-2.5">
          <span className="text-sm text-muted">Total price</span>
          <span className="text-lg font-extrabold text-primary">{naira((weight || 0) * (price || 0), 2)}</span>
        </div>

        <label className="mb-1 mt-3 block text-sm font-bold text-primary-dark">Grade</label>
        <div className="space-y-2">
          {GRADES.map((g) => (
            <label
              key={g.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-black/[.06] bg-white p-3 has-[:checked]:border-accent"
            >
              <input
                type="radio"
                checked={grade === g.value}
                onChange={() => setGrade(g.value)}
                className="text-accent focus:ring-accent"
              />
              <span>
                <span className="font-extrabold text-primary-dark">{g.label}</span>
                <span className="ml-2 text-sm text-muted">{g.description}</span>
              </span>
            </label>
          ))}
        </div>

        <button onClick={save} disabled={!canSave || saving} className="btn-primary mt-5 w-full">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

interface Deal {
  id: string;
  item: string;
  party: string;
  status: string;
  amount: string | number;
  createdAt: string;
  deliveryLocation?: string | null;
  logisticsFee?: string | number;
  dispatched?: boolean;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  buyerPhone?: string | null;
  driverLocationAt?: string | null;
  offers?: { id: string; driverName: string; isVerified: boolean; amount: string | number }[];
}

function MyDeals() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-deals"],
    queryFn: async () => (await api.get<{ data: Deal[] }>("/payments/my-deals")).data.data ?? [],
  });

  const respondToOffer = useMutation({
    mutationFn: async ({ offerId, action }: { offerId: string; action: "accept" | "reject" }) =>
      api.post(`/transport/offers/${offerId}/${action}`),
    onSuccess: (_res, { action }) => {
      toast.success(action === "accept" ? "Driver assigned at their offer" : "Offer declined");
      queryClient.invalidateQueries({ queryKey: ["my-deals"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Could not respond to offer"),
  });

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-extrabold text-primary-dark">My deals</h2>
      {isLoading ? (
        <Spinner />
      ) : data && data.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {data.map((d) => {
            const needsDriver = d.status === "FUNDS_LOCKED" && !d.driverId;
            return (
              <div key={d.id} className="card p-4">
                <div className="flex items-center gap-4">
                  <Link to={`/orders/${d.id}`} className="min-w-0 flex-1">
                    <div className="font-extrabold text-primary-dark hover:underline">{d.item}</div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {d.party}
                      {d.deliveryLocation ? ` · delivering to ${d.deliveryLocation}` : ""}
                    </div>
                  </Link>
                  <span className={`pill ${statusBadge(d.status)}`}>{d.status.replace("_", " ")}</span>
                  <span className="w-28 text-right text-sm font-extrabold text-primary-dark">{naira(d.amount)}</span>
                </div>

                {d.driverName ? (
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-xs font-bold text-primary">
                        <Truck size={13} /> {d.driverName}
                        {d.logisticsFee != null ? ` · ${naira(d.logisticsFee)} delivery` : ""}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {d.status === "IN_TRANSIT" || d.status === "ARRIVED"
                          ? d.driverLocationAt
                            ? `Last seen ${formatDistanceToNow(parseISO(d.driverLocationAt), { addSuffix: true })}`
                            : "On the way — no live location yet"
                          : d.status === "DELIVERED" || d.status === "RELEASED"
                            ? "Delivered"
                            : "Waiting for pickup"}
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      {d.driverPhone && (
                        <a href={`tel:${d.driverPhone}`} title="Call driver" className="btn-outline !min-h-0 !px-2.5 !py-1.5 text-[11px]">
                          <Phone size={11} /> Driver
                        </a>
                      )}
                      {d.buyerPhone && (
                        <a href={`tel:${d.buyerPhone}`} title="Call buyer" className="btn-outline !min-h-0 !px-2.5 !py-1.5 text-[11px]">
                          <Phone size={11} /> Buyer
                        </a>
                      )}
                      <Link to={`/orders/${d.id}`} className="btn-primary !min-h-0 !px-2.5 !py-1.5 text-[11px]">
                        Track
                      </Link>
                    </div>
                  </div>
                ) : (
                  needsDriver && (
                    <div className="mt-2">
                      {d.offers && d.offers.length > 0 && (
                        <div className="mb-2 flex flex-col gap-1.5 rounded-xl bg-accent/10 p-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-accent-dark">
                            Drivers ready to deliver — you have the final say
                          </p>
                          {d.offers.map((o) => (
                            <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-primary-dark">
                                {o.driverName}
                                {o.isVerified ? " ✓" : ""} — {naira(o.amount)}
                              </span>
                              <span className="flex gap-1.5">
                                <button
                                  onClick={() => respondToOffer.mutate({ offerId: o.id, action: "accept" })}
                                  disabled={respondToOffer.isPending}
                                  className="btn-accent !min-h-0 !px-2.5 !py-1 text-[11px]"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => respondToOffer.mutate({ offerId: o.id, action: "reject" })}
                                  disabled={respondToOffer.isPending}
                                  className="btn-outline !min-h-0 !px-2.5 !py-1 text-[11px]"
                                >
                                  Decline
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {d.dispatched ? (
                        <p className="flex items-center gap-1 text-xs font-bold text-accent-dark">
                          <Truck size={13} /> Posted to the load board — waiting for a driver
                        </p>
                      ) : (
                        <Link
                          to={`find-driver?order=${d.id}`}
                          className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                        >
                          <Truck size={13} /> Find a driver
                        </Link>
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-6 text-sm text-muted">
          Escrow deals from your sold listings will appear here.
        </div>
      )}
    </section>
  );
}

