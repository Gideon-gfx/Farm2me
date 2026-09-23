import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Only ever populated in local dev, when no real email provider is
  // configured on the backend — see forgotPassword in auth.controller.ts.
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function submit() {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ devResetUrl?: string }>("/auth/forgot-password", {
        email,
        app: "admin",
      });
      setSent(true);
      setDevResetUrl(data.devResetUrl ?? null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-2xl font-bold text-primary mb-1">🌾 Farm2Me</div>
        <div className="text-muted mb-6">Reset admin password</div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              If an account exists for <span className="font-semibold">{email}</span>, a password reset link has
              been sent to it. The link expires in 1 hour.
            </p>
            {devResetUrl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-semibold mb-1">Dev mode — no email provider configured</div>
                <a href={devResetUrl} className="underline break-all">
                  {devResetUrl}
                </a>
              </div>
            )}
            <Link to="/login" className="block text-center text-sm font-semibold text-primary">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 mb-4"
              type="email"
              placeholder="admin@farm2me.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />

            <button
              onClick={submit}
              disabled={busy || !email}
              className="w-full rounded-full bg-primary text-white py-2.5 font-semibold disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>

            {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

            <Link to="/login" className="mt-4 block text-center text-sm font-semibold text-muted">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
