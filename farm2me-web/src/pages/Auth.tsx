import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Wheat, Store, Truck, Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { captureLocation } from "../lib/location";
import { ROLE_HOME, type Role, type User } from "../lib/types";
import { FarmLeafIcon, FarmTagline, FarmWordmark } from "../components/Logo";
import CountryPhoneInput from "../components/CountryPhoneInput";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type SignupRole = Extract<Role, "FARMER" | "BUYER" | "TRANSPORTER">;
const ROLES: { role: SignupRole; icon: typeof Wheat; label: string }[] = [
  { role: "FARMER", icon: Wheat, label: "Farmer" },
  { role: "BUYER", icon: Store, label: "Buyer" },
  { role: "TRANSPORTER", icon: Truck, label: "Driver" },
];

// Mirrors the backend's signup password policy (see auth.validators.ts) so
// the user sees the requirement before submitting instead of after a 400.
const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
// Mirrors the backend's contactPhone validator — loose on purpose, since
// this is a required contact field (not a verification method) and needs to
// accept phone numbers from any country.
const PHONE_RULE = /^\+?[1-9]\d{6,14}$/;

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession, updateUser } = useAuth();

  const initialRole = (params.get("role") as SignupRole) || "FARMER";
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [role, setRole] = useState<SignupRole>(
    ["FARMER", "BUYER", "TRANSPORTER"].includes(initialRole) ? initialRole : "FARMER"
  );
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const validPhone = PHONE_RULE.test(phoneNumber.trim());
  const validName = fullName.trim().length >= 2;
  // In signup mode only Full name + Phone number show at first; email/
  // password roll down once both are filled in — and Google is disabled
  // until then too, since phoneNumber is compulsory for either signup path.
  const revealRest = mode === "login" || (validName && validPhone);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  // The Google button is initialized once (see the effect below) and its
  // callback closes over `role`/`phoneNumber` from that first render — refs
  // keep it reading the *current* values instead of stale ones.
  const roleRef = useRef(role);
  const phoneRef = useRef(phoneNumber);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    phoneRef.current = phoneNumber;
  }, [phoneNumber]);

  const validEmail = /^\S+@\S+\.\S+$/.test(email);
  const validPassword = PASSWORD_RULE.test(password);
  const canSubmit =
    validEmail &&
    (mode === "login" ? password.length > 0 : validPassword && validName && validPhone);

  // Render the official Google button once the Identity Services script has
  // loaded. Polls briefly since the script tag loads async and there's no
  // load event we can await from here.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google || !googleBtnRef.current) {
        setTimeout(tryInit, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 320,
      });
    };
    tryInit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogleCredential(response: { credential: string }) {
    setBusy(true);
    try {
      // role/phoneNumber only matter for a first-time signup — an
      // already-existing Google account logs straight in and ignores them.
      const { data } = await api.post<{ token: string; user: User }>("/auth/google", {
        idToken: response.credential,
        role: roleRef.current,
        phoneNumber: phoneRef.current.trim(),
      });
      setSession(data.token, data.user);
      captureLocation(updateUser);
      toast.success(`Welcome, ${data.user.fullName}`);
      navigate(ROLE_HOME[data.user.role], { replace: true });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const { data } =
        mode === "signup"
          ? await api.post<{ token: string; user: User }>("/auth/signup", {
              email,
              password,
              fullName: fullName.trim(),
              phoneNumber: phoneNumber.trim(),
              role,
            })
          : await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      setSession(data.token, data.user);
      captureLocation(updateUser);
      toast.success(`Welcome, ${data.user.fullName}`);
      navigate(ROLE_HOME[data.user.role], { replace: true });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? (mode === "signup" ? "Could not create account" : "Sign in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand, matches the prototype's onboarding split screen */}
      <div className="hidden w-[420px] flex-none flex-col items-center justify-center gap-5 bg-primary-dark p-10 text-center lg:flex">
        <FarmLeafIcon size={96} dark />
        <div>
          <FarmWordmark size="text-4xl" dark />
          <div className="mt-3">
            <FarmTagline dark />
          </div>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-[#F5EFE2]/75">
          One marketplace connecting farm produce, bulk buyers and transport — with every
          payment protected by escrow.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <FarmLeafIcon size={28} />
            <FarmWordmark size="text-lg" />
          </div>

          <h1 className="text-2xl font-extrabold text-primary-dark">
            {mode === "signup" ? "How will you use Farm2me?" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "signup" ? "Create your account to get started." : "Sign in to your account."}
          </p>

          {mode === "signup" && (
            <div className="mt-5 flex flex-col gap-2.5">
              {ROLES.map(({ role: r, icon: Icon, label }) => {
                const active = role === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex items-center gap-3.5 rounded-2xl border-2 bg-white p-3.5 text-left transition ${
                      active ? "border-accent" : "border-black/[.06]"
                    }`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-primary">
                      <Icon size={19} />
                    </span>
                    <span className="text-sm font-extrabold text-primary-dark">{label}</span>
                    <span
                      className={`ml-auto flex h-5 w-5 items-center justify-center rounded-full border-2 border-accent`}
                    >
                      {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3.5">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-sm font-bold text-primary-dark">Full name</label>
                  <input
                    className="input mt-1"
                    placeholder="e.g. Amaka Okafor"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-primary-dark">Phone number</label>
                  <CountryPhoneInput value={phoneNumber} onChange={setPhoneNumber} />
                  <p className="mt-1.5 text-xs text-muted">
                    Required so buyers, farmers and transporters can reach you directly — never used to verify your account.
                  </p>
                </div>
              </>
            )}

            <div
              className={`flex flex-col gap-3.5 overflow-hidden transition-all duration-300 ease-out ${
                revealRest ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div>
                <label className="text-sm font-bold text-primary-dark">Email</label>
                <input
                  className="input mt-1"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  tabIndex={revealRest ? 0 : -1}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-primary-dark">Password</label>
                  {mode === "login" && (
                    <Link to="/forgot-password" className="text-xs font-bold text-primary-dark">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative mt-1">
                  <input
                    className="input pr-10"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    tabIndex={revealRest ? 0 : -1}
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
                {mode === "signup" && (
                  <p className="mt-1.5 text-xs text-muted">
                    At least 8 characters, with upper &amp; lowercase letters, a number, and a special character.
                  </p>
                )}
              </div>
            </div>
          </div>

          <button className="btn-ink mt-5 w-full" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {GOOGLE_CLIENT_ID && (
            <>
              <div className="mt-4 flex items-center gap-3 text-xs font-bold text-muted">
                <div className="h-px flex-1 bg-black/10" />
                OR CONTINUE WITH GOOGLE
                <div className="h-px flex-1 bg-black/10" />
              </div>
              <div className="mt-4 flex justify-center" ref={googleBtnRef} />
            </>
          )}

          <p className="mt-3 text-center text-xs text-muted">Payments protected by Farm2me Escrow</p>

          <button
            className="mt-4 w-full text-center text-sm font-semibold text-muted"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
