import Constants from 'expo-constants';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { SoundAttributionsPopover } from '@/components/sound-attributions-popover';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const GITHUB_URL = 'https://github.com/karoldepka/ComRev';

interface BuildInfo {
  hash: string;
  fullHash: string;
  message: string;
  date: string;
  author: string;
  branch: string;
}

export default function AboutScreen() {
  const colorScheme = useColorScheme();
  const c = Colors[colorScheme ?? 'light'];
  const build: BuildInfo | undefined = Constants.expoConfig?.extra?.buildInfo;
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#f5700a', dark: '#7a3300' }}
      headerImage={
        <IconSymbol
          size={200}
          color="rgba(255,255,255,0.18)"
          name="info.circle.fill"
          style={styles.headerIcon}
        />
      }
    >
      <View style={styles.titleRow}>
        <View style={styles.titleTextCol}>
          <Text style={[styles.appName, { color: c.tint }]}>Structable / ComRev</Text>
          <Text style={[styles.tagline, { color: c.text, opacity: 0.6 }]}>
            Open-source table with metadata, comments &amp; notes
          </Text>
        </View>
        <SoundAttributionsPopover />
      </View>

      <View style={[styles.card, { borderColor: c.tint + '44' }]}>
        <InfoRow label="Version" value={version} c={c} />
        {build && (
          <>
            <InfoRow label="Branch" value={build.branch} c={c} mono />
            <InfoRow label="Commit" value={build.hash} c={c} mono />
            <InfoRow label="Date"   value={build.date.slice(0, 16).replace('T', '  ')} c={c} mono />
            <InfoRow label="Author" value={build.author} c={c} />
            <View style={[styles.divider, { borderColor: c.tint + '33' }]} />
            <Text style={[styles.commitMsg, { color: c.text }]}>{build.message}</Text>
          </>
        )}
      </View>

      <TouchableOpacity
        style={[styles.ghButton, { borderColor: c.tint }]}
        onPress={() => Linking.openURL(GITHUB_URL)}
      >
        <Text style={[styles.ghButtonText, { color: c.tint }]}>View on GitHub ↗</Text>
      </TouchableOpacity>
    </ParallaxScrollView>
  );
}

function InfoRow({ label, value, c, mono }: { label: string; value: string; c: any; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.text, opacity: 0.55 }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.text, fontFamily: mono ? 'monospace' : undefined }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerIcon: { position: 'absolute', bottom: -30, right: 20 },
  titleRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleTextCol: { flex: 1 },
  appName:    { fontSize: 26, fontWeight: '700', letterSpacing: 0.3 },
  tagline:    { fontSize: 13, marginTop: -4, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  row:       { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowLabel:  { fontSize: 13, flex: 1 },
  rowValue:  { fontSize: 13, flex: 2, textAlign: 'right' },
  divider:   { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
  commitMsg: { fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  ghButton:  {
    borderWidth: 1, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 18,
    alignSelf: 'flex-start', marginTop: 4,
  },
  ghButtonText: { fontSize: 14, fontWeight: '600' },
});
