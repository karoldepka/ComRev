import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  AMBIENCE_KINDS,
  NOISE_COLORS,
  WAVE_PRESETS,
  useSoundscapeStore,
} from '@/store/soundscape-store';
import type { AmbienceCategory } from '@/utils/ambience-tracks';
import { getCtxState, onStateChange } from '@/utils/binaural-engine';

const CATEGORY_ORDER: AmbienceCategory[] = [
  'Nature',
  'Water',
  'Weather',
  'Animals',
  'Urban',
  'Interior',
  'Transport',
  'Cozy',
  'Meditation',
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

// A slider that only accepts changes via the native <input type="range"> —
// this app targets web (react-native-web), matching the SliderRow pattern in three-d.tsx.
function InlineSlider({
  min,
  max,
  step,
  value,
  onChange,
  tint,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  tint: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e: any) => onChange(parseFloat(e.target.value))}
      style={{ flex: 1, accentColor: tint }}
    />
  );
}

// Reusable "toggle chip + volume slider (+ optional extra controls)" row used by
// the Binaural / Noise / Nature layer sections — each layer plays independently
// and can be mixed with any other layer, on top of any other section.
function LayerRow({
  label,
  sub,
  playing,
  volume,
  onToggle,
  onVolumeChange,
  c,
  dark,
  children,
}: {
  label: string;
  sub?: string;
  playing: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
  c: (typeof Colors)['light'];
  dark: boolean;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        layerStyles.card,
        { borderColor: playing ? c.tint : (dark ? '#333' : '#e8e0d8') },
      ]}
    >
      <Pressable onPress={onToggle} style={layerStyles.header}>
        <MaterialIcons
          name={playing ? 'pause-circle-filled' : 'play-circle-outline'}
          size={26}
          color={playing ? c.tint : c.icon}
        />
        <View style={layerStyles.headerText}>
          <Text style={[layerStyles.title, { color: c.text }]}>{label}</Text>
          {sub ? <Text style={[layerStyles.sub, { color: c.icon }]}>{sub}</Text> : null}
        </View>
      </Pressable>
      <View style={layerStyles.sliderRow}>
        <Text style={[layerStyles.volLabel, { color: c.icon }]}>Vol</Text>
        <InlineSlider min={0} max={1} step={0.01} value={volume} onChange={onVolumeChange} tint={c.tint} />
        <Text style={[layerStyles.volValue, { color: c.icon }]}>{Math.round(volume * 100)}%</Text>
      </View>
      {children}
    </View>
  );
}

const layerStyles = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: 1, marginBottom: 8, padding: 10 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 1 },
  sliderRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 6 },
  volLabel: { fontSize: 11, fontWeight: '600', width: 40 },
  volValue: { fontSize: 11, fontWeight: '600', textAlign: 'right', width: 36 },
});

// Browsable, searchable, category-grouped list for the (100+ track) ambience
// library — a flat list stops being usable at that scale, so tracks are grouped
// by category into collapsible sections, with a search box to jump straight in.
function AmbienceBrowser({
  ambience,
  toggleAmbience,
  setAmbienceVolume,
  c,
  dark,
}: {
  ambience: Record<string, { playing: boolean; volume: number }>;
  toggleAmbience: (key: string) => void;
  setAmbienceVolume: (key: string, v: number) => void;
  c: (typeof Colors)['light'];
  dark: boolean;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<AmbienceCategory>>(new Set());

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byCategory = new Map<AmbienceCategory, typeof AMBIENCE_KINDS>();
    for (const item of AMBIENCE_KINDS) {
      if (term && !item.label.toLowerCase().includes(term)) continue;
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return byCategory;
  }, [search]);

  const searching = search.trim().length > 0;

  const toggleCategory = (cat: AmbienceCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <View>
      <View style={[browserStyles.searchRow, { borderColor: dark ? '#333' : '#e8e0d8' }]}>
        <MaterialIcons name="search" size={18} color={c.icon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search sounds (rain, cave, train, cafe...)"
          placeholderTextColor={c.icon}
          style={[browserStyles.searchInput, { color: c.text }]}
        />
      </View>

      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => {
        const items = grouped.get(cat)!;
        const isOpen = searching || expanded.has(cat);
        return (
          <View key={cat} style={browserStyles.categoryBlock}>
            <Pressable
              onPress={() => toggleCategory(cat)}
              style={[browserStyles.categoryHeader, { borderColor: dark ? '#333' : '#e8e0d8' }]}
            >
              <MaterialIcons
                name={isOpen ? 'expand-less' : 'expand-more'}
                size={20}
                color={c.icon}
              />
              <Text style={[browserStyles.categoryTitle, { color: c.text }]}>{cat}</Text>
              <Text style={[browserStyles.categoryCount, { color: c.icon }]}>{items.length}</Text>
            </Pressable>
            {isOpen &&
              items.map((item) => {
                const layer = ambience[item.key];
                if (!layer) return null;
                return (
                  <LayerRow
                    key={item.key}
                    label={item.label}
                    playing={layer.playing}
                    volume={layer.volume}
                    onToggle={() => toggleAmbience(item.key)}
                    onVolumeChange={(v) => setAmbienceVolume(item.key, v)}
                    c={c}
                    dark={dark}
                  />
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

const browserStyles = StyleSheet.create({
  searchRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, outlineStyle: 'none' } as any,
  categoryBlock: { marginBottom: 4 },
  categoryHeader: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  categoryCount: { fontSize: 12, fontWeight: '600' },
});

export default function SoundscapeScreen() {
  const cs = useColorScheme() ?? 'light';
  const c = Colors[cs];
  const dark = cs === 'dark';
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const hp = isSmall ? 5 : 20;   // horizontal padding
  const tp = isSmall ? 14 : 56;  // top padding

  const { beatHz, carrier, volume, playing, toggle, setBeatHz, setCarrier, setVolume } =
    useSoundscapeStore();

  const extraBinaural = useSoundscapeStore((s) => s.extraBinaural);
  const toggleExtraBinaural = useSoundscapeStore((s) => s.toggleExtraBinaural);
  const setExtraBinauralVolume = useSoundscapeStore((s) => s.setExtraBinauralVolume);

  const noise = useSoundscapeStore((s) => s.noise);
  const toggleNoise = useSoundscapeStore((s) => s.toggleNoise);
  const setNoiseVolume = useSoundscapeStore((s) => s.setNoiseVolume);

  const ambience = useSoundscapeStore((s) => s.ambience);
  const toggleAmbience = useSoundscapeStore((s) => s.toggleAmbience);
  const setAmbienceVolume = useSoundscapeStore((s) => s.setAmbienceVolume);

  const birds = useSoundscapeStore((s) => s.birds);
  const toggleBirds = useSoundscapeStore((s) => s.toggleBirds);
  const setBirdsVolume = useSoundscapeStore((s) => s.setBirdsVolume);
  const setBirdsPitch = useSoundscapeStore((s) => s.setBirdsPitch);
  const setBirdsSpeed = useSoundscapeStore((s) => s.setBirdsSpeed);

  const [ctxState, setCtxState] = useState<string>(getCtxState());
  useEffect(() => onStateChange(setCtxState), []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const anyPlaying =
    playing ||
    Object.values(extraBinaural).some((l) => l.playing) ||
    Object.values(noise).some((l) => l.playing) ||
    Object.values(ambience).some((l) => l.playing) ||
    birds.playing;

  const ctxOk = ctxState === 'running';
  const ctxColor = ctxOk ? '#27ae60' : ctxState === 'suspended' ? '#e67e22' : '#888';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, { padding: hp, paddingTop: tp }]}
    >
      <Text style={[styles.title, { color: c.text }]}>Soundscape</Text>
      <Text style={[styles.subtitle, { color: c.icon }]}>
        Mix binaural beats, noise and nature ambience — layer as many as you like at once.
      </Text>

      {/* AudioContext status — shows 'suspended' if browser blocked autoplay */}
      {anyPlaying && (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: ctxColor }]} />
          <Text style={[styles.statusText, { color: ctxColor }]}>
            {ctxOk ? 'Audio running' : `Audio ${ctxState} — tap a layer again if silent`}
          </Text>
        </View>
      )}

      {/* ---------------- Custom binaural (single tunable layer) ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon }]}>CUSTOM BINAURAL · requires headphones</Text>
      <Pressable
        onPress={toggle}
        style={[styles.playButton, { backgroundColor: playing ? '#c0392b' : c.tint }]}
      >
        <MaterialIcons name={playing ? 'stop' : 'play-arrow'} size={22} color="#fff" />
        <Text style={styles.playLabel}>{playing ? 'Stop' : 'Play'}</Text>
      </Pressable>

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

      {/* ---------------- Layered binaural presets (multiple at once) ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 20 }]}>
        BINAURAL LAYERS · stack several at once
      </Text>
      {WAVE_PRESETS.map((p) => {
        const layer = extraBinaural[p.key];
        if (!layer) return null;
        return (
          <LayerRow
            key={p.key}
            label={p.label}
            sub={p.sub}
            playing={layer.playing}
            volume={layer.volume}
            onToggle={() => toggleExtraBinaural(p.key)}
            onVolumeChange={(v) => setExtraBinauralVolume(p.key, v)}
            c={c}
            dark={dark}
          />
        );
      })}

      {/* ---------------- Noise ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 20 }]}>NOISE</Text>
      {NOISE_COLORS.map((n) => {
        const layer = noise[n.key];
        return (
          <LayerRow
            key={n.key}
            label={n.label}
            playing={layer.playing}
            volume={layer.volume}
            onToggle={() => toggleNoise(n.key)}
            onVolumeChange={(v) => setNoiseVolume(n.key, v)}
            c={c}
            dark={dark}
          />
        );
      })}

      {/* ---------------- Nature ambience ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 20 }]}>
        NATURE AMBIENCE · {AMBIENCE_KINDS.length} field recordings
      </Text>
      <LayerRow
        label="Birds"
        sub="procedurally generated chirps"
        playing={birds.playing}
        volume={birds.volume}
        onToggle={toggleBirds}
        onVolumeChange={setBirdsVolume}
        c={c}
        dark={dark}
      >
        <View style={layerStyles.sliderRow}>
          <Text style={[layerStyles.volLabel, { color: c.icon }]}>Pitch</Text>
          <InlineSlider min={0.5} max={2} step={0.05} value={birds.pitch} onChange={setBirdsPitch} tint={c.tint} />
          <Text style={[layerStyles.volValue, { color: c.icon }]}>{birds.pitch.toFixed(2)}x</Text>
        </View>
        <View style={layerStyles.sliderRow}>
          <Text style={[layerStyles.volLabel, { color: c.icon }]}>Speed</Text>
          <InlineSlider min={0.25} max={3} step={0.05} value={birds.speed} onChange={setBirdsSpeed} tint={c.tint} />
          <Text style={[layerStyles.volValue, { color: c.icon }]}>{birds.speed.toFixed(2)}x</Text>
        </View>
      </LayerRow>

      <AmbienceBrowser
        ambience={ambience}
        toggleAmbience={toggleAmbience}
        setAmbienceVolume={setAmbienceVolume}
        c={c}
        dark={dark}
      />

      <Text style={[styles.hint, { color: c.icon }]}>
        Binaural beats work by playing two slightly different frequencies — one per ear — so
        headphones are required. Noise is synthesized live; nature ambience plays real CC0/CC-BY
        field recordings (credits for CC-BY ones are on the About tab). Every layer runs
        independently and mixes freely with any other layer.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: 13, marginBottom: 20 },

  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    marginBottom: 12,
    paddingVertical: 16,
  },
  playLabel: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },

  card: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },

  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  statusDot: { borderRadius: 99, height: 8, width: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },

  hint: { fontSize: 12, lineHeight: 18, marginTop: 20 },
});
