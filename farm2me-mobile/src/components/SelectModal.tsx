import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";

interface Option {
  value: string;
  label: string;
}

// Generic bottom-sheet picker — the RN equivalent of the web app's Dropdown
// component, used anywhere a fixed list of options needs a nicer UI than a
// native <Picker>.
export default function SelectModal({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.itemText, item.value === value && styles.itemTextSelected]}>
                    {item.label}
                  </Text>
                  {item.value === value && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  triggerText: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  placeholder: { color: COLORS.TEXT_MUTED },
  chevron: { color: COLORS.TEXT_MUTED, fontSize: FONT.size.base },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.SURFACE,
    borderTopLeftRadius: RADIUS.cardLarge,
    borderTopRightRadius: RADIUS.cardLarge,
    paddingVertical: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  itemText: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  itemTextSelected: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  check: { color: COLORS.ACCENT, fontWeight: FONT.weight.bold, fontSize: FONT.size.base },
});
