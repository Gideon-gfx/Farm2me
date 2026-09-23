import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

interface ContactEntry {
  label: string;
  name: string | null | undefined;
  phone: string | null | undefined;
}

// Shows the other parties on a trip (farmer/buyer/driver) with a tap-to-call
// phone number, for pickup/delivery follow-ups outside the app.
export default function ContactsCard({ contacts }: { contacts: ContactEntry[] }) {
  const visible = contacts.filter((c) => c.name);
  if (visible.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Contacts</Text>
      <Text style={styles.subtitle}>Call directly for pickup/delivery follow-ups outside the app.</Text>
      {visible.map((c) => (
        <View key={c.label} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{c.label}</Text>
            <Text style={styles.name}>{c.name}</Text>
          </View>
          {c.phone ? (
            <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
              <Text style={styles.callBtnText}>📞 {c.phone}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.noPhone}>No phone on file</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  title: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  subtitle: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2, marginBottom: SPACING.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.DIVIDER,
  },
  label: { fontSize: 10.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED, textTransform: "uppercase" },
  name: { fontSize: FONT.size.base, fontFamily: FONT.familySemibold, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY, marginTop: 1 },
  callBtn: {
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  callBtnText: { fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  noPhone: { fontSize: 11, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
});
