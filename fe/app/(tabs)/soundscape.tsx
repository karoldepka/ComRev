import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConfirmDialog } from '@/components/confirm-dialog';
import {
  AMBIENCE_KINDS,
  NOISE_COLORS,
  WAVE_PRESETS,
  useSoundscapeStore,
} from '@/store/soundscape-store';
import type { AmbienceCategory } from '@/utils/ambience-tracks';
import { resumeAudioContext } from '@/utils/audio-context';
import { getCtxState, onStateChange } from '@/utils/binaural-engine';

// Responsive column breakpoints
const COL3_WIDTH = 1200;
const COL2_WIDTH = 720;

// Warm accent backgrounds used by master-volume card and now-playing cards
const WARM_DARK_BG = '#1a1a1a';
const WARM_LIGHT_BG = '#fff7f0';

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
  cardWidth,
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
  cardWidth?: number;
}) {
  return (
    <View
      style={[
        layerStyles.card,
        { borderColor: playing ? c.tint : (dark ? '#333' : '#e8e0d8') },
        cardWidth ? { width: cardWidth } : undefined,
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
  cardWidth,
}: {
  ambience: Record<string, { playing: boolean; volume: number }>;
  toggleAmbience: (key: string) => void;
  setAmbienceVolume: (key: string, v: number) => void;
  c: (typeof Colors)['light'];
  dark: boolean;
  cardWidth?: number;
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
            {isOpen && (
              <View style={browserStyles.categoryItems}>
                {items.map((item) => {
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
                      cardWidth={cardWidth}
                    />
                  );
                })}
              </View>
            )}
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
  categoryItems: { flexDirection: 'row', flexWrap: 'wrap' },
});

const presetStyles = StyleSheet.create({
  saveRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 13,
    outlineStyle: 'none',
    paddingHorizontal: 10,
    paddingVertical: 8,
  } as any,
  saveBtn: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  status: { fontSize: 12, marginTop: 6 },
  empty: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  row: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4 },
  radioPad: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    marginLeft: -6,
    width: 32,
  },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
});

const fxStyles = StyleSheet.create({
  swipeRow: { flexDirection: 'row', gap: 8 },
  swipeBtn: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  swipeBtnText: { fontSize: 13, fontWeight: '700' },
  gateHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});

export default function SoundscapeScreen() {
  const cs = useColorScheme() ?? 'light';
  const c = Colors[cs];
  const dark = cs === 'dark';
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const hp = isSmall ? 5 : 20;   // horizontal padding
  const tp = isSmall ? 14 : 56;  // top padding

  // Multi-column breakpoints for layer cards
  const numCols = width >= COL3_WIDTH ? 3 : width >= COL2_WIDTH ? 2 : 1;
  const contentWidth = width - hp * 2;
  const cardGap = 8;
  const cardWidth = numCols > 1 ? (contentWidth - cardGap * (numCols - 1)) / numCols : undefined;

  const masterVolume = useSoundscapeStore((s) => s.masterVolume);
  const masterPaused = useSoundscapeStore((s) => s.masterPaused);
  const setMasterVolume = useSoundscapeStore((s) => s.setMasterVolume);
  const toggleMasterPlayback = useSoundscapeStore((s) => s.toggleMasterPlayback);

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

  const triggerBassSwipe = useSoundscapeStore((s) => s.triggerBassSwipe);
  const stutterGate = useSoundscapeStore((s) => s.stutterGate);
  const toggleStutterGate = useSoundscapeStore((s) => s.toggleStutterGate);
  const setStutterGateBpm = useSoundscapeStore((s) => s.setStutterGateBpm);

  const birds = useSoundscapeStore((s) => s.birds);
  const toggleBirds = useSoundscapeStore((s) => s.toggleBirds);
  const setBirdsVolume = useSoundscapeStore((s) => s.setBirdsVolume);
  const setBirdsPitch = useSoundscapeStore((s) => s.setBirdsPitch);
  const setBirdsSpeed = useSoundscapeStore((s) => s.setBirdsSpeed);

  const presets = useSoundscapeStore((s) => s.presets);
  const loadedPresetId = useSoundscapeStore((s) => s.loadedPresetId);
  const recentLayerKeys = useSoundscapeStore((s) => s.recentLayerKeys);
  const loadPresetList = useSoundscapeStore((s) => s.loadPresetList);
  const saveCurrentAsPreset = useSoundscapeStore((s) => s.saveCurrentAsPreset);
  const loadPresetById = useSoundscapeStore((s) => s.loadPresetById);
  const removePreset = useSoundscapeStore((s) => s.removePreset);
  const hydrateFromLastUsed = useSoundscapeStore((s) => s.hydrateFromLastUsed);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [draftPresetName, setDraftPresetName] = useState('');
  const [presetStatus, setPresetStatus] = useState<string | null>(null);

  useEffect(() => {
    hydrateFromLastUsed();
    loadPresetList();
  }, [hydrateFromLastUsed, loadPresetList]);

  const defaultPresetName = () => {
    const base = 'My preset';
    const existing = new Set(presets.map((p) => p.name));
    let name = base;
    let ordinal = 2;
    while (existing.has(name)) name = `${base} ${ordinal++}`;
    return name;
  };

  const handleSavePreset = async () => {
    const name = draftPresetName.trim() || defaultPresetName();
    try {
      await saveCurrentAsPreset(name);
      setDraftPresetName('');
      setPresetStatus(`Saved: ${name}`);
      setTimeout(() => setPresetStatus(null), 2500);
    } catch (err) {
      setPresetStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeletePreset = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete preset',
      message: `Delete "${name}"? This can't be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (confirmed) await removePreset(id);
  };

  const [ctxState, setCtxState] = useState<string>(getCtxState());
  useEffect(() => onStateChange(setCtxState), []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  // Collect recently used layers for the top summary. Paused entries remain here
  // so a just-paused item can be resumed without hunting through the long page.
  type RecentLayer = {
    key: string;
    label: string;
    sub?: string;
    playing: boolean;
    volume: number;
    onToggle: () => void;
    onVolumeChange: (v: number) => void;
  };
  const layerByKey = new Map<string, RecentLayer>();
  const activeLayerKeys: string[] = [];
  const registerLayer = (layer: RecentLayer) => {
    layerByKey.set(layer.key, layer);
    if (layer.playing) activeLayerKeys.push(layer.key);
  };
  registerLayer({
    key: 'binaural:custom',
    label: 'Custom Binaural',
    sub: `${beatHz.toFixed(1)} Hz beat · ${carrier} Hz carrier`,
    playing,
    volume,
    onToggle: toggle,
    onVolumeChange: setVolume,
  });
  for (const p of WAVE_PRESETS) {
    const layer = extraBinaural[p.key] ?? { playing: false, volume: 0.35 };
    registerLayer({
      key: `eb:${p.key}`,
      label: p.label,
      sub: p.sub,
      playing: layer.playing,
      volume: layer.volume,
      onToggle: () => toggleExtraBinaural(p.key),
      onVolumeChange: (v) => setExtraBinauralVolume(p.key, v),
    });
  }
  for (const n of NOISE_COLORS) {
    const layer = noise[n.key] ?? { playing: false, volume: 0.35 };
    registerLayer({
      key: `noise:${n.key}`,
      label: n.label,
      playing: layer.playing,
      volume: layer.volume,
      onToggle: () => toggleNoise(n.key),
      onVolumeChange: (v) => setNoiseVolume(n.key, v),
    });
  }
  registerLayer({
    key: 'birds',
    label: 'Birds',
    sub: 'procedural chirps',
    playing: birds.playing,
    volume: birds.volume,
    onToggle: toggleBirds,
    onVolumeChange: setBirdsVolume,
  });
  for (const a of AMBIENCE_KINDS) {
    const layer = ambience[a.key] ?? { playing: false, volume: 0.35 };
    registerLayer({
      key: `ambience:${a.key}`,
      label: a.label,
      playing: layer.playing,
      volume: layer.volume,
      onToggle: () => toggleAmbience(a.key),
      onVolumeChange: (v) => setAmbienceVolume(a.key, v),
    });
  }

  const visibleLayerKeys = Array.from(new Set([
    ...recentLayerKeys,
    ...activeLayerKeys.filter((key) => !recentLayerKeys.includes(key)),
  ]));
  const recentLayers = visibleLayerKeys
    .map((key) => layerByKey.get(key))
    .filter((layer): layer is RecentLayer => Boolean(layer));
  const activeLayerCount = recentLayers.filter((layer) => layer.playing).length;
  const anyPlaying = activeLayerCount > 0;

  useEffect(() => {
    if (masterPaused || !anyPlaying || ctxState !== 'suspended' || typeof window === 'undefined') return;
    const resumeRestoredAudio = () => {
      resumeAudioContext();
    };
    window.addEventListener('pointerdown', resumeRestoredAudio, true);
    window.addEventListener('keydown', resumeRestoredAudio, true);
    return () => {
      window.removeEventListener('pointerdown', resumeRestoredAudio, true);
      window.removeEventListener('keydown', resumeRestoredAudio, true);
    };
  }, [anyPlaying, ctxState, masterPaused]);

  const ctxOk = ctxState === 'running';
  const ctxColor = ctxOk ? '#27ae60' : ctxState === 'suspended' ? '#e67e22' : '#888';
  const masterIsPlaying = anyPlaying && !masterPaused;
  const masterActionIsPlay = !masterIsPlaying;
  const masterToggleText = masterIsPlaying ? 'Pause all' : anyPlaying ? 'Play all' : 'Play';
  const masterToggleLabel = masterIsPlaying
    ? 'Pause all soundscape audio'
    : anyPlaying
      ? 'Resume all soundscape audio'
      : 'Play soundscape audio';
  const recentLayerStatus =
    activeLayerCount > 0
      ? masterPaused
        ? ` · ${activeLayerCount} paused`
        : ` · ${activeLayerCount} active`
      : '';

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, { padding: hp, paddingTop: tp }]}
    >
      <Text style={[styles.title, { color: c.text }]}>Soundscape</Text>
      <Text style={[styles.subtitle, { color: c.icon }]}>
        Mix binaural beats, noise and nature ambience — layer as many as you like at once.
      </Text>

      {/* ---------------- Master volume ---------------- */}
      <View style={[styles.masterVolCard, { backgroundColor: dark ? WARM_DARK_BG : WARM_LIGHT_BG, borderColor: c.tint }]}>
        <View style={styles.masterVolHeader}>
          <View style={styles.masterVolTitleGroup}>
            <MaterialIcons name="volume-up" size={22} color={c.tint} />
            <Text style={[styles.masterVolLabel, { color: c.text }]}>Master Volume</Text>
          </View>
          <Pressable
            onPress={toggleMasterPlayback}
            accessibilityRole="button"
            accessibilityLabel={masterToggleLabel}
            accessibilityHint="Controls the whole soundscape mix without changing individual layer volumes."
            accessibilityState={{ selected: masterIsPlaying }}
            style={[
              styles.masterPauseButton,
              {
                backgroundColor: masterActionIsPlay ? c.tint : 'transparent',
                borderColor: c.tint,
              },
            ]}
          >
            <MaterialIcons name={masterActionIsPlay ? 'play-arrow' : 'pause'} size={20} color={masterActionIsPlay ? '#fff' : c.tint} />
            <Text style={[styles.masterPauseText, { color: masterActionIsPlay ? '#fff' : c.tint }]}>
              {masterToggleText}
            </Text>
          </Pressable>
          <Text style={[styles.masterVolValue, { color: c.tint }]}>{Math.round(masterVolume * 100)}%</Text>
        </View>
        <InlineSlider min={0} max={1} step={0.01} value={masterVolume} onChange={setMasterVolume} tint={c.tint} />
        {masterPaused ? (
          <View style={styles.masterPausedRow}>
            <MaterialIcons name="pause-circle-filled" size={14} color={c.tint} />
            <Text style={[styles.masterPausedText, { color: c.tint }]}>Master paused</Text>
          </View>
        ) : null}
      </View>

      {/* ---------------- Now Playing ---------------- */}
      {recentLayers.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 8 }]}>
            MOST RECENTLY USED{recentLayerStatus}
          </Text>
          <View style={styles.nowPlayingGrid}>
            {recentLayers.map((al) => (
              <View
                key={al.key}
                style={[
                  styles.nowPlayingCard,
                  {
                    borderColor: al.playing ? c.tint : (dark ? '#333' : '#e8e0d8'),
                    backgroundColor: dark ? WARM_DARK_BG : WARM_LIGHT_BG,
                  },
                  cardWidth ? { width: cardWidth } : undefined,
                ]}
              >
                <Pressable onPress={al.onToggle} style={layerStyles.header}>
                  <MaterialIcons
                    name={al.playing ? 'pause-circle-filled' : 'play-circle-outline'}
                    size={22}
                    color={al.playing ? c.tint : c.icon}
                  />
                  <View style={layerStyles.headerText}>
                    <Text style={[layerStyles.title, { color: c.text }]}>{al.label}</Text>
                    {al.sub ? <Text style={[layerStyles.sub, { color: c.icon }]}>{al.sub}</Text> : null}
                  </View>
                </Pressable>
                <View style={layerStyles.sliderRow}>
                  <Text style={[layerStyles.volLabel, { color: c.icon }]}>Vol</Text>
                  <InlineSlider min={0} max={1} step={0.01} value={al.volume} onChange={al.onVolumeChange} tint={c.tint} />
                  <Text style={[layerStyles.volValue, { color: c.icon }]}>{Math.round(al.volume * 100)}%</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ---------------- Saved presets ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon }]}>MY PRESETS</Text>
      <View style={[styles.card, { borderColor: dark ? '#333' : '#e8e0d8', paddingVertical: 10 }]}>
        <View style={presetStyles.saveRow}>
          <TextInput
            value={draftPresetName}
            onChangeText={setDraftPresetName}
            placeholder={defaultPresetName()}
            placeholderTextColor={c.icon}
            style={[presetStyles.input, { color: c.text, borderColor: dark ? '#333' : '#e8e0d8' }]}
          />
          <Pressable onPress={handleSavePreset} style={[presetStyles.saveBtn, { backgroundColor: c.tint }]}>
            <MaterialIcons name="save" size={16} color="#fff" />
            <Text style={presetStyles.saveBtnText}>Save preset</Text>
          </Pressable>
        </View>
        {presetStatus ? <Text style={[presetStyles.status, { color: c.icon }]}>{presetStatus}</Text> : null}

        {presets.length === 0 ? (
          <Text style={[presetStyles.empty, { color: c.icon }]}>
            No saved presets yet — dial in a blend below, then save it here to recall it later.
          </Text>
        ) : (
          presets.map((p) => (
            <View key={p.id} style={[presetStyles.row, { borderColor: dark ? '#333' : '#eee' }]}>
              <Pressable onPress={() => loadPresetById(p.id)} style={presetStyles.rowMain}>
                <View style={presetStyles.radioPad}>
                  <MaterialIcons
                    name={loadedPresetId === p.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={18}
                    color={loadedPresetId === p.id ? c.tint : c.icon}
                  />
                </View>
                <Text style={[presetStyles.rowLabel, { color: c.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
              <Pressable onPress={() => handleDeletePreset(p.id, p.name)} hitSlop={8}>
                <MaterialIcons name="delete-outline" size={18} color={c.icon} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* AudioContext status — shows 'suspended' if browser blocked autoplay */}
      {anyPlaying && !masterPaused && (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: ctxColor }]} />
          <Text style={[styles.statusText, { color: ctxColor }]}>
            {ctxOk ? 'Audio running' : `Audio ${ctxState} - click/tap once to resume`}
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
      <View style={styles.layerGrid}>
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
              cardWidth={cardWidth}
            />
          );
        })}
      </View>

      {/* ---------------- Noise ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 20 }]}>NOISE</Text>
      <View style={styles.layerGrid}>
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
              cardWidth={cardWidth}
            />
          );
        })}
      </View>

      {/* ---------------- Sound effects & modifiers ---------------- */}
      <Text style={[styles.sectionLabel, { color: c.icon, marginTop: 20 }]}>SOUND EFFECTS</Text>
      <View style={[styles.card, { borderColor: dark ? '#333' : '#e8e0d8', paddingVertical: 10 }]}>
        <View style={fxStyles.swipeRow}>
          <Pressable
            onPress={() => triggerBassSwipe('up')}
            style={[fxStyles.swipeBtn, { borderColor: c.tint }]}
          >
            <MaterialIcons name="trending-up" size={18} color={c.tint} />
            <Text style={[fxStyles.swipeBtnText, { color: c.tint }]}>Bass swipe up</Text>
          </Pressable>
          <Pressable
            onPress={() => triggerBassSwipe('down')}
            style={[fxStyles.swipeBtn, { borderColor: c.tint }]}
          >
            <MaterialIcons name="trending-down" size={18} color={c.tint} />
            <Text style={[fxStyles.swipeBtnText, { color: c.tint }]}>Bass swipe down</Text>
          </Pressable>
        </View>

        <View style={[styles.divider, { borderColor: dark ? '#333' : '#eee', marginVertical: 10 }]} />

        <Pressable onPress={toggleStutterGate} style={fxStyles.gateHeader}>
          <MaterialIcons
            name={stutterGate.enabled ? 'pause-circle-filled' : 'play-circle-outline'}
            size={26}
            color={stutterGate.enabled ? c.tint : c.icon}
          />
          <View style={layerStyles.headerText}>
            <Text style={[layerStyles.title, { color: c.text }]}>Stutter gate</Text>
            <Text style={[layerStyles.sub, { color: c.icon }]}>chops the whole mix rhythmically</Text>
          </View>
        </Pressable>
        <View style={layerStyles.sliderRow}>
          <Text style={[layerStyles.volLabel, { color: c.icon }]}>BPM</Text>
          <InlineSlider
            min={60}
            max={200}
            step={1}
            value={stutterGate.bpm}
            onChange={setStutterGateBpm}
            tint={c.tint}
          />
          <Text style={[layerStyles.volValue, { color: c.icon }]}>{stutterGate.bpm}</Text>
        </View>
      </View>

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
        cardWidth={cardWidth}
      />

      <Text style={[styles.hint, { color: c.icon }]}>
        Binaural beats work by playing two slightly different frequencies — one per ear — so
        headphones are required. Noise is synthesized live; nature ambience plays real CC0/CC-BY
        field recordings (credits for CC-BY ones are on the About tab). Every layer runs
        independently and mixes freely with any other layer.
      </Text>
      {confirmDialog}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  subtitle: { fontSize: 13, marginBottom: 8 },

  masterVolCard: {
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  masterVolHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  masterVolTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 132,
  },
  masterPauseButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: 10,
  },
  masterPauseText: { fontSize: 13, fontWeight: '800' },
  masterVolLabel: { flex: 1, fontSize: 16, fontWeight: '700' },
  masterVolValue: { fontSize: 16, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  masterPausedRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8 },
  masterPausedText: { fontSize: 12, fontWeight: '700' },

  nowPlayingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  nowPlayingCard: {
    borderRadius: 10,
    borderWidth: 1.5,
    flex: 1,
    marginBottom: 8,
    minWidth: 220,
    padding: 10,
  },

  layerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

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
    maxWidth: 480,
    paddingHorizontal: 14,
    paddingVertical: 4,
    width: '100%',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },

  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  statusDot: { borderRadius: 99, height: 8, width: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },

  hint: { fontSize: 12, lineHeight: 18, marginTop: 20 },
});
