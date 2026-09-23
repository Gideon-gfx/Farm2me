export type Role = "FARMER" | "BUYER" | "TRANSPORTER" | "ADMIN";
export type Grade = "GRADE_A" | "GRADE_B" | "GRADE_C";
export type ListingStatus = "ACTIVE" | "SOLD" | "CANCELLED" | "IN_TRANSIT" | "COMPLETED";
export type PoolStatus = "OPEN" | "LOCKED" | "IN_TRANSIT" | "FULFILLED" | "CANCELLED";
export type EscrowStatus = "FUNDS_LOCKED" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "DISPUTED" | "RELEASED";
export type SubscriptionTier = "FREE" | "STANDARD" | "PREMIUM";

export interface User {
  id: string;
  // Null for a Google signup that hasn't linked a phone number yet (see
  // POST /auth/link-phone).
  phoneNumber: string | null;
  email?: string | null;
  fullName: string;
  role: Role;
  walletBalance: string | number;
  isVerified: boolean;
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  subscriptionTier?: SubscriptionTier;
  subscriptionExpiresAt?: string | null;
  // A real photo the user uploaded (camera or gallery) — not a generated
  // avatar. Null falls back to the initials circle.
  avatarUrl?: string | null;
  // FARMER-only — the public name shown to buyers on listings and search
  // results instead of fullName. Null/unset falls back to fullName.
  farmName?: string | null;
}

export interface Listing {
  id: string;
  farmerId: string;
  cropType: string;
  weightKg: number;
  pricePerKg: string | number;
  totalPrice: string | number;
  minOrderKg: number;
  grade: Grade;
  imageUrls: string[];
  videoUrls?: string[];
  isPooled: boolean;
  poolId?: string | null;
  status: ListingStatus;
  createdAt: string;
  farmerName?: string;
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  // Present only when the list was requested with a viewer lat/lng.
  distanceKm?: number | null;
}

export interface VillagePool {
  id: string;
  contractName: string;
  cropType: string;
  // Free-text detail for categories that need it — e.g. cropType "Poultry"
  // with subType "Broiler chicken", or cropType "Animal Feed" with subType
  // "Black soldier fly maggots".
  subType?: string | null;
  targetWeightKg: number;
  currentWeightKg: number;
  percentageFilled?: number;
  deadline: string;
  pricePerKg: string | number;
  status: PoolStatus;
  // Null when the pool was created by a farmer and no buyer has funded it yet.
  buyerName?: string | null;
  createdByFarmerName?: string | null;
  radiusKm?: number | null;
  // Present only when the list was requested with a viewer lat/lng.
  distanceKm?: number | null;
  contributorCount?: number;
  // Only present on farData entries (>200km away), and only populated for
  // signed-in viewers — see GET /pools.
  contactPhone?: string | null;
}

export interface PoolContribution {
  weightKg: number;
  locationLabel?: string | null;
  confirmedAt?: string | null;
}

export interface EscrowTrip {
  id: string;
  status: EscrowStatus;
  totalAmount: string | number;
  logisticsFee: string | number;
  farmerPayout: string | number;
  createdAt: string;
}

export const CROP_TYPES = [
  "Cassava",
  "Yam",
  "Maize",
  "Beans",
  "Tomatoes",
  "Peppers",
  "Plantain",
  "Cocoyam",
  "Groundnut",
  "Banana",
  "Onions",
  "Bambara Nut (Okpa)",
  "Tiger Nut (Ofio)",
  "Garlic",
  "Ginger",
  "Green Melon (Egusi)",
  "Water Melon",
  "Cocoa Beans",
  "Coconut",
  "Oil Palm Kernel Seeds",
  "Millet",
  "Soya Beans",
  "Sugarcane",
  "Wheat",
  "Vanilla",
  "Cashew Nuts",
  "Pineapples",
  "Mangoes",
  "Oranges",
  "Sesame Seeds",
  "Locust Beans",
  "Rice",
  "Kola Nut",
  "Sorghum",
  "Cotton",
  "Rubber",
  "Hibiscus (Zobo)",
  "Palm Oil",
  "Vegetable Oil",
  "Plant-Based Fertilizer",
  "Chemical Fertilizer",
  "Other",
] as const;

export const ANIMAL_TYPES = [
  "Poultry",
  "Cattle",
  "Goat",
  "Sheep",
  "Pig",
  "Seafood",
  "Rabbit",
  "Turkey",
  "Duck",
  "Animal Dung (Fertilizer)",
  "Animal Feed",
  "Raw Milk",
  "Cheese",
  "Cheese Curds",
  "Eggs",
] as const;

// Options shown when "Seafood" is picked — covers what's commonly sold in
// Nigerian markets; "Other" reveals a free-text field for anything not listed.
export const SEAFOOD_TYPES = [
  "Catfish",
  "Tilapia",
  "Shrimps",
  "Crayfish",
  "Prawns",
  "Lobster",
  "Crabs",
  "Hake (Panla)",
  "Herring (Shawa)",
  "Horse Mackerel (Kote)",
  "Titus Fish (Mackerel)",
  "Croaker Fish",
  "Bonga Fish",
  "Sardine",
  "Finger Fishes",
  "Other",
] as const;

// Selecting these animal types prompts for a sub-type — Poultry/Animal Feed
// are free text (the farmer/seller specifies exactly which breed or feed,
// since that's too varied to enumerate), Seafood is a dropdown of common
// species (see SEAFOOD_TYPES) with its own "Other" free-text fallback.
export const ANIMAL_TYPES_NEEDING_SUBTYPE = ["Poultry", "Animal Feed", "Seafood"] as const;
export const ANIMAL_TYPES_WITH_FREE_TEXT_SUBTYPE = ["Poultry", "Animal Feed"] as const;

// The 3 varieties of beans commonly eaten in Nigeria — picking "Beans" as the
// crop type prompts for one of these (fixed list, no free-text fallback).
export const BEAN_TYPES = ["Oloyin", "Olotu", "White"] as const;

export const GRADES: { value: Grade; label: string; description: string }[] = [
  { value: "GRADE_A", label: "Grade A", description: "Retail Premium" },
  { value: "GRADE_B", label: "Grade B", description: "Processing" },
  { value: "GRADE_C", label: "Grade C", description: "Animal Feed / Biomass" },
];

export const ROLE_HOME: Record<Role, string> = {
  FARMER: "/farmer",
  BUYER: "/buyer",
  TRANSPORTER: "/transporter",
  ADMIN: "/buyer",
};
