// Farm2Me design system.
// Matches the approved Farm2me mobile UI prototype exactly: warm cream
// surfaces, deep ink text, forest green primary, harvest gold accent.

export const COLORS = {
  PRIMARY: "#2F6B3F", // Forest green — brand, confirm actions
  PRIMARY_DARK: "#24352A", // Ink — headings, dark surfaces, nav bar
  ACCENT: "#D9A441", // Harvest gold — CTAs, escrow highlights
  ACCENT_DARK: "#3E2D1A", // Text on gold surfaces
  BACKGROUND: "#F7F5EF", // App background (cream)
  PAGE_BACKGROUND: "#EAE7DF", // Outer/page background behind the device
  SURFACE: "#FFFFFF",
  TEXT_PRIMARY: "#24352A",
  TEXT_MUTED: "#8A8578",
  BORDER: "rgba(0,0,0,0.07)",
  DIVIDER: "rgba(0,0,0,0.06)",
  WHITE: "#FFFFFF",

  // Escrow / status
  ESCROW_BG: "#F6E7C6",
  ESCROW_TEXT: "#8A6414",
  SUCCESS_BG: "#DDEBD9",
  SUCCESS_TEXT: "#2F6B3F",
  NEUTRAL_BG: "#EFEDE5",
  NEUTRAL_TEXT: "#6B6B60",
  TRACK_BG: "#E7ECE3",

  // Status pills (order/escrow stages)
  STATUS_ACTIVE: "#2F6B3F",
  STATUS_IN_TRANSIT: "#D9A441",
  STATUS_COMPLETED: "#6B6B60",
  DANGER: "#B4552E",
  SUCCESS: "#2F6B3F",
} as const;

export const FONT = {
  family: "Manrope_500Medium",
  familyBold: "Manrope_800ExtraBold",
  familySemibold: "Manrope_700Bold",
  size: {
    base: 15,
    small: 13,
    caption: 11,
    header: 20,
    display: 30,
    hero: 34,
  },
  weight: {
    regular: "500",
    medium: "600",
    semibold: "700",
    bold: "800",
  },
} as const;

export const RADIUS = {
  card: 16,
  cardLarge: 18,
  list: 26,
  input: 14,
  button: 14,
  pill: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

// react-native-paper theme override so Paper components match the design system.
export const paperTheme = {
  roundness: RADIUS.input,
  colors: {
    primary: COLORS.PRIMARY,
    secondary: COLORS.ACCENT,
    background: COLORS.BACKGROUND,
    surface: COLORS.SURFACE,
    onSurface: COLORS.TEXT_PRIMARY,
  },
};
