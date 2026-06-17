import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSoundscapeStore } from '@/store/soundscape-store';
import { getCtxState, onStateChange } from '@/utils/binaural-engine';

interface WavePreset {
  label: string;
  sub: string;
  hz: number;
}

const WAVE_PRESETS: WavePreset[] = [
  { label: 'Delta', sub: '~2 Hz · deep sleep', hz: 2 },
  { label: 'Theta', sub: '~6 Hz · meditation', hz: 6 },
  { label: 'Alpha', sub: '~10 Hz · relaxed focus', hz: 10 },
  { label: 'Beta',  sub: '~20 Hz · active thinking', hz: 20 },
  { label: 'Gamma', sub: '~40 Hz · peak performance', hz: 40 },
];

function Stepper({
  label,
  value,
  display,
  onDec,
  onInc,
  c,
}: {
  label: string;
  value: number;
  display: string;
  onDec: () => void;
  onInc: () => void;
  c: (typeof Colors)['light'];
}) {
  return (
    <View style={stepperStyles.row}>
      <Text style={[stepperStyles.label, { color: c.text }]}>{label}</Text>
      <View style={stepperStyles.controls}>
        <Pressable onPress={onDec} style={[stepperStyles.btn, { borderColor: c.tint }]}>
          <Text style={[stepperStyles.btnText, { color: c.tint }]}>−</Text>
        </Pressable>
        <Text style={[stepperStyles.value, { color: c.tint }]}>{display}</Text>
        <Pressable onPress={onInc} style={[stepperStyles.btn, { borderColor: c.tint }]}>
          <Text style={[stepperStyles.btnText, { color: c.tint }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { flex: 1, fontSize: 14, fontWeight: '600' },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  btn: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  btnText: { fontSize: 22, fontWeight: '700', lineHeight: 26 },
  value: { fontSize: 14, fontWeight: '700', minWidth: 70, textAlign: 'center' },
});

export default function SoundscapeScreen() {
  const cs = useColorScheme() ?? 'light';
  const c = Colors[cs];
  const dark = cs === 'dark';

  const { beatHz, carrier, volume, playing, toggle, setBeatHz, setCarrier, setVolume } =
    useSoundscapeStore();

  const [ctxState, setCtxState] = useState<string>(getCtxState());
  useEffect(() => onStateChange(setCtxState), []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const ctxOk = ctxState === 'running';
  const ctxColor = ctxOk ? '#27ae60' : ctxState === 'suspended' ? '#e67e22' : '#888';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: c.text }]}>Soundscape</Text>
      <Text style={[styles.subtitle, { color: c.icon }]}>
        Binaural beats · requires headphones
      </Text>

      {/* Play / Stop — must be a direct tap for AudioContext to unlock */}
      <Pressable
        onPress={toggle}
        style={[styles.playButton, { backgroundColor: playing ? '#c0392b' : c.tint }]}
      >
        <Text style={styles.playLabel}>{playing ? '⏹  Stop' : '▶  Play'}</Text>
      </Pressable>

      {/* AudioContext status — shows 'suspended' if browser blocked autoplay */}
      {playing && (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: ctxColor }]} />
          <Text style={[styles.statusText, { color: ctxColor }]}>
            {ctxOk ? 'Audio running' : `Audio ${ctxState} — tap Play again if silent`}
          </Text>
        </View>
      )}

      {/* Wave presets */}
      <Text style={[styles.sectionLabel, { color: c.icon }]}>WAVE TYPE</Text>
      {WAVE_PRESETS.map((p) => {
        const active = Math.round(beatHz) === p.hz;
        return (
          <Pressable
            key={p.label}
            onPress={() => setBeatHz(p.hz)}
            style={[
              styles.presetChip,
              {
                borderColor: active ? c.tint : (dark ? '#444' : '#ddd'),
                backgroundColor: active ? c.tint + '22' : 'transparent',
              },
            ]}
          >
            <Text style={[styles.presetChipTitle, { color: active ? c.tint : c.text }]}>
              {p.label}
            </Text>
            <Text style={[styles.presetChipSub, { color: c.icon }]}>{p.sub}</Text>
          </Pressable>
        );
      })}

      {/* Fine controls */}
      <View style={[styles.card, { borderColor: dark ? '#333' : '#e8e0d8' }]}>
        <Stepper
          label="Beat frequency"
          value={beatHz}
          display={`${beatHz.toFixed(1)} Hz`}
          onDec={() => setBeatHz(clamp(parseFloat((beatHz - 0.5).toFixed(1)), 0.5, 100))}
          onInc={() => setBeatHz(clamp(parseFloat((beatHz + 0.5).toFixed(1)), 0.5, 100))}
          c={c}
        />
        <View style={[styles.divider, { borderColor: dark ? '#333' : '#eee' }]} />
        <Stepper
          label="Carrier"
          value={carrier}
          display={`${carrier} Hz`}
          onDec={() => setCarrier(clamp(carrier - 10, 80, 500))}
          onInc={() => setCarrier(clamp(carrier + 10, 80, 500))}
          c={c}
        />
        <View style={[styles.divider, { borderColor: dark ? '#333' : '#eee' }]} />
        <Stepper
          label="Volume"
          value={volume}
          display={`${Math.round(volume * 100)}%`}
          onDec={() => setVolume(clamp(Math.round((volume - 0.05) * 100) / 100, 0, 1))}
          onInc={() => setVolume(clamp(Math.round((volume + 0.05) * 100) / 100, 0, 1))}
          c={c}
        />
      </View>

      <Text style={[styles.hint, { color: c.icon }]}>
        Binaural beats work by playing two slightly different frequencies — one per ear.
        Your brain perceives the difference as a beat at the chosen frequency.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 56, gap: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: 13, marginBottom: 20 },

  playButton: {
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 24,
    paddingVertical: 16,
  },
  playLabel: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  presetChip: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetChipTitle: { fontSize: 15, fontWeight: '700' },
  presetChipSub: { fontSize: 12, marginTop: 2 },

  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },

  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  statusDot: { borderRadius: 99, height: 8, width: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },

  hint: { fontSize: 12, lineHeight: 18, marginTop: 20 },
});
