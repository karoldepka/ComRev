import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  FEATURE_FLAGS,
  resetFeatureFlags,
  setFeatureFlag,
  useFeatureFlags,
} from '@/utils/feature-flags';

export default function FeatureFlagsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dark = colorScheme === 'dark';
  const flags = useFeatureFlags();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const hasChanges = FEATURE_FLAGS.some(
    (flag) => flags[flag.key] !== flag.defaultEnabled,
  );

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: compact ? 18 : 28 },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.tint }]}>
          <MaterialIcons name="flag" size={26} color="#fff" />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>
            Feature Flags
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Local controls for staged or noisy UI.
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.panel,
          {
            backgroundColor: dark ? '#1d2021' : '#ffffff',
            borderColor: dark ? '#2f3436' : '#e8edf0',
          },
        ]}
      >
        {FEATURE_FLAGS.map((flag, index) => {
          const enabled = flags[flag.key];
          return (
            <View
              key={flag.key}
              style={[
                styles.flagRow,
                index > 0 && {
                  borderTopColor: dark ? '#2f3436' : '#e8edf0',
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.flagText}>
                <Text style={[styles.flagTitle, { color: colors.text }]}>
                  {flag.title}
                </Text>
                <Text style={[styles.flagDescription, { color: colors.icon }]}>
                  {flag.description}
                </Text>
              </View>
              <Switch
                accessibilityLabel={flag.title}
                accessibilityHint={flag.description}
                onValueChange={(value) => setFeatureFlag(flag.key, value)}
                thumbColor={enabled ? colors.tint : dark ? '#d4d4d8' : '#fff'}
                trackColor={{
                  false: dark ? '#3f4548' : '#d9e0e4',
                  true: colors.tint + '77',
                }}
                value={enabled}
              />
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset feature flags"
        disabled={!hasChanges}
        onPress={resetFeatureFlags}
        style={({ pressed }) => [
          styles.resetButton,
          {
            backgroundColor: hasChanges
              ? dark
                ? '#2a211b'
                : '#fff7f0'
              : dark
                ? '#202426'
                : '#f2f5f7',
            borderColor: hasChanges
              ? dark
                ? '#5a3a22'
                : '#ffd9ba'
              : dark
                ? '#2f3436'
                : '#e8edf0',
            opacity: pressed ? 0.72 : hasChanges ? 1 : 0.6,
          },
        ]}
      >
        <MaterialIcons
          name="restart-alt"
          size={18}
          color={hasChanges ? colors.tint : colors.icon}
        />
        <Text
          style={[
            styles.resetText,
            { color: hasChanges ? colors.tint : colors.icon },
          ]}
        >
          Reset to defaults
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 36,
    paddingTop: 56,
  },
  flagDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  flagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  flagText: {
    flex: 1,
    minWidth: 0,
  },
  flagTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resetButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  screen: {
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 34,
  },
});
