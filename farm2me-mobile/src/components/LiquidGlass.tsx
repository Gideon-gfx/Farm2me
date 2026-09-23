// iOS 26 "Liquid Glass" surface — a frosted, translucent panel that lets
// whatever scrolls behind it show through blurred, used for the farmer tabs'
// fixed top nav and floating bottom tab bar.
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

export function LiquidGlass({ style, edge }: { style?: ViewStyle; edge?: "top" | "bottom" }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={78} tint="light" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.tint,
          edge === "top" ? styles.borderBottom : edge === "bottom" ? styles.borderTop : null,
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tint: { backgroundColor: "rgba(255,255,255,0.38)" },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.6)" },
  borderTop: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.6)" },
});
