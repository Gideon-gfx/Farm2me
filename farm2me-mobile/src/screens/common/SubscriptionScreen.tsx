import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, Card } from "../../components/ui";
import type { ScreenProps } from "../../navigation/types";
import type { SubscriptionTier } from "../../types";

interface Plan {
  tier: SubscriptionTier;
  priceNgn: number;
  commissionRate: number;
}
interface PlansResponse {
  vatRate: number;
  plans: Plan[];
  durationDays: number;
}
interface MyPlan {
  tier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
  commissionRate: number;
  vatRate: number;
}

const TIER_LABEL: Record<SubscriptionTier, string> = { FREE: "Free", STANDARD: "Standard", PREMIUM: "Premium" };
const TIER_BLURB: Record<SubscriptionTier, string> = {
  FREE: "Pay as you go — no monthly commitment.",
  STANDARD: "For regular sellers, transporters and buyers who want lower fees.",
  PREMIUM: "Lowest fees — for high-volume users.",
};

function naira(value: number): string {
  return value === 0 ? "₦0" : `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export default function SubscriptionScreen({ navigation }: ScreenProps<"Subscription">) {
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [myPlan, setMyPlan] = useState<MyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<SubscriptionTier | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plans, mine] = await Promise.all([
          api.get<PlansResponse>("/subscriptions/plans"),
          user ? api.get<MyPlan>("/subscriptions/me") : Promise.resolve(null),
        ]);
        setPlansData(plans.data);
        if (mine) setMyPlan(mine.data);
      } catch {
        setError("Could not load subscription plans.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function upgrade(tier: Exclude<SubscriptionTier, "FREE">) {
    if (!user) {
      setError("Sign in to upgrade your plan.");
      return;
    }
    setUpgrading(tier);
    setError(null);
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/subscriptions/upgrade", { tier });
      setCheckoutUrl(data.checkoutUrl);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not start upgrade.");
      setUpgrading(null);
    }
  }

  async function onWebViewNavChange(navState: { url: string }) {
    if (navState.url.includes("payment-complete")) {
      setCheckoutUrl(null);
      setUpgrading(null);
      await refreshProfile();
      try {
        const { data } = await api.get<MyPlan>("/subscriptions/me");
        setMyPlan(data);
      } catch {
        // Best-effort refresh — webhook may still be processing.
      }
    }
  }

  if (loading || !plansData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  const currentTier = myPlan?.tier ?? (user ? "FREE" : null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Subscription plans</Text>
        <Text style={styles.subtitle}>
          Every order carries a Farm2Me service fee (platform commission + {(plansData.vatRate * 100).toFixed(1)}%
          VAT) — subscribing lowers your commission rate on every order you're part of, as a farmer, transporter or
          buyer.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ gap: SPACING.md, marginTop: SPACING.lg }}>
          {plansData.plans.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            return (
              <Card key={plan.tier} style={[styles.planCard, isCurrent && styles.planCardActive]}>
                <View style={styles.planHeader}>
                  <Text style={styles.planTier}>{TIER_LABEL[plan.tier]}</Text>
                  {isCurrent && (
                    <View style={styles.currentPill}>
                      <Text style={styles.currentPillText}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planBlurb}>{TIER_BLURB[plan.tier]}</Text>

                <Text style={styles.planPrice}>
                  {naira(plan.priceNgn)}
                  {plan.priceNgn > 0 && <Text style={styles.planPriceUnit}> /{plansData.durationDays}d</Text>}
                </Text>

                <Text style={styles.planLine}>
                  <Text style={styles.planLineBold}>{(plan.commissionRate * 100).toFixed(0)}%</Text> platform
                  commission per order
                </Text>
                <Text style={styles.planLine}>
                  {(plansData.vatRate * 100).toFixed(1)}% VAT on that commission (same at every tier)
                </Text>

                {plan.tier === "FREE" ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default plan — no sign-up needed</Text>
                  </View>
                ) : (
                  <Button
                    label={isCurrent ? "Active" : upgrading === plan.tier ? "Redirecting…" : `Upgrade to ${TIER_LABEL[plan.tier]}`}
                    onPress={() => upgrade(plan.tier as Exclude<SubscriptionTier, "FREE">)}
                    disabled={isCurrent}
                    loading={upgrading === plan.tier}
                    variant="green"
                    style={{ marginTop: SPACING.md }}
                  />
                )}
              </Card>
            );
          })}
        </View>

        {myPlan?.subscriptionExpiresAt && myPlan.tier !== "FREE" && (
          <Text style={styles.expiry}>
            Your {TIER_LABEL[myPlan.tier]} plan renews/expires on{" "}
            {new Date(myPlan.subscriptionExpiresAt).toLocaleDateString()} — upgrade again before then to keep the
            discounted rate.
          </Text>
        )}
      </ScrollView>

      {/* Monnify hosted checkout */}
      <Modal visible={checkoutUrl !== null} animationType="slide" onRequestClose={() => setCheckoutUrl(null)}>
        <View style={[styles.webHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => { setCheckoutUrl(null); setUpgrading(null); }}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.BACKGROUND },
  content: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  back: { fontSize: 14, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.PRIMARY, marginBottom: SPACING.sm },
  title: { fontSize: 22, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  subtitle: { fontSize: 12.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 6, lineHeight: 18 },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, fontFamily: FONT.family, marginTop: SPACING.sm },
  planCard: { padding: SPACING.lg },
  planCardActive: { borderColor: COLORS.ACCENT, borderWidth: 2 },
  planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planTier: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  currentPill: { backgroundColor: COLORS.SUCCESS_BG, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  currentPillText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  planBlurb: { fontSize: 12.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 4 },
  planPrice: { fontSize: 24, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, marginTop: SPACING.md },
  planPriceUnit: { fontSize: 12.5, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_MUTED },
  planLine: { fontSize: 12.5, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY, marginTop: 8 },
  planLineBold: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
  defaultBadge: { marginTop: SPACING.md, backgroundColor: COLORS.NEUTRAL_BG, borderRadius: RADIUS.input, paddingVertical: 10, alignItems: "center" },
  defaultBadgeText: { fontSize: 11.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  expiry: { fontSize: 12, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, textAlign: "center", marginTop: SPACING.lg },
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
