// Real vector icon set (Ionicons / MaterialCommunityIcons via
// @expo/vector-icons) behind the app's own semantic icon names, so every
// call site (`<Icon name="wallet" />`) stays the same regardless of which
// icon family actually draws it.
import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName =
  | "home"
  | "orders"
  | "track"
  | "chats"
  | "profile"
  | "search"
  | "escrow"
  | "bell"
  | "truck"
  | "phone"
  | "wallet"
  | "camera"
  | "star"
  | "pin"
  | "edit"
  | "trash"
  | "close"
  | "check"
  | "pool"
  | "add"
  | "back"
  | "remove";

const IONICONS_MAP: Partial<Record<IconName, keyof typeof Ionicons.glyphMap>> = {
  home: "home-outline",
  orders: "receipt-outline",
  track: "navigate-outline",
  chats: "chatbubble-outline",
  profile: "person-outline",
  search: "search-outline",
  escrow: "lock-closed-outline",
  bell: "notifications-outline",
  phone: "call-outline",
  wallet: "wallet-outline",
  camera: "camera-outline",
  star: "star",
  pin: "location-outline",
  edit: "pencil-outline",
  trash: "trash-outline",
  close: "close",
  check: "checkmark",
  pool: "people-outline",
  add: "add-circle-outline",
  back: "arrow-back",
  remove: "remove-circle-outline",
};

const MATERIAL_COMMUNITY_MAP: Partial<Record<IconName, keyof typeof MaterialCommunityIcons.glyphMap>> = {
  truck: "truck-outline",
};

export function Icon({ name, size = 22, color = "#24352A" }: { name: IconName; size?: number; color?: string }) {
  const materialGlyph = MATERIAL_COMMUNITY_MAP[name];
  if (materialGlyph) {
    return <MaterialCommunityIcons name={materialGlyph} size={size} color={color} />;
  }
  const glyph = IONICONS_MAP[name] ?? "ellipse-outline";
  return <Ionicons name={glyph} size={size} color={color} />;
}
