import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../api/client";
import { geocodeAddress } from "../../lib/location";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { showToast } from "../../components/Toast";
import SelectModal from "../../components/SelectModal";
import {
  ANIMAL_TYPES,
  ANIMAL_TYPES_NEEDING_SUBTYPE,
  ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE,
  BEAN_TYPES,
  CROP_TYPES,
  GRADES,
  SEAFOOD_TYPES,
  type Grade,
  type VillagePool,
} from "../../types";

// No cap on photos/videos — a farmer can add as many as they want.
const MIN_POOL_LEAD_DAYS = 3;
const RADIUS_OPTIONS = [5, 10, 25, 50, 75, 100];
const DATE_RULE = /^\d{4}-\d{2}-\d{2}$/;
const CROP_OPTIONS = CROP_TYPES.map((c) => ({ value: c, label: c }));
const ANIMAL_OPTIONS = ANIMAL_TYPES.map((a) => ({ value: a, label: a }));
const SEAFOOD_OPTIONS = SEAFOOD_TYPES.map((s) => ({ value: s, label: s }));
const BEAN_OPTIONS = BEAN_TYPES.map((b) => ({ value: b, label: b }));

interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

type PickedVideo = PickedImage;

function formatNaira(n: number): string {
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

interface CreateListingScreenProps {
  // Pushed on the root stack (e.g. from a pool's "Contribute Your Yield"
  // button) — has its own native header, and falls back to popping it on
  // success when `onCreated` isn't given.
  navigation?: {
    goBack: () => void;
  };
  // Embedded inside AddListingScreen's "form" mode — called instead of any
  // navigation, so the parent can switch back to its own listings view.
  onCreated?: () => void;
}

export default function CreateListingScreen({ navigation, onCreated }: CreateListingScreenProps) {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [videos, setVideos] = useState<PickedVideo[]>([]);
  const [kind, setKind] = useState<"crop" | "animal">("crop");
  const [cropType, setCropType] = useState<string>("");
  const [otherCropType, setOtherCropType] = useState("");
  const [subType, setSubType] = useState("");
  const [seafoodType, setSeafoodType] = useState("");
  const [beanType, setBeanType] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [minOrderKg, setMinOrderKg] = useState("");
  const [grade, setGrade] = useState<Grade>("GRADE_A");
  const [isPooled, setIsPooled] = useState(false);

  // Produce location — off by default (most listings are at the farmer's
  // usual address); geocoded via the device's native geocoder when set.
  const [differentLocation, setDifferentLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [pools, setPools] = useState<VillagePool[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fields for the inline "no open pool yet — start one" form.
  const [poolContractName, setPoolContractName] = useState("");
  const [poolTargetWeightKg, setPoolTargetWeightKg] = useState("");
  const [poolPricePerKg, setPoolPricePerKg] = useState("");
  const [poolDeadline, setPoolDeadline] = useState("");
  const [poolRadiusKm, setPoolRadiusKm] = useState(25);
  const [creatingPool, setCreatingPool] = useState(false);

  const successScale = useRef(new Animated.Value(0)).current;

  const isOther = cropType === "Other";
  const isSeafood = cropType === "Seafood";
  const isBeans = cropType === "Beans";
  const needsSubType = (ANIMAL_TYPES_NEEDING_SUBTYPE as readonly string[]).includes(cropType) || isBeans;
  const isFreeTextSubType = (ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE as readonly string[]).includes(cropType);
  const resolvedSubType = isSeafood
    ? (seafoodType === "Other" ? subType.trim() : seafoodType)
    : isBeans
      ? beanType
      : subType.trim();
  // The raw `cropType` state stays "Other" (needed for the free-text field
  // to show), but every submission/validation uses this resolved name.
  const effectiveCropType = isOther ? otherCropType.trim() : cropType;
  const weight = parseFloat(weightKg) || 0;
  const price = parseFloat(pricePerKg) || 0;
  const minOrder = parseFloat(minOrderKg) || 0;
  const total = weight * price;
  const canSubmit =
    images.length > 0 &&
    effectiveCropType &&
    (!needsSubType || resolvedSubType.length > 0) &&
    weight > 0 &&
    price > 0 &&
    (!minOrderKg || minOrder <= weight) &&
    (!isPooled || selectedPool) &&
    !(differentLocation && locationInput.trim() && !resolvedLocation);

  // Load nearby open pools for the chosen crop when pooling is toggled on.
  useEffect(() => {
    if (!isPooled || !cropType) return;
    (async () => {
      try {
        const { data } = await api.get<{ data: VillagePool[] }>("/pools", {
          params: { cropType, status: "OPEN", limit: 20 },
        });
        setPools(data.data ?? []);
      } catch {
        setPools([]);
      }
    })();
  }, [isPooled, cropType]);

  async function createPool() {
    if (!cropType || creatingPool) return;
    const targetWeightKg = Number(poolTargetWeightKg);
    const poolPrice = Number(poolPricePerKg);
    if (!poolContractName.trim()) {
      setError("Name this pool contract");
      return;
    }
    if (!(targetWeightKg > 0)) {
      setError("Target weight must be greater than 0");
      return;
    }
    if (!(poolPrice > 0)) {
      setError("Asking price must be greater than 0");
      return;
    }
    if (!DATE_RULE.test(poolDeadline) || new Date(poolDeadline).getTime() < Date.now() + MIN_POOL_LEAD_DAYS * 86400000) {
      setError(`Deadline must be a YYYY-MM-DD date at least ${MIN_POOL_LEAD_DAYS} days out`);
      return;
    }
    setCreatingPool(true);
    setError(null);
    try {
      const { data } = await api.post<{ pool: VillagePool }>("/pools/create", {
        contractName: poolContractName.trim(),
        cropType,
        ...(needsSubType ? { subType: resolvedSubType } : {}),
        targetWeightKg,
        pricePerKg: poolPrice,
        deadline: new Date(poolDeadline).toISOString(),
        radiusKm: poolRadiusKm,
      });
      setPools((prev) => [...prev, data.pool]);
      setSelectedPool(data.pool.id);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not create pool");
    } finally {
      setCreatingPool(false);
    }
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Photo permission is required to add images.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], // v56: MediaTypeOptions is deprecated
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
    const type = asset.mimeType ?? "image/jpeg";
    setImages((prev) => [...prev, { uri: asset.uri, name, type }]);
  }

  function removeImage(uri: string) {
    setImages((prev) => prev.filter((i) => i.uri !== uri));
  }

  async function pickVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Photo permission is required to add videos.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const name = asset.fileName ?? `video-${Date.now()}.mp4`;
    const type = asset.mimeType ?? "video/mp4";
    setVideos((prev) => [...prev, { uri: asset.uri, name, type }]);
  }

  function removeVideo(uri: string) {
    setVideos((prev) => prev.filter((v) => v.uri !== uri));
  }

  function playSuccess() {
    setSuccess(true);
    Animated.spring(successScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    setTimeout(() => {
      if (onCreated) {
        onCreated();
        setSuccess(false);
        successScale.setValue(0);
      } else {
        navigation?.goBack();
      }
    }, 1400);
  }

  async function resolveLocation() {
    const query = locationInput.trim();
    if (!query) {
      setError("Enter where the produce is located");
      return;
    }
    setGeocoding(true);
    setError(null);
    try {
      const match = await geocodeAddress(query);
      if (!match) {
        setError("Could not find that address — try adding more detail (city, state)");
        return;
      }
      setResolvedLocation(match);
    } finally {
      setGeocoding(false);
    }
  }

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("cropType", needsSubType ? `${effectiveCropType} (${resolvedSubType})` : effectiveCropType);
      form.append("weightKg", String(weight));
      form.append("pricePerKg", String(price));
      form.append("grade", grade);
      if (!isPooled && minOrder > 0) form.append("minOrderKg", String(minOrder));
      if (differentLocation && resolvedLocation) {
        form.append("locationLabel", locationInput.trim());
        form.append("locationLat", String(resolvedLocation.lat));
        form.append("locationLng", String(resolvedLocation.lng));
      }
      form.append("isPooled", String(isPooled));
      if (isPooled && selectedPool) form.append("poolId", selectedPool);
      images.forEach((img) => {
        // React Native FormData file shape.
        form.append("images", { uri: img.uri, name: img.name, type: img.type } as any);
      });
      videos.forEach((v) => {
        form.append("videos", { uri: v.uri, name: v.name, type: v.type } as any);
      });

      await api.post("/listings/create", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      playSuccess();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not create listing. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Images */}
      <Text style={styles.label}>Photos ({images.length})</Text>
      <View style={styles.thumbRow}>
        {images.map((img) => (
          <TouchableOpacity key={img.uri} onPress={() => removeImage(img.uri)}>
            <Image source={{ uri: img.uri }} style={styles.thumb} />
            <View style={styles.removeBadge}>
              <Text style={styles.removeBadgeText}>✕</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addThumb} onPress={pickImage} activeOpacity={0.8}>
          <Text style={styles.addThumbPlus}>＋</Text>
          <Text style={styles.addThumbText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Videos */}
      <Text style={styles.label}>Videos ({videos.length}) — optional</Text>
      <Text style={styles.hint}>A short clip helps buyers see quality up close.</Text>
      <View style={styles.thumbRow}>
        {videos.map((v) => (
          <TouchableOpacity key={v.uri} style={styles.videoThumb} onPress={() => removeVideo(v.uri)}>
            <Text style={styles.videoThumbIcon}>▶</Text>
            <View style={styles.removeBadge}>
              <Text style={styles.removeBadgeText}>✕</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addThumb} onPress={pickVideo} activeOpacity={0.8}>
          <Text style={styles.addThumbPlus}>＋</Text>
          <Text style={styles.addThumbText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Crop or animal */}
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
              setSelectedPool(null);
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
          setSelectedPool(null);
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

      {/* Weight */}
      <Text style={styles.label}>Weight (kg)</Text>
      <TextInput
        style={styles.input}
        value={weightKg}
        onChangeText={(t) => setWeightKg(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={COLORS.TEXT_MUTED}
      />

      {/* Price per kg + auto total */}
      <Text style={styles.label}>Price per kg (₦)</Text>
      <TextInput
        style={styles.input}
        value={pricePerKg}
        onChangeText={(t) => setPricePerKg(t.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={COLORS.TEXT_MUTED}
      />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatNaira(total)}</Text>
      </View>

      {/* Grade radios */}
      <Text style={styles.label}>Grade</Text>
      {GRADES.map((g) => {
        const selected = grade === g.value;
        return (
          <TouchableOpacity
            key={g.value}
            style={[styles.radioRow, selected && styles.radioRowSelected]}
            onPress={() => setGrade(g.value)}
            activeOpacity={0.85}
          >
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected && <View style={styles.radioDot} />}
            </View>
            <View>
              <Text style={styles.radioTitle}>{g.label}</Text>
              <Text style={styles.radioDesc}>{g.description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Pool toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Add to Village Pool?</Text>
        <Switch
          value={isPooled}
          onValueChange={(v) => {
            setIsPooled(v);
            if (!v) setSelectedPool(null);
          }}
          trackColor={{ true: COLORS.PRIMARY, false: COLORS.BORDER }}
          thumbColor={COLORS.WHITE}
        />
      </View>

      {isPooled && (
        <View>
          {!cropType ? (
            <Text style={styles.hint}>Pick a crop or animal type to see matching pools.</Text>
          ) : pools.length === 0 ? (
            selectedPool ? (
              <Text style={styles.hint}>Pool created — your listing will join it on submit.</Text>
            ) : (
              <View style={styles.newPoolCard}>
                <Text style={styles.hint}>No open pools for {cropType} nearby yet. Start one:</Text>

                <Text style={styles.label}>Contract name</Text>
                <TextInput
                  style={styles.input}
                  value={poolContractName}
                  onChangeText={setPoolContractName}
                  placeholder={`e.g. ${cropType} Village Pool`}
                  placeholderTextColor={COLORS.TEXT_MUTED}
                />

                <Text style={styles.label}>Target weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={poolTargetWeightKg}
                  onChangeText={(t) => setPoolTargetWeightKg(t.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                />

                <Text style={styles.label}>Asking price per kg (₦)</Text>
                <TextInput
                  style={styles.input}
                  value={poolPricePerKg}
                  onChangeText={(t) => setPoolPricePerKg(t.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                />

                <Text style={styles.label}>Deadline</Text>
                <TextInput
                  style={styles.input}
                  value={poolDeadline}
                  onChangeText={setPoolDeadline}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />

                <Text style={styles.label}>Visible within {poolRadiusKm}km</Text>
                <View style={styles.radiusRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.radiusChip, poolRadiusKm === r && styles.radiusChipActive]}
                      onPress={() => setPoolRadiusKm(r)}
                    >
                      <Text style={[styles.radiusChipText, poolRadiusKm === r && styles.radiusChipTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Button
                  label={creatingPool ? "Creating…" : "Create pool"}
                  onPress={createPool}
                  disabled={creatingPool}
                  variant="outline"
                  style={{ marginTop: SPACING.md }}
                />
              </View>
            )
          ) : (
            pools.map((p) => {
              const selected = selectedPool === p.id;
              const pct =
                p.percentageFilled ??
                (p.targetWeightKg > 0 ? Math.round((p.currentWeightKg / p.targetWeightKg) * 100) : 0);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.poolCard, selected && styles.poolCardSelected]}
                  onPress={() => setSelectedPool(p.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.poolName}>{p.contractName}</Text>
                  <Text style={styles.poolMeta}>
                    {pct}% filled · target {p.targetWeightKg}kg
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label="List for sale"
        onPress={submit}
        disabled={!canSubmit}
        loading={submitting}
        variant="green"
        style={{ marginTop: SPACING.lg }}
      />

      {/* Success overlay */}
      {success && (
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successCircle, { transform: [{ scale: successScale }] }]}>
            <Text style={styles.successCheck}>✓</Text>
          </Animated.View>
          <Text style={styles.successText}>Listed!</Text>
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl * 3 },
  label: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
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
  segmentText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, color: COLORS.TEXT_MUTED },
  segmentTextActive: { color: COLORS.TEXT_PRIMARY },
  newPoolCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  radiusChip: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.SURFACE,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
  },
  radiusChipActive: { borderColor: COLORS.PRIMARY, backgroundColor: COLORS.SUCCESS_BG },
  radiusChipText: { fontSize: FONT.size.small, fontWeight: FONT.weight.bold, color: COLORS.TEXT_MUTED },
  radiusChipTextActive: { color: COLORS.PRIMARY },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.input },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: COLORS.DANGER,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBadgeText: { color: COLORS.WHITE, fontSize: 12, fontWeight: FONT.weight.bold },
  addThumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addThumbPlus: { fontSize: 24, color: COLORS.PRIMARY },
  addThumbText: { fontSize: FONT.size.caption, color: COLORS.TEXT_MUTED },
  videoThumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.PRIMARY_DARK,
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbIcon: { color: "#fff", fontSize: 20 },
  input: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.header,
    fontWeight: FONT.weight.semibold,
    color: COLORS.TEXT_PRIMARY,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  totalLabel: { fontSize: FONT.size.base, color: COLORS.TEXT_MUTED },
  totalValue: { fontSize: FONT.size.header, fontWeight: FONT.weight.bold, color: COLORS.PRIMARY },
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
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.TEXT_MUTED,
    marginRight: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: COLORS.PRIMARY },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.PRIMARY },
  radioTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY },
  radioDesc: { fontSize: FONT.size.small, color: COLORS.TEXT_MUTED },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
  },
  toggleLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY },
  hint: { color: COLORS.TEXT_MUTED, fontSize: FONT.size.small, marginTop: SPACING.sm },
  poolCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  poolCardSelected: { borderColor: COLORS.ACCENT },
  poolName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY },
  poolMeta: { fontSize: FONT.size.small, color: COLORS.TEXT_MUTED, marginTop: 2 },
  error: { color: COLORS.DANGER, marginTop: SPACING.md, fontSize: FONT.size.small },
  successOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: COLORS.SUCCESS,
    alignItems: "center",
    justifyContent: "center",
  },
  successCheck: { color: COLORS.WHITE, fontSize: 56, fontWeight: FONT.weight.bold },
  successText: {
    marginTop: SPACING.md,
    fontSize: FONT.size.header,
    fontWeight: FONT.weight.bold,
    color: COLORS.PRIMARY,
  },
});
