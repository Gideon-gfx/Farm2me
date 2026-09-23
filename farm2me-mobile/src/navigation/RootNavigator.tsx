import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../constants/theme";
import type { RootStackParamList } from "./types";
import AuthScreen from "../screens/auth/AuthScreen";
import CreatePoolScreen from "../screens/CreatePoolScreen";
import PoolDetailScreen from "../screens/PoolDetailScreen";
import FarmerTabs from "./FarmerTabs";
import CreateListingScreen from "../screens/farmer/CreateListingScreen";
import ActiveOrderScreen from "../screens/farmer/ActiveOrderScreen";
import FindDriverScreen from "../screens/farmer/FindDriverScreen";
import BuyerTabs from "./BuyerTabs";
import ListingDetailScreen from "../screens/buyer/ListingDetailScreen";
import ConfirmDeliveryScreen from "../screens/buyer/ConfirmDeliveryScreen";
import TransporterTabs from "./TransporterTabs";
import ActiveTripScreen from "../screens/transporter/ActiveTripScreen";
import ComingSoonScreen from "../screens/ComingSoonScreen";
import SubscriptionScreen from "../screens/common/SubscriptionScreen";
import WalletScreen from "../screens/common/WalletScreen";
import ProfileScreen from "../screens/common/ProfileScreen";
import NotificationsScreen from "../screens/common/NotificationsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Native-stack drives transitions with the platform's own navigation APIs
// (UINavigationController / Fragment transitions) instead of JS-animated
// ones, so every push/pop across the app is a genuinely smooth, native
// 60fps+ motion rather than a JS-thread-driven approximation of one.
const headerStyle = {
  headerStyle: { backgroundColor: COLORS.BACKGROUND },
  headerShadowVisible: false,
  headerTintColor: COLORS.TEXT_PRIMARY,
  headerTitleStyle: { fontWeight: "800" as const, fontFamily: "Manrope_800ExtraBold", fontSize: 17 },
  animation: "slide_from_right" as const,
};

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.BACKGROUND }}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  const role = user?.role;

  return (
    <Stack.Navigator screenOptions={headerStyle}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      ) : role === "FARMER" ? (
        <>
          <Stack.Screen name="FarmerTabs" component={FarmerTabs} options={{ headerShown: false }} />
          <Stack.Screen name="CreateListing" component={CreateListingScreen} options={{ title: "Snap & Sell" }} />
          <Stack.Screen name="ActiveOrder" component={ActiveOrderScreen} options={{ title: "Active Order" }} />
          <Stack.Screen name="FindDriver" component={FindDriverScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CreatePool" component={CreatePoolScreen} options={{ title: "Create Pool" }} />
          <Stack.Screen name="PoolDetail" component={PoolDetailScreen} options={{ title: "Village Pool" }} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: "Wallet" }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
        </>
      ) : role === "BUYER" ? (
        <>
          <Stack.Screen name="BuyerTabs" component={BuyerTabs} options={{ headerShown: false }} />
          <Stack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ConfirmDelivery" component={ConfirmDeliveryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CreatePool" component={CreatePoolScreen} options={{ title: "Create Pool" }} />
          <Stack.Screen name="PoolDetail" component={PoolDetailScreen} options={{ title: "Village Pool" }} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ headerShown: false }} />
          {/* Buyer reaches Wallet as its own bottom tab too — this entry
              exists so Profile (pushed directly, not nested in BuyerTabs)
              can also link straight to it. */}
          <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: "Wallet" }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
        </>
      ) : role === "TRANSPORTER" ? (
        <>
          <Stack.Screen name="TransporterTabs" component={TransporterTabs} options={{ headerShown: false }} />
          <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} options={{ title: "Active Trip" }} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
        </>
      ) : (
        <Stack.Screen
          name="ComingSoon"
          component={ComingSoonScreen}
          options={{ headerShown: false }}
          initialParams={{ role: user.role }}
        />
      )}
    </Stack.Navigator>
  );
}
