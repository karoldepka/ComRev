import { ThreeDText } from "@/components/three-d-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  BendPipe,
  BloomPipe,
  ChromaticAberrationPipe,
  DepthOfFieldPipe,
  EffectPipe,
  EnvMapPipe,
  EnvMapStyle,
  FilmGrainPipe,
  FishEyePipe,
  GlitchPipe,
  MetallicPreset,
  MetallicPresetPipe,
  NeonGlowPipe,
  OutlinePipe,
  ParticleDustPipe,
  WireframePipe,
} from "@/utils/three-text-pipes";
import {
  getLatestConfig,
  getPendingSyncCount,
  saveConfigOfflineFirst,
  syncPendingConfigs,
  ThreeDConfig,
} from "@/utils/config-store";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const API_BASE = "http://localhost:8000";

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.controlRow}>{children}</View>;
}
function SliderRow({ label, min, max, step, value, onChange, colors }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; colors: any;
}) {
  return (
    <View style={styles.sliderRow}>
      <Text style={[styles.label, { color: colors.text }]}>{label}: {value.toFixed(step < 0.01 ? 5 : step < 0.1 ? 2 : 1)}</Text>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e: any) => onChange(parseFloat(e.target.value))} style={{ flex: 1, marginLeft: 12 }} />
    </View>
  );
}
function SectionHeader({ title, enabled, onToggle, colors }: {
  title: string; enabled: boolean; onToggle: (v: boolean) => void; colors: any;
}) {
  return (
    <View style={[styles.sectionHeader, { borderColor: enabled ? colors.tint : '#555' }]}>
      <Text style={[styles.sectionTitle, { color: enabled ? colors.tint : colors.text }]}>{title}</Text>
      <Switch value={enabled} onValueChange={onToggle}
        trackColor={{ false: '#767577', true: colors.tint }}
        thumbColor={enabled ? colors.tint : '#f4f3f4'} />
    </View>
  );
}
function CycleButton({ value, options, onPress, colors }: {
  value: string; options: string[]; onPress: () => void; colors: any;
}) {
  return (
    <TouchableOpacity style={[styles.methodButton, { borderColor: colors.tint }]} onPress={onPress}>
      <Text style={[styles.buttonText, { color: colors.tint }]}>{value}</Text>
    </TouchableOpacity>
  );
}

type EffectType =
  | 'bloom'
  | 'depthOfField'
  | 'chromatic'
  | 'filmGrain'
  | 'glitch'
  | 'fishEye'
  | 'bend'
  | 'envMap'
  | 'neonGlow'
  | 'metallicPreset'
  | 'dust'
  | 'wireframe'
  | 'outline';
  
  // Add rays and radial blur
  | 'rays'
  | 'radialBlur';

interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, unknown>;
}

const EFFECT_TYPES: { type: EffectType; label: string }[] = [
  { type: 'bloom', label: 'Bloom' },
  { type: 'depthOfField', label: 'Depth of Field' },
  { type: 'chromatic', label: 'Chromatic' },
  { type: 'filmGrain', label: 'Film Grain' },
  { type: 'glitch', label: 'Glitch' },
  { type: 'fishEye', label: 'Fish Eye' },
  { type: 'bend', label: 'Bend' },
  { type: 'envMap', label: 'Env Map' },
  { type: 'neonGlow', label: 'Neon Glow' },
  { type: 'metallicPreset', label: 'Metallic' },
  { type: 'dust', label: 'Particle Dust' },
  { type: 'wireframe', label: 'Wireframe' },
  { type: 'outline', label: 'Outline' },
  { type: 'rays', label: 'Rays (geometry)' },
  { type: 'radialBlur', label: 'Radial Blur (post)' },
];

function effectTypeLabel(type: EffectType) {
  return EFFECT_TYPES.find((item) => item.type === type)?.label ?? type;
}

function createId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createDefaultEffectParams(type: EffectType): Record<string, unknown> {
  switch (type) {
    case 'bloom': return { strength: 0.8, threshold: 0.2, radius: 0.5 };
    case 'depthOfField': return { focus: 15, aperture: 3, maxBlur: 0.01 };
    case 'chromatic': return { offset: 0.005 };
    case 'filmGrain': return { intensity: 0.35 };
    case 'glitch': return { wildGlitch: false };
    case 'fishEye': return { strength: 0.4, radius: 10 };
    case 'bend': return { strength: 0.18, axis: 'x' };
    case 'envMap': return { style: 'gradient', intensity: 1.5, seed: 42 };
    case 'neonGlow': return { colorIdx: 0, intensity: 0.8, pulseSpeed: 1.0, pulseAmplitude: 0.3 };
    case 'metallicPreset': return { preset: 'gold' };
    case 'dust': return { count: 500, speed: 0.5, size: 0.06, seed: 42 };
    case 'wireframe': return { opacity: 0.25 };
    case 'outline': return { thickness: 1.05 };
    case 'rays': return { mode: 'radial', count: 24, thickness: 0.08, innerMargin: 2, outerMargin: 6 };
    case 'radialBlur': return { strength: 0.12, samples: 8, center: [0.5, 0.5] };
    default: return {};
  }
}

function createEffectInstance(type: EffectType): EffectInstance {
  return {
    id: createId(),
    type,
    enabled: true,
    params: createDefaultEffectParams(type),
  };
}

function createPipeFromInstance(effect: EffectInstance): EffectPipe {
  switch (effect.type) {
    case 'bloom':
      return new BloomPipe(effect.params as any);
    case 'depthOfField':
      return new DepthOfFieldPipe(effect.params as any);
    case 'chromatic':
      return new ChromaticAberrationPipe(effect.params as any);
    case 'filmGrain':
      return new FilmGrainPipe(effect.params as any);
    case 'glitch':
      return new GlitchPipe(effect.params as any);
    case 'fishEye':
      return new FishEyePipe(effect.params as any);
    case 'bend':
      return new BendPipe(effect.params as any);
    case 'envMap':
      return new EnvMapPipe(effect.params as any);
    case 'neonGlow':
      return new NeonGlowPipe(effect.params as any);
    case 'metallicPreset':
      return new MetallicPresetPipe(effect.params as any);
    case 'dust':
      return new ParticleDustPipe(effect.params as any);
    case 'wireframe':
      return new WireframePipe(effect.params as any);
    case 'outline':
      return new OutlinePipe(effect.params as any);
    default:
      return new FilmGrainPipe();
  }
}

function renderEffectControls(
  effect: EffectInstance,
  colors: any,
  onUpdate: (key: string, value: unknown) => void
) {
  const params = effect.params as Record<string, unknown>;
  switch (effect.type) {
    case 'bloom':
      return (
        <>
          <SliderRow label="Strength" min={0} max={3} step={0.05} value={params.strength as number} onChange={(v) => onUpdate('strength', v)} colors={colors} />
          <SliderRow label="Threshold" min={0} max={1} step={0.01} value={params.threshold as number} onChange={(v) => onUpdate('threshold', v)} colors={colors} />
          <SliderRow label="Radius" min={0} max={1} step={0.01} value={params.radius as number} onChange={(v) => onUpdate('radius', v)} colors={colors} />
        </>
      );
    case 'depthOfField':
      return (
        <>
          <SliderRow label="Focus dist" min={1} max={40} step={0.5} value={params.focus as number} onChange={(v) => onUpdate('focus', v)} colors={colors} />
          <SliderRow label="Aperture" min={0.5} max={20} step={0.1} value={params.aperture as number} onChange={(v) => onUpdate('aperture', v)} colors={colors} />
          <SliderRow label="Max Blur" min={0} max={0.05} step={0.001} value={params.maxBlur as number} onChange={(v) => onUpdate('maxBlur', v)} colors={colors} />
        </>
      );
    case 'chromatic':
      return (
        <SliderRow label="Offset" min={0} max={0.02} step={0.0005} value={params.offset as number} onChange={(v) => onUpdate('offset', v)} colors={colors} />
      );
    case 'filmGrain':
      return (
        <SliderRow label="Intensity" min={0} max={1} step={0.01} value={params.intensity as number} onChange={(v) => onUpdate('intensity', v)} colors={colors} />
      );
    case 'glitch':
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>Wild Mode</Text>
          <Switch
            value={Boolean(params.wildGlitch)}
            onValueChange={(value) => onUpdate('wildGlitch', value)}
            trackColor={{ false: '#767577', true: colors.tint }}
            thumbColor={Boolean(params.wildGlitch) ? colors.tint : '#f4f3f4'}
          />
        </Row>
      );
    case 'fishEye':
      return (
        <>
          <SliderRow label="Strength" min={0} max={1} step={0.01} value={params.strength as number} onChange={(v) => onUpdate('strength', v)} colors={colors} />
          <SliderRow label="Radius" min={2} max={30} step={0.5} value={params.radius as number} onChange={(v) => onUpdate('radius', v)} colors={colors} />
        </>
      );
    case 'bend':
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Axis</Text>
            <CycleButton
              value={(params.axis as string)?.toUpperCase() ?? 'X'}
              options={[]}
              onPress={() => {
                const nextAxis = params.axis === 'x' ? 'y' : params.axis === 'y' ? 'z' : 'x';
                onUpdate('axis', nextAxis);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow label="Strength" min={0} max={0.5} step={0.01} value={params.strength as number} onChange={(v) => onUpdate('strength', v)} colors={colors} />
        </>
      );
    case 'envMap':
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Style</Text>
            <CycleButton
              value={(params.style as string) ?? 'gradient'}
              options={[]}
              onPress={() => {
                const stylesList: EnvMapStyle[] = ['gradient', 'studio', 'starfield', 'sunset', 'neon'];
                const idx = stylesList.indexOf(params.style as EnvMapStyle);
                onUpdate('style', stylesList[(idx + 1) % stylesList.length]);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow label="Intensity" min={0} max={3} step={0.05} value={params.intensity as number} onChange={(v) => onUpdate('intensity', v)} colors={colors} />
          <SliderRow label="Seed" min={0} max={999} step={1} value={params.seed as number} onChange={(v) => onUpdate('seed', Math.round(v))} colors={colors} />
        </>
      );
    case 'neonGlow':
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Color</Text>
            <CycleButton
              value={['Magenta', 'Cyan', 'Green', 'Orange', 'Blue'][params.colorIdx as number]}
              options={[]}
              onPress={() => onUpdate('colorIdx', ((params.colorIdx as number) + 1) % 5)}
              colors={colors}
            />
          </Row>
          <SliderRow label="Intensity" min={0} max={2} step={0.05} value={params.intensity as number} onChange={(v) => onUpdate('intensity', v)} colors={colors} />
          <SliderRow label="Pulse Speed" min={0} max={5} step={0.1} value={params.pulseSpeed as number} onChange={(v) => onUpdate('pulseSpeed', v)} colors={colors} />
          <SliderRow label="Pulse Amplitude" min={0} max={1} step={0.01} value={params.pulseAmplitude as number} onChange={(v) => onUpdate('pulseAmplitude', v)} colors={colors} />
        </>
      );
    case 'metallicPreset':
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>Preset</Text>
          <CycleButton
            value={(params.preset as string) ?? 'gold'}
            options={[]}
            onPress={() => {
              const presets: MetallicPreset[] = ['gold', 'chrome', 'copper', 'holographic', 'obsidian'];
              const idx = presets.indexOf(params.preset as MetallicPreset);
              onUpdate('preset', presets[(idx + 1) % presets.length]);
            }}
            colors={colors}
          />
        </Row>
      );
    case 'dust':
      return (
        <>
          <SliderRow label="Count" min={50} max={2000} step={50} value={params.count as number} onChange={(v) => onUpdate('count', Math.round(v))} colors={colors} />
          <SliderRow label="Speed" min={0} max={2} step={0.05} value={params.speed as number} onChange={(v) => onUpdate('speed', v)} colors={colors} />
          <SliderRow label="Size" min={0.01} max={0.3} step={0.005} value={params.size as number} onChange={(v) => onUpdate('size', v)} colors={colors} />
          <SliderRow label="Seed" min={0} max={999} step={1} value={params.seed as number} onChange={(v) => onUpdate('seed', Math.round(v))} colors={colors} />
        </>
      );
    case 'wireframe':
      return (
        <SliderRow label="Opacity" min={0} max={1} step={0.01} value={params.opacity as number} onChange={(v) => onUpdate('opacity', v)} colors={colors} />
      );
    case 'outline':
      return (
        <SliderRow label="Thickness" min={1.01} max={1.2} step={0.005} value={params.thickness as number} onChange={(v) => onUpdate('thickness', v)} colors={colors} />
      );
    default:
      return null;
  }
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ThreeDTextScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  // ── Text & base geometry ────────────────────────────────────────────────────
  const [text, setText] = useState("Hi\nHello World\nThis is a very long line of text");
  const [equalizeLineWidths, setEqualizeLineWidths] = useState(false);
  const [equalizationMethod, setEqualizationMethod] = useState<'spacing' | 'fontSize'>('fontSize');
  const [targetWidth, setTargetWidth] = useState(20);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [rays, setRays] = useState(true);
  const [rayMode, setRayMode] = useState<'radial' | 'spaghetti' | 'chip'>('radial');
  const [rayCount, setRayCount] = useState(24);
  const [rayThickness, setRayThickness] = useState(0.08);
  const [rayInnerMargin, setRayInnerMargin] = useState(2);
  const [rayOuterMargin, setRayOuterMargin] = useState(6);

  const [effectInstances, setEffectInstances] = useState<EffectInstance[]>([]);
  const [selectedEffectType, setSelectedEffectType] = useState<EffectType>('bloom');
  const [selectedEffectSearch, setSelectedEffectSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const c = colors; // shorthand

  const effectInstancesRef = useRef(effectInstances);
  useEffect(() => {
    effectInstancesRef.current = effectInstances;
  }, [effectInstances]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragStartY = useRef(0);
  const dragY = useSharedValue(0);
  const dragItemHeight = useSharedValue(0);
  const itemLayouts = useRef<Record<string, { y: number; height: number }>>({});

  const dragOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  const activePipes = useMemo<EffectPipe[]>(() => {
    return effectInstances
      .filter((instance) => instance.enabled)
      .map((instance) => createPipeFromInstance(instance));
  }, [effectInstances]);

  const reorderEffectByIndex = (from: number, to: number) => {
    if (from === to) return;
    setEffectInstances((instances) => {
      const copy = [...instances];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const updateDragHover = (id: string, positionY: number) => {
    const current = effectInstancesRef.current;
    const currentIndex = current.findIndex((item) => item.id === id);
    if (currentIndex < 0) return;

    const centerY = positionY + dragItemHeight.value / 2;
    const targetItem = current.find((item) => {
      if (item.id === id) return false;
      const layout = itemLayouts.current[item.id];
      return layout && centerY >= layout.y && centerY <= layout.y + layout.height;
    });

    if (!targetItem) {
      return;
    }

    const targetIndex = current.findIndex((item) => item.id === targetItem.id);
    if (targetIndex !== currentIndex) {
      reorderEffectByIndex(currentIndex, targetIndex);
    }
  };

  const createDragGesture = (id: string) =>
    Gesture.Pan()
      .onBegin(() => {
        const layout = itemLayouts.current[id];
        if (!layout) return;

        draggingIdRef.current = id;
        dragStartY.current = layout.y;
        dragY.value = layout.y;
        dragItemHeight.value = layout.height;
        runOnJS(setDraggingId)(id);
      })
      .onUpdate((event) => {
        if (!draggingIdRef.current) return;

        const nextY = dragStartY.current + event.translationY;
        dragY.value = nextY;
        runOnJS(updateDragHover)(id, nextY);
      })
      .onEnd(() => {
        draggingIdRef.current = null;
        runOnJS(setDraggingId)(null);
      });

  const addEffectInstance = () => {
    setEffectInstances((instances) => [...instances, createEffectInstance(selectedEffectType)]);
  };

  const draggingItem = effectInstances.find((instance) => instance.id === draggingId);

  const updateEffectParam = (id: string, key: string, value: unknown) => {
    setEffectInstances((instances) =>
      instances.map((instance) =>
        instance.id === id
          ? { ...instance, params: { ...instance.params, [key]: value } }
          : instance
      )
    );
  };

  const toggleEffectEnabled = (id: string) => {
    setEffectInstances((instances) =>
      instances.map((instance) =>
        instance.id === id ? { ...instance, enabled: !instance.enabled } : instance
      )
    );
  };

  const moveEffect = (id: string, direction: -1 | 1) => {
    setEffectInstances((instances) => {
      const index = instances.findIndex((instance) => instance.id === id);
      if (index < 0) return instances;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= instances.length) return instances;
      const copy = [...instances];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const removeEffectInstance = (id: string) => {
    setEffectInstances((instances) => instances.filter((instance) => instance.id !== id));
  };

  const duplicateEffectInstance = (id: string) => {
    setEffectInstances((instances) => {
      const index = instances.findIndex((instance) => instance.id === id);
      if (index < 0) return instances;
      const source = instances[index];
      const copy = { ...source, id: createId() };
      const next = [...instances];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  useEffect(() => {
    let active = true;

    async function loadLastSavedConfig() {
      try {
        const latest = await getLatestConfig();
        if (!active || !latest) {
          return;
        }

        setText(latest.text);
        setEqualizeLineWidths(latest.equalizeLineWidths);
        setEqualizationMethod(latest.equalizationMethod);
        setTargetWidth(latest.targetWidth);
        setLineSpacing(latest.lineSpacing);
        setRays(latest.rays);
        setRayMode(latest.rayMode);
        setRayCount(latest.rayCount);
        setRayThickness(latest.rayThickness);
        setRayInnerMargin(latest.rayInnerMargin);
        setRayOuterMargin(latest.rayOuterMargin);
        setShowAdvanced(latest.showAdvanced);

        const savedEffects = (latest as any).effectInstances as EffectInstance[] | undefined;
        if (Array.isArray(savedEffects)) {
          setEffectInstances(savedEffects.map((item) => ({
            ...item,
            enabled: item.enabled ?? true,
            params: item.params ?? {},
          })));
        } else {
          setEffectInstances([]);
        }

        setSaveStatus('Restored last saved configuration.');
      } catch (error) {
        console.warn('Unable to load last configuration:', error);
      }
    }

    async function refreshPending() {
      try {
        setPendingSyncCount(await getPendingSyncCount());
      } catch {
        setPendingSyncCount(0);
      }
    }

    loadLastSavedConfig();
    refreshPending();

    const syncOnOnline = async () => {
      try {
        await syncPendingConfigs(API_BASE);
      } catch {
        // Ignore silent sync failures; status remains available to the user.
      }
      refreshPending();
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', syncOnOnline);
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('online', syncOnOnline);
      }
    };
  }, []);

  const refreshPending = async () => {
    try {
      setPendingSyncCount(await getPendingSyncCount());
    } catch {
      setPendingSyncCount(0);
    }
  };

  const buildCurrentConfig = (): ThreeDConfig => ({
    id: `config-${Date.now()}`,
    name: `3D render configuration ${new Date().toISOString()}`,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    text,
    equalizeLineWidths,
    equalizationMethod,
    targetWidth,
    lineSpacing,
    rays,
    rayMode,
    rayCount,
    rayThickness,
    rayInnerMargin,
    rayOuterMargin,
    effectInstances,
    showAdvanced,
  });

  const handleSaveConfig = async () => {
    setSaveStatus('Saving configuration...');
    const config = buildCurrentConfig();

    try {
      const result = await saveConfigOfflineFirst(config, API_BASE);
      if (result.synced) {
        setSaveStatus('Saved locally and synced to the backend.');
      } else {
        setSaveStatus(`Saved locally. Will sync later. ${result.error ?? ''}`.trim());
      }
    } catch (error) {
      setSaveStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    refreshPending();
  };

  const handleSyncPending = async () => {
    setSaveStatus('Syncing pending configurations...');
    try {
      await syncPendingConfigs(API_BASE);
      setSaveStatus('Pending configurations synced successfully.');
    } catch (error) {
      setSaveStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    refreshPending();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.content}>
        <View style={styles.canvas}>
          <ThreeDText
            text={text}
            equalizeLineWidths={equalizeLineWidths}
            equalizationMethod={equalizationMethod}
            targetWidth={targetWidth}
            lineSpacing={lineSpacing}
            rays={rays}
            rayMode={rayMode}
            rayCount={rayCount}
            rayThickness={rayThickness}
            rayInnerMargin={rayInnerMargin}
            rayOuterMargin={rayOuterMargin}
            pipes={activePipes}
          />
        </View>

        <ScrollView style={styles.controls} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* ── Text input ── */}
          <TextInput
            style={[styles.textInput, { color: c.text, borderColor: c.tint, backgroundColor: colorScheme === "dark" ? "#2a2a2a" : "#f5f5f5" }]}
            placeholder="Enter multi-line text for 3D rendering"
            placeholderTextColor={colorScheme === "dark" ? "#999" : "#ccc"}
            value={text} onChangeText={setText} multiline numberOfLines={3}
          />

          {/* ── Base geometry ── */}
          <Text style={[styles.groupLabel, { color: c.text }]}>Geometry</Text>
          <Row>
            <Text style={[styles.label, { color: c.text }]}>Equalize Line Widths</Text>
            <Switch value={equalizeLineWidths} onValueChange={setEqualizeLineWidths} trackColor={{ false: '#767577', true: c.tint }} thumbColor={equalizeLineWidths ? c.tint : '#f4f3f4'} />
          </Row>
          {equalizeLineWidths && (
            <>
              <Row>
                <Text style={[styles.label, { color: c.text }]}>Method: {equalizationMethod}</Text>
                <CycleButton value="Switch" options={[]} onPress={() => setEqualizationMethod(m => m === 'spacing' ? 'fontSize' : 'spacing')} colors={c} />
              </Row>
              <SliderRow label="Target Width" min={5} max={40} step={0.1} value={targetWidth} onChange={setTargetWidth} colors={c} />
            </>
          )}
          <SliderRow label="Line Spacing" min={0.5} max={4} step={0.01} value={lineSpacing} onChange={setLineSpacing} colors={c} />
          <Row>
            <Text style={[styles.label, { color: c.text }]}>Rays</Text>
            <Switch value={rays} onValueChange={setRays} trackColor={{ false: '#767577', true: c.tint }} thumbColor={rays ? c.tint : '#f4f3f4'} />
          </Row>
          {rays && (
            <>
              <Row>
                <Text style={[styles.label, { color: c.text }]}>Mode</Text>
                <CycleButton value={rayMode} options={[]} onPress={() => setRayMode(m => m === 'radial' ? 'spaghetti' : m === 'spaghetti' ? 'chip' : 'radial')} colors={c} />
              </Row>
              <SliderRow label="Count" min={4} max={64} step={1} value={rayCount} onChange={v => setRayCount(Math.round(v))} colors={c} />
              <SliderRow label="Thickness" min={0.01} max={0.5} step={0.01} value={rayThickness} onChange={setRayThickness} colors={c} />
              <SliderRow label="Inner Margin" min={0} max={10} step={0.1} value={rayInnerMargin} onChange={setRayInnerMargin} colors={c} />
              <SliderRow label="Outer Margin" min={1} max={20} step={0.1} value={rayOuterMargin} onChange={setRayOuterMargin} colors={c} />
            </>
          )}

          {/* ── Effects ── */}
          <Text style={[styles.groupLabel, { color: c.text }]}>Effects (composable pipes)</Text>
<View style={styles.effectListContainer}>
            <View style={styles.effectControlRow}>
              <Text style={[styles.label, { color: c.text, flex: 1 }]}>Add effect</Text>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.searchInput, { borderColor: c.tint, color: c.text }]}
                  placeholder="Search effects..."
                  placeholderTextColor={colorScheme === 'dark' ? '#666' : '#999'}
                  value={selectedEffectSearch}
                  onChangeText={setSelectedEffectSearch}
                />
                {selectedEffectSearch.length > 0 && (
                  <View style={[styles.effectSearchList, { borderColor: c.tint }]}
                  >
                    {EFFECT_TYPES.filter(e =>
                      (e.label + ' ' + e.type).toLowerCase().includes(selectedEffectSearch.toLowerCase())
                    ).map((e) => (
                      <TouchableOpacity
                        key={e.type}
                        style={styles.effectSearchItem}
                        onPress={() => {
                          setSelectedEffectType(e.type);
                          addEffectInstance();
                          setSelectedEffectSearch('');
                        }}
                      >
                        <Text style={{ color: c.text }}>{e.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {effectInstances.length === 0 && (
              <Text style={[styles.helpText, { color: c.text }]}>No effect instances yet. Add one to start building a pipeline.</Text>
            )}

            {effectInstances.map((instance, index) => (
              <View
                key={instance.id}
                onLayout={(e) => {
                  itemLayouts.current[instance.id] = {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  };
                }}
                pointerEvents={draggingId === instance.id ? 'none' : 'auto'}
                style={[
                  styles.effectCard,
                  { borderColor: c.tint, backgroundColor: colorScheme === 'dark' ? '#1f1f1f' : '#fafafa' },
                  draggingId === instance.id && styles.hiddenItem,
                ]}
              >
                <View style={styles.effectCardHeader}>
                  <GestureDetector gesture={createDragGesture(instance.id)}>
                    <View style={styles.dragHandle}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>≡</Text>
                    </View>
                  </GestureDetector>
                  <View style={{ flex: 1 }}>
                    <SectionHeader title={`${index + 1}. ${effectTypeLabel(instance.type)}`} enabled={instance.enabled} onToggle={() => toggleEffectEnabled(instance.id)} colors={c} />
                  </View>
                  <Row>
                    <TouchableOpacity style={styles.smallActionButton} onPress={() => duplicateEffectInstance(instance.id)}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>⧉</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallActionButton} onPress={() => moveEffect(instance.id, -1)}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallActionButton} onPress={() => moveEffect(instance.id, 1)}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>↓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallActionButton} onPress={() => removeEffectInstance(instance.id)}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>✕</Text>
                    </TouchableOpacity>
                  </Row>
                </View>
                {instance.enabled && renderEffectControls(instance, c, (key, value) => updateEffectParam(instance.id, key, value))}
              </View>
            ))}

            {draggingItem && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.effectCard,
                  styles.draggingOverlay,
                  { borderColor: c.tint, backgroundColor: colorScheme === 'dark' ? '#1f1f1f' : '#fafafa' },
                  dragOverlayStyle,
                ]}
              >
                <View style={styles.effectCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: c.tint }]}>{`Dragging: ${effectTypeLabel(draggingItem.type)}`}</Text>
                  </View>
                </View>
                {renderEffectControls(draggingItem, c, () => undefined)}
              </Animated.View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.advancedToggle, { borderColor: '#555' }]}
            onPress={() => setShowAdvanced((v) => !v)}
          >
            <Text style={[styles.buttonText, { color: '#888' }]}>{showAdvanced ? '▲ Hide Advanced' : '▼ Show Advanced (seeds)'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, flexDirection: "column" },
  canvas: { flex: 2, width: "100%" },
  controls: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    alignSelf: "center",
    width: "100%",
    maxWidth: 760,
  },
  textInput: {
    borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15,
    minHeight: 80, textAlignVertical: "top", margin: 12, marginBottom: 8,
  },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 12, marginTop: 12, marginBottom: 4, opacity: 0.6 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderRadius: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  controlRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 4,
  },
  sliderRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginVertical: 3, paddingHorizontal: 4,
  },
  label: { fontSize: 13, fontWeight: '500', minWidth: 130 },
  methodButton: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  buttonText: { fontSize: 12, fontWeight: '500' },
  effectGrid: {
    flexDirection: 'column',
    marginHorizontal: 8,
  },
  effectListContainer: {
    position: 'relative',
    marginHorizontal: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    marginBottom: 6,
  },
  effectSearchList: {
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 180,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  effectSearchItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dragHandle: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    borderColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draggingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  hiddenItem: {
    opacity: 0,
  },
  effectControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
  },
  effectCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  effectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smallActionButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  helpText: {
    marginHorizontal: 12,
    fontSize: 13,
    marginBottom: 8,
  },
  effectBlock: {
    flexBasis: 'auto',
    maxWidth: 320,
    marginBottom: 8,
    marginRight: 8,
    alignSelf: 'flex-start',
  },
  advancedToggle: {
    marginHorizontal: 12, marginTop: 16, borderWidth: 1, borderRadius: 6,
    paddingVertical: 8, alignItems: 'center',
  },
});
