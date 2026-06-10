import { ThreeDText } from "@/components/three-d-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    getLatestConfig,
    getPendingSyncCount,
    saveConfigOfflineFirst,
    savePreset,
    syncPendingConfigs,
    ThreeDConfig,
} from "@/utils/config-store";
import {
    BendPipe,
    BloomPipe,
    ChromaticAberrationPipe,
    ColorGradingPipe,
    DepthOfFieldPipe,
    EffectPipe,
    EnvMapPipe,
    EnvMapStyle,
    FilmGrainPipe,
    FishEyePipe,
    FloatingRingsPipe,
    GlitchPipe,
    MetallicPreset,
    MetallicPresetPipe,
    NeonGlowPipe,
    OutlinePipe,
    ParticleDustPipe,
    PixelatePipe,
    PulsePipe,
    RadialBlurPipe,
    RaysPipe,
    ScanlinesPipe,
    TwistPipe,
    VignettePipe,
    WavePipe,
    WireframePipe,
} from "@/utils/three-text-pipes";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert, SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";

const API_BASE = "http://localhost:8000";

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.controlRow}>{children}</View>;
}
function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  colors,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  colors: any;
}) {
  return (
    <View style={styles.sliderRow}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label}: {value.toFixed(step < 0.01 ? 5 : step < 0.1 ? 2 : 1)}
      </Text>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: any) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, marginLeft: 12 }}
      />
    </View>
  );
}
function SectionHeader({
  title,
  enabled,
  onToggle,
  colors,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  colors: any;
}) {
  return (
    <View
      style={[
        styles.sectionHeader,
        { borderColor: enabled ? colors.tint : "#555" },
      ]}
    >
      <Text
        style={[
          styles.sectionTitle,
          { color: enabled ? colors.tint : colors.text },
        ]}
      >
        {title}
      </Text>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: "#767577", true: colors.tint }}
        thumbColor={enabled ? colors.tint : "#f4f3f4"}
      />
    </View>
  );
}
function CycleButton({
  value,
  options,
  onPress,
  colors,
}: {
  value: string;
  options: string[];
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.methodButton, { borderColor: colors.tint }]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, { color: colors.tint }]}>{value}</Text>
    </TouchableOpacity>
  );
}

type EffectType =
  | "bloom"
  | "depthOfField"
  | "chromatic"
  | "filmGrain"
  | "glitch"
  | "fishEye"
  | "bend"
  | "envMap"
  | "neonGlow"
  | "metallicPreset"
  | "dust"
  | "wireframe"
  | "outline"
  | "rays"
  | "radialBlur"
  | "wave"
  | "twist"
  | "pulse"
  | "floatingRings"
  | "vignette"
  | "scanlines"
  | "colorGrading"
  | "pixelate";

interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  animate: boolean;
  params: Record<string, unknown>;
}

const EFFECT_TYPES: {
  type: EffectType;
  label: string;
  target?: "geometry" | "bitmap" | "post";
}[] = [
  { type: "bloom", label: "Bloom" },
  { type: "depthOfField", label: "Depth of Field" },
  { type: "chromatic", label: "Chromatic" },
  { type: "filmGrain", label: "Film Grain" },
  { type: "glitch", label: "Glitch" },
  { type: "fishEye", label: "Fish Eye" },
  { type: "bend", label: "Bend" },
  { type: "envMap", label: "Env Map", target: "geometry" },
  { type: "neonGlow", label: "Neon Glow" },
  { type: "metallicPreset", label: "Metallic", target: "geometry" },
  { type: "dust", label: "Particle Dust", target: "geometry" },
  { type: "wireframe", label: "Wireframe", target: "geometry" },
  { type: "outline", label: "Outline", target: "geometry" },
  { type: "rays", label: "Rays", target: "geometry" },
  { type: "radialBlur", label: "Radial Blur", target: "post" },
  { type: "wave", label: "Wave", target: "geometry" },
  { type: "twist", label: "Twist", target: "geometry" },
  { type: "pulse", label: "Pulse", target: "geometry" },
  { type: "floatingRings", label: "Floating Rings", target: "geometry" },
  { type: "vignette", label: "Vignette", target: "post" },
  { type: "scanlines", label: "Scanlines", target: "post" },
  { type: "colorGrading", label: "Color Grading", target: "post" },
  { type: "pixelate", label: "Pixelate", target: "post" },
];

function effectTypeLabel(type: EffectType) {
  return EFFECT_TYPES.find((item) => item.type === type)?.label ?? type;
}

function createId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createDefaultEffectParams(type: EffectType): Record<string, unknown> {
  switch (type) {
    case "bloom":
      return { strength: 0.8, threshold: 0.2, radius: 0.5 };
    case "depthOfField":
      return { focus: 15, aperture: 3, maxBlur: 0.01 };
    case "chromatic":
      return { offset: 0.005 };
    case "filmGrain":
      return { intensity: 0.35 };
    case "glitch":
      return { wildGlitch: false };
    case "fishEye":
      return { strength: 0.4, radius: 10 };
    case "bend":
      return { strength: 0.18, axis: "x" };
    case "envMap":
      return { style: "gradient", intensity: 1.5, seed: 42 };
    case "neonGlow":
      return {
        colorIdx: 0,
        intensity: 0.8,
        pulseSpeed: 1.0,
        pulseAmplitude: 0.3,
      };
    case "metallicPreset":
      return { preset: "gold" };
    case "dust":
      return { count: 500, speed: 0.5, size: 0.06, seed: 42 };
    case "wireframe":
      return { opacity: 0.25 };
    case "outline":
      return { thickness: 1.05 };
    case "rays":
        return {
          mode: "radial",
          count: 24,
          innerThickness: 0.06,
          outerThickness: 0.08,
          lockThickness: true,
          innerMargin: 2,
          outerMargin: 6,
        };
    case "radialBlur":
      return { strength: 0.12, samples: 8, center: [0.5, 0.5] };
    case "wave":
      return { amplitude: 0.5, frequency: 1.0, speed: 1.0, axis: "x" };
    case "twist":
      return { strength: 0.3, axis: "y" };
    case "pulse":
      return { amplitude: 0.12, speed: 1.0 };
    case "floatingRings":
      return { count: 3, radiusMult: 1.6, speed: 0.25, thickness: 0.04, color: 0xff8800 };
    case "vignette":
      return { offset: 0.5, darkness: 1.0 };
    case "scanlines":
      return { count: 100, intensity: 0.3, scrollSpeed: 0 };
    case "colorGrading":
      return { hueShift: 0, saturation: 1.0, contrast: 1.0, brightness: 0 };
    case "pixelate":
      return { pixelSize: 4 };
    default:
      return {};
  }
}

function createEffectInstance(type: EffectType): EffectInstance {
  return {
    id: createId(),
    type,
    enabled: true,
    animate: true,
    params: createDefaultEffectParams(type),
  };
}

function createPipeFromInstance(effect: EffectInstance): EffectPipe {
  switch (effect.type) {
    case "bloom":
      return new BloomPipe(effect.params as any);
    case "depthOfField":
      return new DepthOfFieldPipe(effect.params as any);
    case "chromatic":
      return new ChromaticAberrationPipe(effect.params as any);
    case "filmGrain":
      return new FilmGrainPipe(effect.params as any);
    case "glitch":
      return new GlitchPipe(effect.params as any);
    case "fishEye":
      return new FishEyePipe(effect.params as any);
    case "bend":
      return new BendPipe(effect.params as any);
    case "envMap":
      return new EnvMapPipe(effect.params as any);
    case "neonGlow":
      return new NeonGlowPipe(effect.params as any);
    case "metallicPreset":
      return new MetallicPresetPipe(effect.params as any);
    case "dust":
      return new ParticleDustPipe(effect.params as any);
    case "wireframe":
      return new WireframePipe(effect.params as any);
    case "outline":
      return new OutlinePipe(effect.params as any);
    case "rays":
      return new RaysPipe(effect.params as any);
    case "radialBlur":
      return new RadialBlurPipe(effect.params as any);
    case "wave":
      return new WavePipe(effect.params as any);
    case "twist":
      return new TwistPipe(effect.params as any);
    case "pulse":
      return new PulsePipe(effect.params as any);
    case "floatingRings":
      return new FloatingRingsPipe(effect.params as any);
    case "vignette":
      return new VignettePipe(effect.params as any);
    case "scanlines":
      return new ScanlinesPipe(effect.params as any);
    case "colorGrading":
      return new ColorGradingPipe(effect.params as any);
    case "pixelate":
      return new PixelatePipe(effect.params as any);
    default:
      return new FilmGrainPipe();
  }
}

function renderEffectControls(
  effect: EffectInstance,
  colors: any,
  onUpdate: (key: string, value: unknown) => void,
) {
  const params = effect.params as Record<string, unknown>;
  switch (effect.type) {
    case "bloom":
      return (
        <>
          <SliderRow
            label="Strength"
            min={0}
            max={3}
            step={0.05}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label="Threshold"
            min={0}
            max={1}
            step={0.01}
            value={params.threshold as number}
            onChange={(v) => onUpdate("threshold", v)}
            colors={colors}
          />
          <SliderRow
            label="Radius"
            min={0}
            max={1}
            step={0.01}
            value={params.radius as number}
            onChange={(v) => onUpdate("radius", v)}
            colors={colors}
          />
        </>
      );
    case "depthOfField":
      return (
        <>
          <SliderRow
            label="Focus dist"
            min={1}
            max={40}
            step={0.5}
            value={params.focus as number}
            onChange={(v) => onUpdate("focus", v)}
            colors={colors}
          />
          <SliderRow
            label="Aperture"
            min={0.5}
            max={20}
            step={0.1}
            value={params.aperture as number}
            onChange={(v) => onUpdate("aperture", v)}
            colors={colors}
          />
          <SliderRow
            label="Max Blur"
            min={0}
            max={0.05}
            step={0.001}
            value={params.maxBlur as number}
            onChange={(v) => onUpdate("maxBlur", v)}
            colors={colors}
          />
        </>
      );
    case "chromatic":
      return (
        <SliderRow
          label="Offset"
          min={0}
          max={0.02}
          step={0.0005}
          value={params.offset as number}
          onChange={(v) => onUpdate("offset", v)}
          colors={colors}
        />
      );
    case "filmGrain":
      return (
        <SliderRow
          label="Intensity"
          min={0}
          max={1}
          step={0.01}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "glitch":
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>Wild Mode</Text>
          <Switch
            value={Boolean(params.wildGlitch)}
            onValueChange={(value) => onUpdate("wildGlitch", value)}
            trackColor={{ false: "#767577", true: colors.tint }}
            thumbColor={Boolean(params.wildGlitch) ? colors.tint : "#f4f3f4"}
          />
        </Row>
      );
    case "fishEye":
      return (
        <>
          <SliderRow
            label="Strength"
            min={0}
            max={1}
            step={0.01}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label="Radius"
            min={2}
            max={30}
            step={0.5}
            value={params.radius as number}
            onChange={(v) => onUpdate("radius", v)}
            colors={colors}
          />
        </>
      );
    case "bend":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Axis</Text>
            <CycleButton
              value={(params.axis as string)?.toUpperCase() ?? "X"}
              options={[]}
              onPress={() => {
                const nextAxis =
                  params.axis === "x" ? "y" : params.axis === "y" ? "z" : "x";
                onUpdate("axis", nextAxis);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow
            label="Strength"
            min={0}
            max={0.5}
            step={0.01}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
        </>
      );
    case "envMap":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Style</Text>
            <CycleButton
              value={(params.style as string) ?? "gradient"}
              options={[]}
              onPress={() => {
                const stylesList: EnvMapStyle[] = [
                  "gradient",
                  "studio",
                  "starfield",
                  "sunset",
                  "neon",
                ];
                const idx = stylesList.indexOf(params.style as EnvMapStyle);
                onUpdate("style", stylesList[(idx + 1) % stylesList.length]);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow
            label="Intensity"
            min={0}
            max={3}
            step={0.05}
            value={params.intensity as number}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
          <SliderRow
            label="Seed"
            min={0}
            max={999}
            step={1}
            value={params.seed as number}
            onChange={(v) => onUpdate("seed", Math.round(v))}
            colors={colors}
          />
        </>
      );
    case "neonGlow":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Color</Text>
            <CycleButton
              value={
                ["Magenta", "Cyan", "Green", "Orange", "Blue"][
                  params.colorIdx as number
                ]
              }
              options={[]}
              onPress={() =>
                onUpdate("colorIdx", ((params.colorIdx as number) + 1) % 5)
              }
              colors={colors}
            />
          </Row>
          <SliderRow
            label="Intensity"
            min={0}
            max={2}
            step={0.05}
            value={params.intensity as number}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
          <SliderRow
            label="Pulse Speed"
            min={0}
            max={5}
            step={0.1}
            value={params.pulseSpeed as number}
            onChange={(v) => onUpdate("pulseSpeed", v)}
            colors={colors}
          />
          <SliderRow
            label="Pulse Amplitude"
            min={0}
            max={1}
            step={0.01}
            value={params.pulseAmplitude as number}
            onChange={(v) => onUpdate("pulseAmplitude", v)}
            colors={colors}
          />
        </>
      );
    case "metallicPreset":
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>Preset</Text>
          <CycleButton
            value={(params.preset as string) ?? "gold"}
            options={[]}
            onPress={() => {
              const presets: MetallicPreset[] = [
                "gold",
                "chrome",
                "copper",
                "holographic",
                "obsidian",
              ];
              const idx = presets.indexOf(params.preset as MetallicPreset);
              onUpdate("preset", presets[(idx + 1) % presets.length]);
            }}
            colors={colors}
          />
        </Row>
      );
    case "dust":
      return (
        <>
          <SliderRow
            label="Count"
            min={50}
            max={2000}
            step={50}
            value={params.count as number}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          <SliderRow
            label="Speed"
            min={0}
            max={2}
            step={0.05}
            value={params.speed as number}
            onChange={(v) => onUpdate("speed", v)}
            colors={colors}
          />
          <SliderRow
            label="Size"
            min={0.01}
            max={0.3}
            step={0.005}
            value={params.size as number}
            onChange={(v) => onUpdate("size", v)}
            colors={colors}
          />
          <SliderRow
            label="Seed"
            min={0}
            max={999}
            step={1}
            value={params.seed as number}
            onChange={(v) => onUpdate("seed", Math.round(v))}
            colors={colors}
          />
        </>
      );
    case "wireframe":
      return (
        <SliderRow
          label="Opacity"
          min={0}
          max={1}
          step={0.01}
          value={params.opacity as number}
          onChange={(v) => onUpdate("opacity", v)}
          colors={colors}
        />
      );
    case "outline":
      return (
        <SliderRow
          label="Thickness"
          min={1.01}
          max={1.2}
          step={0.005}
          value={params.thickness as number}
          onChange={(v) => onUpdate("thickness", v)}
          colors={colors}
        />
      );
    case "rays":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Mode</Text>
            <CycleButton
              value={(params.mode as string) ?? "radial"}
              options={[]}
              onPress={() =>
                onUpdate(
                  "mode",
                  params.mode === "radial"
                    ? "spaghetti"
                    : params.mode === "spaghetti"
                      ? "chip"
                      : "radial",
                )
              }
              colors={colors}
            />
          </Row>
          <SliderRow
            label="Count"
            min={4}
            max={128}
            step={1}
            value={params.count as number}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Inner</Text>
            <Row style={{ alignItems: 'center' }}>
              <SliderRow
                label=""
                min={0.01}
                max={0.5}
                step={0.01}
                value={params.innerThickness as number}
                onChange={(v) => {
                  if (params.lockThickness) { onUpdate('innerThickness', v); onUpdate('outerThickness', v); }
                  else onUpdate('innerThickness', v);
                }}
                colors={colors}
              />
            </Row>
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Outer</Text>
            <Row style={{ alignItems: 'center' }}>
              <SliderRow
                label=""
                min={0.01}
                max={0.5}
                step={0.01}
                value={params.outerThickness as number}
                onChange={(v) => {
                  if (params.lockThickness) { onUpdate('outerThickness', v); onUpdate('innerThickness', v); }
                  else onUpdate('outerThickness', v);
                }}
                colors={colors}
              />
              <TouchableOpacity
                style={[styles.smallActionButton, { marginLeft: 8 }]}
                onPress={() => onUpdate('lockThickness', !Boolean(params.lockThickness))}
              >
                <Text style={[styles.buttonText, { color: colors.tint }]}>{params.lockThickness ? '🔒' : '🔓'}</Text>
              </TouchableOpacity>
            </Row>
          </Row>
          <SliderRow
            label="Inner Margin"
            min={0}
            max={20}
            step={0.1}
            value={params.innerMargin as number}
            onChange={(v) => onUpdate("innerMargin", v)}
            colors={colors}
          />
          <SliderRow
            label="Outer Margin"
            min={0}
            max={40}
            step={0.1}
            value={params.outerMargin as number}
            onChange={(v) => onUpdate("outerMargin", v)}
            colors={colors}
          />
        </>
      );
    case "radialBlur":
      return (
        <>
          <SliderRow
            label="Strength"
            min={0}
            max={1}
            step={0.01}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label="Samples"
            min={1}
            max={32}
            step={1}
            value={params.samples as number}
            onChange={(v) => onUpdate("samples", Math.round(v))}
            colors={colors}
          />
        </>
      );
    case "wave":
      return (
        <>
          <SliderRow label="Amplitude" min={0} max={3} step={0.05}
            value={params.amplitude as number} onChange={(v) => onUpdate("amplitude", v)} colors={colors} />
          <SliderRow label="Frequency" min={0.1} max={5} step={0.05}
            value={params.frequency as number} onChange={(v) => onUpdate("frequency", v)} colors={colors} />
          <SliderRow label="Speed" min={0} max={5} step={0.1}
            value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Axis</Text>
            <CycleButton value={(params.axis as string) ?? "x"} options={[]}
              onPress={() => onUpdate("axis", params.axis === "x" ? "y" : "x")} colors={colors} />
          </Row>
        </>
      );
    case "twist":
      return (
        <>
          <SliderRow label="Strength" min={-3} max={3} step={0.05}
            value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Axis</Text>
            <CycleButton value={(params.axis as string) ?? "y"} options={[]}
              onPress={() => onUpdate("axis", params.axis === "x" ? "y" : params.axis === "y" ? "z" : "x")} colors={colors} />
          </Row>
        </>
      );
    case "pulse":
      return (
        <>
          <SliderRow label="Amplitude" min={0} max={0.5} step={0.01}
            value={params.amplitude as number} onChange={(v) => onUpdate("amplitude", v)} colors={colors} />
          <SliderRow label="Speed" min={0.1} max={5} step={0.1}
            value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
        </>
      );
    case "floatingRings":
      return (
        <>
          <SliderRow label="Count" min={1} max={6} step={1}
            value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          <SliderRow label="Radius" min={0.5} max={4} step={0.05}
            value={params.radiusMult as number} onChange={(v) => onUpdate("radiusMult", v)} colors={colors} />
          <SliderRow label="Speed" min={0} max={2} step={0.05}
            value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <SliderRow label="Thickness" min={0.01} max={0.15} step={0.005}
            value={params.thickness as number} onChange={(v) => onUpdate("thickness", v)} colors={colors} />
        </>
      );
    case "vignette":
      return (
        <>
          <SliderRow label="Offset" min={0} max={1} step={0.01}
            value={params.offset as number} onChange={(v) => onUpdate("offset", v)} colors={colors} />
          <SliderRow label="Darkness" min={0} max={5} step={0.1}
            value={params.darkness as number} onChange={(v) => onUpdate("darkness", v)} colors={colors} />
        </>
      );
    case "scanlines":
      return (
        <>
          <SliderRow label="Count" min={10} max={400} step={5}
            value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          <SliderRow label="Intensity" min={0} max={1} step={0.01}
            value={params.intensity as number} onChange={(v) => onUpdate("intensity", v)} colors={colors} />
          <SliderRow label="Scroll" min={0} max={3} step={0.05}
            value={params.scrollSpeed as number} onChange={(v) => onUpdate("scrollSpeed", v)} colors={colors} />
        </>
      );
    case "colorGrading":
      return (
        <>
          <SliderRow label="Hue Shift" min={0} max={1} step={0.01}
            value={params.hueShift as number} onChange={(v) => onUpdate("hueShift", v)} colors={colors} />
          <SliderRow label="Saturation" min={0} max={3} step={0.05}
            value={params.saturation as number} onChange={(v) => onUpdate("saturation", v)} colors={colors} />
          <SliderRow label="Contrast" min={0} max={3} step={0.05}
            value={params.contrast as number} onChange={(v) => onUpdate("contrast", v)} colors={colors} />
          <SliderRow label="Brightness" min={-0.5} max={0.5} step={0.01}
            value={params.brightness as number} onChange={(v) => onUpdate("brightness", v)} colors={colors} />
        </>
      );
    case "pixelate":
      return (
        <SliderRow label="Pixel Size" min={1} max={32} step={1}
          value={params.pixelSize as number} onChange={(v) => onUpdate("pixelSize", Math.round(v))} colors={colors} />
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
  const [text, setText] = useState(
    "Hi\nHello World\nThis is a very long line of text",
  );
  const [equalizeLineWidths, setEqualizeLineWidths] = useState(false);
  const [equalizationMethod, setEqualizationMethod] = useState<
    "spacing" | "fontSize"
  >("fontSize");
  const [targetWidth, setTargetWidth] = useState(20);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [effectInstances, setEffectInstances] = useState<EffectInstance[]>([]);
  const [selectedEffectType, setSelectedEffectType] =
    useState<EffectType>("bloom");
  const [selectedEffectSearch, setSelectedEffectSearch] = useState("");
  const [lastDeleted, setLastDeleted] = useState<{
    item: EffectInstance;
    index: number;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
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
      .map((instance) => {
        const pipe = createPipeFromInstance(instance);
        pipe.paused = !(instance.animate ?? true);
        return pipe;
      });
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
      return (
        layout && centerY >= layout.y && centerY <= layout.y + layout.height
      );
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

  const addEffectInstance = (type?: EffectType) => {
    const t = type ?? selectedEffectType;
    setEffectInstances((instances) => [
      ...instances,
      createEffectInstance(t),
    ]);
  };

  function generatePresetName(instances: EffectInstance[]) {
    if (instances.length === 0) return "No effects";
    const counts: Record<string, number> = {};
    instances.forEach((i) => {
      const lbl = effectTypeLabel(i.type);
      counts[lbl] = (counts[lbl] || 0) + 1;
    });
    const parts = Object.entries(counts).map(([label, n]) =>
      n > 1 ? `${n}x ${label}` : `${label}`,
    );
    return parts.join(", ");
  }

  const handleSavePreset = async () => {
    try {
      const name = generatePresetName(effectInstances.filter((i) => i.enabled));
      const preset = {
        id: `preset-${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        effects: effectInstances,
      };
      await savePreset(preset as any);
      setSaveStatus(`Saved preset: ${name}`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus(
        `Save preset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const draggingItem = effectInstances.find(
    (instance) => instance.id === draggingId,
  );

  const updateEffectParam = (id: string, key: string, value: unknown) => {
    setEffectInstances((instances) =>
      instances.map((instance) =>
        instance.id === id
          ? { ...instance, params: { ...instance.params, [key]: value } }
          : instance,
      ),
    );
  };

  const toggleEffectEnabled = (id: string) => {
    setEffectInstances((instances) =>
      instances.map((instance) =>
        instance.id === id
          ? { ...instance, enabled: !instance.enabled }
          : instance,
      ),
    );
  };

  const toggleEffectAnimate = (id: string) => {
    setEffectInstances((instances) =>
      instances.map((instance) =>
        instance.id === id
          ? { ...instance, animate: !(instance.animate ?? true) }
          : instance,
      ),
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
    const performDelete = () => {
      setEffectInstances((instances) => {
        const index = instances.findIndex((i) => i.id === id);
        if (index < 0) return instances;
        const item = instances[index];
        const next = instances.filter((instance) => instance.id !== id);
        setLastDeleted({ item, index });
        if (undoTimerRef.current) {
          clearTimeout(undoTimerRef.current);
        }
        // clear after 6s
        // @ts-ignore - window.setTimeout returns number
        undoTimerRef.current = window.setTimeout(() => {
          setLastDeleted(null);
          undoTimerRef.current = null;
        }, 6000) as any;
        return next;
      });
    };

    // confirmation dialog for delete
    if (typeof Alert !== "undefined" && Alert.alert) {
      Alert.alert(
        "Delete effect",
        "Are you sure you want to delete this effect instance?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => performDelete(),
          },
        ],
      );
    } else if (typeof window !== "undefined" && window.confirm) {
      if (window.confirm("Delete effect?")) performDelete();
    } else {
      performDelete();
    }
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setEffectInstances((instances) => {
      const next = [...instances];
      next.splice(lastDeleted.index, 0, lastDeleted.item);
      return next;
    });
    setLastDeleted(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
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
        setShowAdvanced(latest.showAdvanced);

        const savedEffects = (latest as any).effectInstances as
          | EffectInstance[]
          | undefined;
        if (Array.isArray(savedEffects)) {
          setEffectInstances(
            savedEffects.map((item) => ({
              ...item,
              enabled: item.enabled ?? true,
              animate: item.animate ?? true,
              params: item.params ?? {},
            })),
          );
        } else {
          setEffectInstances([]);
        }

        setSaveStatus("Restored last saved configuration.");
      } catch (error) {
        console.warn("Unable to load last configuration:", error);
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

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", syncOnOnline);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("online", syncOnOnline);
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
    effectInstances,
    showAdvanced,
  });

  const handleSaveConfig = async () => {
    setSaveStatus("Saving configuration...");
    const config = buildCurrentConfig();

    try {
      const result = await saveConfigOfflineFirst(config, API_BASE);
      if (result.synced) {
        setSaveStatus("Saved locally and synced to the backend.");
      } else {
        setSaveStatus(
          `Saved locally. Will sync later. ${result.error ?? ""}`.trim(),
        );
      }
    } catch (error) {
      setSaveStatus(
        `Save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    refreshPending();
  };

  const handleSyncPending = async () => {
    setSaveStatus("Syncing pending configurations...");
    try {
      await syncPendingConfigs(API_BASE);
      setSaveStatus("Pending configurations synced successfully.");
    } catch (error) {
      setSaveStatus(
        `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
            pipes={activePipes}
          />
        </View>

        <ScrollView
          style={styles.controls}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* ── Text input ── */}
          <TextInput
            style={[
              styles.textInput,
              {
                color: c.text,
                borderColor: c.tint,
                backgroundColor: colorScheme === "dark" ? "#2a2a2a" : "#f5f5f5",
              },
            ]}
            placeholder="Enter multi-line text for 3D rendering"
            placeholderTextColor={colorScheme === "dark" ? "#999" : "#ccc"}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={3}
          />

          {/* ── Base geometry ── */}
          <Text style={[styles.groupLabel, { color: c.text }]}>Geometry</Text>
          <Row>
            <Text style={[styles.label, { color: c.text }]}>
              Equalize Line Widths
            </Text>
            <Switch
              value={equalizeLineWidths}
              onValueChange={setEqualizeLineWidths}
              trackColor={{ false: "#767577", true: c.tint }}
              thumbColor={equalizeLineWidths ? c.tint : "#f4f3f4"}
            />
          </Row>
          {equalizeLineWidths && (
            <>
              <Row>
                <Text style={[styles.label, { color: c.text }]}>
                  Method: {equalizationMethod}
                </Text>
                <CycleButton
                  value="Switch"
                  options={[]}
                  onPress={() =>
                    setEqualizationMethod((m) =>
                      m === "spacing" ? "fontSize" : "spacing",
                    )
                  }
                  colors={c}
                />
              </Row>
              <SliderRow
                label="Target Width"
                min={5}
                max={40}
                step={0.1}
                value={targetWidth}
                onChange={setTargetWidth}
                colors={c}
              />
            </>
          )}
          <SliderRow
            label="Line Spacing"
            min={0.5}
            max={4}
            step={0.01}
            value={lineSpacing}
            onChange={setLineSpacing}
            colors={c}
          />
          {/* ── Effects ── */}
          <Text style={[styles.groupLabel, { color: c.text }]}>
            Effects (composable pipes)
          </Text>
          <View style={styles.effectListContainer}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginHorizontal: 12,
              }}
            >
              <Text style={[styles.label, { color: c.text }]}>
                Pipeline presets
              </Text>
              <TouchableOpacity
                style={[styles.smallActionButton, { borderColor: c.tint }]}
                onPress={handleSavePreset}
              >
                <Text style={[styles.buttonText, { color: c.tint }]}>
                  Save preset
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.effectControlRow}>
              <Text style={[styles.label, { color: c.text, flex: 1 }]}>
                Add effect
              </Text>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[
                    styles.searchInput,
                    { borderColor: c.tint, color: c.text },
                  ]}
                  placeholder="Search effects..."
                  placeholderTextColor={
                    colorScheme === "dark" ? "#666" : "#999"
                  }
                  value={selectedEffectSearch}
                  onChangeText={setSelectedEffectSearch}
                />
                {selectedEffectSearch.length > 0 ? (
                  <View
                    style={[styles.effectSearchList, { borderColor: c.tint }]}
                  >
                    {EFFECT_TYPES.filter((e) =>
                      (e.label + " " + e.type)
                        .toLowerCase()
                        .includes(selectedEffectSearch.toLowerCase()),
                    ).map((e) => (
                      <TouchableOpacity
                        key={e.type}
                        style={styles.effectSearchItem}
                        onPress={() => {
                          addEffectInstance(e.type);
                          setSelectedEffectSearch("");
                        }}
                      >
                        <Text style={{ color: c.text }}>{e.label}</Text>
                        {e.target && (
                          <Text style={{ color: "#888", fontSize: 11 }}>
                            {" "}
                            {" " +
                              (e.target === "geometry"
                                ? "G"
                                : e.target === "post"
                                  ? "P"
                                  : "B")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      marginTop: 8,
                    }}
                  >
                    {EFFECT_TYPES.map((e) => (
                      <TouchableOpacity
                        key={e.type}
                        style={[
                          styles.effectPill,
                          {
                            borderColor: c.tint,
                            backgroundColor:
                              colorScheme === "dark" ? "#222" : "#fff",
                          },
                        ]}
                        onPress={() => addEffectInstance(e.type)}
                      >
                        <Text
                          style={[styles.effectPillText, { color: c.text }]}
                        >
                          {e.label}
                        </Text>
                        {e.target && (
                          <View
                            style={[
                              styles.targetBadge,
                              {
                                backgroundColor:
                                  e.target === "geometry"
                                    ? "#4caf50"
                                    : e.target === "post"
                                      ? "#2196f3"
                                      : "#9c27b0",
                              },
                            ]}
                          >
                            <Text style={{ color: "#fff", fontSize: 10 }}>
                              {e.target === "geometry"
                                ? "G"
                                : e.target === "post"
                                  ? "P"
                                  : "B"}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Undo banner if recently deleted */}
            {lastDeleted && (
              <View
                style={{
                  marginHorizontal: 12,
                  marginVertical: 6,
                  padding: 8,
                  borderWidth: 1,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderColor: c.tint,
                  backgroundColor: colorScheme === "dark" ? "#161616" : "#fff",
                }}
              >
                <Text style={{ color: c.text }}>
                  Deleted {effectTypeLabel(lastDeleted.item.type)}
                </Text>
                <TouchableOpacity
                  onPress={undoDelete}
                  style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: c.tint }}>Undo</Text>
                </TouchableOpacity>
              </View>
            )}

            {effectInstances.length === 0 && (
              <Text style={[styles.helpText, { color: c.text }]}>
                No effect instances yet. Add one to start building a pipeline.
              </Text>
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
                pointerEvents={draggingId === instance.id ? "none" : "auto"}
                style={[
                  styles.effectCard,
                  {
                    borderColor: c.tint,
                    backgroundColor:
                      colorScheme === "dark" ? "#1f1f1f" : "#fafafa",
                  },
                  draggingId === instance.id && styles.hiddenItem,
                ]}
              >
                <View style={styles.effectCardHeader}>
                  <GestureDetector gesture={createDragGesture(instance.id)}>
                    <View style={styles.dragHandle}>
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        ≡
                      </Text>
                    </View>
                  </GestureDetector>
                  <View style={{ flex: 1 }}>
                    <SectionHeader
                      title={`${index + 1}. ${effectTypeLabel(instance.type)}`}
                      enabled={instance.enabled}
                      onToggle={() => toggleEffectEnabled(instance.id)}
                      colors={c}
                    />
                  </View>
                  <Row>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => toggleEffectAnimate(instance.id)}
                    >
                      <Text style={[styles.buttonText, { color: (instance.animate ?? true) ? c.tint : "#666" }]}>
                        {(instance.animate ?? true) ? "▶" : "⏸"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => duplicateEffectInstance(instance.id)}
                    >
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        ⧉
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => moveEffect(instance.id, -1)}
                    >
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        ↑
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => moveEffect(instance.id, 1)}
                    >
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        ↓
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => removeEffectInstance(instance.id)}
                    >
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </Row>
                </View>
                {instance.enabled &&
                  renderEffectControls(instance, c, (key, value) =>
                    updateEffectParam(instance.id, key, value),
                  )}
              </View>
            ))}

            {draggingItem && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.effectCard,
                  styles.draggingOverlay,
                  {
                    borderColor: c.tint,
                    backgroundColor:
                      colorScheme === "dark" ? "#1f1f1f" : "#fafafa",
                  },
                  dragOverlayStyle,
                ]}
              >
                <View style={styles.effectCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.sectionTitle, { color: c.tint }]}
                    >{`Dragging: ${effectTypeLabel(draggingItem.type)}`}</Text>
                  </View>
                </View>
                {renderEffectControls(draggingItem, c, () => undefined)}
              </Animated.View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.advancedToggle, { borderColor: "#555" }]}
            onPress={() => setShowAdvanced((v) => !v)}
          >
            <Text style={[styles.buttonText, { color: "#888" }]}>
              {showAdvanced ? "▲ Hide Advanced" : "▼ Show Advanced (seeds)"}
            </Text>
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
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    margin: 12,
    marginBottom: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    opacity: 0.6,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600" },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 3,
    paddingHorizontal: 4,
  },
  label: { fontSize: 13, fontWeight: "500", minWidth: 130 },
  methodButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  buttonText: { fontSize: 12, fontWeight: "500" },
  effectGrid: {
    flexDirection: "column",
    marginHorizontal: 8,
  },
  effectListContainer: {
    position: "relative",
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
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  effectSearchItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  effectPill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  effectPillText: { fontSize: 13, marginRight: 8 },
  targetBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandle: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    borderColor: "#888",
    alignItems: "center",
    justifyContent: "center",
  },
  draggingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  hiddenItem: {
    opacity: 0,
  },
  effectControlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    flexBasis: "auto",
    maxWidth: 320,
    marginBottom: 8,
    marginRight: 8,
    alignSelf: "flex-start",
  },
  advancedToggle: {
    marginHorizontal: 12,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
});
