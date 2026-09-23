import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role !== "ADMIN") {
        setError("This account is not an administrator.");
        return;
      }
      navigate("/", { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-2xl font-bold text-primary mb-1">🌾 Farm2Me</div>
        <div className="text-muted mb-6">Admin console</div>

        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 mb-4"
          type="email"
          placeholder="admin@farm2me.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Password</label>
          <Link to="/forgot-password" className="text-xs font-semibold text-primary">
            Forgot password?
          </Link>
        </div>
        <div className="relative mb-4">
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-14"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <button
          onClick={submit}
          disabled={busy || !email || !password}
          className="w-full rounded-full bg-primary text-white py-2.5 font-semibold disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}
