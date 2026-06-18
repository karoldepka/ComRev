import { Tabs } from "expo-router";
import React from "react";
import { useWindowDimensions } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const iconSize = isSmall ? 22 : 28;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarItemStyle: isSmall ? { paddingHorizontal: 0 } : undefined,
        tabBarLabelStyle: isSmall ? { fontSize: 10, marginTop: -2 } : undefined,
        tabBarStyle: isSmall
          ? { height: 52, paddingTop: 2, paddingBottom: 2 }
          : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "About",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="info.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="repos"
        options={{
          title: "Repos",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="list.bullet" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inspiration"
        options={{
          title: "Inspire",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="quote.bubble.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="three-d"
        options={{
          title: "3D Text",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="cube.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="slideshow"
        options={{
          title: "Slideshow",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="play.rectangle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="presets"
        options={{
          title: "Presets",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="star.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="soundscape"
        options={{
          title: "Soundscape",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="waveform" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
