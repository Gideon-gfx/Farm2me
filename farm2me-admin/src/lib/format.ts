export function naira(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return `₦${(isNaN(n) ? 0 : n).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
