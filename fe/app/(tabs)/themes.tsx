import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/components/app-theme-provider';
import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  type AppTheme,
  type AppThemeId,
} from '@/constants/theme';

const THEME_OPTIONS: { id: AppThemeId; theme?: AppTheme }[] = [
  { id: DEFAULT_THEME_ID },
  ...Object.values(APP_THEMES).map((theme) => ({ id: theme.id, theme })),
];

function getThemeTitle(option: { id: AppThemeId; theme?: AppTheme }) {
  return option.id === 'system'
    ? 'System default'
    : (option.theme?.name ?? option.id);
}

function getThemeDescription(option: { id: AppThemeId; theme?: AppTheme }) {
  return option.id === 'system'
    ? 'Follow your device: Sunrise in light mode and Midnight in dark mode.'
    : (option.theme?.description ?? '');
}

export default function ThemesScreen() {
  const { colors, selectedThemeId, setTheme, theme } = useAppTheme();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.tint }]}>
          <MaterialIcons name="palette" size={28} color={colors.onTint} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            Appearance
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Choose a theme
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Themes apply instantly and stay on this device. {theme.name} is
            active now.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {THEME_OPTIONS.map((option) => {
          const previewTheme = option.theme ?? theme;
          const selected = selectedThemeId === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Use ${getThemeTitle(option)} theme`}
              onPress={() => setTheme(option.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: previewTheme.colors.surface,
                  borderColor: selected
                    ? previewTheme.colors.tint
                    : previewTheme.colors.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.preview,
                  {
                    backgroundColor: previewTheme.colors.background,
                    borderColor: previewTheme.colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.previewBar,
                    { backgroundColor: previewTheme.colors.surfaceRaised },
                  ]}
                >
                  <View
                    style={[
                      styles.previewDot,
                      { backgroundColor: previewTheme.colors.tint },
                    ]}
                  />
                  <View
                    style={[
                      styles.previewLine,
                      { backgroundColor: previewTheme.colors.icon },
                    ]}
                  />
                </View>
                <View style={styles.previewBody}>
                  <View
                    style={[
                      styles.previewCard,
                      { backgroundColor: previewTheme.colors.surface },
                    ]}
                  />
                  <View
                    style={[
                      styles.previewAccent,
                      { backgroundColor: previewTheme.colors.tint },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.cardCopy}>
                  <Text
                    style={[
                      styles.cardTitle,
                      { color: previewTheme.colors.text },
                    ]}
                  >
                    {getThemeTitle(option)}
                  </Text>
                  <Text
                    style={[
                      styles.cardDescription,
                      { color: previewTheme.colors.icon },
                    ]}
                  >
                    {getThemeDescription(option)}
                  </Text>
                </View>
                {selected ? (
                  <View
                    style={[
                      styles.selectedBadge,
                      { backgroundColor: previewTheme.colors.tint },
                    ]}
                  >
                    <MaterialIcons
                      name="check"
                      size={16}
                      color={previewTheme.colors.onTint}
                    />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 2,
    flexBasis: 280,
    flexGrow: 1,
    gap: 14,
    maxWidth: 480,
    overflow: 'hidden',
    padding: 12,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardDescription: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  content: { gap: 22, padding: 24, paddingBottom: 40, paddingTop: 56 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    maxWidth: 760,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  preview: { borderRadius: 6, borderWidth: 1, height: 122, overflow: 'hidden' },
  previewAccent: { borderRadius: 4, height: 10, width: '55%' },
  previewBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    height: 28,
    paddingHorizontal: 9,
  },
  previewBody: {
    flex: 1,
    gap: 9,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  previewCard: { borderRadius: 4, height: 37, width: '82%' },
  previewDot: { borderRadius: 4, height: 8, width: 8 },
  previewLine: { borderRadius: 3, height: 6, opacity: 0.6, width: 72 },
  screen: { flex: 1 },
  selectedBadge: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34, marginTop: 2 },
});
