import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, Card } from "../../components/ui";
import type { RootStackParamList } from "../../navigation/types";

function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

const TIER_LABEL: Record<string, string> = { FREE: "Free", STANDARD: "Standard", PREMIUM: "Premium" };
const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

interface WalletDeposit {
  id: string;
  amount: string | number;
  status: "PENDING" | "COMPLETED";
  createdAt: string;
}
interface WalletData {
  walletBalance: string | number;
  deposits: WalletDeposit[];
}

export default function WalletScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    try {
      const { data } = await api.get<WalletData>("/wallet");
      setWallet(data);
    } catch {
      // Best-effort — balance still shows from the auth profile below.
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  async function deposit() {
    const value = Number(amount);
    if (!value || value < 100) {
      setError("Enter an amount of at least ₦100.");
      return;
    }
    setError(null);
    setDepositing(true);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/wallet/deposit", { amount: value });
      setCheckoutUrl(data.checkoutUrl);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not start deposit.");
      setDepositing(false);
    }
  }

  async function onWebViewNavChange(navState: { url: string }) {
    if (navState.url.includes("payment-complete")) {
      setCheckoutUrl(null);
      setDepositing(false);
      setAmount("");
      await refreshProfile();
      await loadWallet();
    }
  }

  const balance = wallet?.walletBalance ?? user?.walletBalance ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.md }]}>
        <Text style={styles.title}>Wallet</Text>
        <View style={styles.card}>
          <Text style={styles.label}>AVAILABLE BALANCE</Text>
          <Text style={styles.amount}>{naira(balance)}</Text>
          <TouchableOpacity
            style={styles.withdrawBtn}
            onPress={() => Alert.alert("Withdraw", "Bank withdrawals are coming soon.")}
          >
            <Text style={styles.withdrawText}>Withdraw to bank</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.planCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={styles.miniAvatar}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.miniAvatarImage} />
              ) : (
                <Text style={styles.miniAvatarText}>{(user?.fullName ?? "U").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.planValue}>{user?.fullName}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
            <Text style={styles.planLink}>Edit profile ›</Text>
          </TouchableOpacity>
        </Card>

        <Card style={styles.planCard}>
          <View>
            <Text style={styles.planLabel}>Farm2Me plan</Text>
            <Text style={styles.planValue}>{TIER_LABEL[user?.subscriptionTier ?? "FREE"]}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate("Subscription")}>
            <Text style={styles.planLink}>View plans ›</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ marginTop: SPACING.lg }}>
          <Text style={styles.sectionTitle}>Add funds</Text>
          <Text style={styles.sectionSubtitle}>Top up your wallet via Monnify's secure checkout.</Text>

          <View style={styles.quickRow}>
            {QUICK_AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                style={[styles.quickChip, amount === String(a) && styles.quickChipActive]}
                onPress={() => setAmount(String(a))}
              >
                <Text style={[styles.quickChipText, amount === String(a) && styles.quickChipTextActive]}>
                  {naira(a)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount (₦)"
            placeholderTextColor={COLORS.TEXT_MUTED}
            keyboardType="numeric"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={depositing ? "Redirecting…" : "Add funds"} onPress={deposit} loading={depositing} variant="gold" style={{ marginTop: SPACING.md }} />
        </Card>

        {wallet && wallet.deposits.length > 0 && (
          <Card style={{ marginTop: SPACING.lg }}>
            <Text style={styles.sectionTitle}>Recent deposits</Text>
            {wallet.deposits.map((d) => (
              <View key={d.id} style={styles.depositRow}>
                <View>
                  <Text style={styles.depositAmount}>{naira(d.amount)}</Text>
                  <Text style={styles.depositDate}>{new Date(d.createdAt).toLocaleString()}</Text>
                </View>
                <View style={[styles.statusPill, d.status === "COMPLETED" ? styles.statusCompleted : styles.statusPending]}>
                  <Text style={[styles.statusText, d.status === "COMPLETED" ? styles.statusTextCompleted : styles.statusTextPending]}>
                    {d.status === "COMPLETED" ? "Completed" : "Pending"}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <Button label="Sign out" onPress={signOut} variant="outline" style={{ marginTop: SPACING.xl }} />
      </ScrollView>

      {/* Monnify hosted checkout */}
      <Modal visible={checkoutUrl !== null} animationType="slide" onRequestClose={() => setCheckoutUrl(null)}>
        <View style={[styles.webHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => { setCheckoutUrl(null); setDepositing(false); }}>
            <Text style={styles.webClose}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.webTitle}>Secure payment</Text>
          <View style={{ width: 60 }} />
        </View>
        {checkoutUrl && <WebView source={{ uri: checkoutUrl }} onNavigationStateChange={onWebViewNavChange} />}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  title: {
    fontSize: 22,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    marginBottom: SPACING.md,
  },
  card: { backgroundColor: COLORS.PRIMARY_DARK, borderRadius: RADIUS.cardLarge, padding: SPACING.lg },
  label: { color: "#8FBF9C", fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, letterSpacing: 1 },
  amount: { color: "#F5EFE2", fontSize: 30, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, marginVertical: 6 },
  withdrawBtn: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.ACCENT,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 9,
  },
  withdrawText: { color: COLORS.ACCENT_DARK, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 12.5 },
  planCard: { marginTop: SPACING.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planLabel: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_MUTED, letterSpacing: 0.5 },
  planValue: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, marginTop: 2 },
  planLink: { fontSize: 12.5, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.PRIMARY },
  miniAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  miniAvatarImage: { width: "100%", height: "100%" },
  miniAvatarText: { fontSize: 14, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: "#fff" },
  sectionTitle: { fontSize: 14, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  sectionSubtitle: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: SPACING.md },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  quickChipActive: { backgroundColor: COLORS.PRIMARY, borderColor: COLORS.PRIMARY },
  quickChipText: { fontSize: 12, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY },
  quickChipTextActive: { color: "#fff" },
  input: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.input,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, fontFamily: FONT.family, marginTop: SPACING.sm },
  depositRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.DIVIDER,
    marginTop: 4,
  },
  depositAmount: { fontSize: 14, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  depositDate: { fontSize: 10.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  statusPill: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusCompleted: { backgroundColor: COLORS.SUCCESS_BG },
  statusPending: { backgroundColor: COLORS.ESCROW_BG },
  statusText: { fontSize: 10, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
  statusTextCompleted: { color: COLORS.PRIMARY },
  statusTextPending: { color: COLORS.ESCROW_TEXT },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.PRIMARY_DARK,
  },
  webClose: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold },
  webTitle: { color: "#fff", fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
});
