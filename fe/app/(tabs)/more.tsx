import { Link, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/components/app-theme-provider';
import { IconSymbol } from '@/components/ui/icon-symbol';

type SecondaryDestination = {
  href: Href;
  icon: Parameters<typeof IconSymbol>[0]['name'];
  title: string;
  description: string;
};

export default function MoreScreen() {
  const { t } = useTranslation();
  const { colorScheme, colors } = useAppTheme();
  const dark = colorScheme === 'dark';
  const destinations: SecondaryDestination[] = [
    {
      href: '/(tabs)/inspiration',
      icon: 'quote.bubble.fill',
      title: t('tabInspire'),
      description: 'Generate mottos, quotes, and values.',
    },
    {
      href: '/(tabs)/slideshow',
      icon: 'play.rectangle.fill',
      title: t('tabSlideshow'),
      description: 'Present your text in a full-screen sequence.',
    },
    {
      href: '/(tabs)/about',
      icon: 'info.circle.fill',
      title: t('tabAbout'),
      description: 'View build details and project credits.',
    },
    {
      href: '/(tabs)/themes',
      icon: 'paintpalette.fill',
      title: 'Themes',
      description: 'Choose the app appearance for this device.',
    },
    {
      href: '/(tabs)/feature-flags',
      icon: 'flag.fill',
      title: 'Feature flags',
      description: 'Control staged interface features.',
    },
  ];

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>{t('tabMore')}</Text>
      <Text style={[styles.subtitle, { color: colors.icon }]}>
        More ways to work with your workspace.
      </Text>
      <View style={styles.list}>
        {destinations.map((destination) => (
          <Link key={destination.href} href={destination.href} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${destination.title}`}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: dark ? '#1d2021' : '#ffffff',
                  borderColor: dark ? '#2f3436' : '#e8edf0',
                  opacity: pressed ? 0.74 : 1,
                },
              ]}
            >
              <View style={[styles.icon, { borderColor: colors.tint + '55' }]}>
                <IconSymbol
                  name={destination.icon}
                  size={22}
                  color={colors.tint}
                />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {destination.title}
                </Text>
                <Text style={[styles.cardDescription, { color: colors.icon }]}>
                  {destination.description}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={22} color={colors.icon} />
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  cardDescription: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  content: { gap: 16, padding: 24, paddingBottom: 40, paddingTop: 56 },
  copy: { flex: 1, minWidth: 0 },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  list: { gap: 10 },
  screen: { flex: 1 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
});
