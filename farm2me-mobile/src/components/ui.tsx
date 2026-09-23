// Shared building blocks that mirror the Farm2me UI prototype's component
// patterns: bordered cards, escrow banners, status pills and CTA buttons.
import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { Icon } from "./Icon";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({
  label,
  bg = COLORS.NEUTRAL_BG,
  color = COLORS.NEUTRAL_TEXT,
}: {
  label: string;
  bg?: string;
  color?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function EscrowBanner({ label }: { label: string }) {
  return (
    <View style={styles.escrowBanner}>
      <Icon name="escrow" size={15} color={COLORS.ESCROW_TEXT} />
      <Text style={styles.escrowText}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ pct, color = COLORS.ACCENT }: { pct: number; color?: string }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

type ButtonVariant = "gold" | "green" | "ink" | "outline";

const VARIANT_STYLE: Record<ButtonVariant, { bg: string; color: string }> = {
  gold: { bg: COLORS.ACCENT, color: COLORS.ACCENT_DARK },
  green: { bg: COLORS.PRIMARY, color: COLORS.WHITE },
  ink: { bg: COLORS.PRIMARY_DARK, color: "#F5EFE2" },
  outline: { bg: COLORS.SURFACE, color: COLORS.TEXT_PRIMARY },
};

export function Button({
  label,
  onPress,
  variant = "gold",
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANT_STYLE[variant];
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: v.bg },
        variant === "outline" && styles.buttonOutline,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={v.color} />
      ) : (
        <Text style={[styles.buttonText, { color: v.color }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
  },
  pill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familySemibold },
  escrowBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.ESCROW_BG,
    borderRadius: 12,
    padding: 11,
  },
  escrowText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familySemibold,
    color: COLORS.ESCROW_TEXT,
  },
  progressTrack: {
    height: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.NEUTRAL_BG,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: RADIUS.pill },
  button: {
    height: 52,
    borderRadius: RADIUS.button,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonOutline: { borderWidth: 1, borderColor: COLORS.BORDER },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
});
