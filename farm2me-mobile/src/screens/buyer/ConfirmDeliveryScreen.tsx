import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Button, EscrowBanner } from "../../components/ui";
import { StarPicker } from "../../components/StarRating";
import ContactsCard from "../../components/ContactsCard";
import type { ScreenProps } from "../../navigation/types";

const PIN_LENGTH = 4;

interface TripContacts {
  farmerName?: string | null;
  farmerPhone?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  farmerIds?: string[];
  driverId?: string | null;
}

interface RatingTarget {
  id: string;
  label: string;
}

export default function ConfirmDeliveryScreen({ route, navigation }: ScreenProps<"ConfirmDelivery">) {
  const { escrowTripId } = route.params;
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<TripContacts | null>(null);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const [delivered, setDelivered] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .get<TripContacts>(`/escrow/${escrowTripId}`)
      .then(({ data }) => setContacts(data))
      .catch(() => {
        // Contacts are a nice-to-have here — PIN confirmation still works without them.
      });
  }, [escrowTripId]);

  const inputs = useRef<(TextInput | null)[]>([]);
  const pin = digits.join("");
  const complete = pin.length === PIN_LENGTH && digits.every(Boolean);

  function handleChange(text: string, index: number) {
    const char = text.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char && index < PIN_LENGTH - 1) inputs.current[index + 1]?.focus();
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function confirm() {
    if (!complete || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/payments/confirm-delivery", { escrowTripId, pin });
      setDelivered(true);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Invalid PIN or delivery could not be confirmed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRating(target: RatingTarget, value: number, comment: string) {
    try {
      await api.post("/ratings", { escrowTripId, rateeId: target.id, rating: value, comment: comment || undefined });
      setRated((prev) => new Set(prev).add(target.id));
    } catch (e: any) {
      Alert.alert("Could not submit rating", e?.response?.data?.error ?? "Please try again.");
    }
  }

  const ratingTargets: RatingTarget[] = [
    ...(contacts?.farmerIds ?? []).map((id, i) => ({
      id,
      label: (contacts?.farmerIds?.length ?? 0) > 1 ? `${contacts?.farmerName ?? "Farmer"} (share ${i + 1})` : contacts?.farmerName ?? "Farmer",
    })),
    ...(contacts?.driverId ? [{ id: contacts.driverId, label: contacts?.driverName ?? "Transporter" }] : []),
  ];

  async function submitDispute() {
    if (disputeReason.trim().length < 3 || disputeSubmitting) return;
    setDisputeSubmitting(true);
    try {
      await api.post("/payments/raise-dispute", {
        escrowTripId,
        reason: disputeReason.trim(),
        evidenceUrls: [],
      });
      setDisputeOpen(false);
      setDisputeReason("");
      Alert.alert("Dispute raised", "Our team will review your dispute and contact you.", [
        { text: "OK", onPress: () => navigation.popToTop() },
      ]);
    } catch (e: any) {
      Alert.alert("Could not raise dispute", e?.response?.data?.error ?? "Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  if (delivered) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
        <Text style={styles.title}>Payment released!</Text>
        <Text style={styles.instruction}>Thank you — funds have been released to the farmer and transporter.</Text>

        {ratingTargets.length > 0 && (
          <View style={{ marginTop: SPACING.xl, gap: SPACING.lg }}>
            <Text style={styles.instruction}>Rate your experience</Text>
            {ratingTargets.map((t) => (
              <RatingRow key={t.id} target={t} done={rated.has(t.id)} onSubmit={submitRating} />
            ))}
          </View>
        )}

        <Button label="Done" onPress={() => navigation.popToTop()} variant="green" style={{ marginTop: SPACING.xl }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.md }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Confirm delivery</Text>
      <Text style={styles.instruction}>Enter the delivery PIN shown by your driver</Text>

      <View style={styles.pinRow}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            style={[styles.pinBox, d ? styles.pinBoxFilled : null]}
            value={d}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={i === 0}
            textAlign="center"
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label="Confirm & release payment"
        onPress={confirm}
        disabled={!complete}
        loading={submitting}
        variant="green"
        style={{ marginTop: SPACING.xl }}
      />

      <EscrowBanner label="Releases the buyer's payment to the farmer and transporter" />

      <ContactsCard
        contacts={[
          { label: "Farmer", name: contacts?.farmerName, phone: contacts?.farmerPhone },
          { label: "Driver", name: contacts?.driverName, phone: contacts?.driverPhone },
        ]}
      />

      <TouchableOpacity onPress={() => setDisputeOpen(true)}>
        <Text style={styles.disputeLink}>Raise a dispute</Text>
      </TouchableOpacity>

      <Modal visible={disputeOpen} transparent animationType="slide" onRequestClose={() => setDisputeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Raise a dispute</Text>
            <Text style={styles.instruction}>Tell us what went wrong with this delivery.</Text>
            <TextInput
              style={styles.reasonInput}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="e.g. Goods arrived spoiled / wrong quantity"
              placeholderTextColor={COLORS.TEXT_MUTED}
              multiline
            />
            <Button
              label="Submit dispute"
              onPress={submitDispute}
              disabled={disputeReason.trim().length < 3}
              loading={disputeSubmitting}
              variant="ink"
              style={{ marginTop: SPACING.md }}
            />
            <TouchableOpacity onPress={() => setDisputeOpen(false)}>
              <Text style={styles.cancelLink}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RatingRow({
  target,
  done,
  onSubmit,
}: {
  target: RatingTarget;
  done: boolean;
  onSubmit: (target: RatingTarget, value: number, comment: string) => Promise<void>;
}) {
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (done) {
    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingLabel}>{target.label}</Text>
        <Text style={styles.ratingThanks}>Thanks for your feedback!</Text>
      </View>
    );
  }

  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{target.label}</Text>
      <StarPicker value={value} onChange={setValue} />
      <TextInput
        style={styles.ratingComment}
        value={comment}
        onChangeText={setComment}
        placeholder="Leave a comment (optional)"
        placeholderTextColor={COLORS.TEXT_MUTED}
      />
      <Button
        label="Submit rating"
        variant="outline"
        disabled={value === 0}
        loading={submitting}
        onPress={async () => {
          setSubmitting(true);
          await onSubmit(target, value, comment);
          setSubmitting(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND, paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  backBtnText: { fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 17, color: COLORS.TEXT_PRIMARY },
  title: { fontSize: 20, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY, textAlign: "center" },
  instruction: { fontSize: FONT.size.base, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, textAlign: "center", marginTop: 4 },
  pinRow: { flexDirection: "row", justifyContent: "center", gap: SPACING.md, marginTop: SPACING.xl },
  pinBox: {
    width: 60,
    height: 72,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: COLORS.SURFACE,
    fontSize: 26,
    fontWeight: FONT.weight.bold,
    fontFamily: FONT.familyBold,
    color: COLORS.TEXT_PRIMARY,
  },
  pinBoxFilled: { borderColor: COLORS.PRIMARY, borderWidth: 2 },
  error: { color: COLORS.DANGER, textAlign: "center", marginTop: SPACING.md, fontSize: FONT.size.small, fontFamily: FONT.family },
  disputeLink: { color: COLORS.DANGER, fontSize: FONT.size.small, fontFamily: FONT.family, textAlign: "center", marginTop: SPACING.lg },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: COLORS.SURFACE,
    borderTopLeftRadius: RADIUS.cardLarge,
    borderTopRightRadius: RADIUS.cardLarge,
    padding: SPACING.lg,
  },
  modalTitle: { fontSize: 17, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  reasonInput: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    padding: SPACING.md,
    minHeight: 90,
    textAlignVertical: "top",
    marginTop: SPACING.md,
    fontSize: FONT.size.base,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
  cancelLink: { color: COLORS.TEXT_MUTED, fontFamily: FONT.family, textAlign: "center", marginTop: SPACING.md },
  ratingRow: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  ratingLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  ratingThanks: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.PRIMARY },
  ratingComment: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT.size.small,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
  },
});
