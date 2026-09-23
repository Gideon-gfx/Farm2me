import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS, FONT } from "../constants/theme";
import { Icon, type IconName } from "../components/Icon";
import { LiquidGlass } from "../components/LiquidGlass";
import type { FarmerTabParamList } from "./types";
import FarmerDashboard from "../screens/farmer/FarmerDashboard";
import AddListingScreen from "../screens/farmer/AddListingScreen";
import VillagePoolsScreen from "../screens/farmer/VillagePoolsScreen";

const Tab = createBottomTabNavigator<FarmerTabParamList>();

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} size={25} color={color} />;

// Find a Driver isn't a real tab screen — it's a full-screen map flow (like
// a ride-hailing app's map view) pushed on the root stack with its own back
// arrow, not something that lives inside the tab bar's content area. Tapping
// this tab just redirects there and never actually renders anything itself.
function FindDriverTabRedirect() {
  return null;
}

export default function FarmerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // A smooth cross-fade + slide between tabs instead of an instant cut.
        animation: "shift",
        tabBarActiveTintColor: COLORS.PRIMARY,
        tabBarInactiveTintColor: "#A5A193",
        // Floats over the content (iOS 26 "Liquid Glass" look) instead of a
        // flat opaque bar — screens add bottom padding to clear it.
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarBackground: () => <LiquidGlass edge="bottom" />,
        tabBarLabelStyle: { fontSize: 9.5, fontWeight: "700", fontFamily: "Manrope_700Bold" },
      }}
    >
      <Tab.Screen name="MyFarm" component={FarmerDashboard} options={{ title: "My Farm", tabBarIcon: tabIcon("home") }} />
      <Tab.Screen
        name="FindDriver"
        component={FindDriverTabRedirect}
        options={{ title: "Find a Driver", tabBarIcon: tabIcon("truck") }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate("FindDriver");
          },
        })}
      />
      <Tab.Screen name="AddListing" component={AddListingScreen} options={{ title: "Add listings", tabBarIcon: tabIcon("add") }} />
      <Tab.Screen name="VillagePools" component={VillagePoolsScreen} options={{ title: "Village pools", tabBarIcon: tabIcon("pool") }} />
    </Tab.Navigator>
  );
}
