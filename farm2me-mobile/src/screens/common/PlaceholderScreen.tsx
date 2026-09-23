import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS, FONT, SPACING } from "../../constants/theme";
import { Icon, type IconName } from "../../components/Icon";

// Generic "coming soon" tab body. Pass a title + icon name via makePlaceholder
// so each tab can register its own component.
export function makePlaceholder(title: string, iconName: IconName) {
  return function Placeholder() {
    return (
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Icon name={iconName} size={30} color={COLORS.PRIMARY} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>This section is coming soon.</Text>
      </View>
    );
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND, alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.SUCCESS_BG,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  title: { fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  body: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.sm },
});
