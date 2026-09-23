import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import toast from "react-hot-toast";
import { Upload, Video, X } from "lucide-react";
import { api } from "../api/client";
import { formatAmountInput, naira, parseAmountInput } from "../lib/format";
import { geocodeAddress } from "../lib/location";
import {
  ANIMAL_TYPES,
  ANIMAL_TYPES_NEEDING_SUBTYPE,
  ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE,
  BEAN_TYPES,
  CROP_TYPES,
  GRADES,
  SEAFOOD_TYPES,
  type VillagePool,
} from "../lib/types";
import Dropdown from "../components/Dropdown";

// Backend enforces this same minimum (see pool.validators.ts) — checked
// client-side so the date picker starts the user on a valid day.
const MIN_POOL_LEAD_DAYS = 3;

const CROP_OPTIONS = CROP_TYPES.map((c) => ({ value: c, label: c }));
const ANIMAL_OPTIONS = ANIMAL_TYPES.map((a) => ({ value: a, label: a }));
const SEAFOOD_OPTIONS = SEAFOOD_TYPES.map((s) => ({ value: s, label: s }));
const BEAN_OPTIONS = BEAN_TYPES.map((b) => ({ value: b, label: b }));

// Weight/price are plain useState (see weightKgInput/pricePerKgInput below)
// so their inputs can show live comma formatting — a native
// react-hook-form-bound type="number" input can't display commas.
const schema = z.object({
  grade: z.enum(["GRADE_A", "GRADE_B", "GRADE_C"]),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export default function CreateListing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [kind, setKind] = useState<"crop" | "animal">("crop");
  const [cropType, setCropType] = useState("");
  const [otherCropType, setOtherCropType] = useState("");
  const [subType, setSubType] = useState("");
  const [seafoodType, setSeafoodType] = useState("");
  const [beanType, setBeanType] = useState("");
  const [isPooled, setIsPooled] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isSeafood = cropType === "Seafood";
  const isBeans = cropType === "Beans";
  const isOther = cropType === "Other";
  // "Other" (crop side only — ANIMAL_TYPES has no such option) replaces the
  // placeholder with whatever the farmer typed, everywhere the actual crop
  // name is needed (pool matching, submission) — the raw `cropType` state
  // stays "Other" only for UI branching (Dropdown value, this computation).
  const effectiveCropType = isOther ? otherCropType.trim() : cropType;
  const needsSubType = (ANIMAL_TYPES_NEEDING_SUBTYPE as readonly string[]).includes(cropType) || isBeans;
  const isFreeTextSubType = (ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE as readonly string[]).includes(cropType);
  const resolvedSubType = isSeafood
    ? (seafoodType === "Other" ? subType.trim() : seafoodType)
    : isBeans
      ? beanType
      : subType.trim();

  const [weightKgInput, setWeightKgInput] = useState("");
  const [pricePerKgInput, setPricePerKgInput] = useState("");
  const [minOrderKgInput, setMinOrderKgInput] = useState("");
  const weightKg = parseAmountInput(weightKgInput);
  const pricePerKg = parseAmountInput(pricePerKgInput);
  const minOrderKg = parseAmountInput(minOrderKgInput);
  const total = weightKg * pricePerKg;

  // This produce might not be at the farmer's own registered address (e.g.
  // stored at another farm or a warehouse) — off by default, since most
  // listings are at the farmer's usual location.
  const [differentLocation, setDifferentLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [poolContractName, setPoolContractName] = useState("");
  const [poolTargetWeightKg, setPoolTargetWeightKg] = useState("");
  const [poolPricePerKg, setPoolPricePerKg] = useState("");
  const [poolDeadline, setPoolDeadline] = useState("");
  const [poolRadiusKm, setPoolRadiusKm] = useState(25);
  const [creatingPool, setCreatingPool] = useState(false);

  const {
    register,
    handleSubmit,
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { grade: "GRADE_A" },
  });

  const { data: pools } = useQuery({
    queryKey: ["open-pools", effectiveCropType],
    enabled: isPooled && !!effectiveCropType,
    queryFn: async () =>
      (await api.get<{ data: VillagePool[] }>("/pools", {
        params: { cropType: effectiveCropType, status: "OPEN", limit: 20 },
      })).data.data ?? [],
  });

  async function createPool() {
    if (!effectiveCropType || creatingPool) return;
    const targetWeightKg = Number(poolTargetWeightKg);
    const poolPrice = Number(poolPricePerKg);
    if (!poolContractName.trim()) {
      toast.error("Name this pool contract");
      return;
    }
    if (!(targetWeightKg > 0)) {
      toast.error("Target weight must be greater than 0");
      return;
    }
    if (!(poolPrice > 0)) {
      toast.error("Asking price must be greater than 0");
      return;
    }
    if (!poolDeadline) {
      toast.error("Pick a deadline");
      return;
    }
    setCreatingPool(true);
    try {
      const { data } = await api.post<{ pool: VillagePool }>("/pools/create", {
        contractName: poolContractName.trim(),
        cropType: effectiveCropType,
        ...(needsSubType ? { subType: resolvedSubType } : {}),
        targetWeightKg,
        pricePerKg: poolPrice,
        deadline: new Date(poolDeadline).toISOString(),
        radiusKm: poolRadiusKm,
      });
      await queryClient.invalidateQueries({ queryKey: ["open-pools", effectiveCropType] });
      setSelectedPool(data.pool.id);
      toast.success("Pool created — your listing will join it");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not create pool");
    } finally {
      setCreatingPool(false);
    }
  }

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...picked]);
  }, []);

  const addVideos = useCallback((files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).filter((f) => f.type.startsWith("video/"));
    setVideos((prev) => [...prev, ...picked]);
  }, []);

  async function resolveLocation() {
    const query = locationInput.trim();
    if (!query) {
      toast.error("Enter where the produce is located");
      return;
    }
    setGeocoding(true);
    try {
      const match = await geocodeAddress(query);
      if (!match) {
        toast.error("Could not find that address — try adding more detail (city, state)");
        return;
      }
      setResolvedLocation({ lat: match.lat, lng: match.lng, label: query });
      toast.success("Location confirmed");
    } catch {
      toast.error("Could not look up that address");
    } finally {
      setGeocoding(false);
    }
  }

  async function onSubmit(values: FormValues) {
    if (!effectiveCropType) {
      toast.error(isOther ? "Enter the crop type" : "Select a crop or animal type");
      return;
    }
    if (needsSubType && !resolvedSubType) {
      toast.error(
        cropType === "Poultry"
          ? "Specify the poultry type"
          : isSeafood
            ? "Specify the seafood type"
            : isBeans
              ? "Select a type of beans"
              : "Specify the feed type"
      );
      return;
    }
    if (!(weightKg > 0)) {
      toast.error("Weight must be greater than 0");
      return;
    }
    if (!(pricePerKg > 0)) {
      toast.error("Price per kg must be greater than 0");
      return;
    }
    if (!isPooled && minOrderKgInput && minOrderKg > weightKg) {
      toast.error("Minimum order can't be more than the total weight");
      return;
    }
    if (images.length === 0) {
      toast.error("Add at least one photo");
      return;
    }
    if (isPooled && !selectedPool) {
      toast.error("Pick a pool to join, or turn pooling off");
      return;
    }
    if (differentLocation && !resolvedLocation) {
      toast.error("Confirm the produce's location before continuing");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("cropType", needsSubType ? `${effectiveCropType} (${resolvedSubType})` : effectiveCropType);
      form.append("weightKg", String(weightKg));
      form.append("pricePerKg", String(pricePerKg));
      form.append("grade", values.grade);
      if (!isPooled && minOrderKg > 0) form.append("minOrderKg", String(minOrderKg));
      if (differentLocation && resolvedLocation) {
        form.append("locationLabel", resolvedLocation.label);
        form.append("locationLat", String(resolvedLocation.lat));
        form.append("locationLng", String(resolvedLocation.lng));
      }
      form.append("isPooled", String(isPooled));
      if (isPooled && selectedPool) form.append("poolId", selectedPool);
      images.forEach((f) => form.append("images", f));
      videos.forEach((f) => form.append("videos", f));
      await api.post("/listings/create", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Listing created");
      navigate("..", { relative: "route" });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not create listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-extrabold text-primary-dark">Create a listing</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Image upload */}
          <div>
            <label className="mb-1 block text-sm font-bold text-primary-dark">Photos ({images.length})</label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInput.current?.click()}
              className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed p-4 text-center ${
                dragOver ? "border-accent bg-escrow/40" : "border-black/15 bg-white"
              }`}
            >
              <Upload className="text-muted" />
              <p className="mt-2 text-sm text-muted">Drag &amp; drop or tap to add photos</p>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
            {images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {images.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className="mb-1 block text-sm font-bold text-primary-dark">
              Videos ({videos.length}) — optional
            </label>
            <div
              onClick={() => videoInput.current?.click()}
              className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-black/15 bg-white p-4 text-center"
            >
              <Video className="text-muted" />
              <p className="mt-2 text-sm text-muted">Tap to add a short video (helps buyers see quality up close)</p>
              <input
                ref={videoInput}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                multiple
                hidden
                onChange={(e) => addVideos(e.target.files)}
              />
            </div>
            {videos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {videos.map((f, i) => (
                  <div key={i} className="relative">
                    <video src={URL.createObjectURL(f)} className="h-20 w-32 rounded-lg bg-black object-cover" muted />
                    <button
                      type="button"
                      onClick={() => setVideos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Crop or animal */}
          <div>
            <div className="flex gap-2">
              {(["crop", "animal"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setCropType("");
                    setOtherCropType("");
                    setSubType("");
                    setSeafoodType("");
                    setBeanType("");
                    setSelectedPool(null);
                  }}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-extrabold transition ${
                    kind === k ? "border-accent bg-white text-primary-dark" : "border-black/[.06] bg-white text-muted"
                  }`}
                >
                  {k === "crop" ? "Crop" : "Animal"}
                </button>
              ))}
            </div>
            <label className="mb-1 mt-3 block text-sm font-bold text-primary-dark">
              {kind === "crop" ? "Crop type" : "Animal type"}
            </label>
            <Dropdown
              placeholder={kind === "crop" ? "Select a crop" : "Select an animal"}
              value={cropType}
              onChange={(v) => {
                setCropType(v);
                setOtherCropType("");
                setSubType("");
                setSeafoodType("");
                setBeanType("");
                setSelectedPool(null);
              }}
              options={kind === "crop" ? CROP_OPTIONS : ANIMAL_OPTIONS}
            />
          </div>

          {isOther && (
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">Specify crop type</label>
              <input
                className="input"
                placeholder="e.g. Sweet Potato"
                value={otherCropType}
                onChange={(e) => setOtherCropType(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {isSeafood && (
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">Type of seafood</label>
              <Dropdown
                placeholder="Select a type"
                value={seafoodType}
                onChange={(v) => {
                  setSeafoodType(v);
                  setSubType("");
                }}
                options={SEAFOOD_OPTIONS}
              />
            </div>
          )}

          {isBeans && (
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">Type of beans</label>
              <Dropdown placeholder="Select a type" value={beanType} onChange={setBeanType} options={BEAN_OPTIONS} />
            </div>
          )}

          {(isFreeTextSubType || (isSeafood && seafoodType === "Other")) && (
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">
                {cropType === "Poultry" ? "Specify poultry type" : isSeafood ? "Specify seafood type" : "Specify feed type"}
              </label>
              <input
                className="input"
                placeholder={cropType === "Poultry" ? "e.g. Broiler chicken" : isSeafood ? "e.g. Snapper" : "e.g. Black soldier fly maggots"}
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
              />
            </div>
          )}

          {/* Weight + price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">Weight (kg)</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0"
                value={weightKgInput}
                onChange={(e) => setWeightKgInput(formatAmountInput(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">Price per kg (₦)</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0"
                value={pricePerKgInput}
                onChange={(e) => setPricePerKgInput(formatAmountInput(e.target.value))}
              />
            </div>
          </div>

          {/* Minimum order — lets buyers purchase part of the listing rather
              than only the whole thing. Not shown for pooled listings, which
              are always sold as a single village-pool contract. */}
          {!isPooled && (
            <div>
              <label className="mb-1 block text-sm font-bold text-primary-dark">
                Lowest quantity a buyer can order (kg)
              </label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="e.g. 5 — leave blank for no minimum"
                value={minOrderKgInput}
                onChange={(e) => setMinOrderKgInput(formatAmountInput(e.target.value))}
              />
            </div>
          )}

          {/* Produce location — defaults to the farmer's own registered
              address; only needed when this particular batch is somewhere
              else (another farm, a warehouse, etc). Manually typed and
              geocoded, same pattern as the buyer's delivery address. */}
          <div>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-black/[.06] bg-white p-3">
              <input
                type="checkbox"
                checked={differentLocation}
                onChange={(e) => {
                  setDifferentLocation(e.target.checked);
                  setResolvedLocation(null);
                }}
                className="h-4 w-4 text-accent focus:ring-accent"
              />
              <span className="text-sm font-bold text-primary-dark">
                This produce is at a different location than my farm
              </span>
            </label>

            {differentLocation && (
              <div className="mt-2.5">
                <label className="mb-1 block text-sm font-bold text-primary-dark">Produce location</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input min-w-0 flex-1"
                    placeholder="e.g. Along Epe road, Ikorodu, Lagos"
                    value={locationInput}
                    onChange={(e) => {
                      setLocationInput(e.target.value);
                      setResolvedLocation(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={resolveLocation}
                    disabled={geocoding}
                    className="btn-outline !min-h-0 !px-3 !py-2.5 text-xs"
                  >
                    {geocoding ? "Finding…" : "Confirm"}
                  </button>
                </div>
                {resolvedLocation && (
                  <p className="mt-1 text-xs font-bold text-primary">✓ Location confirmed</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Used for delivery distance and pickup — buyers and transporters see this instead of your farm's
                  saved address for this listing.
                </p>
              </div>
            )}
          </div>

          {/* Live total */}
          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
            <span className="text-muted">Total price</span>
            <span className="text-xl font-extrabold text-primary">{naira(total, 2)}</span>
          </div>

          {/* Grade */}
          <div>
            <label className="mb-1 block text-sm font-bold text-primary-dark">Grade</label>
            <div className="space-y-2">
              {GRADES.map((g) => (
                <label key={g.value} className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-black/[.06] bg-white p-3 has-[:checked]:border-accent">
                  <input type="radio" value={g.value} {...register("grade")} className="text-accent focus:ring-accent" />
                  <span>
                    <span className="font-extrabold text-primary-dark">{g.label}</span>
                    <span className="ml-2 text-sm text-muted">{g.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Pool toggle */}
          <label className="flex items-center justify-between rounded-xl border-2 border-black/[.06] bg-white p-3">
            <span className="font-extrabold text-primary-dark">Add to a Village Pool?</span>
            <input
              type="checkbox"
              className="h-6 w-6 rounded text-primary focus:ring-primary"
              checked={isPooled}
              onChange={(e) => {
                setIsPooled(e.target.checked);
                if (!e.target.checked) setSelectedPool(null);
              }}
            />
          </label>

          {isPooled && (
            <div className="card overflow-x-auto">
              {!effectiveCropType ? (
                <p className="p-4 text-sm text-muted">Select a crop type to see matching pools.</p>
              ) : (pools ?? []).length === 0 ? (
                selectedPool ? (
                  <p className="p-4 text-sm font-semibold text-primary">
                    Pool created — it'll be created together with your listing on submit.
                  </p>
                ) : (
                  <div className="p-4">
                    <p className="text-sm text-muted">
                      No open pools for {effectiveCropType} yet. Start one — buyers can fund it once it's listed.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-primary-dark">Contract name</label>
                        <input
                          className="input"
                          placeholder={`e.g. ${effectiveCropType} Village Pool`}
                          value={poolContractName}
                          onChange={(e) => setPoolContractName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-primary-dark">Target weight (kg)</label>
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={poolTargetWeightKg}
                          onChange={(e) => setPoolTargetWeightKg(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-primary-dark">Asking price per kg (₦)</label>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={poolPricePerKg}
                          onChange={(e) => setPoolPricePerKg(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-primary-dark">Deadline</label>
                        <input
                          className="input"
                          type="date"
                          min={format(new Date(Date.now() + MIN_POOL_LEAD_DAYS * 86400000), "yyyy-MM-dd")}
                          value={poolDeadline}
                          onChange={(e) => setPoolDeadline(e.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-bold text-primary-dark">
                          Visible to others within {poolRadiusKm}km
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step={5}
                          value={poolRadiusKm}
                          onChange={(e) => setPoolRadiusKm(Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-outline mt-3 w-full"
                      onClick={createPool}
                      disabled={creatingPool}
                    >
                      {creatingPool ? "Creating…" : "Create pool"}
                    </button>
                  </div>
                )
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-background text-left text-muted">
                    <tr>
                      <th className="px-3 py-2">Contract</th>
                      <th className="px-3 py-2">Buyer</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Filled</th>
                      <th className="px-3 py-2">Deadline</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pools ?? []).map((p) => {
                      const pct = p.percentageFilled ?? Math.round((p.currentWeightKg / p.targetWeightKg) * 100);
                      const selected = selectedPool === p.id;
                      return (
                        <tr key={p.id} className="border-t border-border">
                          <td className="px-3 py-2 font-bold text-primary-dark">{p.contractName}</td>
                          <td className="px-3 py-2">{p.buyerName ?? "—"}</td>
                          <td className="px-3 py-2">{p.targetWeightKg} kg</td>
                          <td className="px-3 py-2">{pct}%</td>
                          <td className="px-3 py-2 text-muted">{format(parseISO(p.deadline), "d MMM")}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPool(selected ? null : p.id)}
                              className={`rounded-pill px-3 py-1.5 text-xs font-bold ${
                                selected ? "bg-primary text-white" : "border border-primary text-primary"
                              }`}
                            >
                              {selected ? "Joined" : "Join This Pool"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "List for sale"}
          </button>
        </form>
    </div>
  );
}

