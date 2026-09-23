import React, { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AFRICAN_COUNTRIES, DEFAULT_COUNTRY, type Country } from "../lib/africanCountries";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

// Combined country-code + flag picker and subscriber-number input. Emits the
// full E.164-ish phone number ("+234803...") via onChange.
export default function CountryPhoneInput({
  value,
  onChange,
  placeholder = "803 000 0000",
}: {
  value: string;
  onChange: (phone: string) => void;
  placeholder?: string;
}) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onChange(digits ? `+${country.dial}${digits}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, digits]);

  useEffect(() => {
    if (value === "" && digits !== "") setDigits("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText}>
          {country.flag} +{country.dial}
        </Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        value={digits}
        onChangeText={(t) => {
          let v = t.replace(/\D/g, "");
          if (v.startsWith("0")) v = v.slice(1);
          setDigits(v.slice(0, 12));
        }}
        placeholder={placeholder}
        placeholderTextColor={COLORS.TEXT_MUTED}
        keyboardType="number-pad"
      />

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <FlatList
              data={AFRICAN_COUNTRIES}
              keyExtractor={(c) => c.iso2}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    setCountry(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.itemFlag}>{item.flag}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDial}>+{item.dial}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACING.sm },
  trigger: {
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: RADIUS.input,
    paddingHorizontal: 14,
    backgroundColor: COLORS.SURFACE,
  },
  triggerText: { fontSize: 15, fontFamily: FONT.familySemibold, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: FONT.family,
    backgroundColor: COLORS.SURFACE,
    color: COLORS.TEXT_PRIMARY,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.SURFACE,
    borderTopLeftRadius: RADIUS.cardLarge,
    borderTopRightRadius: RADIUS.cardLarge,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  itemFlag: { fontSize: 18 },
  itemName: { flex: 1, fontSize: 14, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  itemDial: { fontSize: 13, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
});
