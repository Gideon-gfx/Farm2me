import { api } from "../api/client";
import type { User } from "./types";

// A reverse-geocoded locationLabel (see captureLocation below) is a
// most-specific-first comma list, e.g. "Akintunde Street, Onike, Lagos
// Mainland, Lagos State, 104233, Nigeria". Buyer-facing views only need the
// neighbourhood/city/state level — the street segment and any postal code
// are dropped so a farmer/buyer's exact address is never shown to someone
// just browsing (the map already makes the same call, showing an
// approximate pin rather than the precise address).
export function publicLocationLabel(label?: string | null): string | null {
  if (!label) return label ?? null;
  const parts = label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return label;

  const [, ...rest] = parts; // drop the street/house-level first segment
  const cleaned = rest.filter((p) => !/^\d{4,}$/.test(p)); // drop postal codes
  return cleaned.join(", ") || label;
}

// Turns a manually typed address into coordinates (Nominatim forward
// search), so a buyer who'd rather type their delivery address than grant
// GPS access still ends up with real lat/lng — everything downstream (farmer
// dispatch distance, map pins) depends on having a coordinate, not just text.
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return null;
  const results = await res.json();
  const first = results?.[0];
  if (!first) return null;
  return { lat: Number(first.lat), lng: Number(first.lon), label: first.display_name ?? query };
}

// Best-effort: runs right after sign-up/sign-in so a user's full location is
// on file for their profile. Never blocks the auth flow or surfaces an error
// — permission can always be denied, and the account still works without it.
export function captureLocation(onUpdated: (user: User) => void) {
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      let locationLabel: string | undefined;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          locationLabel = data.display_name;
        }
      } catch {
        // Reverse geocoding is a nice-to-have — lat/lng alone still saves.
      }
      try {
        const { data } = await api.post<{ user: User }>("/auth/update-location", {
          locationLat: latitude,
          locationLng: longitude,
          ...(locationLabel ? { locationLabel } : {}),
        });
        onUpdated(data.user);
      } catch {
        // Ignore — location capture must never break sign-in.
      }
    },
    () => {
      // Permission denied/unavailable — user can grant it later from Profile.
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}
