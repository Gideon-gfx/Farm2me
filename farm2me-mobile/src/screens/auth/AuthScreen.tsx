import React, { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { captureLocation } from "../../lib/location";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button } from "../../components/ui";
import { FarmLeafIcon, FarmTagline, FarmWordmark } from "../../components/Logo";
import CountryPhoneInput from "../../components/CountryPhoneInput";
import type { Role, User } from "../../types";

WebBrowser.maybeCompleteAuthSession();

// Same policy the backend enforces (see auth.validators.ts) — checked
// client-side so the user sees the requirement before submitting.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
const EMAIL_RULE = /^\S+@\S+\.\S+$/;
// Mirrors the backend's contactPhone validator — loose on purpose, since
// this is a required contact field (not a verification method) and needs to
// accept phone numbers from any country.
const PHONE_RULE = /^\+?[1-9]\d{6,14}$/;

// Set these (e.g. via app.json "extra" or EXPO_PUBLIC_ env vars) once Google
// OAuth client IDs exist for this app — the button only renders when at
// least one is configured, same as the web app's GOOGLE_CLIENT_ID gate.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_CONFIGURED = !!(GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
// expo-auth-session's hook below always runs (rules of hooks apply even
// before Google sign-in is configured for this app) — give it a well-formed
// placeholder client id in that case instead of an empty string, so it
// never throws while building a request nothing will actually use (the
// button that calls promptAsync stays hidden unless GOOGLE_CONFIGURED).
const PLACEHOLDER_GOOGLE_CLIENT_ID = "000000000000-placeholder.apps.googleusercontent.com";

type SelectableRole = Extract<Role, "FARMER" | "BUYER" | "TRANSPORTER">;

const ROLE_CARDS: { role: SelectableRole; init: string; label: string; desc: string; tint: string; tfg: string }[] = [
  { role: "FARMER", init: "F", label: "Farmer", desc: "List produce & get paid via escrow", tint: COLORS.SUCCESS_BG, tfg: COLORS.PRIMARY },
  { role: "BUYER", init: "B", label: "Buyer", desc: "Source farm produce in bulk", tint: COLORS.ESCROW_BG, tfg: COLORS.ESCROW_TEXT },
  { role: "TRANSPORTER", init: "T", label: "Transporter", desc: "Find loads along your route", tint: "#E3E1D6", tfg: COLORS.PRIMARY_DARK },
];

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"signup" | "login" | "forgot">("signup");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [role, setRole] = useState<SelectableRole | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validName = fullName.trim().length >= 2;
  const validPhone = PHONE_RULE.test(phoneNumber.trim());
  // In signup mode only Full name + Phone number show at first; email/
  // password roll down once both are filled in — and Google is disabled
  // until then too, since phoneNumber is compulsory for either signup path.
  const revealRest = mode === "login" || (mode === "signup" && validName && validPhone);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || PLACEHOLDER_GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params?.id_token;
      if (idToken) googleSignIn(idToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function googleSignIn(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{ token: string; user: User }>("/auth/google", {
        idToken,
        role: role ?? "FARMER",
        phoneNumber: phoneNumber.trim(),
      });
      await signIn(data.token, data.user);
      captureLocation();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  const validEmail = EMAIL_RULE.test(email);
  const validPassword = PASSWORD_RULE.test(password);
  const canSubmit =
    validEmail &&
    (mode === "login" ? password.length > 0 : validPassword && validName && validPhone && !!role);

  async function sendResetLink() {
    if (!EMAIL_RULE.test(forgotEmail) || forgotLoading) return;
    setForgotLoading(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotSent(true);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not send reset link.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function submit() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
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
      await signIn(data.token, data.user);
      captureLocation();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[auth] submit failed:", e?.response?.status, e?.response?.data ?? e?.message ?? e);
      setError(e?.response?.data?.error ?? (mode === "signup" ? "Could not create account." : "Sign in failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : StatusBar.currentHeight ?? 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <FarmLeafIcon size={68} />
          <View style={{ marginTop: SPACING.sm }}>
            <FarmWordmark />
          </View>
          <View style={{ marginTop: SPACING.sm }}>
            <FarmTagline />
          </View>
        </View>

        <Text style={styles.title}>
          {mode === "signup" ? "How will you use Farm2me?" : mode === "forgot" ? "Reset your password" : "Welcome back"}
        </Text>

        {mode === "forgot" && (
          <View style={{ marginTop: SPACING.md }}>
            {forgotSent ? (
              <Text style={styles.hint}>
                If an account exists for {forgotEmail.trim()}, we've sent a password reset link to that email —
                open it to choose a new password.
              </Text>
            ) : (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  label="Send reset link"
                  onPress={sendResetLink}
                  disabled={!EMAIL_RULE.test(forgotEmail)}
                  loading={forgotLoading}
                  variant="ink"
                  style={{ marginTop: SPACING.lg }}
                />
              </>
            )}
            <TouchableOpacity
              onPress={() => {
                setMode("login");
                setForgotSent(false);
                setError(null);
              }}
            >
              <Text style={styles.switchMode}>Back to login</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === "signup" && (
          <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
            {ROLE_CARDS.map((card) => {
              const selected = role === card.role;
              return (
                <TouchableOpacity
                  key={card.role}
                  style={[styles.roleCard, selected && styles.roleCardSelected]}
                  onPress={() => setRole(card.role)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.roleInit, { backgroundColor: card.tint }]}>
                    <Text style={[styles.roleInitText, { color: card.tfg }]}>{card.init}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleLabel}>{card.label}</Text>
                    <Text style={styles.roleDesc}>{card.desc}</Text>
                  </View>
                  <View style={[styles.roleDotRing, selected && styles.roleDotRingOn]}>
                    {selected && <View style={styles.roleDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {mode === "signup" && (
          <>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Amaka Okafor"
              placeholderTextColor={COLORS.TEXT_MUTED}
              autoFocus
            />

            <Text style={styles.label}>Phone number</Text>
            <CountryPhoneInput value={phoneNumber} onChange={setPhoneNumber} />
            <Text style={styles.hint}>
              Required so buyers, farmers and transporters can reach you directly — never used to verify your account.
            </Text>
          </>
        )}

        {revealRest && (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.TEXT_MUTED}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.TEXT_MUTED}
                secureTextEntry={!showPassword}
                onSubmitEditing={submit}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeToggle}>
                <Text style={styles.eyeToggleText}>{showPassword ? "Hide" : "Show"}</Text>
              </TouchableOpacity>
            </View>
            {mode === "signup" && (
              <Text style={styles.hint}>
                At least 8 characters, with upper &amp; lowercase letters, a number, and a special character.
              </Text>
            )}
            {mode === "login" && (
              <TouchableOpacity
                onPress={() => {
                  setForgotEmail(email);
                  setForgotSent(false);
                  setError(null);
                  setMode("forgot");
                }}
              >
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {mode !== "forgot" && (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={mode === "signup" ? "Create account" : "Sign in"}
              onPress={submit}
              disabled={!canSubmit}
              loading={loading}
              variant={canSubmit ? "ink" : "outline"}
              style={{ marginTop: SPACING.lg }}
            />

            {GOOGLE_CONFIGURED && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR CONTINUE WITH GOOGLE</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Button
                  label="Continue with Google"
                  onPress={() => promptAsync()}
                  disabled={!request || loading}
                  variant="outline"
                />
              </>
            )}

            <Text style={styles.footnote}>Payments protected by Farm2me Escrow</Text>

            <TouchableOpacity onPress={() => setMode(mode === "signup" ? "login" : "signup")}>
              <Text style={styles.switchMode}>
                {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.xl },
  logoWrap: { alignItems: "center", marginBottom: SPACING.lg },
  title: {
    fontSize: 22,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    textAlign: "center",
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.1)" },
  dividerText: { fontSize: 11, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  label: {
    fontSize: 15,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: FONT.family,
    backgroundColor: COLORS.SURFACE,
    color: COLORS.TEXT_PRIMARY,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.SURFACE,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
  eyeToggle: { paddingHorizontal: 14 },
  eyeToggleText: { fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  hint: { marginTop: SPACING.xs, fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  forgotLink: {
    marginTop: SPACING.sm,
    fontSize: 12.5,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.PRIMARY,
    textAlign: "right",
  },
  error: { color: COLORS.DANGER, marginTop: SPACING.md, fontSize: FONT.size.small, fontFamily: FONT.family },
  footnote: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: FONT.family,
    color: COLORS.TEXT_MUTED,
    marginTop: SPACING.md,
  },
  switchMode: {
    textAlign: "center",
    marginTop: SPACING.md,
    fontSize: FONT.size.small,
    fontFamily: FONT.family,
    color: COLORS.TEXT_MUTED,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.06)",
  },
  roleCardSelected: { borderColor: COLORS.ACCENT },
  roleInit: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  roleInitText: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 17 },
  roleLabel: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 15, color: COLORS.TEXT_PRIMARY },
  roleDesc: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  roleDotRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  roleDotRingOn: {},
  roleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.ACCENT },
});
