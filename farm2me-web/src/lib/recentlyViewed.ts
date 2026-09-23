const KEY = "farm2me:recently-viewed";
const MAX = 10;

// Per-browser only (localStorage) — a lightweight "recently viewed" trail
// for the product page, not synced anywhere and never read by anyone but
// this viewer's own browser.
export function recordRecentlyViewed(listingId: string) {
  try {
    const ids = readIds().filter((id) => id !== listingId);
    ids.unshift(listingId);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    // Storage can be unavailable (private mode, blocked) — safe to skip.
  }
}

export function getRecentlyViewed(excludeId?: string): string[] {
  return readIds().filter((id) => id !== excludeId);
}

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
