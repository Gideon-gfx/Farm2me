// Deterministic warm tint per label, matching the prototype's produce-card palette.
const TINTS = ["#EADFC4", "#E3CDA8", "#F0DCA8", "#CFE0C3", "#EFC9B8", "#E8B8AD"];

export function tintFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
