import * as Location from "expo-location";
import { api } from "../api/client";
import { showToast } from "../components/Toast";

// Turns a manually typed address into coordinates (native OS geocoder), so
// a farmer/buyer who'd rather type an address than grant GPS access still
// ends up with real lat/lng — everything downstream (dispatch distance, map
// pins) depends on having a coordinate, not just text.
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(query);
    const first = results[0];
    if (!first) return null;
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    return null;
  }
}

// Best-effort: runs right after sign-up/sign-in so a user's full location is
// on file for their profile. Never throws — permission can always be
// denied, and the account still works without it.
export async function captureLocation(): Promise<void> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      showToast("Location permission denied — you can add your location later from Profile.", "info");
      return;
    }

    const pos = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = pos.coords;

    let locationLabel: string | undefined;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (place) {
        locationLabel = [place.street, place.city ?? place.subregion, place.region, place.country]
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      // Reverse geocoding is a nice-to-have — lat/lng alone still saves.
    }

    await api.post("/auth/update-location", {
      locationLat: latitude,
      locationLng: longitude,
      ...(locationLabel ? { locationLabel } : {}),
    });
  } catch {
    // Ignore — location capture must never break sign-in.
  }
}
