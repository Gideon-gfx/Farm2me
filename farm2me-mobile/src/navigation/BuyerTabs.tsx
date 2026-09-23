import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS, FONT } from "../constants/theme";
import { Icon, type IconName } from "../components/Icon";
import type { BuyerTabParamList } from "./types";
import BuyerDashboard from "../screens/buyer/BuyerDashboard";
import WalletScreen from "../screens/common/WalletScreen";
import { makePlaceholder } from "../screens/common/PlaceholderScreen";

const Tab = createBottomTabNavigator<BuyerTabParamList>();

const MyOrders = makePlaceholder("My Orders", "orders");
const Messages = makePlaceholder("Messages", "chats");

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} size={25} color={color} />;

export default function BuyerTabs() {
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
      <Tab.Screen name="Home" component={BuyerDashboard} options={{ title: "Market", tabBarIcon: tabIcon("home") }} />
      <Tab.Screen name="MyOrders" component={MyOrders} options={{ title: "Orders", tabBarIcon: tabIcon("orders") }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: "Wallet", tabBarIcon: tabIcon("wallet") }} />
      <Tab.Screen name="Messages" component={Messages} options={{ title: "Chats", tabBarIcon: tabIcon("chats") }} />
    </Tab.Navigator>
  );
}
