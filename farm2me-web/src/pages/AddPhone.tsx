import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { ROLE_HOME, type User } from "../lib/types";
import AppShell from "../components/AppShell";

const OTP_LEN = 6;

// Lets a Google-only account (no phoneNumber yet) add and verify one — the
// same OTP machinery as sign-up, just attaching to the existing account
// instead of creating a new one (see POST /auth/link-phone).
export default function AddPhone() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [digits, setDigits] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const phoneNumber = `+234${digits}`;
  const validPhone = /^[789][01]\d{8}$/.test(digits);
  const otpValue = otp.join("");
  const complete = otpValue.length === OTP_LEN && otp.every(Boolean);

  async function sendOtp() {
    if (!validPhone || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ devOtp?: string }>("/auth/request-otp", { phoneNumber });
      if (data.devOtp) {
        setDevOtp(data.devOtp);
        setOtp(data.devOtp.split(""));
        toast.success(`Dev mode: code is ${data.devOtp} (auto-filled)`);
      } else {
        setDevOtp(null);
        toast.success("Code sent");
      }
      setStep("otp");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  function onOtpChange(v: string, i: number) {
    const c = v.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = c;
      return next;
    });
    if (c && i < OTP_LEN - 1) inputs.current[i + 1]?.focus();
  }

  async function verify() {
    if (!complete || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User }>("/auth/link-phone", {
        phoneNumber,
        otp: otpValue,
      });
      updateUser(data.user);
      toast.success("Phone number added");
      navigate(user ? ROLE_HOME[user.role] : "/", { replace: true });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not verify code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-extrabold text-primary-dark">Add your phone number</h1>
        <p className="mt-1 text-sm text-muted">
          Needed for delivery updates and driver contact — your account works without it, but
          escrow SMS notifications won't reach you until it's added.
        </p>

        {step === "otp" && devOtp && (
          <div className="mt-4 rounded-xl bg-escrow px-3 py-2.5 text-sm font-bold text-escrow-ink">
            No SMS provider configured — dev code <span className="font-mono">{devOtp}</span> (already filled in below)
          </div>
        )}

        {step === "phone" ? (
          <div className="mt-5">
            <label className="text-sm font-bold text-primary-dark">Phone number</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex min-h-tap items-center rounded-xl border border-black/10 bg-white px-3 font-bold">
                🇳🇬 +234
              </span>
              <input
                className="input flex-1"
                inputMode="numeric"
                placeholder="803 000 0000"
                value={digits}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "");
                  if (v.startsWith("0")) v = v.slice(1);
                  setDigits(v.slice(0, 10));
                }}
              />
            </div>
            <button className="btn-ink mt-5 w-full" disabled={!validPhone || busy} onClick={sendOtp}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <label className="text-sm font-bold text-primary-dark">Enter code</label>
            <p className="mt-1 text-xs text-muted">Code sent to {phoneNumber}.</p>
            <div className="mt-2 flex justify-between gap-2">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  className="h-14 w-12 rounded-xl border border-black/10 bg-white text-center text-xl font-extrabold focus:border-2 focus:border-accent"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => onOtpChange(e.target.value, i)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
                  }}
                />
              ))}
            </div>
            <button className="btn-ink mt-5 w-full" disabled={!complete || busy} onClick={verify}>
              {busy ? "Verifying…" : "Verify & save"}
            </button>
            <button className="mt-3 w-full text-sm font-semibold text-muted" onClick={() => setStep("phone")}>
              ← Change number
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
