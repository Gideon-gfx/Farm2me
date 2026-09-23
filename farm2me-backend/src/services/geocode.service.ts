// Free address search via OpenStreetMap's Nominatim — no API key, unlike
// Google Places. Proxied through our own backend (rather than called
// directly from every device) so we can set a proper identifying User-Agent
// and stay within Nominatim's usage policy (nominatim.org/release-docs/latest/api/Search/),
// which asks for exactly that plus reasonable request volume.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "Farm2Me/1.0 (contact: support@farm2me.com)";

export interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

// Nigeria-only for now — every part of this app (currency, SMS provider,
// sample addresses) is Nigeria-specific, so biasing/filtering to it here
// gives noticeably better suggestions than an unfiltered worldwide search.
export async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "0");
  // Nominatim's own practical ceiling for a single query — the point is to
  // surface everything plausibly matching, not just the top few.
  url.searchParams.set("limit", "20");
  url.searchParams.set("countrycodes", "ng");

  const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];

  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
}
