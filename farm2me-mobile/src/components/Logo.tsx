// Farm2me mark — ported 1:1 from the UI prototype's plant glyph + wordmark
// (gold "2" underlined with a small arrow) so the app boots with the exact
// approved brand mark instead of a placeholder emoji.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, Line, Path } from "react-native-svg";
import { FONT } from "../constants/theme";

export function FarmLeafIcon({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Line x1={20} y1={52} x2={20} y2={20} stroke="#D9A441" strokeWidth={2.2} strokeLinecap="round" />
      <Ellipse cx={20} cy={19} rx={2.8} ry={5.5} fill="#D9A441" />
      <Ellipse cx={15.5} cy={26} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(-32 15.5 26)" />
      <Ellipse cx={24.5} cy={26} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(32 24.5 26)" />
      <Ellipse cx={14.8} cy={34} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(-32 14.8 34)" />
      <Ellipse cx={25.2} cy={34} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(32 25.2 34)" />
      <Ellipse cx={14.8} cy={42} rx={2.6} ry={5.3} fill="#EFC878" transform="rotate(-32 14.8 42)" />
      <Ellipse cx={25.2} cy={42} rx={2.6} ry={5.3} fill="#EFC878" transform="rotate(32 25.2 42)" />
      <Path d="M24 51 C36 48 34 40 43 33" stroke="#2F6B3F" strokeWidth={2.2} strokeLinecap="round" strokeDasharray="1 5.5" />
      <Path d="M46 8 C40.5 8 37 12 37 17 c0 6.5 9 14 9 14 s9 -7.5 9 -14 C55 12 51.5 8 46 8 Z" fill="#2F6B3F" />
      <Circle cx={46} cy={16.5} r={4.2} fill="#F5EFE2" />
      <Ellipse cx={46} cy={16.5} rx={1.9} ry={3.4} fill="#D9A441" />
    </Svg>
  );
}

export function FarmWordmark({ fontSize = 30 }: { fontSize?: number }) {
  return (
    <View style={styles.wordmarkRow}>
      <Text style={[styles.wordmarkText, { fontSize }]}>Farm</Text>
      <View style={styles.twoWrap}>
        <Text style={[styles.wordmarkText, styles.gold, { fontSize }]}>2</Text>
        <Svg width={17} height={7} viewBox="0 0 19 8" style={styles.arrow}>
          <Path d="M1.5 4 H15 M15 4 l-4 -3 M15 4 l-4 3" stroke="#D9A441" strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      </View>
      <Text style={[styles.wordmarkText, { fontSize }]}>me</Text>
    </View>
  );
}

export function FarmTagline() {
  return <Text style={styles.tagline}>Farmers · Movers · Buyers</Text>;
}

const styles = StyleSheet.create({
  wordmarkRow: { flexDirection: "row", alignItems: "flex-end" },
  wordmarkText: { fontWeight: "800", fontFamily: FONT.familyBold, letterSpacing: 0.6, color: "#24352A" },
  gold: { color: "#D9A441" },
  twoWrap: { position: "relative" },
  arrow: { position: "absolute", left: "50%", bottom: -8, marginLeft: -8.5 },
  tagline: {
    fontWeight: "700",
    fontFamily: FONT.familySemibold,
    fontSize: 9.5,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#2F6B3F",
  },
});
