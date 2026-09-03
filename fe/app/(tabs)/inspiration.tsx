import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useAppTheme } from '@/components/app-theme-provider';
import {
  generateInspiration,
  groupInspirationItems,
  InspirationGenerateResponse,
  InspirationKind,
  INSPIRATION_KIND_LABELS,
} from '@/utils/inspiration-generator';

const PROMPT_EXAMPLES = [
  'motivation for my project',
  'calm courage for launching an open-source app',
  'values for a trustworthy offline-first table tool',
];

export default function InspirationScreen() {
  const { colorScheme, colors } = useAppTheme();
  const dark = colorScheme === 'dark';
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const [prompt, setPrompt] = useState('motivation for my project');
  const [result, setResult] = useState<InspirationGenerateResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'online' | 'local' | 'error'>(
    'idle',
  );
  const [error, setError] = useState('');
  const [count, setCount] = useState(3);

  const groups = useMemo(
    () => groupInspirationItems(result?.items ?? []),
    [result],
  );

  const runGenerator = async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    setStatus('idle');
    try {
      const generated = await generateInspiration({
        prompt: text,
        count_per_kind: count,
      });
      setResult(generated.response);
      setStatus(generated.usedFallback ? 'local' : 'online');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const statusText = {
    idle: 'Ready',
    online: 'Synced',
    local: 'Local',
    error: 'Needs attention',
  }[status];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: isSmall ? 12 : 48 },
      ]}
    >
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>
            Inspiration Generator
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Mottos, mantras, values.
          </Text>
        </View>
        <View
          style={[
            styles.syncPill,
            {
              borderColor: status === 'error' ? '#d14343' : colors.tint,
              backgroundColor: dark ? '#202426' : '#fff7f0',
            },
          ]}
        >
          <View
            style={[
              styles.syncDot,
              {
                backgroundColor:
                  status === 'error'
                    ? '#d14343'
                    : status === 'local'
                      ? '#c77d00'
                      : colors.tint,
              },
            ]}
          />
          <Text style={[styles.syncText, { color: colors.text }]}>
            {statusText}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.promptPanel,
          {
            borderColor: dark ? '#333' : '#ded4cb',
            backgroundColor: dark ? '#1f2224' : '#fffaf6',
          },
        ]}
      >
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What do you need words for?"
          placeholderTextColor={dark ? '#7b858c' : '#8d8179'}
          multiline
          accessibilityLabel="Inspiration prompt"
          accessibilityHint="Describe the theme or words you want to generate."
          style={[
            styles.promptInput,
            {
              color: colors.text,
              borderColor: dark ? '#444' : '#e4d4c6',
              backgroundColor: colors.background,
            },
          ]}
        />
        <View style={styles.controlsRow}>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setCount((cur) => Math.max(1, cur - 1))}
              accessibilityRole="button"
              accessibilityLabel="Generate one fewer item per category"
              style={[styles.iconButton, { borderColor: colors.tint }]}
            >
              <Text style={[styles.iconButtonText, { color: colors.tint }]}>
                -
              </Text>
            </Pressable>
            <Text style={[styles.countText, { color: colors.text }]}>
              {count} each
            </Text>
            <Pressable
              onPress={() => setCount((cur) => Math.min(8, cur + 1))}
              accessibilityRole="button"
              accessibilityLabel="Generate one more item per category"
              style={[styles.iconButton, { borderColor: colors.tint }]}
            >
              <Text style={[styles.iconButtonText, { color: colors.tint }]}>
                +
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={runGenerator}
            disabled={loading || !prompt.trim()}
            accessibilityRole="button"
            accessibilityLabel="Generate inspiration"
            accessibilityState={{
              disabled: loading || !prompt.trim(),
              busy: loading,
            }}
            style={[
              styles.generateButton,
              {
                backgroundColor: colors.tint,
                opacity: loading || !prompt.trim() ? 0.55 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={dark ? '#111' : '#fff'} />
            ) : (
              <Text
                style={[styles.generateText, { color: dark ? '#111' : '#fff' }]}
              >
                Generate
              </Text>
            )}
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.examples}
        >
          {PROMPT_EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => setPrompt(example)}
              accessibilityRole="button"
              accessibilityLabel={`Use example prompt: ${example}`}
              style={[
                styles.exampleChip,
                { borderColor: dark ? '#444' : '#e4d4c6' },
              ]}
            >
              <Text style={[styles.exampleText, { color: colors.text }]}>
                {example}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.results}>
        {!result && !loading ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.icon }]}>
              Generate mottos, famous quotes, mantras, affirmations, values,
              beliefs, and qualities from one prompt.
            </Text>
          </View>
        ) : null}
        {groups.map((group) => (
          <View key={group.kind} style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>
              {INSPIRATION_KIND_LABELS[group.kind as InspirationKind]}
            </Text>
            <View style={styles.cardGrid}>
              {group.items.map((item, index) => (
                <View
                  key={`${group.kind}-${index}-${item.text}`}
                  style={[
                    styles.card,
                    {
                      backgroundColor: dark ? '#202426' : '#ffffff',
                      borderColor: dark ? '#333' : '#eaded4',
                    },
                  ]}
                >
                  <Text style={[styles.itemText, { color: colors.text }]}>
                    {item.text}
                  </Text>
                  {item.author_name ? (
                    <Text style={[styles.metaText, { color: colors.icon }]}>
                      - {item.author_name}
                    </Text>
                  ) : null}
                  {item.source_note ? (
                    <Text style={[styles.sourceText, { color: colors.icon }]}>
                      {item.source_note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 3 },
  syncPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  syncDot: { borderRadius: 99, height: 8, width: 8 },
  syncText: { fontSize: 12, fontWeight: '700' },
  promptPanel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
  },
  promptInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  controlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  stepper: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconButtonText: { fontSize: 22, fontWeight: '700', lineHeight: 25 },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 54,
    textAlign: 'center',
  },
  generateButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 116,
    paddingHorizontal: 18,
  },
  generateText: { fontSize: 14, fontWeight: '800' },
  examples: { gap: 8, paddingRight: 4 },
  exampleChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exampleText: { fontSize: 12 },
  errorText: {
    color: '#d14343',
    fontSize: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  results: { gap: 18, padding: 16, paddingBottom: 36 },
  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 42 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  group: { gap: 8 },
  groupTitle: { fontSize: 16, fontWeight: '800' },
  cardGrid: { gap: 8 },
  card: { borderRadius: 8, borderWidth: 1, padding: 12 },
  itemText: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  metaText: { fontSize: 12, marginTop: 8 },
  sourceText: { fontSize: 11, marginTop: 5 },
});
