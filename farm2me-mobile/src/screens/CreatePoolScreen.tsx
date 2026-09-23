import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { Button } from "../components/ui";
import SelectModal from "../components/SelectModal";
import {
  ANIMAL_TYPES,
  ANIMAL_TYPES_NEEDING_SUBTYPE,
  ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE,
  BEAN_TYPES,
  CROP_TYPES,
  SEAFOOD_TYPES,
  type VillagePool,
} from "../types";
import type { ScreenProps } from "../navigation/types";

const MIN_LEAD_DAYS = 3;
const RADIUS_OPTIONS = [5, 10, 25, 50, 75, 100];
const DATE_RULE = /^\d{4}-\d{2}-\d{2}$/;

const CROP_OPTIONS = CROP_TYPES.map((c) => ({ value: c, label: c }));
const ANIMAL_OPTIONS = ANIMAL_TYPES.map((a) => ({ value: a, label: a }));
const SEAFOOD_OPTIONS = SEAFOOD_TYPES.map((s) => ({ value: s, label: s }));
const BEAN_OPTIONS = BEAN_TYPES.map((b) => ({ value: b, label: b }));

export default function CreatePoolScreen({ navigation }: ScreenProps<"CreatePool">) {
  const [kind, setKind] = useState<"crop" | "animal">("crop");
  const [cropType, setCropType] = useState("");
  const [subType, setSubType] = useState("");
  const [seafoodType, setSeafoodType] = useState("");
  const [beanType, setBeanType] = useState("");
  const [contractName, setContractName] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [deadline, setDeadline] = useState("");
  const [radiusKm, setRadiusKm] = useState(25);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSeafood = cropType === "Seafood";
  const isBeans = cropType === "Beans";
  const needsSubType = (ANIMAL_TYPES_NEEDING_SUBTYPE as readonly string[]).includes(cropType) || isBeans;
  const isFreeTextSubType = (ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE as readonly string[]).includes(cropType);
  const resolvedSubType = isSeafood
    ? (seafoodType === "Other" ? subType.trim() : seafoodType)
    : isBeans
      ? beanType
      : subType.trim();
  const validDeadline =
    DATE_RULE.test(deadline) && new Date(deadline).getTime() >= Date.now() + MIN_LEAD_DAYS * 86400000;

  const canSubmit =
    !!cropType &&
    (!needsSubType || resolvedSubType.length > 0) &&
    contractName.trim().length > 0 &&
    Number(targetWeightKg) > 0 &&
    Number(pricePerKg) > 0 &&
    validDeadline;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<{ pool: VillagePool }>("/pools/create", {
        contractName: contractName.trim(),
        cropType,
        ...(needsSubType ? { subType: resolvedSubType } : {}),
        targetWeightKg: Number(targetWeightKg),
        pricePerKg: Number(pricePerKg),
        deadline: new Date(deadline).toISOString(),
        radiusKm,
      });
      navigation.replace("PoolDetail", { poolId: data.pool.id });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not create pool");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create a Village Pool</Text>
      <Text style={styles.subtitle}>
        Say how much you need (or have) — of a crop or an animal — and the price per kg.
      </Text>

      <View style={styles.segmentRow}>
        {(["crop", "animal"] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.segmentBtn, kind === k && styles.segmentBtnActive]}
            onPress={() => {
              setKind(k);
              setCropType("");
              setSubType("");
              setSeafoodType("");
              setBeanType("");
            }}
          >
            <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>
              {k === "crop" ? "Crop" : "Animal"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{kind === "crop" ? "Crop type" : "Animal type"}</Text>
      <SelectModal
        placeholder={kind === "crop" ? "Select a crop" : "Select an animal"}
        value={cropType}
        onChange={(v) => {
          setCropType(v);
          setSubType("");
          setSeafoodType("");
          setBeanType("");
        }}
        options={kind === "crop" ? CROP_OPTIONS : ANIMAL_OPTIONS}
      />

      {isSeafood && (
        <>
          <Text style={styles.label}>Type of seafood</Text>
          <SelectModal
            placeholder="Select a type"
            value={seafoodType}
            onChange={(v) => {
              setSeafoodType(v);
              setSubType("");
            }}
            options={SEAFOOD_OPTIONS}
          />
        </>
      )}

      {isBeans && (
        <>
          <Text style={styles.label}>Type of beans</Text>
          <SelectModal placeholder="Select a type" value={beanType} onChange={setBeanType} options={BEAN_OPTIONS} />
        </>
      )}

      {(isFreeTextSubType || (isSeafood && seafoodType === "Other")) && (
        <>
          <Text style={styles.label}>
            {cropType === "Poultry" ? "Specify poultry type" : isSeafood ? "Specify seafood type" : "Specify feed type"}
          </Text>
          <TextInput
            style={styles.input}
            value={subType}
            onChangeText={setSubType}
            placeholder={cropType === "Poultry" ? "e.g. Broiler chicken" : isSeafood ? "e.g. Snapper" : "e.g. Black soldier fly maggots"}
            placeholderTextColor={COLORS.TEXT_MUTED}
          />
        </>
      )}

      <Text style={styles.label}>Contract name</Text>
      <TextInput
        style={styles.input}
        value={contractName}
        onChangeText={setContractName}
        placeholder={cropType ? `e.g. ${cropType} Bulk Order` : "e.g. Bulk Order"}
        placeholderTextColor={COLORS.TEXT_MUTED}
      />

      <Text style={styles.label}>Quantity (kg)</Text>
      <TextInput
        style={styles.input}
        value={targetWeightKg}
        onChangeText={(t) => setTargetWeightKg(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={COLORS.TEXT_MUTED}
      />

      <Text style={styles.label}>Price per kg (₦)</Text>
      <TextInput
        style={styles.input}
        value={pricePerKg}
        onChangeText={(t) => setPricePerKg(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={COLORS.TEXT_MUTED}
      />

      <Text style={styles.label}>Deadline</Text>
      <TextInput
        style={styles.input}
        value={deadline}
        onChangeText={setDeadline}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={COLORS.TEXT_MUTED}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Text style={styles.hint}>At least {MIN_LEAD_DAYS} days from today.</Text>

      <Text style={styles.label}>Visible within {radiusKm}km</Text>
      <View style={styles.radiusRow}>
        {RADIUS_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.radiusChip, radiusKm === r && styles.radiusChipActive]}
            onPress={() => setRadiusKm(r)}
          >
            <Text style={[styles.radiusChipText, radiusKm === r && styles.radiusChipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>Centered on your profile location — set it first if you haven't already.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label="Create pool"
        onPress={submit}
        disabled={!canSubmit}
        loading={submitting}
        variant="green"
        style={{ marginTop: SPACING.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  title: { fontSize: 20, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  subtitle: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 4 },
  segmentRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.lg },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.SURFACE,
  },
  segmentBtnActive: { borderColor: COLORS.ACCENT },
  segmentText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  segmentTextActive: { color: COLORS.TEXT_PRIMARY },
  label: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    fontFamily: FONT.familySemibold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
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
  hint: { fontSize: FONT.size.caption, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.xs },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  radiusChip: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.SURFACE,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
  },
  radiusChipActive: { borderColor: COLORS.PRIMARY, backgroundColor: COLORS.SUCCESS_BG },
  radiusChipText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  radiusChipTextActive: { color: COLORS.PRIMARY },
  error: { color: COLORS.DANGER, marginTop: SPACING.md, fontSize: FONT.size.small, fontFamily: FONT.family },
});
