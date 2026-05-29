import { ThreeDText } from "@/components/three-d-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  BloomPipe,
  ChromaticAberrationPipe,
  DepthOfFieldPipe,
  EffectPipe,
  EnvMapPipe,
  EnvMapStyle,
  FilmGrainPipe,
  GlitchPipe,
  MetallicPreset,
  MetallicPresetPipe,
  NeonGlowPipe,
  OutlinePipe,
  ParticleDustPipe,
  WireframePipe,
} from "@/utils/three-text-pipes";
import React, { useMemo, useRef, useState } from "react";
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

  // ── Bloom ───────────────────────────────────────────────────────────────────
  const [bloomOn, setBloomOn] = useState(false);
  const [bloomStrength, setBloomStrength] = useState(0.8);
  const [bloomThreshold, setBloomThreshold] = useState(0.2);
  const [bloomRadius, setBloomRadius] = useState(0.5);

  // ── Depth of Field ──────────────────────────────────────────────────────────
  const [dofOn, setDofOn] = useState(false);
  const [dofFocus, setDofFocus] = useState(15);
  const [dofAperture, setDofAperture] = useState(3); // stored as ×0.00001
  const [dofMaxBlur, setDofMaxBlur] = useState(0.01);

  // ── Chromatic Aberration ────────────────────────────────────────────────────
  const [chromaOn, setChromaOn] = useState(false);
  const [chromaOffset, setChromaOffset] = useState(0.005);

  // ── Film Grain ──────────────────────────────────────────────────────────────
  const [filmOn, setFilmOn] = useState(false);
  const [filmIntensity, setFilmIntensity] = useState(0.35);

  // ── Glitch ──────────────────────────────────────────────────────────────────
  const [glitchOn, setGlitchOn] = useState(false);
  const [glitchWild, setGlitchWild] = useState(false);

  // ── Env Map ─────────────────────────────────────────────────────────────────
  const [envOn, setEnvOn] = useState(false);
  const ENV_STYLES: EnvMapStyle[] = ['gradient', 'studio', 'starfield', 'sunset', 'neon'];
  const [envStyle, setEnvStyle] = useState<EnvMapStyle>('gradient');
  const [envIntensity, setEnvIntensity] = useState(1.5);
  const [envSeed, setEnvSeed] = useState(42);

  // ── Neon Glow ───────────────────────────────────────────────────────────────
  const [neonOn, setNeonOn] = useState(false);
  const NEON_COLORS = [0xff00ff, 0x00ffff, 0x00ff88, 0xff6600, 0x0066ff];
  const NEON_COLOR_NAMES = ['Magenta', 'Cyan', 'Green', 'Orange', 'Blue'];
  const [neonColorIdx, setNeonColorIdx] = useState(0);
  const [neonIntensity, setNeonIntensity] = useState(0.8);
  const [neonPulseSpeed, setNeonPulseSpeed] = useState(1.0);
  const [neonPulseAmp, setNeonPulseAmp] = useState(0.3);

  // ── Metallic Preset ─────────────────────────────────────────────────────────
  const [metallicOn, setMetallicOn] = useState(false);
  const METALLIC_PRESETS: MetallicPreset[] = ['gold', 'chrome', 'copper', 'holographic', 'obsidian'];
  const [metallicPreset, setMetallicPreset] = useState<MetallicPreset>('gold');

  // ── Particle Dust ───────────────────────────────────────────────────────────
  const [dustOn, setDustOn] = useState(false);
  const [dustCount, setDustCount] = useState(500);
  const [dustSpeed, setDustSpeed] = useState(0.5);
  const [dustSize, setDustSize] = useState(0.06);
  const [dustSeed, setDustSeed] = useState(42);

  // ── Wireframe ───────────────────────────────────────────────────────────────
  const [wireOn, setWireOn] = useState(false);
  const [wireOpacity, setWireOpacity] = useState(0.25);

  // ── Outline ─────────────────────────────────────────────────────────────────
  const [outlineOn, setOutlineOn] = useState(false);
  const [outlineThickness, setOutlineThickness] = useState(1.05);

  // ── Advanced (seed, etc.) ───────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Stable pipe refs (one instance per pipe, never recreated) ───────────────
  const bloomPipe   = useRef(new BloomPipe());
  const dofPipe     = useRef(new DepthOfFieldPipe());
  const chromaPipe  = useRef(new ChromaticAberrationPipe());
  const filmPipe    = useRef(new FilmGrainPipe());
  const glitchPipe  = useRef(new GlitchPipe());
  const envPipe     = useRef(new EnvMapPipe());
  const neonPipe    = useRef(new NeonGlowPipe());
  const metallicPipe = useRef(new MetallicPresetPipe());
  const dustPipe    = useRef(new ParticleDustPipe());
  const wirePipe    = useRef(new WireframePipe());
  const outlinePipe = useRef(new OutlinePipe());

  // Sync params into pipe refs every render (safe — refs, no side effects)
  bloomPipe.current.params   = { strength: bloomStrength, threshold: bloomThreshold, radius: bloomRadius };
  dofPipe.current.params     = { focus: dofFocus, aperture: dofAperture * 0.00001, maxBlur: dofMaxBlur };
  chromaPipe.current.params  = { offset: chromaOffset };
  filmPipe.current.params    = { intensity: filmIntensity };
  glitchPipe.current.params  = { wildGlitch: glitchWild };
  envPipe.current.params     = { style: envStyle, seed: envSeed, intensity: envIntensity };
  neonPipe.current.params    = { color: NEON_COLORS[neonColorIdx], intensity: neonIntensity, pulseSpeed: neonPulseSpeed, pulseAmplitude: neonPulseAmp };
  metallicPipe.current.params = { preset: metallicPreset };
  dustPipe.current.params    = { count: dustCount, speed: dustSpeed, size: dustSize, seed: dustSeed };
  wirePipe.current.params    = { opacity: wireOpacity };
  outlinePipe.current.params = { thickness: outlineThickness };

  // Rebuild pipes array only when enabled toggles change
  const activePipes = useMemo<EffectPipe[]>(() => {
    const p: EffectPipe[] = [];
    if (bloomOn)    p.push(bloomPipe.current);
    if (dofOn)      p.push(dofPipe.current);
    if (chromaOn)   p.push(chromaPipe.current);
    if (filmOn)     p.push(filmPipe.current);
    if (glitchOn)   p.push(glitchPipe.current);
    if (envOn)      p.push(envPipe.current);
    if (neonOn)     p.push(neonPipe.current);
    if (metallicOn) p.push(metallicPipe.current);
    if (dustOn)     p.push(dustPipe.current);
    if (wireOn)     p.push(wirePipe.current);
    if (outlineOn)  p.push(outlinePipe.current);
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloomOn, dofOn, chromaOn, filmOn, glitchOn, envOn, neonOn, metallicOn, dustOn, wireOn, outlineOn]);

  const c = colors; // shorthand

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

          {/* Bloom */}
          <SectionHeader title="Bloom" enabled={bloomOn} onToggle={setBloomOn} colors={c} />
          {bloomOn && (
            <>
              <SliderRow label="Strength" min={0} max={3} step={0.05} value={bloomStrength} onChange={setBloomStrength} colors={c} />
              <SliderRow label="Threshold" min={0} max={1} step={0.01} value={bloomThreshold} onChange={setBloomThreshold} colors={c} />
              <SliderRow label="Radius" min={0} max={1} step={0.01} value={bloomRadius} onChange={setBloomRadius} colors={c} />
            </>
          )}

          {/* Depth of Field */}
          <SectionHeader title="Depth of Field" enabled={dofOn} onToggle={setDofOn} colors={c} />
          {dofOn && (
            <>
              <SliderRow label="Focus dist" min={1} max={40} step={0.5} value={dofFocus} onChange={setDofFocus} colors={c} />
              <SliderRow label="Aperture ×1e-5" min={0.5} max={20} step={0.1} value={dofAperture} onChange={setDofAperture} colors={c} />
              <SliderRow label="Max Blur" min={0} max={0.05} step={0.001} value={dofMaxBlur} onChange={setDofMaxBlur} colors={c} />
            </>
          )}

          {/* Chromatic Aberration */}
          <SectionHeader title="Chromatic Aberration" enabled={chromaOn} onToggle={setChromaOn} colors={c} />
          {chromaOn && (
            <SliderRow label="Offset" min={0} max={0.02} step={0.0005} value={chromaOffset} onChange={setChromaOffset} colors={c} />
          )}

          {/* Film Grain */}
          <SectionHeader title="Film Grain" enabled={filmOn} onToggle={setFilmOn} colors={c} />
          {filmOn && (
            <SliderRow label="Intensity" min={0} max={1} step={0.01} value={filmIntensity} onChange={setFilmIntensity} colors={c} />
          )}

          {/* Glitch */}
          <SectionHeader title="Glitch" enabled={glitchOn} onToggle={setGlitchOn} colors={c} />
          {glitchOn && (
            <Row>
              <Text style={[styles.label, { color: c.text }]}>Wild Mode</Text>
              <Switch value={glitchWild} onValueChange={setGlitchWild} trackColor={{ false: '#767577', true: c.tint }} thumbColor={glitchWild ? c.tint : '#f4f3f4'} />
            </Row>
          )}

          {/* Env Map */}
          <SectionHeader title="Environment Map" enabled={envOn} onToggle={setEnvOn} colors={c} />
          {envOn && (
            <>
              <Row>
                <Text style={[styles.label, { color: c.text }]}>Style</Text>
                <CycleButton value={envStyle} options={[]} onPress={() => setEnvStyle(s => { const i = ENV_STYLES.indexOf(s); return ENV_STYLES[(i + 1) % ENV_STYLES.length]; })} colors={c} />
              </Row>
              <SliderRow label="Intensity" min={0} max={3} step={0.05} value={envIntensity} onChange={setEnvIntensity} colors={c} />
              {showAdvanced && (
                <SliderRow label="Seed" min={0} max={999} step={1} value={envSeed} onChange={v => setEnvSeed(Math.round(v))} colors={c} />
              )}
            </>
          )}

          {/* Neon Glow */}
          <SectionHeader title="Neon Glow" enabled={neonOn} onToggle={setNeonOn} colors={c} />
          {neonOn && (
            <>
              <Row>
                <Text style={[styles.label, { color: c.text }]}>Color</Text>
                <CycleButton value={NEON_COLOR_NAMES[neonColorIdx]} options={[]} onPress={() => setNeonColorIdx(i => (i + 1) % NEON_COLORS.length)} colors={c} />
              </Row>
              <SliderRow label="Intensity" min={0} max={2} step={0.05} value={neonIntensity} onChange={setNeonIntensity} colors={c} />
              <SliderRow label="Pulse Speed" min={0} max={5} step={0.1} value={neonPulseSpeed} onChange={setNeonPulseSpeed} colors={c} />
              <SliderRow label="Pulse Amplitude" min={0} max={1} step={0.01} value={neonPulseAmp} onChange={setNeonPulseAmp} colors={c} />
            </>
          )}

          {/* Metallic Preset */}
          <SectionHeader title="Metallic Preset" enabled={metallicOn} onToggle={setMetallicOn} colors={c} />
          {metallicOn && (
            <Row>
              <Text style={[styles.label, { color: c.text }]}>Preset</Text>
              <CycleButton value={metallicPreset} options={[]} onPress={() => setMetallicPreset(p => { const i = METALLIC_PRESETS.indexOf(p); return METALLIC_PRESETS[(i + 1) % METALLIC_PRESETS.length]; })} colors={c} />
            </Row>
          )}

          {/* Particle Dust */}
          <SectionHeader title="Particle Dust" enabled={dustOn} onToggle={setDustOn} colors={c} />
          {dustOn && (
            <>
              <SliderRow label="Count" min={50} max={2000} step={50} value={dustCount} onChange={v => setDustCount(Math.round(v))} colors={c} />
              <SliderRow label="Speed" min={0} max={2} step={0.05} value={dustSpeed} onChange={setDustSpeed} colors={c} />
              <SliderRow label="Size" min={0.01} max={0.3} step={0.005} value={dustSize} onChange={setDustSize} colors={c} />
              {showAdvanced && (
                <SliderRow label="Seed" min={0} max={999} step={1} value={dustSeed} onChange={v => setDustSeed(Math.round(v))} colors={c} />
              )}
            </>
          )}

          {/* Wireframe */}
          <SectionHeader title="Wireframe Overlay" enabled={wireOn} onToggle={setWireOn} colors={c} />
          {wireOn && (
            <SliderRow label="Opacity" min={0} max={1} step={0.01} value={wireOpacity} onChange={setWireOpacity} colors={c} />
          )}

          {/* Outline */}
          <SectionHeader title="Outline" enabled={outlineOn} onToggle={setOutlineOn} colors={c} />
          {outlineOn && (
            <SliderRow label="Thickness" min={1.01} max={1.2} step={0.005} value={outlineThickness} onChange={setOutlineThickness} colors={c} />
          )}

          {/* Advanced toggle */}
          <TouchableOpacity
            style={[styles.advancedToggle, { borderColor: '#555' }]}
            onPress={() => setShowAdvanced(v => !v)}
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
  controls: { flex: 1, borderTopWidth: 1, borderTopColor: "#ccc" },
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
  advancedToggle: {
    marginHorizontal: 12, marginTop: 16, borderWidth: 1, borderRadius: 6,
    paddingVertical: 8, alignItems: 'center',
  },
});
