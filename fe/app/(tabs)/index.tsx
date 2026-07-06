import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, type Href } from 'expo-router';
import { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const ACTIONS: {
  href: Href;
  icon: IconName;
  titleKey: string;
  bodyKey: string;
}[] = [
  {
    href: '/(tabs)/three-d',
    icon: 'view-in-ar',
    titleKey: 'homeAction3dTitle',
    bodyKey: 'homeAction3dBody',
  },
  {
    href: '/(tabs)/soundscape',
    icon: 'graphic-eq',
    titleKey: 'homeActionSoundTitle',
    bodyKey: 'homeActionSoundBody',
  },
  {
    href: '/(tabs)/presets',
    icon: 'star',
    titleKey: 'homeActionPresetsTitle',
    bodyKey: 'homeActionPresetsBody',
  },
  {
    href: '/update',
    icon: 'system-update-alt',
    titleKey: 'homeActionUpdateTitle',
    bodyKey: 'homeActionUpdateBody',
  },
];

export default function HomeScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dark = colorScheme === 'dark';
  const { width } = useWindowDimensions();
  const compact = width < 560;

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: compact ? 18 : 28 },
        ]}
      >
        <View style={styles.hero}>
          <View style={[styles.logoMark, { backgroundColor: colors.tint }]}>
            <MaterialIcons
              name="dataset"
              size={compact ? 26 : 30}
              color="#fff"
            />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: colors.tint }]}>
              {t('homeEyebrow')}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('homeTitle')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.icon }]}>
              {t('homeSubtitle')}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBar,
            {
              backgroundColor: dark ? '#201914' : '#fff7f0',
              borderColor: dark ? '#3a2a1d' : '#ffd9ba',
            },
          ]}
        >
          <MaterialIcons name="sync" size={18} color={colors.tint} />
          <Text style={[styles.statusText, { color: colors.text }]}>
            {t('homeStatus')}
          </Text>
        </View>

        <View
          style={[styles.actionsGrid, compact && styles.actionsGridCompact]}
        >
          {ACTIONS.map((action) => (
            <Link key={String(action.href)} href={action.href} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.actionCard,
                  {
                    backgroundColor: dark ? '#1d2021' : '#ffffff',
                    borderColor: dark ? '#2f3436' : '#e8edf0',
                    opacity: pressed ? 0.74 : 1,
                  },
                  compact ? styles.actionCardCompact : styles.actionCardWide,
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    { borderColor: colors.tint + '55' },
                  ]}
                >
                  <MaterialIcons
                    name={action.icon}
                    size={22}
                    color={colors.tint}
                  />
                </View>
                <View style={styles.actionText}>
                  <Text style={[styles.actionTitle, { color: colors.text }]}>
                    {t(action.titleKey)}
                  </Text>
                  <Text style={[styles.actionBody, { color: colors.icon }]}>
                    {t(action.bodyKey)}
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color={colors.icon}
                />
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 36,
    paddingTop: 56,
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  logoMark: {
    alignItems: 'center',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 760,
  },
  statusBar: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionsGridCompact: {
    flexDirection: 'column',
  },
  actionCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  actionCardWide: {
    flexBasis: 280,
    flexGrow: 1,
  },
  actionCardCompact: {
    width: '100%',
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  actionBody: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
