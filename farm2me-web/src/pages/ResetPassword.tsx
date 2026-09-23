import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import { FarmLeafIcon, FarmWordmark } from "../components/Logo";

// Mirrors the backend's password policy (see auth.validators.ts).
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validPassword = PASSWORD_RULE.test(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit() {
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    if (!validPassword || mismatch || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/auth", { replace: true }), 1500);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page-background px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <FarmLeafIcon size={32} />
          <FarmWordmark size="text-xl" />
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-extrabold text-primary-dark">Choose a new password</h1>

          {!token ? (
            <p className="mt-4 text-sm text-danger">
              This link is missing its reset token. Request a new one from the{" "}
              <Link to="/forgot-password" className="underline">
                forgot password
              </Link>{" "}
              page.
            </p>
          ) : done ? (
            <p className="mt-4 text-sm font-bold text-primary">Password updated — redirecting you to sign in…</p>
          ) : (
            <>
              <label className="mt-4 block text-sm font-bold text-primary-dark">New password</label>
              <div className="relative mt-1">
                <input
                  className="input pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                At least 8 characters, with upper &amp; lowercase letters, a number, and a special character.
              </p>

              <label className="mt-4 block text-sm font-bold text-primary-dark">Confirm password</label>
              <input
                className="input mt-1"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              {mismatch && <p className="mt-1.5 text-xs text-danger">Passwords don't match.</p>}

              <button
                className="btn-ink mt-5 w-full"
                disabled={busy || !validPassword || mismatch}
                onClick={submit}
              >
                {busy ? "Saving…" : "Reset password"}
              </button>

              {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
