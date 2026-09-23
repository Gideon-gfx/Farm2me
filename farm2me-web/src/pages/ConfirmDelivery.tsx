import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Lock, ShieldCheck, X } from "lucide-react";
import { api } from "../api/client";
import TopBar from "../components/TopBar";

const LEN = 4;

export default function ConfirmDelivery() {
  const { escrowId } = useParams<{ escrowId: string }>();
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const pin = digits.join("");
  const complete = pin.length === LEN;

  function onChange(v: string, i: number) {
    const c = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = c;
      return next;
    });
    if (c && i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  async function confirm() {
    if (!complete || busy) return;
    setBusy(true);
    try {
      await api.post("/payments/confirm-delivery", { escrowTripId: escrowId, pin });
      toast.success("Payment released to the farmer. Thank you!");
      navigate("/buyer");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not confirm delivery");
    } finally {
      setBusy(false);
    }
  }

  async function submitDispute() {
    if (reason.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      await api.post("/payments/raise-dispute", { escrowTripId: escrowId, reason: reason.trim(), evidenceUrls: [] });
      toast.success("Dispute raised — our team will be in touch.");
      navigate("/buyer");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not raise dispute");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="card p-6 text-center">
          <ShieldCheck className="mx-auto text-primary" size={40} />
          <h1 className="mt-3 text-2xl font-extrabold text-primary-dark">Confirm receipt</h1>
          <p className="mt-1 text-sm text-muted">
            Enter the PIN shown by your driver to confirm receipt and release payment.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className="h-16 w-14 rounded-xl border border-black/10 bg-white text-center text-2xl font-extrabold text-primary-dark focus:border-2 focus:border-accent"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => onChange(e.target.value, i)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>

          <button onClick={confirm} disabled={!complete || busy} className="btn-primary mt-6 w-full">
            {busy ? "Releasing…" : "Confirm Receipt & Release Payment"}
          </button>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-escrow p-3 text-left">
            <Lock size={15} className="mt-0.5 flex-none text-escrow-ink" />
            <span className="text-xs font-bold leading-relaxed text-escrow-ink">
              Releases the buyer's payment to the farmer and transporter
            </span>
          </div>

          <button onClick={() => setDisputeOpen(true)} className="mt-4 text-sm font-bold text-danger">
            Something went wrong? Raise a Dispute
          </button>
        </div>
      </main>

      {disputeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setDisputeOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-card" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-primary-dark">Raise a dispute</h3>
              <button onClick={() => setDisputeOpen(false)} className="text-muted"><X size={20} /></button>
            </div>
            <textarea
              className="input min-h-[100px] py-2"
              placeholder="Describe what went wrong (e.g. goods spoiled, wrong quantity)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button onClick={submitDispute} disabled={reason.trim().length < 3 || busy} className="btn-ink mt-4 w-full">
              Submit dispute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
