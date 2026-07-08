import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const iconSize = isSmall ? 24 : 26;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: !isSmall,
        tabBarItemStyle: isSmall ? { paddingHorizontal: 0 } : undefined,
        tabBarLabelStyle: { fontSize: 11, marginTop: -2 },
        tabBarStyle: isSmall
          ? { height: 52, paddingTop: 4, paddingBottom: 4 }
          : { height: 60, paddingTop: 4, paddingBottom: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabHome'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: t('tabAbout'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="info.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="repos"
        options={{
          title: t('tabItems'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="list.bullet" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inspiration"
        options={{
          title: t('tabInspire'),
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={iconSize}
              name="quote.bubble.fill"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="three-d"
        options={{
          title: t('tab3d'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="cube.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="slideshow"
        options={{
          title: t('tabSlideshow'),
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={iconSize}
              name="play.rectangle.fill"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="presets"
        options={{
          title: t('tabPresets'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="star.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="soundscape"
        options={{
          title: t('tabSoundscape'),
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="waveform" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="feature-flags"
        options={{
          title: 'Flags',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={iconSize} name="flag.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
