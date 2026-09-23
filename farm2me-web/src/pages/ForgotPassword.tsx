import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { FarmLeafIcon, FarmWordmark } from "../components/Logo";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Only ever populated in dev, when no real email provider is configured on
  // the backend — see forgotPassword in auth.controller.ts.
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function submit() {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ devResetUrl?: string }>("/auth/forgot-password", {
        email,
        app: "web",
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
    <div className="flex min-h-screen items-center justify-center bg-page-background px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <FarmLeafIcon size={32} />
          <FarmWordmark size="text-xl" />
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-extrabold text-primary-dark">Reset your password</h1>

          {sent ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted">
                If an account exists for <span className="font-bold text-primary-dark">{email}</span>, a password
                reset link has been sent to it. The link expires in 1 hour.
              </p>
              {devResetUrl && (
                <div className="rounded-xl border border-accent/30 bg-escrow p-3 text-xs text-escrow-ink">
                  <div className="mb-1 font-bold">Dev mode — no email provider configured</div>
                  <a href={devResetUrl} className="break-all underline">
                    {devResetUrl}
                  </a>
                </div>
              )}
              <Link to="/auth" className="block text-center text-sm font-bold text-primary-dark">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Enter the email on your account and we'll send you a link to reset your password.
              </p>

              <label className="mt-4 block text-sm font-bold text-primary-dark">Email</label>
              <input
                className="input mt-1"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />

              <button className="btn-ink mt-5 w-full" disabled={!email || busy} onClick={submit}>
                {busy ? "Sending…" : "Send reset link"}
              </button>

              {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}

              <Link to="/auth" className="mt-4 block text-center text-sm font-semibold text-muted">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
