import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, FONT } from "../constants/theme";
import { Icon } from "./Icon";

// Read-only average display, e.g. on a farmer/transporter's profile card.
export function StarDisplay({ average, count, size = 14 }: { average: number; count: number; size?: number }) {
  if (count === 0) {
    return <Text style={styles.none}>No ratings yet</Text>;
  }
  return (
    <View style={styles.displayRow}>
      <Icon name="star" size={size} color={COLORS.ACCENT} />
      <Text style={styles.average}>{average.toFixed(1)}</Text>
      <Text style={styles.count}>({count})</Text>
    </View>
  );
}

// Interactive 1-5 star picker for submitting a rating.
export function StarPicker({ value, onChange, size = 28 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={styles.pickerRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} style={styles.star} activeOpacity={0.7}>
          <Icon name="star" size={size} color={n <= value ? COLORS.ACCENT : "rgba(0,0,0,0.15)"} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  displayRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  average: { fontSize: 12, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  count: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  none: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  pickerRow: { flexDirection: "row", alignItems: "center" },
  star: { padding: 2 },
});
