import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/components/app-theme-provider';
import { ATTRIBUTION_REQUIRED_SOUNDS } from '@/utils/ambience-tracks';

// Nature-ambience recordings under CC-BY require a visible credit; this popover
// is that credit. CC0 sounds (also used in the Soundscape mixer) need no
// mention here — see utils/ambience-tracks.ts for the full license breakdown.
export function SoundAttributionsPopover() {
  const { colorScheme: cs, colors: c } = useAppTheme();
  const dark = cs === 'dark';
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.anchor}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={[styles.iconButton, { borderColor: c.tint + '55' }]}
        accessibilityLabel="Sound credits"
      >
        <MaterialIcons name="cloud" size={20} color={c.tint} />
      </Pressable>

      {expanded && (
        <View
          style={[
            styles.panel,
            { backgroundColor: dark ? '#1c1c1e' : '#fff', borderColor: c.tint + '33' },
          ]}
        >
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: c.text }]}>Sound credits</Text>
            <Pressable onPress={() => setExpanded(false)}>
              <MaterialIcons name="close" size={18} color={c.icon} />
            </Pressable>
          </View>
          <Text style={[styles.panelSub, { color: c.icon }]}>
            Nature ambience in Soundscape uses field recordings from freesound.org.
            These are shared under Creative Commons Attribution 4.0 and require credit:
          </Text>
          {ATTRIBUTION_REQUIRED_SOUNDS.map((s) => (
            <Pressable
              key={s.sourceUrl}
              onPress={() => Linking.openURL(s.sourceUrl)}
              style={[styles.entry, { borderColor: dark ? '#333' : '#eee' }]}
            >
              <Text style={[styles.entryTitle, { color: c.text }]}>
                &ldquo;{s.title}&rdquo; by {s.author}
              </Text>
              <Text style={[styles.entryLicense, { color: c.tint }]}>
                {s.license} · freesound.org ↗
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'relative' },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  panel: {
    position: 'absolute',
    top: 40,
    right: 0,
    width: 280,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    zIndex: 20,
    // Subtle elevation so it reads as a floating popover.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  panelHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  panelTitle: { fontSize: 14, fontWeight: '700' },
  panelSub: { fontSize: 11, lineHeight: 15 },
  entry: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  entryTitle: { fontSize: 12, fontWeight: '600' },
  entryLicense: { fontSize: 11, marginTop: 2 },
});
