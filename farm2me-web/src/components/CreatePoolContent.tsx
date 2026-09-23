import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { api } from "../api/client";
import {
  ANIMAL_TYPES,
  ANIMAL_TYPES_NEEDING_SUBTYPE,
  ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE,
  BEAN_TYPES,
  CROP_TYPES,
  SEAFOOD_TYPES,
  type VillagePool,
} from "../lib/types";
import Dropdown from "./Dropdown";

// Backend enforces the same minimum (see pool.validators.ts) — checked
// client-side so the date picker starts the user on a valid day.
const MIN_LEAD_DAYS = 3;

const CROP_OPTIONS = CROP_TYPES.map((c) => ({ value: c, label: c }));
const ANIMAL_OPTIONS = ANIMAL_TYPES.map((a) => ({ value: a, label: a }));
const SEAFOOD_OPTIONS = SEAFOOD_TYPES.map((s) => ({ value: s, label: s }));
const BEAN_OPTIONS = BEAN_TYPES.map((b) => ({ value: b, label: b }));

// Bare "create a pool" form — no page chrome, so it can render either
// standalone (wrapped in AppShell, see CreatePool.tsx) or nested inside a
// dashboard shell (e.g. /buyer/:name/pools/new, wrapped in AppShell already).
// A buyer's demand contract: how much of a crop or animal they need, and
// what they're offering to pay per kg — farmers then supply into it.
export default function CreatePoolContent() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<"crop" | "animal">("crop");
  const [cropType, setCropType] = useState("");
  const [subType, setSubType] = useState("");
  const [seafoodType, setSeafoodType] = useState("");
  const [beanType, setBeanType] = useState("");
  const [contractName, setContractName] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [deadline, setDeadline] = useState("");
  const [radiusKm, setRadiusKm] = useState(25);
  const [submitting, setSubmitting] = useState(false);

  const isSeafood = cropType === "Seafood";
  const isBeans = cropType === "Beans";
  const needsSubType = (ANIMAL_TYPES_NEEDING_SUBTYPE as readonly string[]).includes(cropType) || isBeans;
  const isFreeTextSubType = (ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE as readonly string[]).includes(cropType);
  // Seafood picks from a species dropdown ("Other" reveals the same free-text
  // field Poultry/Animal Feed use); Beans picks from a fixed 3-option
  // dropdown (no free-text fallback); everything else needing a sub-type is
  // pure free text.
  const resolvedSubType = isSeafood
    ? (seafoodType === "Other" ? subType.trim() : seafoodType)
    : isBeans
      ? beanType
      : subType.trim();

  const canSubmit =
    !!cropType &&
    (!needsSubType || resolvedSubType.length > 0) &&
    contractName.trim().length > 0 &&
    Number(targetWeightKg) > 0 &&
    Number(pricePerKg) > 0 &&
    !!deadline;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await api.post<{ pool: VillagePool }>("/pools/create", {
        contractName: contractName.trim(),
        cropType,
        ...(needsSubType ? { subType: resolvedSubType } : {}),
        targetWeightKg: Number(targetWeightKg),
        pricePerKg: Number(pricePerKg),
        deadline: new Date(deadline).toISOString(),
        radiusKm,
      });
      toast.success("Pool created");
      navigate(`../${data.pool.id}`, { relative: "path" });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not create pool");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-extrabold text-primary-dark">Create a Village Pool</h1>
      <p className="mt-1 text-sm text-muted">
        Tell farmers how much you need — of a crop or an animal — and what you're paying per kg.
      </p>

      <div className="mt-5 flex gap-2">
        {(["crop", "animal"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCropType("");
              setSubType("");
              setSeafoodType("");
              setBeanType("");
            }}
            className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-extrabold transition ${
              kind === k ? "border-accent bg-white text-primary-dark" : "border-black/[.06] bg-white text-muted"
            }`}
          >
            {k === "crop" ? "Crop" : "Animal"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-bold text-primary-dark">
          {kind === "crop" ? "Crop type" : "Animal type"}
        </label>
        <Dropdown
          placeholder={kind === "crop" ? "Select a crop" : "Select an animal"}
          value={cropType}
          onChange={(v) => {
            setCropType(v);
            setSubType("");
            setSeafoodType("");
            setBeanType("");
          }}
          options={kind === "crop" ? CROP_OPTIONS : ANIMAL_OPTIONS}
        />
      </div>

      {isSeafood && (
        <div className="mt-4">
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
        <div className="mt-4">
          <label className="mb-1 block text-sm font-bold text-primary-dark">Type of beans</label>
          <Dropdown
            placeholder="Select a type"
            value={beanType}
            onChange={setBeanType}
            options={BEAN_OPTIONS}
          />
        </div>
      )}

      {(isFreeTextSubType || (isSeafood && seafoodType === "Other")) && (
        <div className="mt-4">
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

      <div className="mt-4">
        <label className="mb-1 block text-sm font-bold text-primary-dark">Contract name</label>
        <input
          className="input"
          placeholder={cropType ? `e.g. ${cropType} Bulk Order` : "e.g. Bulk Order"}
          value={contractName}
          onChange={(e) => setContractName(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-bold text-primary-dark">Quantity needed (kg)</label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={targetWeightKg}
            onChange={(e) => setTargetWeightKg(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-primary-dark">Price offered per kg (₦)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={pricePerKg}
            onChange={(e) => setPricePerKg(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-bold text-primary-dark">Deadline</label>
        <input
          className="input"
          type="date"
          min={format(new Date(Date.now() + MIN_LEAD_DAYS * 86400000), "yyyy-MM-dd")}
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-bold text-primary-dark">
          Visible to farmers within {radiusKm}km
        </label>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <p className="mt-1 text-xs text-muted">
          Centered on your profile location — set it first if you haven't already.
        </p>
      </div>

      <button className="btn-primary mt-6 w-full" disabled={!canSubmit || submitting} onClick={submit}>
        {submitting ? "Creating…" : "Create pool"}
      </button>
    </div>
  );
}
