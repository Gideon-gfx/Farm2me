// `fractionDigits` sets both the minimum and maximum, so passing 2 always
// shows exactly two decimal places (e.g. "₦50,000.00"), not just up to two.
export function naira(value: string | number, fractionDigits = 0): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

// Live thousands-separator formatting for a plain-number text input — e.g.
// typing "999" then "9" reformats to "9,999" as you type. Native
// type="number" inputs can't display commas, so callers use a text input
// bound to this instead. Keeps at most 2 decimal places, one decimal point.
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) {
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  const intPart = cleaned.slice(0, firstDot).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decPart = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return `${intPart}.${decPart}`;
}

// Parses a value produced by formatAmountInput (or any comma-grouped number
// string) back into a plain number — 0 for empty/invalid input.
export function parseAmountInput(formatted: string): number {
  const n = Number(formatted.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// Listing/escrow status -> the prototype's escrow-timeline pill palette.
export function statusBadge(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "bg-success text-primary",
    OPEN: "bg-success text-primary",
    DELIVERED: "bg-success text-primary",
    ARRIVED: "bg-accent/15 text-accent-dark",
    IN_TRANSIT: "bg-escrow text-escrow-ink",
    FUNDS_LOCKED: "bg-escrow text-escrow-ink",
    LOCKED: "bg-escrow text-escrow-ink",
    COMPLETED: "bg-black/5 text-muted",
    RELEASED: "bg-black/5 text-muted",
    SOLD: "bg-black/5 text-muted",
    FULFILLED: "bg-black/5 text-muted",
    DISPUTED: "bg-danger/10 text-danger",
    CANCELLED: "bg-danger/10 text-danger",
  };
  return map[status] ?? "bg-black/5 text-muted";
}
