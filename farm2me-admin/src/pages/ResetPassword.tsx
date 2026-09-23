import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

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

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit() {
    if (!token) {
      setError("This reset link is missing its token.");
      return;
    }
    if (mismatch || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-2xl font-bold text-primary mb-1">🌾 Farm2Me</div>
        <div className="text-muted mb-6">Choose a new password</div>

        {!token ? (
          <div className="text-sm text-red-600">
            This link is missing its reset token. Request a new one from the{" "}
            <Link to="/forgot-password" className="underline">
              forgot password
            </Link>{" "}
            page.
          </div>
        ) : done ? (
          <div className="text-sm text-green-700">Password updated — redirecting you to sign in…</div>
        ) : (
          <>
            <label className="block text-sm font-medium mb-1">New password</label>
            <div className="relative mb-4">
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-14"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-muted mb-4">
              At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special
              character.
            </p>

            <label className="block text-sm font-medium mb-1">Confirm password</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 mb-4"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {mismatch && <div className="mb-4 text-sm text-red-600">Passwords don't match.</div>}

            <button
              onClick={submit}
              disabled={busy || !password || mismatch}
              className="w-full rounded-full bg-primary text-white py-2.5 font-semibold disabled:opacity-50"
            >
              {busy ? "Saving…" : "Reset password"}
            </button>

            {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
