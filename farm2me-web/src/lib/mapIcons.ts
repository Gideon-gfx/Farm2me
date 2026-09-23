import L from "leaflet";

// Shared Leaflet pin styles so every map in the app (transporter live map,
// product page, order tracking) uses the same visual language: a farm emoji
// for sellers/pickup points, a truck for transporters/drivers, a house for
// the buyer/delivery point. Colour still carries state (e.g. an open load vs
// one this driver already accepted), the emoji carries "what kind of place".
function badgeIcon(emoji: string, bg: string, size = 26) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:${Math.round(
      size * 0.55
    )}px;line-height:1">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Farm/seller pins.
export const farmIconAvailable = badgeIcon("🌾", "#2F6B3F"); // an open, unaccepted load's pickup
export const farmIconMine = badgeIcon("🌾", "#D9A441"); // this driver's own accepted pickup
export const farmIconNearby = badgeIcon("🌾", "#EA580C", 22); // a farm nearby, not tied to any load
export const farmIconListing = badgeIcon("🌾", "#2F6B3F", 30); // the product page's own farmer pin

// Transporter/driver pins.
export const truckIconSelf = badgeIcon("🚚", "#2563eb"); // "you are here"
export const truckIconLive = badgeIcon("🚚", "#D9A441", 24); // a trip's live GPS-reported driver position

// Buyer/delivery pin — not a seller, kept as a plain house marker.
export const buyerIcon = badgeIcon("🏠", "#8B5CF6", 22);
