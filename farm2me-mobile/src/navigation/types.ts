import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

// Root stack — holds the auth flow plus each role's home (tab navigator) and
// the screens pushed on top of those tabs.
export type RootStackParamList = {
  Auth: undefined;

  // Farmer
  FarmerTabs: undefined;
  CreateListing: undefined;
  ActiveOrder: { escrowTripId: string };
  // Optional preselect so "My deals" can deep-link into a specific order.
  FindDriver: { escrowTripId?: string } | undefined;

  // Buyer
  BuyerTabs: undefined;
  ListingDetail: { listingId: string };
  ConfirmDelivery: { escrowTripId: string };

  // Shared (farmer or buyer)
  CreatePool: undefined;
  PoolDetail: { poolId: string };

  // Shared across all roles
  Notifications: undefined;
  Subscription: undefined;
  // Buyer/Transporter reach this as their "Wallet" bottom tab instead — this
  // stack entry exists so the Farmer stack (which has no tab bar) can push to
  // the same screen from the dashboard's wallet card.
  Wallet: undefined;
  // Transporter reaches this as their own "Profile" bottom tab; Farmer/Buyer
  // push to it directly since neither has a tab bar with a Profile slot.
  Profile: undefined;

  // Transporter
  TransporterTabs: undefined;
  ActiveTrip: { escrowTripId: string };

  ComingSoon: { role: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

// Bottom-tab param lists.
export type FarmerTabParamList = {
  MyFarm: undefined;
  FindDriver: { escrowTripId?: string } | undefined;
  AddListing: undefined;
  VillagePools: undefined;
};

export type BuyerTabParamList = {
  Home: undefined;
  MyOrders: undefined;
  Wallet: undefined;
  Messages: undefined;
};

export type TransporterTabParamList = {
  AvailableLoads: undefined;
  MyTrips: undefined;
  Wallet: undefined;
  Profile: undefined;
};

// Composite props so tab screens can also navigate on the root stack.
export type FarmerTabScreenProps<T extends keyof FarmerTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<FarmerTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

export type BuyerTabScreenProps<T extends keyof BuyerTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<BuyerTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

export type TransporterTabScreenProps<T extends keyof TransporterTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<TransporterTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;
