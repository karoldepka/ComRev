import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeLanguageCode, SUPPORTED_LANGUAGES } from '@/utils/i18n';

interface BuildInfo {
  hash: string;
  fullHash: string;
  message: string;
  date: string;
  author: string;
  branch: string;
  buildTimestamp?: string;
}

export default function UpdateScreen() {
  const { t, i18n } = useTranslation();
  const { lang } = useLocalSearchParams<{ lang?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dark = colorScheme === 'dark';
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const build: BuildInfo | undefined = Constants.expoConfig?.extra?.buildInfo;
  const version = Constants.expoConfig?.version ?? '-';
  const activeLanguage = normalizeLanguageCode(i18n.language) ?? 'en';

  useEffect(() => {
    const requested = normalizeLanguageCode(
      Array.isArray(lang) ? lang[0] : lang,
    );
    if (requested && requested !== activeLanguage) {
      void i18n.changeLanguage(requested);
    }
  }, [activeLanguage, i18n, lang]);

  const metaRows = [
    { label: t('updateVersionLabel'), value: version },
    { label: t('updateCommitLabel'), value: build?.hash ?? '-' },
    {
      label: t('updateBuiltLabel'),
      value: formatTimestamp(build?.buildTimestamp),
    },
    { label: t('updateBranchLabel'), value: build?.branch ?? '-' },
  ];

  const highlights = [
    t('updateHighlightState'),
    t('updateHighlightKeyboard'),
    t('updateHighlightLayout'),
    t('updateHighlightI18n'),
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: compact ? 18 : 28 },
        ]}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/')
            }
            style={({ pressed }) => [
              styles.backButton,
              {
                borderColor: dark ? '#33383a' : '#e3e8eb',
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <MaterialIcons name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>
              {t('updateBack')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.eyebrow, { color: colors.tint }]}>
            {t('updateEyebrow')}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('updateTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            {t('updateSubtitle')}
          </Text>
        </View>

        <View
          style={[
            styles.panel,
            {
              backgroundColor: dark ? '#1d2021' : '#ffffff',
              borderColor: dark ? '#303638' : '#e8edf0',
            },
          ]}
        >
          {metaRows.map((row) => (
            <View key={row.label} style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.icon }]}>
                {row.label}
              </Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('updateHighlightsTitle')}
          </Text>
          <View style={styles.highlightList}>
            {highlights.map((highlight) => (
              <View key={highlight} style={styles.highlightRow}>
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={colors.tint}
                />
                <Text style={[styles.highlightText, { color: colors.text }]}>
                  {highlight}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('updateLanguageTitle')}
          </Text>
          <View style={styles.languageGrid}>
            {SUPPORTED_LANGUAGES.map((language) => {
              const { code } = language;
              const selected = activeLanguage === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => i18n.changeLanguage(code)}
                  style={({ pressed }) => [
                    styles.languagePill,
                    {
                      backgroundColor: selected
                        ? colors.tint
                        : dark
                          ? '#1d2021'
                          : '#ffffff',
                      borderColor: selected
                        ? colors.tint
                        : dark
                          ? '#303638'
                          : '#e8edf0',
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.languageCode,
                      { color: selected ? '#fff' : colors.text },
                    ]}
                  >
                    {code === 'ca' ? 'CAT' : code.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.languageLabel,
                      { color: selected ? '#fff' : colors.icon },
                    ]}
                  >
                    {language?.label ?? code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTimestamp(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace('T', ' ');
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 34,
    paddingTop: 14,
  },
  topRow: {
    alignItems: 'flex-start',
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
  },
  hero: {
    maxWidth: 820,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  metaRow: {
    alignItems: 'flex-start',
    borderBottomColor: 'rgba(128,128,128,0.18)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  metaLabel: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: '42%',
  },
  metaValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  highlightList: {
    gap: 9,
  },
  highlightRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languagePill: {
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 104,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  languageCode: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
