// A fixed (non-scrolling) top nav bar for the farmer tabs, styled to match
// the floating liquid-glass bottom tab bar. Content underneath scrolls past
// it rather than pushing it around.
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LiquidGlass } from "./LiquidGlass";

export const TOP_NAV_CONTENT_HEIGHT = 56;

export function GlassTopNav({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { height: TOP_NAV_CONTENT_HEIGHT + insets.top, paddingTop: insets.top }]}>
      <LiquidGlass edge="top" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  content: { flex: 1, paddingHorizontal: 16, justifyContent: "center" },
});
