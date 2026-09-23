import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS } from "../constants/theme";
import { Icon, type IconName } from "../components/Icon";
import type { TransporterTabParamList } from "./types";
import LoadBoardScreen from "../screens/transporter/LoadBoardScreen";
import WalletScreen from "../screens/common/WalletScreen";
import ProfileScreen from "../screens/common/ProfileScreen";
import { makePlaceholder } from "../screens/common/PlaceholderScreen";

const Tab = createBottomTabNavigator<TransporterTabParamList>();

const MyTrips = makePlaceholder("My Trips", "orders");

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} size={25} color={color} />;

export default function TransporterTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // A smooth cross-fade + slide between tabs instead of an instant cut.
        animation: "shift",
        tabBarActiveTintColor: COLORS.PRIMARY,
        tabBarInactiveTintColor: "#A5A193",
        tabBarStyle: {
          backgroundColor: COLORS.SURFACE,
          borderTopWidth: 1,
          borderTopColor: COLORS.BORDER,
          height: 58,
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarLabelStyle: { fontSize: 9.5, fontWeight: "700", fontFamily: "Manrope_700Bold" },
      }}
    >
      <Tab.Screen name="AvailableLoads" component={LoadBoardScreen} options={{ title: "Jobs", tabBarIcon: tabIcon("home") }} />
      <Tab.Screen name="MyTrips" component={MyTrips} options={{ title: "Trips", tabBarIcon: tabIcon("orders") }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: "Wallet", tabBarIcon: tabIcon("wallet") }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile", tabBarIcon: tabIcon("profile") }} />
    </Tab.Navigator>
  );
}
