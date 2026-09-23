import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { COLORS, FONT, SPACING } from "../constants/theme";
import { Button } from "../components/ui";
import { FarmLeafIcon } from "../components/Logo";
import type { ScreenProps } from "../navigation/types";

export default function ComingSoonScreen({ route }: ScreenProps<"ComingSoon">) {
  const { signOut } = useAuth();
  const { role } = route.params;
  return (
    <View style={styles.container}>
      <FarmLeafIcon size={64} />
      <Text style={styles.title}>{role} experience coming soon</Text>
      <Text style={styles.body}>
        The farmer app is ready. The {role.toLowerCase()} flow is on the way.
      </Text>
      <Button label="Sign out" onPress={signOut} variant="ink" style={{ marginTop: SPACING.xl, minWidth: 160 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND, alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  title: {
    fontSize: 18,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  body: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, textAlign: "center", marginTop: SPACING.sm },
});
