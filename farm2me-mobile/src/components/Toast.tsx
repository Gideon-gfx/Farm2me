// A floating, auto-dismissing message — used instead of the OS's blocking
// Alert.alert() for things like a denied camera/location/photo-library
// permission, where the app should tell the user and let them carry on,
// not stop them with a modal they have to tap through.
//
// showToast(...) is a plain function (not a hook) so it can be called from
// anywhere, including non-component code like lib/location.ts's background
// location capture — mount <ToastHost /> once near the root (see App.tsx)
// and every showToast() call anywhere in the app renders through it.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

export type ToastType = "info" | "success" | "error";

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

const TYPE_STYLE: Record<ToastType, { bg: string; fg: string }> = {
  info: { bg: COLORS.PRIMARY_DARK, fg: "#F5EFE2" },
  success: { bg: COLORS.PRIMARY, fg: "#FFFFFF" },
  error: { bg: COLORS.DANGER, fg: "#FFFFFF" },
};

let setter: ((msg: ToastMessage) => void) | null = null;

export function showToast(message: string, type: ToastType = "info") {
  setter?.({ id: Date.now(), message, type });
}

const DURATION_MS = 3200;

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setter = (msg) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(msg);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, DURATION_MS);
    };
    return () => {
      setter = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!toast) return null;
  const palette = TYPE_STYLE[toast.type];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top: insets.top + SPACING.sm, opacity, backgroundColor: palette.bg },
      ]}
    >
      <Text style={[styles.text, { color: palette.fg }]}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: SPACING.md,
    right: SPACING.md,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 999,
  },
  text: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, textAlign: "center" },
});
