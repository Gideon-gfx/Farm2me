import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../api/client";
import { geocodeAddress } from "../lib/location";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { Button } from "./ui";
import { Icon } from "./Icon";
import { GRADES, type Grade, type Listing } from "../types";

function formatNaira(n: number): string {
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

// Farmer's edit sheet for an ACTIVE, unpooled listing — mirrors the web
// app's EditListingModal: crop/weight/price/grade/min-order/location, plus a
// media strip so the farmer can see what's actually on the listing.
export default function EditListingModal({
  visible,
  listing,
  onClose,
  onSaved,
  onDelete,
}: {
  visible: boolean;
  listing: Listing | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  if (!listing) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <EditListingBody listing={listing} onClose={onClose} onSaved={onSaved} onDelete={onDelete} />
    </Modal>
  );
}

function EditListingBody({
  listing,
  onClose,
  onSaved,
  onDelete,
}: {
  listing: Listing;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [cropType, setCropType] = useState(listing.cropType);
  const [weightKg, setWeightKg] = useState(String(listing.weightKg));
  const [pricePerKg, setPricePerKg] = useState(String(listing.pricePerKg));
  const [minOrderKg, setMinOrderKg] = useState(String(listing.minOrderKg ?? 1));
  const [grade, setGrade] = useState<Grade>(listing.grade);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const originalLocation = listing.locationLabel ?? "";
  const [locationInput, setLocationInput] = useState(originalLocation);
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const locationDirty = locationInput.trim() !== originalLocation;

  const media = [
    ...(listing.imageUrls ?? []).map((url) => ({ type: "image" as const, url })),
    ...(listing.videoUrls ?? []).map((url) => ({ type: "video" as const, url })),
  ];

  const weight = Number(weightKg);
  const price = Number(pricePerKg);
  const minOrder = Number(minOrderKg);
  const canSave =
    cropType.trim().length > 0 &&
    weight > 0 &&
    price > 0 &&
    minOrder > 0 &&
    minOrder <= weight &&
    !(locationDirty && locationInput.trim() && !resolvedCoords);

  async function confirmLocation() {
    const query = locationInput.trim();
    if (!query) return;
    setGeocoding(true);
    try {
      const match = await geocodeAddress(query);
      if (!match) return;
      setResolvedCoords(match);
    } finally {
      setGeocoding(false);
    }
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await api.patch(`/listings/${listing.id}`, {
        cropType: cropType.trim(),
        weightKg: weight,
        pricePerKg: price,
        minOrderKg: minOrder,
        grade,
        ...(locationDirty
          ? {
              locationLabel: locationInput.trim(),
              ...(resolvedCoords ? { locationLat: resolvedCoords.lat, locationLng: resolvedCoords.lng } : {}),
            }
          : {}),
      });
      onSaved();
    } catch {
      // The button re-enables; the farmer can retry.
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.delete(`/listings/${listing.id}`);
      onDelete(listing.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Edit listing</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Icon name="close" size={20} color={COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {media.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
            {media.map((m, i) => (
              <View key={i} style={styles.mediaThumb}>
                {m.type === "image" ? (
                  <Image source={{ uri: m.url }} style={styles.mediaImage} />
                ) : (
                  <View style={styles.videoThumb}>
                    <Text style={styles.videoThumbIcon}>▶</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.hint}>No photos or videos on this listing.</Text>
        )}

        <Text style={styles.label}>Crop / animal type</Text>
        <TextInput style={styles.input} value={cropType} onChangeText={setCropType} />

        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={weightKg}
              onChangeText={(t) => setWeightKg(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Price/kg (₦)</Text>
            <TextInput
              style={styles.input}
              value={pricePerKg}
              onChangeText={(t) => setPricePerKg(t.replace(/[^0-9.]/g, ""))}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Text style={styles.label}>Lowest quantity a buyer can order (kg)</Text>
        <TextInput
          style={styles.input}
          value={minOrderKg}
          onChangeText={(t) => setMinOrderKg(t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Produce location</Text>
        <View style={styles.row2}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={locationInput}
            onChangeText={(t) => {
              setLocationInput(t);
              setResolvedCoords(null);
            }}
            placeholder="Leave blank to use your farm's saved address"
            placeholderTextColor={COLORS.TEXT_MUTED}
          />
          {locationDirty && locationInput.trim() && (
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmLocation} disabled={geocoding}>
              <Text style={styles.confirmBtnText}>{geocoding ? "…" : "Confirm"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {locationDirty && locationInput.trim() && resolvedCoords && (
          <Text style={styles.confirmedText}>✓ Location confirmed</Text>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total price</Text>
          <Text style={styles.totalValue}>{formatNaira((weight || 0) * (price || 0))}</Text>
        </View>

        <Text style={styles.label}>Grade</Text>
        {GRADES.map((g) => {
          const isSelected = grade === g.value;
          return (
            <TouchableOpacity
              key={g.value}
              style={[styles.radioRow, isSelected && styles.radioRowSelected]}
              onPress={() => setGrade(g.value)}
              activeOpacity={0.85}
            >
              <View style={[styles.radio, isSelected && styles.radioOn]}>{isSelected && <View style={styles.radioDot} />}</View>
              <View>
                <Text style={styles.radioTitle}>{g.label}</Text>
                <Text style={styles.radioDesc}>{g.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <Button label={saving ? "Saving…" : "Save changes"} onPress={save} disabled={!canSave || saving} variant="green" style={{ marginTop: SPACING.lg }} />

        <TouchableOpacity style={styles.deleteBtn} onPress={remove} disabled={deleting} activeOpacity={0.85}>
          {deleting ? (
            <ActivityIndicator color={COLORS.DANGER} />
          ) : (
            <>
              <Icon name="trash" size={15} color={COLORS.DANGER} />
              <Text style={styles.deleteBtnText}>Delete listing</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  mediaRow: { marginBottom: SPACING.md },
  mediaThumb: { width: 84, height: 84, borderRadius: RADIUS.input, marginRight: SPACING.sm, overflow: "hidden" },
  mediaImage: { width: "100%", height: "100%" },
  videoThumb: { width: "100%", height: "100%", backgroundColor: COLORS.PRIMARY_DARK, alignItems: "center", justifyContent: "center" },
  videoThumbIcon: { color: "#fff", fontSize: 20 },
  hint: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginBottom: SPACING.md },
  label: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY, marginTop: SPACING.md, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.base,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
  row2: { flexDirection: "row", gap: SPACING.sm, alignItems: "center" },
  col: { flex: 1 },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 13, borderRadius: RADIUS.input, borderWidth: 2, borderColor: COLORS.BORDER },
  confirmBtnText: { fontSize: FONT.size.small, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  confirmedText: { fontSize: FONT.size.small, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY, marginTop: SPACING.xs },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  totalLabel: { fontSize: FONT.size.base, color: COLORS.TEXT_MUTED, fontFamily: FONT.family },
  totalValue: { fontSize: FONT.size.header, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  radioRowSelected: { borderColor: COLORS.ACCENT },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.TEXT_MUTED, marginRight: SPACING.md, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: COLORS.PRIMARY },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.PRIMARY },
  radioTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY },
  radioDesc: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  deleteBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.DANGER },
});
