import React, { useEffect, useRef, useState } from "react";
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, View } from "react-native";
import { api } from "../api/client";
import { COLORS, FONT, RADIUS, SPACING } from "../constants/theme";
import { Button, Card } from "./ui";
import { Icon } from "./Icon";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STEP = 100;
const POLL_MS = 4000;
// Fast enough that suggestions keep narrowing as each character lands.
const SEARCH_DEBOUNCE_MS = 250;
// Only once typing has genuinely paused this long — not just between two
// keystrokes — do we treat "still no matching suggestion" as "this is a
// manually-typed address" and auto-reveal the rest of the form.
const SETTLE_MS = 1500;

interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

interface Quote {
  id: string;
  driverId: string;
  driverName: string;
  driverIsVerified: boolean;
  amount: string | number;
  proposedBy: "FARMER" | "DRIVER";
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  minAmount: number;
  maxAmount: number;
}

interface RequestData {
  id: string;
  destinationLabel: string;
  itemDescription: string;
  weightKg: number;
  status: "OPEN" | "ACCEPTED" | "CANCELLED";
  agreedAmount: string | number | null;
}

function naira(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Farmer self-arranged delivery: destination + what/how much -> broadcasts to
// nearby drivers -> live negotiation per driver (a bounded +/-100 stepper on
// whoever's turn it is) -> accept. Order-independent — see
// transportRequest.controller.ts for why this isn't an EscrowTrip.
export default function TransportRequestCard() {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stepperAmounts, setStepperAmounts] = useState<Record<string, number>>({});
  const [acceptedInfo, setAcceptedInfo] = useState<{ driverName: string; amount: number } | null>(null);

  const [destination, setDestination] = useState("");
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationConfirmed, setDestinationConfirmed] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [item, setItem] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside the settle timeout's closure, which captures whatever
  // `suggestions` was at the moment it was scheduled — a ref always has the
  // latest value instead.
  const suggestionsRef = useRef<AddressSuggestion[]>([]);
  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  function revealRestOfForm() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDestinationConfirmed(true);
  }

  // As-you-type address suggestions from the very first character (fast
  // debounce, so the list keeps narrowing with each keystroke — see
  // geocode.service.ts for the Nigeria bias). Separately, typing anything
  // resets a much longer "settle" timer: only once the farmer has actually
  // stopped typing for SETTLE_MS with no suggestion picked and nothing
  // matching do we treat the typed text itself as the destination and
  // auto-reveal the rest of the form — never mid-keystroke.
  function onDestinationChange(text: string) {
    setDestination(text);
    setDestinationCoords(null);
    setDestinationConfirmed(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (settleRef.current) clearTimeout(settleRef.current);

    if (text.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<{ data: AddressSuggestion[] }>("/geo/search", { params: { q: text.trim() } });
        setSuggestions(data.data ?? []);
      } catch {
        setSuggestions([]);
      }
    }, SEARCH_DEBOUNCE_MS);

    settleRef.current = setTimeout(() => {
      if (suggestionsRef.current.length === 0) revealRestOfForm();
    }, SETTLE_MS);
  }

  function pickSuggestion(s: AddressSuggestion) {
    if (settleRef.current) clearTimeout(settleRef.current);
    setDestination(s.label);
    setDestinationCoords({ lat: s.lat, lng: s.lng });
    setSuggestions([]);
    revealRestOfForm();
  }

  async function refresh(id: string) {
    try {
      const { data } = await api.get<{ request: RequestData; quotes: Quote[] }>(`/transport/quote-requests/${id}`);
      setRequest(data.request);
      setQuotes(data.quotes);
      setStepperAmounts((prev) => {
        const next = { ...prev };
        for (const q of data.quotes) {
          if (!(q.id in next)) next[q.id] = Number(q.amount);
        }
        return next;
      });
      if (data.request.status === "ACCEPTED") {
        const accepted = data.quotes.find((q) => q.status === "ACCEPTED");
        if (accepted) setAcceptedInfo({ driverName: accepted.driverName, amount: Number(data.request.agreedAmount) });
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      // Keep last known state — next poll retries.
    }
  }

  useEffect(() => {
    if (!requestId) return;
    refresh(requestId);
    pollRef.current = setInterval(() => refresh(requestId), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (settleRef.current) clearTimeout(settleRef.current);
    setRequestId(null);
    setRequest(null);
    setQuotes([]);
    setStepperAmounts({});
    setDestination("");
    setDestinationCoords(null);
    setDestinationConfirmed(false);
    setSuggestions([]);
    setItem("");
    setWeightKg("");
    setAcceptedInfo(null);
    setError(null);
  }

  async function submitRequest() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<{ request: RequestData }>("/transport/quote-requests", {
        destinationLabel: destination.trim(),
        destinationLat: destinationCoords?.lat,
        destinationLng: destinationCoords?.lng,
        itemDescription: item.trim(),
        weightKg: Number(weightKg),
      });
      setRequestId(data.request.id);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not create this request");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest() {
    if (requestId) {
      try {
        await api.post(`/transport/quote-requests/${requestId}/cancel`);
      } catch {
        // Best-effort — the farmer is leaving this request either way.
      }
    }
    reset();
  }

  function adjustStepper(quote: Quote, delta: number) {
    setStepperAmounts((prev) => {
      const current = prev[quote.id] ?? Number(quote.amount);
      const next = Math.min(quote.maxAmount, Math.max(quote.minAmount, current + delta));
      return { ...prev, [quote.id]: next };
    });
  }

  async function counterQuote(quote: Quote) {
    const amount = stepperAmounts[quote.id] ?? Number(quote.amount);
    setBusyQuoteId(quote.id);
    setError(null);
    try {
      await api.post(`/transport/quotes/${quote.id}/counter`, { amount });
      if (requestId) await refresh(requestId);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not send that offer");
    } finally {
      setBusyQuoteId(null);
    }
  }

  async function acceptQuote(quote: Quote) {
    setBusyQuoteId(quote.id);
    setError(null);
    try {
      await api.post(`/transport/quotes/${quote.id}/accept`);
      if (requestId) await refresh(requestId);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not accept this quote");
    } finally {
      setBusyQuoteId(null);
    }
  }

  if (acceptedInfo) {
    return (
      <Card style={styles.card}>
        <Text style={styles.acceptedTitle}>🎉 {acceptedInfo.driverName} accepted your request!</Text>
        <Text style={styles.acceptedSub}>Agreed at {naira(acceptedInfo.amount)}</Text>
        <TouchableOpacity onPress={reset}>
          <Text style={styles.newRequestLink}>Start a new request</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  if (!requestId) {
    const ready = destinationConfirmed && item.trim().length > 0 && Number(weightKg) > 0;
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Where are you delivering to?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 15 Adeniran Ogunsanya Street, Surulere, Lagos"
          placeholderTextColor={COLORS.TEXT_MUTED}
          value={destination}
          onChangeText={onDestinationChange}
        />
        {suggestions.length > 0 && (
          <ScrollView
            style={styles.suggestionsBox}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {suggestions.map((s, i) => (
              <TouchableOpacity
                key={`${s.lat}-${s.lng}-${i}`}
                style={[styles.suggestionRow, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => pickSuggestion(s)}
                activeOpacity={0.7}
              >
                <Icon name="pin" size={14} color={COLORS.TEXT_MUTED} />
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {destinationConfirmed && (
          <>
            <Text style={styles.label}>What are you delivering?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Fresh tomatoes"
              placeholderTextColor={COLORS.TEXT_MUTED}
              value={item}
              onChangeText={setItem}
            />
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.TEXT_MUTED}
              value={weightKg}
              onChangeText={(t) => setWeightKg(t.replace(/[^0-9.]/g, ""))}
            />
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={submitting ? "Requesting…" : "Request drivers"}
          onPress={submitRequest}
          disabled={submitting || !ready}
          variant="green"
          style={{ marginTop: SPACING.md }}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.activeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Delivering to {request?.destinationLabel}</Text>
          <Text style={styles.sub}>
            {request?.weightKg}kg of {request?.itemDescription}
          </Text>
        </View>
        <TouchableOpacity onPress={cancelRequest}>
          <Text style={styles.cancelLink}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {quotes.length === 0 ? (
        <Text style={styles.waitingText}>Waiting for nearby drivers to quote…</Text>
      ) : (
        quotes.map((q) => {
          const stepValue = stepperAmounts[q.id] ?? Number(q.amount);
          const farmersTurn = q.proposedBy === "DRIVER";
          const busy = busyQuoteId === q.id;
          return (
            <View key={q.id} style={styles.quoteRow}>
              <Text style={styles.quoteDriver}>
                {q.driverName}
                {q.driverIsVerified ? " ✓" : ""}
              </Text>
              {farmersTurn ? (
                <>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => adjustStepper(q, -STEP)}
                      disabled={stepValue <= q.minAmount}
                    >
                      <Icon name="remove" size={18} color={COLORS.TEXT_PRIMARY} />
                    </TouchableOpacity>
                    <Text style={styles.stepperAmount}>{naira(stepValue)}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => adjustStepper(q, STEP)}
                      disabled={stepValue >= q.maxAmount}
                    >
                      <Icon name="add" size={18} color={COLORS.TEXT_PRIMARY} />
                    </TouchableOpacity>
                  </View>
                  {stepValue <= q.minAmount && <Text style={styles.rangeHint}>Too low</Text>}
                  {stepValue >= q.maxAmount && <Text style={styles.rangeHint}>Too high</Text>}
                  <View style={styles.quoteActions}>
                    <Button
                      label={busy ? "…" : `Request ${naira(stepValue)}`}
                      onPress={() => counterQuote(q)}
                      disabled={busy}
                      variant="outline"
                      style={{ flex: 1 }}
                    />
                    <Button label="Accept" onPress={() => acceptQuote(q)} disabled={busy} variant="green" style={{ flex: 1 }} />
                  </View>
                </>
              ) : (
                <Text style={styles.waitingText}>You offered {naira(q.amount)} — waiting for the driver to respond</Text>
              )}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: SPACING.lg },
  title: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  sub: { fontSize: 11.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 1 },
  label: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, fontFamily: FONT.familySemibold, color: COLORS.TEXT_PRIMARY, marginTop: SPACING.md, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.input,
    borderWidth: 2,
    borderColor: COLORS.BORDER,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.base,
    fontFamily: FONT.family,
    color: COLORS.TEXT_PRIMARY,
    marginTop: SPACING.sm,
  },
  error: { color: COLORS.DANGER, fontSize: FONT.size.small, marginTop: SPACING.sm },
  suggestionsBox: {
    maxHeight: 260,
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    marginTop: SPACING.xs,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.DIVIDER,
  },
  suggestionText: { flex: 1, fontSize: 12.5, fontFamily: FONT.family, color: COLORS.TEXT_PRIMARY },
  activeHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACING.sm },
  cancelLink: { color: COLORS.DANGER, fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold },
  waitingText: { fontSize: 12.5, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: SPACING.sm },
  quoteRow: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  quoteDriver: { fontSize: 13.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.md, marginTop: SPACING.sm },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.SURFACE,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperAmount: { fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY, minWidth: 90, textAlign: "center" },
  rangeHint: { textAlign: "center", fontSize: 11, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.DANGER, marginTop: 4 },
  quoteActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  acceptedTitle: { fontSize: 15, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  acceptedSub: { fontSize: 13, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  newRequestLink: { marginTop: SPACING.md, color: COLORS.PRIMARY, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, fontSize: 12.5 },
});
