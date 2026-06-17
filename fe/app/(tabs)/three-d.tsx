import { AiEffectChatModal } from "@/components/AiEffectChatModal";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { ExportModal } from "@/components/ExportModal";
import { ImagePickerModal } from "@/components/ImagePickerModal";
import { ThreeDText, ThreeDTextHandle } from "@/components/three-d-text";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThreeDStore } from "@/store/three-d-store";
import { useSoundscapeStore } from "@/store/soundscape-store";
import {
  consumePendingPresetToLoad,
  deletePreset,
  deletePresetFromBackend,
  getLatestConfig,
  getPendingSyncCount,
  getPresets,
  loadPresetsFromBackend,
  PresetRecord,
  getTriedEffects,
  recordTriedEffect,
  saveConfigOfflineFirst,
  savePreset,
  savePresetOfflineFirst,
  syncPendingConfigs,
  ThreeDConfig,
} from "@/utils/config-store";
import { createEffectInstance, createId } from "@/utils/effect-defaults";
import { isSvgDataUrl, processSvgDataUrl } from "@/utils/image-sources";
import {
  SlideImage,
  SlideImageOverlay,
  SlideImagePosition,
  slideImageStyle,
} from "@/components/SlideImageOverlay";
import { createPipeFromInstance } from "@/utils/pipe-factory";
import { SUPPORTED_LANGUAGES } from "@/utils/i18n";
import {
  AVAILABLE_FONTS,
  DEFAULT_3D_FONT_FAMILY,
  registerCustomFontUrl,
} from "@/utils/three-text-geometry";
import {
  AcidPipe,
  AmbientPulsePipe,
  AnimChromaticPipe,
  AntialiasingPipe,
  AuraPipe,
  BackgroundPlanePipe,
  // vertex deform
  BendPipe,
  // post-process
  BloomPipe,
  BlurPipe,
  BouncePipe,
  BreathePipe,
  BulgePipe,
  ChromaticAberrationPipe,
  ChromeEdgePipe,
  CircularBlurPipe,
  ColorBurnPipe,
  ColorCycleLightPipe,
  ColorGradingPipe,
  ColorOverlayPipe,
  CometTrailPipe,
  ConfettiPipe,
  CrosshatchPipe,
  CrtCurvaturePipe,
  CrumplePipe,
  // ai-generated
  CustomJsPipe,
  CylindrizePipe,
  DepthLinesPipe,
  DepthOfFieldPipe,
  DiscoPipe,
  DissolveAnimPipe,
  DramaticLightPipe,
  DuotonePipe,
  EchoCopiesPipe,
  // base
  EffectPipe,
  EmbossPipe,
  EmissivePulsePipe,
  // material
  EnvMapPipe,
  EnvMapStyle,
  ExplodePipe,
  FigureEightPipe,
  FilmGrainPipe,
  FishEyePipe,
  FlatShadePipe,
  FlickerPipe,
  FlipCoinPipe,
  FloatDriftPipe,
  FloatingCubesPipe,
  FloatingRingsPipe,
  FogEffectPipe,
  FoldPipe,
  FrostedGlassPipe,
  GlassPipe,
  GlitchBlockPipe,
  GlitchPipe,
  GlowEdgePipe,
  GradientMeshPipe,
  GraphicsPipe,
  GridFloorPipe,
  GrowPipe,
  HalftonePipe,
  HologramPipe,
  InflatePipe,
  InvertPipe,
  IridescentPipe,
  JitterPipe,
  KaleidoscopePostPipe,
  LensDistortPipe,
  LevitationPipe,
  LightningFlashPipe,
  MainTextPipe,
  MatcapPipe,
  MeltPipe,
  MetallicPreset,
  MetallicPresetPipe,
  MirrorHPipe,
  MirrorPlanePipe,
  MirrorVPipe,
  MoonLightPipe,
  MosaicPipe,
  NeonGlowPipe,
  NightVisionPipe,
  NoisePostPipe,
  NoiseWobblePipe,
  OldFilmPipe,
  OrbitAnimPipe,
  OrbiterPipe,
  OutlinePipe,
  // scene objects
  ParticleDustPipe,
  PendulumPipe,
  PinchPipe,
  PixelatePipe,
  PixelShiftPipe,
  PortalRingPipe,
  PosterizePipe,
  // animation
  PulsePipe,
  RadialBlurPipe,
  RainbowLightsPipe,
  RainbowMeshPipe,
  RainPipe,
  RaysPipe,
  DEFAULT_STAR_SVG,
  DEFAULT_HEART_SVG,
  DEFAULT_LIGHTNING_SVG,
  RetroTvPipe,
  RgbShiftPipe,
  RimLightPipe,
  RipplePipe,
  RockPipe,
  ScanlinesPipe,
  SepiaPipe,
  ShadowFloorPipe,
  SharpenPipe,
  ShearPipe,
  ShrinkPipe,
  SketchPipe,
  SnowPipe,
  SobelEdgePipe,
  SparklePipe,
  SpeedLinesPipe,
  SpherifyPipe,
  SpikesPipe,
  SpinPipe,
  SpiralDeformPipe,
  // lighting
  SpotlightPipe,
  SquishPipe,
  StarField3dPipe,
  StrobePipe,
  StudioLightPipe,
  SunsetLightPipe,
  SwayPipe,
  SwingPipe,
  TaperPipe,
  Text3dPipe,
  ThermalPipe,
  ThresholdPipe,
  ToonShadingPipe,
  TremplePipe,
  TwistPipe,
  VhsTrackingPipe,
  VignettePipe,
  VoxelizePipe,
  WaterRipplePipe,
  WavePipe,
  WigglePipe,
  TessellatePipe,
  WingsPipe,
  FirePipe,
  SmokePipe,
  SkySpherePipe,
  SkyStyle,
  WireframePipe,
  XRayPipe,
  ZapPipe,
  ZoomBlurPipe,
} from "@/utils/three-text-pipes";
import { useFocusEffect, router } from "expo-router";
import { nanoid } from "nanoid/non-secure";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { API_BASE } from '@/utils/api-config';
const DEFAULT_MAIN_TEXT = "Hi\nHello World\nThis is a very long line of text";
const DEFAULT_SEQUENCE_LINE_DURATION_MS = 1600;
const MAX_SEQUENCE_ITEM_DURATION_MS = 8500;


type PrincipalTextSet = {
  id: string;
  name: string;
  text: string;
  images?: SlideImage[];
  soundscape?: import('@/store/soundscape-store').SoundscapeConfig;
  configOverride?: { effectInstances?: import('@/utils/config-store').EffectInstance[] };
};

type SequencePage = {
  id: string;
  setName: string;
  text: string;
  durationMs: number;
  transition: "flare" | "slide" | "zoom" | "wipe";
  soundscape?: import('@/store/soundscape-store').SoundscapeConfig;
  configOverride?: { effectInstances?: import('@/utils/config-store').EffectInstance[] };
  images?: SlideImage[];
};

function normalizePrincipalTextSets(
  params: Record<string, unknown>,
): PrincipalTextSet[] {
  const rawSets = params.textSets;
  if (Array.isArray(rawSets) && rawSets.length > 0) {
    return rawSets.map((set, index) => {
      const item = (set ?? {}) as Record<string, unknown>;
      // Normalise images array, migrating legacy single-image fields
      let images: SlideImage[] = [];
      if (Array.isArray(item.images)) {
        images = item.images
          .filter((img: any) => typeof img?.imageUrl === "string")
          .map((img: any) => ({
            id: String(img.id || createId()),
            imageUrl: img.imageUrl as string,
            imagePosition: (img.imagePosition as SlideImagePosition) ?? "bottom-right",
            opacity: typeof img.opacity === "number" ? img.opacity : 1,
            contrast: typeof img.contrast === "number" ? img.contrast : 1,
            brightness: typeof img.brightness === "number" ? img.brightness : 1,
            scale: typeof img.scale === "number" ? img.scale : 1,
            svgColor: typeof img.svgColor === "string" ? img.svgColor : undefined,
            svgStrokeWidth: typeof img.svgStrokeWidth === "number" ? img.svgStrokeWidth : undefined,
          }));
      } else if (typeof item.imageUrl === "string") {
        images = [{
          id: createId(),
          imageUrl: item.imageUrl as string,
          imagePosition: (item.imagePosition as SlideImagePosition) ?? "bottom-right",
          opacity: 1, contrast: 1, brightness: 1, scale: 1,
        }];
      }
      return {
        id: String(item.id || `set-${index + 1}`),
        name: String(item.name || `Set ${index + 1}`),
        text: String(item.text ?? ""),
        images,
        soundscape: (item.soundscape as any) ?? undefined,
        configOverride: (item.configOverride as any) ?? undefined,
      };
    });
  }

  return [
    {
      id: "default",
      name: "Set 1",
      text: String(params.text ?? DEFAULT_MAIN_TEXT),
    },
  ];
}

function getActivePrincipalTextSet(
  params: Record<string, unknown>,
): PrincipalTextSet {
  const sets = normalizePrincipalTextSets(params);
  const activeId =
    typeof params.activeTextSetId === "string" ? params.activeTextSetId : "";
  return sets.find((set) => set.id === activeId) ?? sets[0];
}

function getPrincipalText(params: Record<string, unknown>): string {
  return getActivePrincipalTextSet(params).text;
}

function estimateSequenceDurationMs(text: string, minimumMs: number): number {
  const clean = text.trim();
  const words = clean.split(/\s+/).filter(Boolean).length;
  const punctuationBonus = /[.!?;:]$/.test(clean) ? 450 : 0;
  const duration =
    minimumMs +
    clean.length * 36 +
    words * 95 +
    punctuationBonus;
  return Math.max(
    minimumMs,
    Math.min(MAX_SEQUENCE_ITEM_DURATION_MS, Math.round(duration)),
  );
}

function getSequencePages(
  textSets: PrincipalTextSet[],
  minimumDurationMs: number,
): SequencePage[] {
  const transitions: SequencePage["transition"][] = [
    "flare",
    "slide",
    "zoom",
    "wipe",
  ];
  const pages = textSets
    .filter((set) => set.text.trim().length > 0)
    .map((set, setIndex) => ({
      id: set.id,
      setName: set.name,
      text: set.text,
      durationMs: estimateSequenceDurationMs(set.text, minimumDurationMs),
      transition: transitions[setIndex % transitions.length],
      images: set.images,
      soundscape: set.soundscape,
      configOverride: set.configOverride,
    }));
  return pages.length > 0
    ? pages
    : [
        {
          id: "empty",
          setName: "Set 1",
          text: " ",
          durationMs: minimumDurationMs,
          transition: "flare",
        },
      ];
}

function playGongSound(audioContextRef: React.MutableRefObject<AudioContext | null>) {
  if (typeof window === "undefined") return;
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) return;
  try {
    const ctx = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = ctx;
    ctx.resume?.().catch(() => undefined);
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(1.0, now + 0.008);  // hard slam
    master.gain.exponentialRampToValueAtTime(0.7, now + 0.05);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 6.0); // long ring
    master.connect(ctx.destination);

    // Inharmonic metallic partials (large gong ratios)
    const base = 80; // lower fundamental = bigger gong
    const partials = [
      { ratio: 1.0,   gain: 1.0,  decay: 6.0 },
      { ratio: 1.72,  gain: 0.75, decay: 4.5 },
      { ratio: 2.46,  gain: 0.55, decay: 3.2 },
      { ratio: 3.13,  gain: 0.38, decay: 2.3 },
      { ratio: 4.57,  gain: 0.22, decay: 1.5 },
      { ratio: 6.21,  gain: 0.14, decay: 1.0 },
      { ratio: 8.04,  gain: 0.07, decay: 0.6 },
    ];

    for (const { ratio, gain, decay } of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * ratio, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }

    // Heavy strike transient — broad noise burst
    const bufLen = Math.ceil(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);
    const noise = ctx.createBufferSource();
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.setValueAtTime(base * 2.5, now);
    nf.Q.setValueAtTime(0.5, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noise.buffer = buf;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(now);
  } catch (error) {
    console.warn("Unable to play gong sound:", error);
  }
}

function playSequencePageSound(
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  pageIndex: number,
) {
  if (typeof window === "undefined") return;
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    const ctx = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = ctx;
    ctx.resume?.().catch(() => undefined);
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(90, now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.24, now + 0.035);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    master.connect(filter);
    filter.connect(ctx.destination);

    const base = 174.61 * Math.pow(2, (pageIndex % 5) / 12);
    [1, 1.5, 2.25].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(base * ratio * 0.75, now);
      osc.frequency.exponentialRampToValueAtTime(base * ratio * 1.7, now + 0.24);
      gain.gain.setValueAtTime(0.0001, now + i * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.18 / (i + 1), now + 0.06 + i * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52 + i * 0.08);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + i * 0.025);
      osc.stop(now + 0.9);
    });

    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(base * 5, now + 0.05);
    shimmer.frequency.exponentialRampToValueAtTime(base * 8, now + 0.55);
    shimmerGain.gain.setValueAtTime(0.0001, now + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.08, now + 0.12);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(master);
    shimmer.start(now + 0.05);
    shimmer.stop(now + 0.85);
  } catch (error) {
    console.warn("Unable to play sequence sound:", error);
  }
}

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
  rightWidget,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  colors: any;
  rightWidget?: React.ReactNode;
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
      {rightWidget}
    </View>
  );
}

/**
 * Two sliders with a padlock button on the second one.
 * When locked, editing either value mirrors it to the other.
 * Reusable for any pair of linked numeric params.
 */
function LinkedSliderPair({
  label1,
  label2,
  min,
  max,
  step,
  value1,
  value2,
  onChange1,
  onChange2,
  locked,
  onLockToggle,
  colors,
}: {
  label1: string;
  label2: string;
  min: number;
  max: number;
  step: number;
  value1: number;
  value2: number;
  onChange1: (v: number) => void;
  onChange2: (v: number) => void;
  locked: boolean;
  onLockToggle: () => void;
  colors: any;
}) {
  const handle1 = (v: number) => {
    onChange1(v);
    if (locked) onChange2(v);
  };
  const handle2 = (v: number) => {
    onChange2(v);
    if (locked) onChange1(v);
  };
  const lockBtn = (
    <TouchableOpacity onPress={onLockToggle} style={styles.smallActionButton}>
      <Text style={[styles.buttonText, { color: colors.tint }]}>
        {locked ? "🔒" : "🔓"}
      </Text>
    </TouchableOpacity>
  );
  return (
    <>
      <SliderRow
        label={label1}
        min={min}
        max={max}
        step={step}
        value={value1}
        onChange={handle1}
        colors={colors}
      />
      <SliderRow
        label={label2}
        min={min}
        max={max}
        step={step}
        value={value2}
        onChange={handle2}
        colors={colors}
        rightWidget={lockBtn}
      />
    </>
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

function DebouncedTextInput({
  value,
  onCommit,
  delay = 600,
  style,
  placeholder,
  placeholderTextColor,
  multiline,
}: {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
  style?: any;
  placeholder?: string;
  placeholderTextColor?: string;
  multiline?: boolean;
}) {
  const [local, setLocal] = React.useState(value);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onCommit(v), delay);
  };

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <TextInput
      style={style}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      value={local}
      onChangeText={handleChange}
      multiline={multiline}
    />
  );
}

type EffectType =
  // primary text
  | "mainText"
  // post-process
  | "bloom"
  | "depthOfField"
  | "chromatic"
  | "filmGrain"
  | "glitch"
  | "vignette"
  | "scanlines"
  | "colorGrading"
  | "pixelate"
  | "radialBlur"
  | "circularBlur"
  | "sepia"
  | "invert"
  | "sobelEdge"
  | "thermal"
  | "nightVision"
  | "duotone"
  | "posterize"
  | "colorOverlay"
  | "halftone"
  | "sharpen"
  | "animChromatic"
  | "blur"
  | "lensDistort"
  | "mosaic"
  | "noisePost"
  | "crtCurvature"
  | "vhsTracking"
  | "glowEdge"
  | "acid"
  | "kaleidoscopePost"
  | "oldFilm"
  | "zoomBlur"
  | "crosshatch"
  | "glitchBlock"
  | "speedLines"
  | "rgbShift"
  | "frostedGlass"
  | "waterRipple"
  | "pixelShift"
  | "retroTv"
  | "antialiasing"
  // vertex deform
  | "fishEye"
  | "bend"
  | "wave"
  | "twist"
  | "inflate"
  | "taper"
  | "shear"
  | "spherify"
  | "ripple"
  | "melt"
  | "pinch"
  | "voxelize"
  | "crumple"
  | "noiseWobble"
  | "spiralDeform"
  | "bulge"
  | "squish"
  | "zap"
  | "explode"
  | "fold"
  | "spikes"
  | "cylindrize"
  // material
  | "envMap"
  | "neonGlow"
  | "metallicPreset"
  | "xRay"
  | "toonShading"
  | "hologram"
  | "gradientMesh"
  | "rainbowMesh"
  | "iridescent"
  | "emissivePulse"
  | "dissolveAnim"
  | "glass"
  | "matcap"
  // lighting
  | "spotlight"
  | "strobe"
  | "flicker"
  | "colorCycleLight"
  | "disco"
  | "ambientPulse"
  | "rimLight"
  | "dramaticLight"
  | "lightningFlash"
  | "rainbowLights"
  // scene objects
  | "dust"
  | "wireframe"
  | "outline"
  | "echoCopies"
  | "rays"
  | "floatingRings"
  | "starField3d"
  | "snow"
  | "rain"
  | "confetti"
  | "sparkle"
  | "aura"
  | "gridFloor"
  | "orbiter"
  | "portalRing"
  | "cometTrail"
  | "floatingCubes"
  | "mirrorPlane"
  // animation
  | "pulse"
  | "spin"
  | "bounce"
  | "levitation"
  | "swing"
  | "tremble"
  | "breathe"
  | "wiggle"
  | "floatDrift"
  | "flipCoin"
  | "grow"
  | "shrink"
  | "orbitAnim"
  | "rock"
  | "jitter"
  | "sway"
  | "figureEight"
  | "pendulum"
  // ai-generated
  | "customJs"
  // added effects
  | "tessellate"
  | "text3d"
  | "graphics"
  | "wings"
  | "fire"
  | "smoke"
  | "skySphere"
  | "fractalBackground"
  // static effects
  | "flatShade"
  | "shadowFloor"
  | "backgroundPlane"
  | "fogEffect"
  | "emboss"
  | "threshold"
  | "mirrorH"
  | "mirrorV"
  | "sketch"
  | "sunsetLight"
  | "studioLight"
  | "moonLight"
  | "chromeEdge"
  | "colorBurn"
  | "depthLines";

interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  animate: boolean;
  seed?: number;
  params: Record<string, unknown>;
}

const EFFECT_TYPES: {
  type: EffectType;
  label: string;
  target?: "geometry" | "bitmap" | "post";
  primary?: boolean;
  animated?: boolean;
}[] = [
  // Primary text (always present, not user-addable)
  { type: "mainText", label: "Primary Text", primary: true },
  // Post-process
  { type: "bloom", label: "Bloom", target: "post" },
  { type: "depthOfField", label: "Depth of Field", target: "post" },
  { type: "chromatic", label: "Chromatic", target: "post" },
  { type: "filmGrain", label: "Film Grain", target: "post" },
  { type: "glitch", label: "Glitch", target: "post", animated: true },
  { type: "vignette", label: "Vignette", target: "post" },
  { type: "scanlines", label: "Scanlines", target: "post" },
  { type: "colorGrading", label: "Color Grading", target: "post" },
  { type: "pixelate", label: "Pixelate", target: "post" },
  { type: "radialBlur", label: "Radial Blur", target: "post" },
  { type: "circularBlur", label: "Circular Blur", target: "post" },
  { type: "sepia", label: "Sepia", target: "post" },
  { type: "invert", label: "Invert", target: "post" },
  { type: "sobelEdge", label: "Sobel Edge", target: "post" },
  { type: "thermal", label: "Thermal", target: "post" },
  { type: "nightVision", label: "Night Vision", target: "post" },
  { type: "duotone", label: "Duotone", target: "post" },
  { type: "posterize", label: "Posterize", target: "post" },
  { type: "colorOverlay", label: "Color Overlay", target: "post" },
  { type: "halftone", label: "Halftone", target: "post" },
  { type: "sharpen", label: "Sharpen", target: "post" },
  {
    type: "animChromatic",
    label: "Anim Chromatic",
    target: "post",
    animated: true,
  },
  { type: "blur", label: "Blur", target: "post" },
  { type: "lensDistort", label: "Lens Distort", target: "post" },
  { type: "mosaic", label: "Mosaic", target: "post" },
  { type: "noisePost", label: "Noise", target: "post" },
  { type: "crtCurvature", label: "CRT Curvature", target: "post" },
  {
    type: "vhsTracking",
    label: "VHS Tracking",
    target: "post",
    animated: true,
  },
  { type: "glowEdge", label: "Glow Edge", target: "post" },
  { type: "acid", label: "Acid", target: "post", animated: true },
  { type: "kaleidoscopePost", label: "Kaleidoscope", target: "post" },
  { type: "oldFilm", label: "Old Film", target: "post", animated: true },
  { type: "zoomBlur", label: "Zoom Blur", target: "post" },
  { type: "crosshatch", label: "Crosshatch", target: "post" },
  {
    type: "glitchBlock",
    label: "Glitch Block",
    target: "post",
    animated: true,
  },
  { type: "speedLines", label: "Speed Lines", target: "post" },
  { type: "rgbShift", label: "RGB Shift", target: "post" },
  { type: "frostedGlass", label: "Frosted Glass", target: "post" },
  {
    type: "waterRipple",
    label: "Water Ripple",
    target: "post",
    animated: true,
  },
  { type: "pixelShift", label: "Pixel Shift", target: "post", animated: true },
  { type: "retroTv", label: "Retro TV", target: "post", animated: true },
  { type: "antialiasing", label: "Antialiasing", target: "post" },
  // Post-process static
  { type: "emboss", label: "Emboss", target: "post" },
  { type: "threshold", label: "Threshold", target: "post" },
  { type: "mirrorH", label: "Mirror H", target: "post" },
  { type: "mirrorV", label: "Mirror V", target: "post" },
  { type: "sketch", label: "Sketch", target: "post" },
  { type: "colorBurn", label: "Color Burn", target: "post" },
  { type: "depthLines", label: "Depth Lines", target: "post" },
  // Vertex deform
  { type: "fishEye", label: "Fish Eye", target: "geometry" },
  { type: "bend", label: "Bend", target: "geometry" },
  { type: "wave", label: "Wave", target: "geometry", animated: true },
  { type: "twist", label: "Twist", target: "geometry" },
  { type: "inflate", label: "Inflate", target: "geometry" },
  { type: "taper", label: "Taper", target: "geometry" },
  { type: "shear", label: "Shear", target: "geometry" },
  { type: "spherify", label: "Spherify", target: "geometry" },
  { type: "ripple", label: "Ripple", target: "geometry", animated: true },
  { type: "melt", label: "Melt", target: "geometry", animated: true },
  { type: "pinch", label: "Pinch", target: "geometry" },
  { type: "voxelize", label: "Voxelize", target: "geometry" },
  { type: "crumple", label: "Crumple", target: "geometry" },
  {
    type: "noiseWobble",
    label: "Noise Wobble",
    target: "geometry",
    animated: true,
  },
  { type: "spiralDeform", label: "Spiral Deform", target: "geometry" },
  { type: "bulge", label: "Bulge", target: "geometry" },
  { type: "squish", label: "Squish", target: "geometry" },
  { type: "zap", label: "Zap", target: "geometry", animated: true },
  { type: "explode", label: "Explode", target: "geometry", animated: true },
  { type: "fold", label: "Fold", target: "geometry" },
  { type: "spikes", label: "Spikes", target: "geometry" },
  { type: "cylindrize", label: "Cylindrize", target: "geometry" },
  // Material
  { type: "envMap", label: "Env Map", target: "geometry" },
  { type: "neonGlow", label: "Neon Glow", target: "geometry", animated: true },
  { type: "metallicPreset", label: "Metallic", target: "geometry" },
  { type: "xRay", label: "X-Ray", target: "geometry" },
  { type: "toonShading", label: "Toon Shading", target: "geometry" },
  { type: "hologram", label: "Hologram", target: "geometry", animated: true },
  { type: "gradientMesh", label: "Gradient Mesh", target: "geometry" },
  {
    type: "rainbowMesh",
    label: "Rainbow Mesh",
    target: "geometry",
    animated: true,
  },
  {
    type: "iridescent",
    label: "Iridescent",
    target: "geometry",
    animated: true,
  },
  {
    type: "emissivePulse",
    label: "Emissive Pulse",
    target: "geometry",
    animated: true,
  },
  {
    type: "dissolveAnim",
    label: "Dissolve",
    target: "geometry",
    animated: true,
  },
  { type: "glass", label: "Glass", target: "geometry" },
  { type: "matcap", label: "Matcap", target: "geometry" },
  { type: "flatShade", label: "Flat Shade", target: "geometry" },
  { type: "chromeEdge", label: "Chrome Edge", target: "geometry" },
  // Lighting
  { type: "spotlight", label: "Spotlight" },
  { type: "strobe", label: "Strobe", animated: true },
  { type: "flicker", label: "Flicker", animated: true },
  { type: "colorCycleLight", label: "Color Cycle Light", animated: true },
  { type: "disco", label: "Disco", animated: true },
  { type: "ambientPulse", label: "Ambient Pulse", animated: true },
  { type: "rimLight", label: "Rim Light" },
  { type: "dramaticLight", label: "Dramatic Light" },
  { type: "lightningFlash", label: "Lightning Flash", animated: true },
  { type: "rainbowLights", label: "Rainbow Lights", animated: true },
  { type: "sunsetLight", label: "Sunset Light" },
  { type: "studioLight", label: "Studio Light" },
  { type: "moonLight", label: "Moon Light" },
  // Scene objects
  { type: "dust", label: "Particle Dust", target: "geometry", animated: true },
  { type: "wireframe", label: "Wireframe", target: "geometry" },
  { type: "outline", label: "Outline", target: "geometry" },
  { type: "echoCopies", label: "Echo Copies", target: "geometry" },
  { type: "rays", label: "Rays", target: "geometry" },
  {
    type: "floatingRings",
    label: "Floating Rings",
    target: "geometry",
    animated: true,
  },
  {
    type: "starField3d",
    label: "Star Field 3D",
    target: "geometry",
    animated: true,
  },
  { type: "snow", label: "Snow", target: "geometry", animated: true },
  { type: "rain", label: "Rain", target: "geometry", animated: true },
  { type: "confetti", label: "Confetti", target: "geometry", animated: true },
  { type: "sparkle", label: "Sparkle", target: "geometry", animated: true },
  { type: "aura", label: "Aura", target: "geometry", animated: true },
  { type: "gridFloor", label: "Grid Floor", target: "geometry" },
  { type: "orbiter", label: "Orbiter", target: "geometry", animated: true },
  {
    type: "portalRing",
    label: "Portal Ring",
    target: "geometry",
    animated: true,
  },
  {
    type: "cometTrail",
    label: "Comet Trail",
    target: "geometry",
    animated: true,
  },
  {
    type: "floatingCubes",
    label: "Floating Cubes",
    target: "geometry",
    animated: true,
  },
  { type: "mirrorPlane", label: "Mirror Plane", target: "geometry" },
  { type: "shadowFloor", label: "Shadow Floor", target: "geometry" },
  { type: "backgroundPlane", label: "Background Plane", target: "geometry" },
  { type: "fogEffect", label: "Fog", target: "geometry" },
  // Animation
  { type: "pulse", label: "Pulse", target: "geometry", animated: true },
  { type: "spin", label: "Spin", target: "geometry", animated: true },
  { type: "bounce", label: "Bounce", target: "geometry", animated: true },
  {
    type: "levitation",
    label: "Levitation",
    target: "geometry",
    animated: true,
  },
  { type: "swing", label: "Swing", target: "geometry", animated: true },
  { type: "tremble", label: "Tremble", target: "geometry", animated: true },
  { type: "breathe", label: "Breathe", target: "geometry", animated: true },
  { type: "wiggle", label: "Wiggle", target: "geometry", animated: true },
  {
    type: "floatDrift",
    label: "Float Drift",
    target: "geometry",
    animated: true,
  },
  { type: "flipCoin", label: "Flip Coin", target: "geometry", animated: true },
  { type: "grow", label: "Grow", target: "geometry", animated: true },
  { type: "shrink", label: "Shrink", target: "geometry", animated: true },
  { type: "orbitAnim", label: "Orbit", target: "geometry", animated: true },
  { type: "rock", label: "Rock", target: "geometry", animated: true },
  { type: "jitter", label: "Jitter", target: "geometry", animated: true },
  { type: "sway", label: "Sway", target: "geometry", animated: true },
  {
    type: "figureEight",
    label: "Figure Eight",
    target: "geometry",
    animated: true,
  },
  { type: "pendulum", label: "Pendulum", target: "geometry", animated: true },
  // AI-generated
  { type: "customJs", label: "AI Custom", target: "geometry" },
  // Added effects
  { type: "text3d", label: "3D Text", target: "geometry" },
  { type: "graphics", label: "Add Graphics", target: "geometry" },
  { type: "tessellate", label: "Tessellate",  target: "geometry" },
  { type: "wings",      label: "Wings",      target: "geometry", animated: true },
  { type: "fire",       label: "Fire",        target: "geometry", animated: true },
  { type: "smoke",      label: "Smoke",       target: "geometry", animated: true },
  { type: "skySphere",  label: "Sky",         target: "geometry", animated: true },
  { type: "fractalBackground", label: "Fractal",  target: "geometry", animated: true },
];

const DEFAULT_HIDDEN_EFFECT_TYPES = new Set<EffectType>(["crosshatch"]);

function isAnimatedEffectType(type: EffectType) {
  return EFFECT_TYPES.some((effect) => effect.type === type && effect.animated);
}

function commonSpeedValue(params: Record<string, unknown>) {
  const value = Number(params.commonSpeed ?? 1);
  return Number.isFinite(value) ? value : 1;
}

// English synonym keywords for effects — searched in addition to the translated label.
// Locale files may also provide eff_<type>_kw keys for localized synonyms.
const EFFECT_KEYWORDS: Partial<Record<EffectType, string[]>> = {
  wings:          ["angel", "bird", "fly", "feather", "butterfly", "bat", "flap", "wing"],
  fire:           ["flame", "blaze", "burn", "heat", "hot", "ember", "inferno"],
  smoke:          ["fog", "mist", "haze", "cloud", "vapor", "steam", "grey"],
  skySphere:      ["sky", "background", "environment", "space", "horizon", "aurora", "nebula", "night", "sunset", "day"],
  fractalBackground: ["fractal", "mandelbrot", "julia", "plasma", "math", "chaos", "infinite", "zoom", "psychedelic", "pattern"],
  graphics:       ["image", "picture", "photo", "icon", "svg", "artwork", "logo", "texture"],
  text3d:         ["text", "words", "letters", "font", "typography", "write", "caption"],
  bloom:          ["glow", "light", "luminous", "radiance", "shine", "halo", "bright"],
  depthOfField:   ["focus", "bokeh", "lens", "dof", "depth", "blur"],
  chromatic:      ["aberration", "prism", "fringe", "color shift", "rainbow edge"],
  filmGrain:      ["noise", "grain", "static", "film", "gritty"],
  glitch:         ["distort", "corrupt", "error", "artifact", "digital", "bug", "corrupt"],
  vignette:       ["dark edges", "border", "frame", "fade", "shadow"],
  sepia:          ["vintage", "old", "antique", "brown", "aged", "retro"],
  invert:         ["negative", "reverse", "opposite", "negate"],
  nightVision:    ["green", "dark", "thermal", "vision", "goggles"],
  hologram:       ["holo", "sci-fi", "projection", "transparent", "futuristic"],
  xRay:           ["xray", "transparent", "see-through", "skeleton", "medical"],
  toonShading:    ["cartoon", "anime", "cel", "comic", "flat", "toon"],
  glass:          ["transparent", "crystal", "ice", "clear", "translucent", "refractive"],
  dissolveAnim:   ["disappear", "fade", "disintegrate", "particles", "crumble"],
  gradientMesh:   ["gradient", "blend", "color", "transition", "fade"],
  rainbowMesh:    ["rainbow", "colorful", "spectrum", "multicolor", "hue"],
  iridescent:     ["pearl", "opal", "sheen", "prismatic", "holographic"],
  wireframe:      ["mesh", "edges", "grid", "lines", "skeletal", "outline"],
  envMap:         ["environment", "reflection", "reflective", "mirror", "shiny"],
  neonGlow:       ["neon", "electric", "bright", "light", "LED", "glow"],
  snow:           ["winter", "snowflakes", "blizzard", "cold", "ice", "flakes"],
  rain:           ["water", "drops", "storm", "drizzle", "downpour", "wet"],
  confetti:       ["party", "celebration", "festive", "colorful", "ticker tape"],
  sparkle:        ["stars", "glitter", "shine", "twinkle", "magic", "fairy"],
  dust:           ["particles", "motes", "floating", "ambient", "atmosphere", "sand"],
  spotlight:      ["light", "lamp", "beam", "cone", "illuminate", "spot"],
  matcap:         ["material", "surface", "reflection", "preset", "shader"],
  customJs:       ["ai", "custom", "code", "script", "javascript", "generated", "creative"],
};

function effectTypeLabel(type: EffectType, t: (k: string) => string) {
  return t(`eff_${type}`);
}

// ── Random config generation ──────────────────────────────────────────────────

const RANDOM_MOTION_TYPES = new Set<EffectType>([
  'pulse', 'spin', 'bounce', 'levitation', 'swing', 'tremble', 'breathe', 'wiggle',
  'floatDrift', 'flipCoin', 'grow', 'shrink', 'orbitAnim', 'rock', 'jitter', 'sway',
  'figureEight', 'pendulum',
]);
const RANDOM_DEFORM_TYPES = new Set<EffectType>([
  'fishEye', 'bend', 'wave', 'twist', 'inflate', 'taper', 'shear', 'spherify',
  'ripple', 'melt', 'pinch', 'voxelize', 'crumple', 'noiseWobble', 'spiralDeform',
  'bulge', 'squish', 'zap', 'explode', 'fold', 'spikes', 'cylindrize',
]);
const RANDOM_MATERIAL_TYPES = new Set<EffectType>([
  'envMap', 'neonGlow', 'metallicPreset', 'xRay', 'toonShading', 'hologram',
  'gradientMesh', 'rainbowMesh', 'iridescent', 'emissivePulse', 'dissolveAnim',
  'glass', 'matcap', 'flatShade', 'chromeEdge',
]);
const RANDOM_LIGHTING_TYPES = new Set<EffectType>([
  'spotlight', 'strobe', 'flicker', 'colorCycleLight', 'disco', 'ambientPulse',
  'rimLight', 'dramaticLight', 'lightningFlash', 'rainbowLights',
  'sunsetLight', 'studioLight', 'moonLight',
]);
const RANDOM_SCENE_TYPES = new Set<EffectType>([
  'dust', 'wireframe', 'outline', 'echoCopies', 'rays', 'floatingRings', 'starField3d',
  'snow', 'rain', 'confetti', 'sparkle', 'aura', 'gridFloor', 'orbiter', 'portalRing',
  'cometTrail', 'floatingCubes', 'mirrorPlane', 'shadowFloor', 'backgroundPlane',
  'fogEffect', 'wings', 'fire', 'smoke', 'skySphere', 'fractalBackground',
]);

function pickOne<T extends { type: EffectType }>(
  pool: T[],
  tried: Set<string>,
): T | null {
  if (pool.length === 0) return null;
  const untried = pool.filter((e) => !tried.has(e.type));
  // 80% chance to pick untried if any exist
  const src = untried.length > 0 && Math.random() < 0.8 ? untried : pool;
  return src[Math.floor(Math.random() * src.length)];
}

function randomizeColor(): number {
  return Math.floor(Math.random() * 0xffffff);
}

function withRandomColor(params: Record<string, unknown>): Record<string, unknown> {
  if ('color' in params) return { ...params, color: randomizeColor() };
  return params;
}

async function generateRandomConfig(
  currentInstances: EffectInstance[],
  apiBase: string,
): Promise<EffectInstance[]> {
  const triedArr = await getTriedEffects().catch(() => [] as string[]);
  const tried = new Set(triedArr);

  const addable = EFFECT_TYPES.filter((e) => !e.primary && e.type !== 'customJs' && !DEFAULT_HIDDEN_EFFECT_TYPES.has(e.type));

  const byCategory = (set: Set<EffectType>) => addable.filter((e) => set.has(e.type));

  const picked = new Set<EffectType>();
  const add = (entry: (typeof addable)[0] | null) => {
    if (entry && !picked.has(entry.type)) picked.add(entry.type);
  };

  // 1. Always include 1 motion animation (makes it dynamic)
  add(pickOne(byCategory(RANDOM_MOTION_TYPES), tried));

  // 2. Maybe include 1 deform (65%)
  if (Math.random() < 0.65) add(pickOne(byCategory(RANDOM_DEFORM_TYPES), tried));

  // 3. Maybe include 1 material (55%)
  if (Math.random() < 0.55) add(pickOne(byCategory(RANDOM_MATERIAL_TYPES), tried));

  // 4. Maybe include 1 lighting (40%)
  if (Math.random() < 0.40) add(pickOne(byCategory(RANDOM_LIGHTING_TYPES), tried));

  // 5. Maybe include 1 scene object (45%)
  if (Math.random() < 0.45) add(pickOne(byCategory(RANDOM_SCENE_TYPES), tried));

  // 6. Maybe include 1 post-process (35%)
  const postPool = addable.filter((e) => e.target === 'post');
  if (Math.random() < 0.35) add(pickOne(postPool, tried));

  // Fallback: ensure at least one effect
  if (picked.size === 0) add(pickOne(addable, tried));

  const mainText = currentInstances.find((i) => i.type === 'mainText') ?? createEffectInstance('mainText');

  const newInstances: EffectInstance[] = [
    mainText,
    ...[...picked].map((type) => {
      const inst = createEffectInstance(type);
      return { ...inst, params: withRandomColor(inst.params) };
    }),
  ];

  // Record newly tried types (fire-and-forget)
  for (const type of picked) {
    recordTriedEffect(type, apiBase).catch(() => {});
  }

  return newInstances;
}

// Stub kept only to satisfy the switch default below; the real implementation is in utils/effect-defaults.ts
function createDefaultEffectParams_local(
  type: EffectType,
): Record<string, unknown> {
  switch (type) {
    case "mainText":
      return {
        text: DEFAULT_MAIN_TEXT,
        textSets: [
          {
            id: "default",
            name: "Set 1",
            text: DEFAULT_MAIN_TEXT,
          },
        ],
        activeTextSetId: "default",
        sequenceLineDurationMs: DEFAULT_SEQUENCE_LINE_DURATION_MS,
        fontFamily: DEFAULT_3D_FONT_FAMILY,
        size: 2,
        height: 0.8,
        curveSegments: 48,
        bevelEnabled: true,
        bevelThickness: 0.15,
        bevelSize: 0.08,
        bevelOffset: 0,
        bevelSegments: 5,
        color: 0xff6600,
        metalness: 0.95,
        roughness: 0.15,
        envMapIntensity: 1.5,
        equalizeLineWidths: false,
        equalizationMethod: "fontSize",
        targetWidth: 20,
        lineSpacing: 1.0,
      };
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
      return {
        style: "gradient",
        intensity: 1.5,
        seed: 42,
        customImageDataUrl: undefined,
      };
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
        heartRotation: 0,
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
      return {
        count: 3,
        radiusMult: 1.6,
        speed: 0.25,
        thickness: 0.04,
        color: 0xff8800,
      };
    case "vignette":
      return { offset: 0.5, darkness: 1.0 };
    case "scanlines":
      return { count: 100, intensity: 0.3, scrollSpeed: 0 };
    case "colorGrading":
      return { hueShift: 0, saturation: 1.0, contrast: 1.0, brightness: 0 };
    case "pixelate":
      return { pixelSize: 4 };
    case "circularBlur":
      return { radius: 0.01, samples: 16 };
    case "sepia":
      return { amount: 1 };
    case "invert":
      return { amount: 1 };
    case "sobelEdge":
      return { strength: 1 };
    case "thermal":
      return { intensity: 1 };
    case "nightVision":
      return { intensity: 0.8, noise: 0.2 };
    case "duotone":
      return { colorA: 0xff6600, colorB: 0x0066ff };
    case "posterize":
      return { levels: 4 };
    case "colorOverlay":
      return { color: 0xff6600, opacity: 0.4 };
    case "halftone":
      return { dotSize: 4 };
    case "sharpen":
      return { amount: 1 };
    case "animChromatic":
      return { amount: 0.01, speed: 1 };
    case "blur":
      return { radius: 1 };
    case "lensDistort":
      return { k: 0.3 };
    case "mosaic":
      return { size: 0.05 };
    case "noisePost":
      return { amount: 0.15, animated: true };
    case "crtCurvature":
      return { bend: 4 };
    case "vhsTracking":
      return { strength: 0.04, speed: 1 };
    case "glowEdge":
      return { radius: 3, intensity: 1.5, color: 0xff6600 };
    case "acid":
      return { strength: 0.08, speed: 1 };
    case "kaleidoscopePost":
      return { segments: 6 };
    case "oldFilm":
      return { scratchIntensity: 0.3, vignetteAmount: 0.5, grainAmount: 0.08 };
    case "zoomBlur":
      return { strength: 0.04, samples: 10 };
    case "crosshatch":
      return { density: 8, lineWidth: 0.5 };
    case "glitchBlock":
      return { intensity: 0.1, frequency: 1 };
    case "speedLines":
      return { intensity: 0.5, lineCount: 48 };
    case "rgbShift":
      return { amount: 0.005, angle: 0 };
    case "frostedGlass":
      return { blur: 2 };
    case "waterRipple":
      return { strength: 0.02, speed: 1, frequency: 10 };
    case "pixelShift":
      return { amount: 3, speed: 1 };
    case "retroTv":
      return { scanlineIntensity: 0.2, curvature: 5, noise: 0.05 };
    case "antialiasing":
      return {};
    // vertex deform
    case "inflate":
      return { strength: 0.5 };
    case "taper":
      return { strength: 0.5, axis: "y" };
    case "shear":
      return { strength: 0.3, axis: "x" };
    case "spherify":
      return { strength: 0.5 };
    case "ripple":
      return { amplitude: 0.3, frequency: 2, speed: 1.5 };
    case "melt":
      return { strength: 0.5, speed: 0 };
    case "pinch":
      return { strength: 0.5 };
    case "voxelize":
      return { gridSize: 0.2 };
    case "crumple":
      return { strength: 0.3, seed: 42 };
    case "noiseWobble":
      return { amplitude: 0.3, frequency: 2, speed: 1 };
    case "spiralDeform":
      return { twist: 0.3, flare: 0.2 };
    case "bulge":
      return { strength: 0.5 };
    case "squish":
      return { strength: 0.5, axis: "y" };
    case "zap":
      return { strength: 1.5, density: 0.1 };
    case "explode":
      return { strength: 0.5, pulse: false };
    case "fold":
      return { strength: 0.5, axis: "y" };
    case "spikes":
      return { strength: 2, density: 0.05, seed: 42 };
    case "cylindrize":
      return { strength: 0.5, radius: 10 };
    // material
    case "xRay":
      return { color: 0x00ffff, opacity: 0.4 };
    case "toonShading":
      return { color: 0x44cc88, steps: 4 };
    case "hologram":
      return { color: 0x00ffff, scanSpeed: 1 };
    case "gradientMesh":
      return { colorTop: 0xff6600, colorBottom: 0x0066ff, animated: false };
    case "rainbowMesh":
      return { speed: 0.3, saturation: 1 };
    case "iridescent":
      return { speed: 1 };
    case "emissivePulse":
      return {
        color: 0xff6600,
        minIntensity: 0,
        maxIntensity: 1.5,
        speed: 1.5,
      };
    case "dissolveAnim":
      return { speed: 0.5, color: 0xff6600 };
    case "glass":
      return { color: 0xaaddff, roughness: 0.05, transmission: 0.9 };
    case "matcap":
      return { colorA: 0xff6600, colorB: 0xffffff, shininess: 0.5 };
    // lighting
    case "spotlight":
      return { color: 0xffffff, intensity: 3, angle: 0.4, penumbra: 0.3 };
    case "strobe":
      return { color: 0xffffff, frequency: 4, intensity: 5 };
    case "flicker":
      return { color: 0xffa020, baseIntensity: 2, flickerAmount: 1.5 };
    case "colorCycleLight":
      return { speed: 0.5, intensity: 2, saturation: 1 };
    case "disco":
      return { lightCount: 6, speed: 2, intensity: 2 };
    case "ambientPulse":
      return { color: 0xffffff, minIntensity: 0.1, maxIntensity: 2, speed: 1 };
    case "rimLight":
      return { color: 0x4488ff, intensity: 2 };
    case "dramaticLight":
      return { keyColor: 0xfff4e0, fillColor: 0x203060 };
    case "lightningFlash":
      return { color: 0xaaccff, intensity: 8, frequency: 2 };
    case "rainbowLights":
      return { count: 7, speed: 0.5, intensity: 1.5 };
    // scene objects
    case "echoCopies":
      return {
        count: 4,
        offsetX: 0.3,
        offsetY: 0,
        offsetZ: -0.5,
        rotateY: 0,
        opacity: 0.4,
        color: 0xff6600,
        fade: true,
      };
    case "starField3d":
      return { count: 800, speed: 0.05, spread: 30 };
    case "snow":
      return { count: 400, speed: 0.5, spread: 20 };
    case "rain":
      return { count: 300, speed: 1, spread: 20 };
    case "confetti":
      return { count: 60, speed: 1, spread: 15 };
    case "sparkle":
      return { count: 200, color: 0xffffaa, spread: 8 };
    case "aura":
      return { color: 0xff6600, opacity: 0.15, layers: 3, speed: 1 };
    case "gridFloor":
      return { color: 0x444444, opacity: 0.4, size: 40, divisions: 40 };
    case "orbiter":
      return { count: 4, color: 0xff6600, orbitRadius: 4, speed: 1, size: 0.3 };
    case "portalRing":
      return { color: 0x00ffff, radius: 5, speed: 0.5 };
    case "cometTrail":
      return { color: 0xffffff, speed: 1.2, count: 3 };
    case "floatingCubes":
      return { count: 12, color: 0xff6600, spread: 10, speed: 0.5 };
    case "mirrorPlane":
      return { opacity: 0.3, axis: "y", offset: 0 };
    // animation
    case "spin":
      return { speedX: 0, speedY: 1, speedZ: 0 };
    case "bounce":
      return { height: 1.5, speed: 2 };
    case "levitation":
      return { amplitude: 0.5, speed: 0.8 };
    case "swing":
      return { angle: 0.4, speed: 1, axis: "z" };
    case "tremble":
      return { intensity: 0.05, speed: 20 };
    case "breathe":
      return { depth: 0.08, speed: 0.4 };
    case "wiggle":
      return { amount: 0.15, speed: 5 };
    case "floatDrift":
      return { amplitude: 0.3, speed: 0.3 };
    case "flipCoin":
      return { axis: "y", speed: 2 };
    case "grow":
      return { targetScale: 1, speed: 1 };
    case "shrink":
      return { targetScale: 0.5, speed: 1 };
    case "orbitAnim":
      return { radius: 3, speed: 0.5, axis: "y" };
    case "rock":
      return { angle: 0.2, speed: 1 };
    case "jitter":
      return { intensity: 0.1, frequency: 12 };
    case "sway":
      return { amplitude: 0.2, speed: 0.7 };
    case "figureEight":
      return { width: 2, height: 1, speed: 0.5 };
    case "pendulum":
      return { angle: 0.5, speed: 1.2 };
    case "customJs":
      return { code: "", description: "" };
    case "text3d":
      return {
        text: "Text 3D",
        fontFamily: DEFAULT_3D_FONT_FAMILY,
        size: 2,
        height: 0.8,
        curveSegments: 48,
        bevelEnabled: true,
        bevelThickness: 0.15,
        bevelSize: 0.08,
        bevelOffset: 0,
        bevelSegments: 5,
        color: 0xff6600,
        metalness: 0.95,
        roughness: 0.15,
        envMapIntensity: 1.5,
        equalizeLineWidths: false,
        equalizationMethod: "fontSize",
        targetWidth: 20,
        lineSpacing: 1.0,
        posX: 0,
        posY: 0,
        posZ: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    case "graphics":
      return {
        items: [],
        layout: "row",
        spacing: 4,
        scale: 1,
        extrudeDepth: 0.2,
        bevelEnabled: true,
        bevelSize: 0.02,
        bevelThickness: 0.02,
        bevelSegments: 3,
        colorOverride: false,
        color: 0xff6600,
        metalness: 0.8,
        roughness: 0.2,
        bgEnabled: false,
        bgColor: 0x111111,
        bgOpacity: 0.8,
        matImageDataUrl: undefined,
        envMapStyle: "none",
        envMapIntensity: 1.5,
        envMapCustomDataUrl: undefined,
        posX: 0,
        posY: 0,
        posZ: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    case "wings":
      return { style: "straight", color: 0xffffff, size: 2.5, longLength: 1.4, shortLength: 0.6, heightScale: 0.6, flapSpeed: 2.5, flapAmplitude: 0.45, opacity: 0.88 };
    case "fractalBackground":
      return { fractalType: "mandelbrot", scheme: "psychedelic", maxIter: 128, zoom: 0.35, cx: -0.5, cy: 0, juliaRe: -0.7, juliaIm: 0.27, animateJulia: true, juliaSpeed: 0.3, width: 60, height: 40, offsetZ: -8 };
    case "flatShade":
      return {};
    case "shadowFloor":
      return { color: 0x000000, opacity: 0.35, size: 30, offsetY: 0 };
    case "backgroundPlane":
      return {
        color: 0x111111,
        colorBottom: 0x222244,
        opacity: 1,
        width: 60,
        height: 40,
        offsetZ: -3,
        gradient: false,
      };
    case "fogEffect":
      return { color: 0xaaaaaa, near: 10, far: 50 };
    case "emboss":
      return { strength: 1 };
    case "threshold":
      return { cutoff: 0.5, smoothing: 0.05 };
    case "mirrorH":
      return { split: 0.5 };
    case "mirrorV":
      return { split: 0.5 };
    case "sketch":
      return { strength: 3, paperColor: 0xf5f0e0, inkColor: 0x141008 };
    case "sunsetLight":
      return { intensity: 1 };
    case "studioLight":
      return { keyIntensity: 3, fillIntensity: 1.2, backIntensity: 1.5 };
    case "moonLight":
      return { intensity: 1, ambientIntensity: 0.15 };
    case "chromeEdge":
      return { color: 0xffffff, intensity: 0.6 };
    case "colorBurn":
      return { color: 0xff6600, strength: 0.5 };
    case "depthLines":
      return { lineCount: 12, lineWidth: 0.03, color: 0x000000 };
    default:
      return {};
  }
}


const CURATED_COLORS = [
  { label: "Orange", value: 0xff6600 },
  { label: "Green", value: 0x00ff88 },
  { label: "Blue", value: 0x0088ff },
  { label: "Cyan", value: 0x00ffff },
  { label: "Magenta", value: 0xff00ff },
  { label: "Yellow", value: 0xffff00 },
  { label: "Purple", value: 0x8800ff },
  { label: "White", value: 0xffffff },
];

// ── Color history (localStorage, max 12 recent) ───────────────────────────────
const COLOR_HISTORY_KEY = "comrev_recent_colors";
const MAX_COLOR_HISTORY = 12;

function loadRecentColors(): number[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(COLOR_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentColor(hex: number) {
  try {
    if (typeof localStorage === "undefined") return;
    const list = loadRecentColors().filter((c) => c !== hex);
    list.unshift(hex);
    localStorage.setItem(
      COLOR_HISTORY_KEY,
      JSON.stringify(list.slice(0, MAX_COLOR_HISTORY)),
    );
  } catch {}
}

function numToHex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}

function hexToNum(s: string): number {
  return parseInt(s.replace("#", ""), 16);
}

function ColorPickerRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  colors: any;
}) {
  const _colorScheme = useColorScheme();
  const [showModal, setShowModal] = React.useState(false);
  const [recentColors, setRecentColors] = React.useState<number[]>(() =>
    loadRecentColors(),
  );
  const [draftHex, setDraftHex] = React.useState(numToHex(value));
  const originalValueRef = React.useRef(value);

  React.useEffect(() => {
    setDraftHex(numToHex(value));
  }, [value]);

  const applyColor = (num: number) => {
    onChange(num);
    saveRecentColor(num);
    setRecentColors(loadRecentColors());
  };

  return (
    <>
      <View style={[styles.controlRow, { paddingVertical: 2 }]}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <TouchableOpacity
          onPress={() => {
            originalValueRef.current = value;
            setDraftHex(numToHex(value));
            setShowModal(true);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <View
            style={{
              width: 28,
              height: 20,
              borderRadius: 3,
              backgroundColor: numToHex(value),
              borderWidth: 1,
              borderColor: "#888",
            }}
          />
          <Text style={{ color: colors.tint, fontSize: 12 }}>Pick</Text>
        </TouchableOpacity>
      </View>
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background ?? "#1a1a1a",
              borderRadius: 12,
              padding: 20,
              width: 280,
              gap: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: "600",
                fontSize: 15,
                marginBottom: 4,
              }}
            >
              {label}
            </Text>
            {/* Native color input */}
            <View style={{ alignItems: "center" }}>
              {typeof document !== "undefined" && (
                <input
                  type="color"
                  value={draftHex}
                  onChange={(e: any) => {
                    const hex = e.target.value;
                    setDraftHex(hex);
                    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hexToNum(hex));
                  }}
                  style={{
                    width: 80,
                    height: 80,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              )}
            </View>
            {/* Recent colors */}
            {recentColors.length > 0 && (
              <View>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 11,
                    opacity: 0.6,
                    marginBottom: 6,
                  }}
                >
                  Recent
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {recentColors.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => {
                        setDraftHex(numToHex(c));
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          backgroundColor: numToHex(c),
                          borderWidth: 2,
                          borderColor:
                            numToHex(c) === draftHex
                              ? colors.tint
                              : "transparent",
                        }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {/* Hex input */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>Hex:</Text>
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#555",
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  color: colors.text,
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
                value={draftHex}
                onChangeText={(v) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDraftHex(v);
                }}
                maxLength={7}
                autoCapitalize="none"
              />
            </View>
            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => {
                  onChange(originalValueRef.current);
                  setShowModal(false);
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: "#555",
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  applyColor(hexToNum(draftHex));
                  setShowModal(false);
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  backgroundColor: colors.tint,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: _colorScheme === "dark" ? "#000" : "#fff",
                    fontWeight: "600",
                  }}
                >
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FontPickerRow({
  params,
  onUpdate,
  colors,
}: {
  params: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  colors: any;
}) {
  const { t } = useTranslation();
  const _colorScheme = useColorScheme();
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [draftUrl, setDraftUrl] = React.useState("");
  const builtInFonts = AVAILABLE_FONTS.filter((f) => !f.isCustom);
  const currentFont = AVAILABLE_FONTS.find((f) => f.id === params.fontFamily);

  const cycleFont = () => {
    const all = AVAILABLE_FONTS.filter((f) => !f.isCustom);
    const idx = all.findIndex(
      (f) => f.id === (params.fontFamily ?? DEFAULT_3D_FONT_FAMILY),
    );
    onUpdate("fontFamily", all[(idx + 1) % all.length].id);
  };

  const applyCustomUrl = () => {
    const url = draftUrl.trim();
    if (!url) return;
    const id = registerCustomFontUrl("Custom font", url);
    onUpdate("fontFamily", id);
    setShowUrlInput(false);
    setDraftUrl("");
  };

  return (
    <>
      <Row>
        <Text style={[styles.label, { color: colors.text }]}>{t("font")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <CycleButton
            value={currentFont?.label ?? "Helvetiker"}
            options={[]}
            onPress={cycleFont}
            colors={colors}
          />
          <TouchableOpacity
            onPress={() => setShowUrlInput((v) => !v)}
            style={[
              styles.smallActionButton,
              {
                borderColor: colors.tint,
                paddingHorizontal: 6,
                paddingVertical: 2,
              },
            ]}
          >
            <Text style={{ color: colors.tint, fontSize: 11 }}>URL</Text>
          </TouchableOpacity>
        </View>
      </Row>
      {showUrlInput && (
        <View style={{ paddingHorizontal: 4, paddingBottom: 4, gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 11, opacity: 0.7 }}>
            Paste a URL to any typeface.json file (e.g. from facetype.js or
            Three.js CDN):
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#555",
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                color: colors.text,
                fontSize: 12,
              }}
              value={draftUrl}
              onChangeText={setDraftUrl}
              placeholder="https://…/font.typeface.json"
              placeholderTextColor="#888"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={applyCustomUrl}
              returnKeyType="go"
            />
            <TouchableOpacity
              onPress={applyCustomUrl}
              style={{
                backgroundColor: colors.tint,
                borderRadius: 6,
                paddingHorizontal: 10,
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: _colorScheme === "dark" ? "#000" : "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                Load
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.text, fontSize: 10, opacity: 0.5 }}>
            Built-in: {builtInFonts.map((f) => f.label).join(" · ")}
          </Text>
        </View>
      )}
    </>
  );
}

const SLIDE_IMAGE_POSITIONS: { value: SlideImagePosition; label: string }[] = [
  { value: "background", label: "BG" },
  { value: "top-left",   label: "↖" },
  { value: "top-right",  label: "↗" },
  { value: "bottom-left",  label: "↙" },
  { value: "bottom-right", label: "↘" },
];

function renderText3dControls({
  params,
  colors,
  t,
  onUpdate,
  confirm,
  colorScheme,
  includeTransform,
  onPickSlideImage,
}: {
  params: Record<string, unknown>;
  colors: any;
  t: (key: string, options?: any) => string;
  onUpdate: (key: string, value: unknown) => void;
  confirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    hideCancel?: boolean;
  }) => Promise<boolean>;
  colorScheme?: "light" | "dark";
  includeTransform?: boolean;
  onPickSlideImage?: (textSetId: string, imageId?: string) => void;
}) {
  const inputBg = colorScheme === "dark" ? "#2a2a2a" : "#f5f5f5";
  const textSets = normalizePrincipalTextSets(params);
  const activeTextSet = getActivePrincipalTextSet(params);
  const canDeleteTextSet = textSets.length > 1;

  const commitTextSets = (
    nextSets: PrincipalTextSet[],
    nextActiveId = activeTextSet.id,
  ) => {
    const nextActive = nextSets.find((set) => set.id === nextActiveId) ?? nextSets[0];
    onUpdate("textSets", nextSets);
    onUpdate("activeTextSetId", nextActive.id);
    onUpdate("text", nextActive.text);
  };

  const patchActiveSetImage = (imageId: string, patch: Partial<SlideImage>) => {
    commitTextSets(
      textSets.map((set) =>
        set.id !== activeTextSet.id
          ? set
          : {
              ...set,
              images: (set.images ?? []).map((img) =>
                img.id === imageId ? { ...img, ...patch } : img,
              ),
            },
      ),
    );
  };

  const removeActiveSetImage = (imageId: string) => {
    commitTextSets(
      textSets.map((set) =>
        set.id !== activeTextSet.id
          ? set
          : { ...set, images: (set.images ?? []).filter((img) => img.id !== imageId) },
      ),
    );
  };

  const renameActiveTextSet = (name: string) => {
    commitTextSets(
      textSets.map((set) =>
        set.id === activeTextSet.id
          ? { ...set, name: name.trim() || "Untitled set" }
          : set,
      ),
    );
  };

  const updateActiveTextSet = (text: string) => {
    commitTextSets(
      textSets.map((set) =>
        set.id === activeTextSet.id ? { ...set, text } : set,
      ),
    );
  };

  const addTextSet = () => {
    const id = createId();
    const nextSet: PrincipalTextSet = {
      id,
      name: `Set ${textSets.length + 1}`,
      text: activeTextSet.text,
    };
    commitTextSets([...textSets, nextSet], id);
  };

  const deleteActiveTextSet = async () => {
    if (!canDeleteTextSet) return;
    const performDelete = () => {
      const index = textSets.findIndex((set) => set.id === activeTextSet.id);
      const nextSets = textSets.filter((set) => set.id !== activeTextSet.id);
      const nextActive =
        nextSets[Math.max(0, Math.min(index, nextSets.length - 1))] ?? nextSets[0];
      commitTextSets(nextSets, nextActive.id);
    };
    const confirmed = await confirm({
      title: "Delete text set",
      message: `Delete "${activeTextSet.name}"? This removes its multiline text set.`,
      confirmText: t("delete", "Delete"),
      cancelText: t("cancel", "Cancel"),
      destructive: true,
    });
    if (confirmed) performDelete();
  };

  return (
    <>
      <View style={{ marginHorizontal: 12, marginTop: 8, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.label, { color: colors.text }]}>
            Principal text
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
            {textSets.map((set) => {
              const active = set.id === activeTextSet.id;
              return (
                <TouchableOpacity
                  key={set.id}
                  onPress={() => commitTextSets(textSets, set.id)}
                  style={[
                    styles.textSetChip,
                    {
                      borderColor: active ? colors.tint : "#777",
                      backgroundColor: active
                        ? `${colors.tint}22`
                        : colorScheme === "dark"
                          ? "#202020"
                          : "#fff",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? colors.tint : colors.text,
                      fontSize: 12,
                      fontWeight: active ? "700" : "500",
                    }}
                    numberOfLines={1}
                  >
                    {set.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            style={[
              styles.searchInput,
              {
                color: colors.text,
                borderColor: colors.tint,
                backgroundColor: inputBg,
                flex: 1,
                marginBottom: 0,
              },
            ]}
            value={activeTextSet.name}
            onChangeText={renameActiveTextSet}
            placeholder="Set name"
            placeholderTextColor={colorScheme === "dark" ? "#777" : "#999"}
          />
          <TouchableOpacity
            style={[styles.smallActionButton, { borderColor: colors.tint }]}
            onPress={addTextSet}
          >
            <Text style={[styles.buttonText, { color: colors.tint }]}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.smallActionButton,
              {
                borderColor: canDeleteTextSet ? "#e55" : "#777",
                opacity: canDeleteTextSet ? 1 : 0.45,
              },
            ]}
            onPress={deleteActiveTextSet}
            disabled={!canDeleteTextSet}
          >
            <Text
              style={[
                styles.buttonText,
                { color: canDeleteTextSet ? "#e55" : "#777" },
              ]}
            >
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <DebouncedTextInput
        style={[
          styles.textInput,
          {
            color: colors.text,
            borderColor: colors.tint,
            backgroundColor: inputBg,
            marginVertical: 6,
          },
        ]}
        placeholder="Enter text..."
        placeholderTextColor={colorScheme === "dark" ? "#999" : "#ccc"}
        value={activeTextSet.text}
        onCommit={updateActiveTextSet}
        multiline
      />
      <Row>
        <Text style={[styles.label, { color: colors.text }]}>Capitalize</Text>
        <Switch
          value={params.capitalizeText !== false}
          onValueChange={(v) => onUpdate("capitalizeText", v)}
          trackColor={{ false: "#767577", true: colors.tint }}
          thumbColor={params.capitalizeText !== false ? colors.tint : "#f4f3f4"}
        />
      </Row>
      {/* Slide images */}
      {onPickSlideImage && (
        <View style={{ marginHorizontal: 12, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={[styles.label, { color: colors.text }]}>Slide images</Text>
            <TouchableOpacity
              style={[styles.smallActionButton, { borderColor: colors.tint }]}
              onPress={() => onPickSlideImage(activeTextSet.id)}
            >
              <Text style={[styles.buttonText, { color: colors.tint }]}>+ Add image</Text>
            </TouchableOpacity>
          </View>
          {(activeTextSet.images ?? []).map((img) => (
            <View
              key={img.id}
              style={{
                borderWidth: 1,
                borderColor: colorScheme === "dark" ? "#333" : "#ddd",
                borderRadius: 8,
                padding: 8,
                marginBottom: 8,
                gap: 6,
              }}
            >
              {/* Thumbnail + position + remove */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <img
                  src={isSvgDataUrl(img.imageUrl)
                    ? processSvgDataUrl(img.imageUrl, img.svgColor ?? '#ffffff', img.svgStrokeWidth)
                    : img.imageUrl}
                  style={{ width: 52, height: 52, borderRadius: 5, objectFit: isSvgDataUrl(img.imageUrl) ? "contain" : "cover", flexShrink: 0, backgroundColor: isSvgDataUrl(img.imageUrl) ? '#333' : 'transparent' } as any}
                  alt="slide"
                />
                <View style={{ flex: 1, gap: 4 }}>
                  {/* Position buttons */}
                  <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
                    {SLIDE_IMAGE_POSITIONS.map(({ value, label }) => {
                      const isActive = img.imagePosition === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          style={{
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 5,
                            borderWidth: 1,
                            borderColor: isActive ? colors.tint : "#777",
                            backgroundColor: isActive ? `${colors.tint}22` : "transparent",
                          }}
                          onPress={() => patchActiveSetImage(img.id, { imagePosition: value })}
                        >
                          <Text style={{ color: isActive ? colors.tint : colors.text, fontSize: 11 }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Replace / Remove */}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.smallActionButton, { borderColor: colors.tint }]}
                      onPress={() => onPickSlideImage(activeTextSet.id, img.id)}
                    >
                      <Text style={[styles.buttonText, { color: colors.tint }]}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallActionButton, { borderColor: "#e55" }]}
                      onPress={() => removeActiveSetImage(img.id)}
                    >
                      <Text style={[styles.buttonText, { color: "#e55" }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              {/* Per-image sliders */}
              <SliderRow
                label="Opacity"
                min={0} max={1} step={0.05}
                value={img.opacity}
                onChange={(v) => patchActiveSetImage(img.id, { opacity: v })}
                colors={colors}
              />
              <SliderRow
                label="Contrast"
                min={0.5} max={2} step={0.05}
                value={img.contrast}
                onChange={(v) => patchActiveSetImage(img.id, { contrast: v })}
                colors={colors}
              />
              <SliderRow
                label="Brightness"
                min={0.5} max={2} step={0.05}
                value={img.brightness}
                onChange={(v) => patchActiveSetImage(img.id, { brightness: v })}
                colors={colors}
              />
              <SliderRow
                label="Scale"
                min={0.1} max={3} step={0.05}
                value={img.scale ?? 1}
                onChange={(v) => patchActiveSetImage(img.id, { scale: v })}
                colors={colors}
              />
              {isSvgDataUrl(img.imageUrl) && (
                <>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 11, opacity: 0.7 }}>SVG Color</Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      {['#ffffff','#000000','#ff6b00','#00ccff','#ff3366','#44dd55','#ffcc00','#cc44ff'].map((col) => (
                        <TouchableOpacity
                          key={col}
                          style={{
                            width: 24, height: 24, borderRadius: 12,
                            backgroundColor: col,
                            borderWidth: (img.svgColor ?? '#ffffff') === col ? 2 : 1,
                            borderColor: (img.svgColor ?? '#ffffff') === col ? colors.tint : '#666',
                          }}
                          onPress={() => patchActiveSetImage(img.id, { svgColor: col })}
                        />
                      ))}
                    </View>
                  </View>
                  <SliderRow
                    label="SVG Stroke"
                    min={0} max={6} step={0.5}
                    value={img.svgStrokeWidth ?? 0}
                    onChange={(v) => patchActiveSetImage(img.id, { svgStrokeWidth: v })}
                    colors={colors}
                  />
                </>
              )}
            </View>
          ))}
          {(activeTextSet.images ?? []).length === 0 && (
            <Text style={{ color: colorScheme === "dark" ? "#666" : "#aaa", fontSize: 12, fontStyle: "italic" }}>
              No images — tap "+ Add image" to add one.
            </Text>
          )}
        </View>
      )}
      <SliderRow
        label="Min read time"
        min={300}
        max={10000}
        step={100}
        value={
          (params.sequenceLineDurationMs as number) ??
          DEFAULT_SEQUENCE_LINE_DURATION_MS
        }
        onChange={(v) => onUpdate("sequenceLineDurationMs", Math.round(v))}
        colors={colors}
      />
      <ColorPickerRow
        label={t("color")}
        value={(params.color as number) ?? 0xff6600}
        onChange={(v) => onUpdate("color", v)}
        colors={colors}
      />
      <FontPickerRow params={params} onUpdate={onUpdate} colors={colors} />
      <SliderRow
        label={t("size")}
        min={0.5}
        max={6}
        step={0.1}
        value={(params.size as number) ?? 2}
        onChange={(v) => onUpdate("size", v)}
        colors={colors}
      />
      <SliderRow
        label={t("extrude_depth")}
        min={0.05}
        max={3}
        step={0.05}
        value={(params.height as number) ?? 0.8}
        onChange={(v) => onUpdate("height", v)}
        colors={colors}
      />
      <SliderRow
        label={t("metalness")}
        min={0}
        max={1}
        step={0.01}
        value={(params.metalness as number) ?? 0.95}
        onChange={(v) => onUpdate("metalness", v)}
        colors={colors}
      />
      <SliderRow
        label={t("roughness")}
        min={0}
        max={1}
        step={0.01}
        value={(params.roughness as number) ?? 0.15}
        onChange={(v) => onUpdate("roughness", v)}
        colors={colors}
      />
      <SliderRow
        label={t("envMapIntensity")}
        min={0}
        max={4}
        step={0.05}
        value={(params.envMapIntensity as number) ?? 1.5}
        onChange={(v) => onUpdate("envMapIntensity", v)}
        colors={colors}
      />
      <Row>
        <Text style={[styles.label, { color: colors.text }]}>{t("bevel")}</Text>
        <Switch
          value={Boolean(params.bevelEnabled ?? true)}
          onValueChange={(v) => onUpdate("bevelEnabled", v)}
          trackColor={{ false: "#767577", true: colors.tint }}
          thumbColor={(params.bevelEnabled ?? true) ? colors.tint : "#f4f3f4"}
        />
      </Row>
      {(params.bevelEnabled ?? true) && (
        <>
          <SliderRow
            label={t("bevelThickness")}
            min={0}
            max={0.5}
            step={0.01}
            value={(params.bevelThickness as number) ?? 0.15}
            onChange={(v) => onUpdate("bevelThickness", v)}
            colors={colors}
          />
          <SliderRow
            label={t("bevelSize")}
            min={0}
            max={0.3}
            step={0.01}
            value={(params.bevelSize as number) ?? 0.08}
            onChange={(v) => onUpdate("bevelSize", v)}
            colors={colors}
          />
          <SliderRow
            label={t("bevelOffset")}
            min={-0.2}
            max={0.2}
            step={0.01}
            value={(params.bevelOffset as number) ?? 0}
            onChange={(v) => onUpdate("bevelOffset", v)}
            colors={colors}
          />
          <SliderRow
            label={t("bevelSegments")}
            min={1}
            max={12}
            step={1}
            value={(params.bevelSegments as number) ?? 5}
            onChange={(v) => onUpdate("bevelSegments", Math.round(v))}
            colors={colors}
          />
        </>
      )}
      <SliderRow
        label={t("curveSegments")}
        min={2}
        max={128}
        step={1}
        value={(params.curveSegments as number) ?? 48}
        onChange={(v) => onUpdate("curveSegments", Math.round(v))}
        colors={colors}
      />
      <Row>
        <Text style={[styles.label, { color: colors.text }]}>
          {t("equalizeWidths")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {Boolean(params.equalizeLineWidths) && (
            <select
              value={(params.equalizationMethod as string) ?? "fontSize"}
              onChange={(e) => onUpdate("equalizationMethod", e.target.value)}
              style={{ background: colorScheme === "dark" ? "#222" : "#fff", color: colors.text, border: `1px solid ${colorScheme === "dark" ? "#444" : "#ccc"}`, borderRadius: 6, padding: "3px 7px", fontSize: 12, cursor: "pointer" } as any}
            >
              <option value="fontSize">fontSize</option>
              <option value="spacing">spacing</option>
            </select>
          )}
          <Switch
            value={Boolean(params.equalizeLineWidths)}
            onValueChange={(v) => onUpdate("equalizeLineWidths", v)}
            trackColor={{ false: "#767577", true: colors.tint }}
            thumbColor={params.equalizeLineWidths ? colors.tint : "#f4f3f4"}
          />
        </View>
      </Row>
      {params.equalizeLineWidths && (
        <>
          <SliderRow
            label={t("targetWidth")}
            min={5}
            max={40}
            step={0.1}
            value={(params.targetWidth as number) ?? 20}
            onChange={(v) => onUpdate("targetWidth", v)}
            colors={colors}
          />
        </>
      )}
      <SliderRow
        label={t("lineGap")}
        min={-1}
        max={6}
        step={0.05}
        value={(params.lineSpacing as number) ?? 1.0}
        onChange={(v) => onUpdate("lineSpacing", v)}
        colors={colors}
      />
      <SliderRow
        label={t("perspective3d") || "3D Perspective"}
        min={0}
        max={1}
        step={0.01}
        value={(params.perspective as number) ?? 1.0}
        onChange={(v) => onUpdate("perspective", v)}
        colors={colors}
      />
      {includeTransform && (
        <>
          <SliderRow
            label={t("positionX")}
            min={-20}
            max={20}
            step={0.1}
            value={(params.posX as number) ?? 0}
            onChange={(v) => onUpdate("posX", v)}
            colors={colors}
          />
          <SliderRow
            label={t("positionY")}
            min={-20}
            max={20}
            step={0.1}
            value={(params.posY as number) ?? 0}
            onChange={(v) => onUpdate("posY", v)}
            colors={colors}
          />
          <SliderRow
            label={t("positionZ")}
            min={-20}
            max={20}
            step={0.1}
            value={(params.posZ as number) ?? 0}
            onChange={(v) => onUpdate("posZ", v)}
            colors={colors}
          />
          <SliderRow
            label={t("rotationX")}
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotX as number) ?? 0}
            onChange={(v) => onUpdate("rotX", v)}
            colors={colors}
          />
          <SliderRow
            label={t("rotationY")}
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotY as number) ?? 0}
            onChange={(v) => onUpdate("rotY", v)}
            colors={colors}
          />
          <SliderRow
            label={t("rotationZ")}
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotZ as number) ?? 0}
            onChange={(v) => onUpdate("rotZ", v)}
            colors={colors}
          />
        </>
      )}
    </>
  );
}

// ── Per-SVG-item bevel/extrude controls ──────────────────────────────────────

interface GraphicsItemRowProps {
  item: any;
  globalParams: Record<string, unknown>;
  colors: any;
  onUpdateItem: (updated: any) => void;
  onDelete: () => void;
}

function GraphicsItemRow({ item, globalParams, colors, onUpdateItem, onDelete }: GraphicsItemRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const isSvg = item.type === 'svg';

  const gExtrude   = (globalParams.extrudeDepth   as number)  ?? 0.2;
  const gBevel     = (globalParams.bevelEnabled    as boolean) ?? true;
  const gBevelSize = (globalParams.bevelSize       as number)  ?? 0.02;
  const gBevelThk  = (globalParams.bevelThickness  as number)  ?? 0.02;
  const gBevelSegs = (globalParams.bevelSegments   as number)  ?? 3;

  const hasOverride = isSvg && (
    item.extrudeDepth !== undefined ||
    item.bevelEnabled !== undefined ||
    item.bevelSize    !== undefined ||
    item.bevelThickness !== undefined ||
    item.bevelSegments  !== undefined
  );

  function resetOverrides() {
    const { extrudeDepth: _a, bevelEnabled: _b, bevelSize: _c, bevelThickness: _d, bevelSegments: _e, ...rest } = item;
    onUpdateItem(rest);
  }

  return (
    <View style={{ marginVertical: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, fontSize: 12, opacity: 0.8, flex: 1 }} numberOfLines={1}>
          {item.name} ({item.type.toUpperCase()}){hasOverride ? ' ✦' : ''}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {isSvg && (
            <TouchableOpacity onPress={() => setExpanded(e => !e)}>
              <Text style={{ color: colors.tint, fontSize: 12 }}>{expanded ? '▲' : '▼'} 3D</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDelete}>
            <Text style={{ color: "#ff4444", fontSize: 12 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSvg && expanded && (
        <View style={{ paddingLeft: 8, paddingTop: 4, borderLeftWidth: 2, borderLeftColor: colors.tint + '55', marginTop: 4 }}>
          <SliderRow
            label="Extrude Depth"
            min={0} max={2} step={0.05}
            value={item.extrudeDepth ?? gExtrude}
            onChange={(v) => onUpdateItem({ ...item, extrudeDepth: v })}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Bevel</Text>
            <Switch
              value={Boolean(item.bevelEnabled ?? gBevel)}
              onValueChange={(v) => onUpdateItem({ ...item, bevelEnabled: v })}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(item.bevelEnabled ?? gBevel) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {(item.bevelEnabled ?? gBevel) && (item.extrudeDepth ?? gExtrude) > 0 && (
            <>
              <SliderRow
                label="Bevel Size"
                min={0} max={0.5} step={0.005}
                value={item.bevelSize ?? gBevelSize}
                onChange={(v) => onUpdateItem({ ...item, bevelSize: v })}
                colors={colors}
              />
              <SliderRow
                label="Bevel Thickness"
                min={0} max={0.5} step={0.005}
                value={item.bevelThickness ?? gBevelThk}
                onChange={(v) => onUpdateItem({ ...item, bevelThickness: v })}
                colors={colors}
              />
              <SliderRow
                label="Bevel Segments"
                min={1} max={12} step={1}
                value={item.bevelSegments ?? gBevelSegs}
                onChange={(v) => onUpdateItem({ ...item, bevelSegments: Math.round(v) })}
                colors={colors}
              />
            </>
          )}
          {hasOverride && (
            <TouchableOpacity
              onPress={resetOverrides}
              style={{ alignSelf: "flex-start", marginTop: 4, paddingVertical: 2, paddingHorizontal: 6,
                borderWidth: 1, borderColor: "#888", borderRadius: 4 }}
            >
              <Text style={{ color: "#888", fontSize: 11 }}>Reset to global</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function renderEffectControls(
  effect: EffectInstance,
  colors: any,
  t: (key: string, options?: any) => string,
  onUpdate: (key: string, value: unknown) => void,
  confirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    hideCancel?: boolean;
  }) => Promise<boolean>,
  onEditCode?: (id: string, code: string, description: string) => void,
  colorScheme?: "light" | "dark",
  onPickImage?: (instanceId: string, paramKey: string) => void,
  onPickSlideImage?: (textSetId: string, imageId?: string) => void,
) {
  const params = effect.params as Record<string, unknown>;
  const id = effect.id;
  // shorthand: t(`p_${k}`) for param labels
  const p = (k: string) => t(`p_${k}`);
  switch (effect.type) {
    case "mainText":
      return renderText3dControls({ params, colors, t, onUpdate, confirm, colorScheme, onPickSlideImage });
    case "bloom":
      return (
        <>
          <SliderRow
            label={p("strength")}
            min={0}
            max={3}
            step={0.05}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label={p("threshold")}
            min={0}
            max={1}
            step={0.01}
            value={params.threshold as number}
            onChange={(v) => onUpdate("threshold", v)}
            colors={colors}
          />
          <SliderRow
            label={p("radius")}
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
            label={p("focusDist")}
            min={1}
            max={40}
            step={0.5}
            value={params.focus as number}
            onChange={(v) => onUpdate("focus", v)}
            colors={colors}
          />
          <SliderRow
            label={p("aperture")}
            min={0.5}
            max={20}
            step={0.1}
            value={params.aperture as number}
            onChange={(v) => onUpdate("aperture", v)}
            colors={colors}
          />
          <SliderRow
            label={p("maxBlur")}
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
          label={p("offset")}
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
          label={p("intensity")}
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
          <Text style={[styles.label, { color: colors.text }]}>
            {p("wildMode")}
          </Text>
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
            label={p("strength")}
            min={0}
            max={1}
            step={0.01}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label={p("radius")}
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
            <Text style={[styles.label, { color: colors.text }]}>
              {p("axis")}
            </Text>
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
            label={p("strength")}
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
            <Text style={[styles.label, { color: colors.text }]}>
              {p("style")}
            </Text>
            <select
              value={(params.style as string) ?? "gradient"}
              onChange={(e) => onUpdate("style", e.target.value)}
              style={
                {
                  background: colorScheme === "dark" ? "#222" : "#fff",
                  color: colors.text,
                  border: `1px solid ${colorScheme === "dark" ? "#444" : "#ccc"}`,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 13,
                  cursor: "pointer",
                } as any
              }
            >
              {(
                [
                  "gradient",
                  "studio",
                  "starfield",
                  "sunset",
                  "neon",
                  "plasma",
                  "custom",
                ] as EnvMapStyle[]
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          {params.style === "custom" && (
            <Row>
              <Text style={[styles.label, { color: colors.text }]}>
                {p("customImage")}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <TouchableOpacity
                  style={[
                    styles.smallActionButton,
                    {
                      borderColor: colors.tint,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    },
                  ]}
                  onPress={() => onPickImage?.(id, "customImageDataUrl")}
                >
                  <Text style={[styles.buttonText, { color: colors.tint }]}>
                    {params.customImageDataUrl
                      ? p("changeImage")
                      : p("chooseImage")}
                  </Text>
                </TouchableOpacity>
                {Boolean(params.customImageDataUrl) && (
                  <img
                    src={params.customImageDataUrl as string}
                    style={
                      {
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 4,
                      } as any
                    }
                  />
                )}
              </View>
            </Row>
          )}
          {params.style === "plasma" && (
            <>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>
                  {p("scheme")}
                </Text>
                <select
                  value={(params.plasmaScheme as string) ?? "psychedelic"}
                  onChange={(e) => onUpdate("plasmaScheme", e.target.value)}
                  style={{
                    background: colorScheme === "dark" ? "#222" : "#fff",
                    color: colors.text,
                    border: `1px solid ${colorScheme === "dark" ? "#444" : "#ccc"}`,
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 13,
                    cursor: "pointer",
                  } as any}
                >
                  {["psychedelic","fire","ice","electric","forest","ocean","sunset","neon","lava","grayscale"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Row>
              <SliderRow
                label={p("speed")}
                min={0.1}
                max={4}
                step={0.1}
                value={(params.plasmaSpeed as number) ?? 1}
                onChange={(v) => onUpdate("plasmaSpeed", v)}
                colors={colors}
              />
              <SliderRow
                label={p("scale")}
                min={1}
                max={30}
                step={0.5}
                value={(params.plasmaScale as number) ?? 8}
                onChange={(v) => onUpdate("plasmaScale", v)}
                colors={colors}
              />
            </>
          )}
          <SliderRow
            label={p("intensity")}
            min={0}
            max={3}
            step={0.05}
            value={params.intensity as number}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
          {params.style !== "custom" && params.style !== "plasma" && (
            <SliderRow
              label={p("seed")}
              min={0}
              max={999}
              step={1}
              value={params.seed as number}
              onChange={(v) => onUpdate("seed", Math.round(v))}
              colors={colors}
            />
          )}
        </>
      );
    case "neonGlow":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              {t("color")}
            </Text>
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
            label={p("intensity")}
            min={0}
            max={2}
            step={0.05}
            value={params.intensity as number}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
          <SliderRow
            label={p("pulseSpeed")}
            min={0}
            max={5}
            step={0.1}
            value={params.pulseSpeed as number}
            onChange={(v) => onUpdate("pulseSpeed", v)}
            colors={colors}
          />
          <SliderRow
            label={p("pulseAmplitude")}
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
          <Text style={[styles.label, { color: colors.text }]}>
            {p("preset")}
          </Text>
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
            label={p("count")}
            min={50}
            max={2000}
            step={50}
            value={params.count as number}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          <SliderRow
            label={p("speed")}
            min={0}
            max={2}
            step={0.05}
            value={params.speed as number}
            onChange={(v) => onUpdate("speed", v)}
            colors={colors}
          />
          <SliderRow
            label={t("size")}
            min={0.01}
            max={0.3}
            step={0.005}
            value={params.size as number}
            onChange={(v) => onUpdate("size", v)}
            colors={colors}
          />
          <SliderRow
            label={p("seed")}
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
          label={p("opacity")}
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
          label={p("thickness")}
          min={1.01}
          max={1.2}
          step={0.005}
          value={params.thickness as number}
          onChange={(v) => onUpdate("thickness", v)}
          colors={colors}
        />
      );
    case "rays": {
      let rayShape = (params.rayShape as string);
      let layout = (params.layout as string);

      if (rayShape === undefined && layout === undefined) {
        const mode = (params.mode as string) ?? "radial";
        if (mode === "spaghetti") {
          rayShape = "spaghetti";
          layout = "radial";
        } else {
          rayShape = "bar";
          layout = mode;
        }
      } else {
        rayShape = rayShape ?? "bar";
        layout = layout ?? "radial";
      }

      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              Ray shape
            </Text>
            <CycleButton
              value={rayShape}
              options={[]}
              onPress={() =>
                onUpdate(
                  "rayShape",
                  rayShape === "bar"
                    ? "spaghetti"
                    : rayShape === "spaghetti"
                      ? "image"
                      : rayShape === "image"
                        ? "crystal"
                        : rayShape === "crystal"
                          ? "thunder"
                          : rayShape === "thunder"
                            ? "sine"
                            : rayShape === "sine"
                              ? "petal"
                              : "bar",
                )
              }
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              Ray layout
            </Text>
            <CycleButton
              value={layout}
              options={[]}
              onPress={() =>
                onUpdate(
                  "layout",
                  layout === "radial"
                    ? "chip"
                    : layout === "chip"
                      ? "wings"
                      : layout === "wings"
                        ? "heart"
                        : layout === "heart"
                          ? "cross"
                          : layout === "cross"
                            ? "sunburst"
                            : layout === "sunburst"
                              ? "halo"
                              : layout === "halo"
                                ? "spiral"
                                : layout === "spiral"
                                  ? "rose"
                                  : layout === "rose"
                                    ? "crystalFan"
                                    : layout === "crystalFan"
                                      ? "triLines"
                                      : "radial",
                )
              }
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("leftEnabled")}</Text>
            <Switch
              value={params.leftEnabled !== undefined ? Boolean(params.leftEnabled) : true}
              onValueChange={(value) => onUpdate("leftEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.leftEnabled !== undefined ? Boolean(params.leftEnabled) : true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("rightEnabled")}</Text>
            <Switch
              value={params.rightEnabled !== undefined ? Boolean(params.rightEnabled) : true}
              onValueChange={(value) => onUpdate("rightEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.rightEnabled !== undefined ? Boolean(params.rightEnabled) : true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("topEnabled")}</Text>
            <Switch
              value={params.topEnabled !== undefined ? Boolean(params.topEnabled) : true}
              onValueChange={(value) => onUpdate("topEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.topEnabled !== undefined ? Boolean(params.topEnabled) : true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("bottomEnabled")}</Text>
            <Switch
              value={params.bottomEnabled !== undefined ? Boolean(params.bottomEnabled) : true}
              onValueChange={(value) => onUpdate("bottomEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.bottomEnabled !== undefined ? Boolean(params.bottomEnabled) : true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {layout === "wings" && (
            <Row>
              <Text style={[styles.label, { color: colors.text }]}>
                {p("wingsStyle")}
              </Text>
              <CycleButton
                value={(params.wingsStyle as string) ?? "straight"}
                options={[]}
                onPress={() =>
                  onUpdate(
                    "wingsStyle",
                    (params.wingsStyle as string) === "straight"
                      ? "angel"
                      : (params.wingsStyle as string) === "angel"
                        ? "falcon"
                        : (params.wingsStyle as string) === "falcon"
                          ? "bat"
                          : "straight",
                  )
                }
                colors={colors}
              />
            </Row>
          )}
          <SliderRow
            label={p("count")}
            min={4}
            max={128}
            step={1}
            value={(params.count as number) ?? 24}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          {rayShape === "bar" && (
            <LinkedSliderPair
              label1={p("innerThickness")}
              label2={p("outerThickness")}
              min={0.01}
              max={0.5}
              step={0.01}
              value1={(params.innerThickness as number) ?? 0.06}
              value2={(params.outerThickness as number) ?? 0.08}
              onChange1={(v) => onUpdate("innerThickness", v)}
              onChange2={(v) => onUpdate("outerThickness", v)}
              locked={Boolean(params.lockThickness)}
              onLockToggle={() =>
                onUpdate("lockThickness", !Boolean(params.lockThickness))
              }
              colors={colors}
            />
          )}
          {(rayShape === "spaghetti" || rayShape === "thunder" || rayShape === "sine" || rayShape === "petal") && (
            <SliderRow
              label={p("thickness")}
              min={0.01}
              max={0.5}
              step={0.01}
              value={
                (((params.innerThickness as number) ?? 0.06) +
                  ((params.outerThickness as number) ?? 0.08)) /
                2
              }
              onChange={(v) => {
                onUpdate("innerThickness", v);
                onUpdate("outerThickness", v);
              }}
              colors={colors}
            />
          )}
          {rayShape === "crystal" && (
            <>
              <LinkedSliderPair
                label1={p("innerThickness")}
                label2={p("outerThickness")}
                min={0.01}
                max={0.5}
                step={0.01}
                value1={(params.innerThickness as number) ?? 0.06}
                value2={(params.outerThickness as number) ?? 0.08}
                onChange1={(v) => onUpdate("innerThickness", v)}
                onChange2={(v) => onUpdate("outerThickness", v)}
                locked={Boolean(params.lockThickness)}
                onLockToggle={() =>
                  onUpdate("lockThickness", !Boolean(params.lockThickness))
                }
                colors={colors}
              />
              <SliderRow
                label={p("crystalWidth")}
                min={0.02}
                max={0.5}
                step={0.01}
                value={(params.crystalWidth as number) ?? 0.12}
                onChange={(v) => onUpdate("crystalWidth", v)}
                colors={colors}
              />
            </>
          )}
          {rayShape === "thunder" && (
            <SliderRow
              label={p("thunderZigzags")}
              min={1}
              max={10}
              step={1}
              value={(params.thunderZigzags as number) ?? 3}
              onChange={(v) => onUpdate("thunderZigzags", Math.round(v))}
              colors={colors}
            />
          )}
          {rayShape === "sine" && (
            <SliderRow
              label={p("sineCycles")}
              min={0.5}
              max={8}
              step={0.5}
              value={(params.sineCycles as number) ?? 2}
              onChange={(v) => onUpdate("sineCycles", v)}
              colors={colors}
            />
          )}
          {rayShape === "image" && (
            <>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>
                  Ray image
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
                >
                  <TouchableOpacity
                    style={[
                      styles.smallActionButton,
                      {
                        borderColor: colors.tint,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      },
                    ]}
                    onPress={() => onPickImage?.(id, "rayImage")}
                  >
                    <Text style={[styles.buttonText, { color: colors.tint }]}>
                      {params.rayImage ? "Change Image" : "Choose Image"}
                    </Text>
                  </TouchableOpacity>
                  {Boolean(params.rayImage) && (
                    <img
                      src={params.rayImage as string}
                      style={
                        {
                          width: 40,
                          height: 40,
                          objectFit: "contain",
                          borderRadius: 4,
                          backgroundColor: "#333",
                        } as any
                      }
                    />
                  )}
                </View>
              </Row>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>
                  Presets
                </Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.smallActionButton,
                      {
                        borderColor: colors.tint,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      },
                    ]}
                    onPress={() => onUpdate("rayImage", DEFAULT_STAR_SVG)}
                  >
                    <Text style={{ color: colors.tint, fontSize: 11 }}>Star</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.smallActionButton,
                      {
                        borderColor: colors.tint,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      },
                    ]}
                    onPress={() => onUpdate("rayImage", DEFAULT_HEART_SVG)}
                  >
                    <Text style={{ color: colors.tint, fontSize: 11 }}>Heart</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.smallActionButton,
                      {
                        borderColor: colors.tint,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      },
                    ]}
                    onPress={() => onUpdate("rayImage", DEFAULT_LIGHTNING_SVG)}
                  >
                    <Text style={{ color: colors.tint, fontSize: 11 }}>Lightning</Text>
                  </TouchableOpacity>
                </View>
              </Row>
              <SliderRow
                label="Image scale"
                min={0.1}
                max={5}
                step={0.05}
                value={(params.imageScale as number) ?? 1.0}
                onChange={(v) => onUpdate("imageScale", v)}
                colors={colors}
              />
            </>
          )}
          <SliderRow
            label={p("innerMargin")}
            min={0}
            max={20}
            step={0.1}
            value={(params.innerMargin as number) ?? 2}
            onChange={(v) => onUpdate("innerMargin", v)}
            colors={colors}
          />
          <SliderRow
            label={p("outerMargin")}
            min={0}
            max={40}
            step={0.1}
            value={(params.outerMargin as number) ?? 6}
            onChange={(v) => onUpdate("outerMargin", v)}
            colors={colors}
          />
          {layout === "heart" && (
            <SliderRow
              label={p("heartRotation")}
              min={0}
              max={180}
              step={1}
              value={(params.heartRotation as number) ?? 0}
              onChange={(v) => onUpdate("heartRotation", v)}
              colors={colors}
            />
          )}
          {layout === "spiral" && (
            <SliderRow
              label={p("spiralTightness")}
              min={0.2}
              max={3.0}
              step={0.05}
              value={(params.spiralTightness as number) ?? 1.0}
              onChange={(v) => onUpdate("spiralTightness", v)}
              colors={colors}
            />
          )}
          {layout === "rose" && (
            <SliderRow
              label={p("roseK")}
              min={1}
              max={12}
              step={1}
              value={(params.roseK as number) ?? 4}
              onChange={(v) => onUpdate("roseK", Math.round(v))}
              colors={colors}
            />
          )}
        </>
      );
    }
    case "radialBlur":
      return (
        <>
          <SliderRow
            label={p("strength")}
            min={0}
            max={1}
            step={0.01}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <SliderRow
            label={p("segments")}
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
          <SliderRow
            label={p("amplitude")}
            min={0}
            max={3}
            step={0.05}
            value={params.amplitude as number}
            onChange={(v) => onUpdate("amplitude", v)}
            colors={colors}
          />
          <SliderRow
            label={p("frequency")}
            min={0.1}
            max={5}
            step={0.05}
            value={params.frequency as number}
            onChange={(v) => onUpdate("frequency", v)}
            colors={colors}
          />
          <SliderRow
            label={p("speed")}
            min={0}
            max={5}
            step={0.1}
            value={params.speed as number}
            onChange={(v) => onUpdate("speed", v)}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              {p("axis")}
            </Text>
            <CycleButton
              value={(params.axis as string) ?? "x"}
              options={[]}
              onPress={() => onUpdate("axis", params.axis === "x" ? "y" : "x")}
              colors={colors}
            />
          </Row>
        </>
      );
    case "twist":
      return (
        <>
          <SliderRow
            label={p("strength")}
            min={-3}
            max={3}
            step={0.05}
            value={params.strength as number}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              {p("axis")}
            </Text>
            <CycleButton
              value={(params.axis as string) ?? "y"}
              options={[]}
              onPress={() =>
                onUpdate(
                  "axis",
                  params.axis === "x" ? "y" : params.axis === "y" ? "z" : "x",
                )
              }
              colors={colors}
            />
          </Row>
        </>
      );
    case "pulse":
      return (
        <>
          <SliderRow
            label={p("amplitude")}
            min={0}
            max={0.5}
            step={0.01}
            value={params.amplitude as number}
            onChange={(v) => onUpdate("amplitude", v)}
            colors={colors}
          />
          <SliderRow
            label={p("speed")}
            min={0.1}
            max={5}
            step={0.1}
            value={params.speed as number}
            onChange={(v) => onUpdate("speed", v)}
            colors={colors}
          />
        </>
      );
    case "floatingRings":
      return (
        <>
          <SliderRow
            label={p("count")}
            min={1}
            max={6}
            step={1}
            value={params.count as number}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          <SliderRow
            label={p("radius")}
            min={0.5}
            max={4}
            step={0.05}
            value={params.radiusMult as number}
            onChange={(v) => onUpdate("radiusMult", v)}
            colors={colors}
          />
          <SliderRow
            label={p("speed")}
            min={0}
            max={2}
            step={0.05}
            value={params.speed as number}
            onChange={(v) => onUpdate("speed", v)}
            colors={colors}
          />
          <SliderRow
            label={p("thickness")}
            min={0.01}
            max={0.15}
            step={0.005}
            value={params.thickness as number}
            onChange={(v) => onUpdate("thickness", v)}
            colors={colors}
          />
        </>
      );
    case "vignette":
      return (
        <>
          <SliderRow
            label={p("offset")}
            min={0}
            max={1}
            step={0.01}
            value={params.offset as number}
            onChange={(v) => onUpdate("offset", v)}
            colors={colors}
          />
          <SliderRow
            label={p("darkness")}
            min={0}
            max={5}
            step={0.1}
            value={params.darkness as number}
            onChange={(v) => onUpdate("darkness", v)}
            colors={colors}
          />
        </>
      );
    case "scanlines":
      return (
        <>
          <SliderRow
            label={p("count")}
            min={10}
            max={400}
            step={5}
            value={params.count as number}
            onChange={(v) => onUpdate("count", Math.round(v))}
            colors={colors}
          />
          <SliderRow
            label={p("intensity")}
            min={0}
            max={1}
            step={0.01}
            value={params.intensity as number}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
          <SliderRow
            label={p("scroll")}
            min={0}
            max={3}
            step={0.05}
            value={params.scrollSpeed as number}
            onChange={(v) => onUpdate("scrollSpeed", v)}
            colors={colors}
          />
        </>
      );
    case "colorGrading":
      return (
        <>
          <SliderRow
            label={p("hueShift")}
            min={0}
            max={1}
            step={0.01}
            value={params.hueShift as number}
            onChange={(v) => onUpdate("hueShift", v)}
            colors={colors}
          />
          <SliderRow
            label={p("saturation")}
            min={0}
            max={3}
            step={0.05}
            value={params.saturation as number}
            onChange={(v) => onUpdate("saturation", v)}
            colors={colors}
          />
          <SliderRow
            label={p("contrast")}
            min={0}
            max={3}
            step={0.05}
            value={params.contrast as number}
            onChange={(v) => onUpdate("contrast", v)}
            colors={colors}
          />
          <SliderRow
            label={p("brightness")}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={params.brightness as number}
            onChange={(v) => onUpdate("brightness", v)}
            colors={colors}
          />
        </>
      );
    case "pixelate":
      return (
        <SliderRow
          label={p("pixelSize")}
          min={1}
          max={32}
          step={1}
          value={params.pixelSize as number}
          onChange={(v) => onUpdate("pixelSize", Math.round(v))}
          colors={colors}
        />
      );
    case "circularBlur":
      return (
        <SliderRow
          label={p("radius")}
          min={0}
          max={0.05}
          step={0.001}
          value={params.radius as number}
          onChange={(v) => onUpdate("radius", v)}
          colors={colors}
        />
      );
    case "sepia":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={1}
          step={0.01}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "invert":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={1}
          step={0.01}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "sobelEdge":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={5}
          step={0.1}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "thermal":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={1}
          step={0.01}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "nightVision":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={2}
          step={0.05}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "duotone":
      return (
        <>
          <ColorPickerRow
            label={p("colorA")}
            value={(params.colorA as number) ?? 0xff6600}
            onChange={(v) => onUpdate("colorA", v)}
            colors={colors}
          />
          <ColorPickerRow
            label={p("colorB")}
            value={(params.colorB as number) ?? 0x0066ff}
            onChange={(v) => onUpdate("colorB", v)}
            colors={colors}
          />
        </>
      );
    case "posterize":
      return (
        <SliderRow
          label={p("levels")}
          min={2}
          max={16}
          step={1}
          value={params.levels as number}
          onChange={(v) => onUpdate("levels", Math.round(v))}
          colors={colors}
        />
      );
    case "colorOverlay":
      return (
        <>
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0xff6600}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("opacity")}
            min={0}
            max={1}
            step={0.01}
            value={params.opacity as number}
            onChange={(v) => onUpdate("opacity", v)}
            colors={colors}
          />
        </>
      );
    case "halftone":
      return (
        <SliderRow
          label={p("dotSize")}
          min={1}
          max={16}
          step={0.5}
          value={params.dotSize as number}
          onChange={(v) => onUpdate("dotSize", v)}
          colors={colors}
        />
      );
    case "sharpen":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={3}
          step={0.05}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "animChromatic":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={0.05}
          step={0.001}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "blur":
      return (
        <SliderRow
          label={p("radius")}
          min={0}
          max={5}
          step={0.1}
          value={params.radius as number}
          onChange={(v) => onUpdate("radius", v)}
          colors={colors}
        />
      );
    case "lensDistort":
      return (
        <SliderRow
          label={p("k")}
          min={-1}
          max={1}
          step={0.01}
          value={params.k as number}
          onChange={(v) => onUpdate("k", v)}
          colors={colors}
        />
      );
    case "mosaic":
      return (
        <SliderRow
          label={t("size")}
          min={0.01}
          max={0.3}
          step={0.005}
          value={params.size as number}
          onChange={(v) => onUpdate("size", v)}
          colors={colors}
        />
      );
    case "noisePost":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={0.5}
          step={0.01}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "crtCurvature":
      return (
        <SliderRow
          label={p("bend")}
          min={1}
          max={20}
          step={0.5}
          value={params.bend as number}
          onChange={(v) => onUpdate("bend", v)}
          colors={colors}
        />
      );
    case "vhsTracking":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={0.2}
          step={0.002}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "glowEdge":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={5}
          step={0.1}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "acid":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={0.3}
          step={0.005}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "kaleidoscopePost":
      return (
        <SliderRow
          label={p("segments")}
          min={2}
          max={16}
          step={1}
          value={params.segments as number}
          onChange={(v) => onUpdate("segments", Math.round(v))}
          colors={colors}
        />
      );
    case "oldFilm":
      return (
        <SliderRow
          label={p("grain")}
          min={0}
          max={0.3}
          step={0.005}
          value={params.grainAmount as number}
          onChange={(v) => onUpdate("grainAmount", v)}
          colors={colors}
        />
      );
    case "zoomBlur":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={0.2}
          step={0.002}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "crosshatch":
      return (
        <SliderRow
          label={p("density")}
          min={4}
          max={24}
          step={1}
          value={params.density as number}
          onChange={(v) => onUpdate("density", v)}
          colors={colors}
        />
      );
    case "glitchBlock":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={1}
          step={0.01}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "speedLines":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={2}
          step={0.05}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "rgbShift":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={0.03}
          step={0.001}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "frostedGlass":
      return (
        <SliderRow
          label={p("blur")}
          min={0}
          max={10}
          step={0.2}
          value={params.blur as number}
          onChange={(v) => onUpdate("blur", v)}
          colors={colors}
        />
      );
    case "waterRipple":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={0.1}
          step={0.002}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "pixelShift":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={20}
          step={0.5}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "retroTv":
      return (
        <SliderRow
          label={p("blur")}
          min={0}
          max={0.3}
          step={0.005}
          value={params.noise as number}
          onChange={(v) => onUpdate("noise", v)}
          colors={colors}
        />
      );
    case "antialiasing":
      return null;
    case "inflate":
    case "spherify":
    case "pinch":
    case "bulge":
    case "squish":
    case "melt":
    case "fold":
    case "cylindrize":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={2}
          step={0.05}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "taper":
    case "shear":
    case "explode":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={2}
          step={0.05}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "voxelize":
      return (
        <SliderRow
          label={p("gridSize")}
          min={0.05}
          max={1}
          step={0.05}
          value={params.gridSize as number}
          onChange={(v) => onUpdate("gridSize", v)}
          colors={colors}
        />
      );
    case "crumple":
    case "spikes":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={3}
          step={0.05}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "ripple":
    case "noiseWobble":
      return (
        <SliderRow
          label={p("amplitude")}
          min={0}
          max={2}
          step={0.05}
          value={params.amplitude as number}
          onChange={(v) => onUpdate("amplitude", v)}
          colors={colors}
        />
      );
    case "zap":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={5}
          step={0.1}
          value={params.strength as number}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "spiralDeform":
      return (
        <SliderRow
          label={p("twist")}
          min={0}
          max={2}
          step={0.05}
          value={params.twist as number}
          onChange={(v) => onUpdate("twist", v)}
          colors={colors}
        />
      );
    case "xRay":
      return (
        <SliderRow
          label={p("opacity")}
          min={0}
          max={1}
          step={0.01}
          value={params.opacity as number}
          onChange={(v) => onUpdate("opacity", v)}
          colors={colors}
        />
      );
    case "toonShading":
      return (
        <SliderRow
          label={p("steps")}
          min={2}
          max={8}
          step={1}
          value={params.steps as number}
          onChange={(v) => onUpdate("steps", Math.round(v))}
          colors={colors}
        />
      );
    case "hologram":
      return (
        <SliderRow
          label={p("scanSpeed")}
          min={0}
          max={3}
          step={0.1}
          value={params.scanSpeed as number}
          onChange={(v) => onUpdate("scanSpeed", v)}
          colors={colors}
        />
      );
    case "gradientMesh":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={1}
          step={1}
          value={params.animated ? 1 : 0}
          onChange={(v) => onUpdate("animated", v === 1)}
          colors={colors}
        />
      );
    case "rainbowMesh":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={2}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "iridescent":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "emissivePulse":
      return (
        <SliderRow
          label={p("maxIntensity")}
          min={0}
          max={3}
          step={0.1}
          value={params.maxIntensity as number}
          onChange={(v) => onUpdate("maxIntensity", v)}
          colors={colors}
        />
      );
    case "dissolveAnim":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={2}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "glass":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={1}
          step={0.01}
          value={params.transmission as number}
          onChange={(v) => onUpdate("transmission", v)}
          colors={colors}
        />
      );
    case "matcap":
      return null;
    case "spotlight":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={10}
          step={0.1}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "strobe":
      return (
        <SliderRow
          label={p("frequency")}
          min={0.5}
          max={20}
          step={0.5}
          value={params.frequency as number}
          onChange={(v) => onUpdate("frequency", v)}
          colors={colors}
        />
      );
    case "flicker":
      return (
        <SliderRow
          label={p("flickerAmount")}
          min={0}
          max={3}
          step={0.1}
          value={params.flickerAmount as number}
          onChange={(v) => onUpdate("flickerAmount", v)}
          colors={colors}
        />
      );
    case "colorCycleLight":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "disco":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={5}
          step={0.1}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "ambientPulse":
      return (
        <SliderRow
          label={p("maxIntensity")}
          min={0}
          max={5}
          step={0.1}
          value={params.maxIntensity as number}
          onChange={(v) => onUpdate("maxIntensity", v)}
          colors={colors}
        />
      );
    case "rimLight":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={5}
          step={0.1}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "dramaticLight":
      return null;
    case "lightningFlash":
      return (
        <SliderRow
          label={p("frequency")}
          min={0.5}
          max={10}
          step={0.5}
          value={params.frequency as number}
          onChange={(v) => onUpdate("frequency", v)}
          colors={colors}
        />
      );
    case "rainbowLights":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "echoCopies":
      return (
        <SliderRow
          label={p("count")}
          min={1}
          max={12}
          step={1}
          value={params.count as number}
          onChange={(v) => onUpdate("count", Math.round(v))}
          colors={colors}
        />
      );
    case "starField3d":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={0.5}
          step={0.005}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "snow":
    case "rain":
    case "confetti":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "sparkle":
      return (
        <SliderRow
          label={p("count")}
          min={50}
          max={500}
          step={10}
          value={params.count as number}
          onChange={(v) => onUpdate("count", Math.round(v))}
          colors={colors}
        />
      );
    case "aura":
      return (
        <SliderRow
          label={p("layers")}
          min={1}
          max={6}
          step={1}
          value={params.layers as number}
          onChange={(v) => onUpdate("layers", Math.round(v))}
          colors={colors}
        />
      );
    case "gridFloor":
      return (
        <SliderRow
          label={p("opacity")}
          min={0}
          max={1}
          step={0.01}
          value={params.opacity as number}
          onChange={(v) => onUpdate("opacity", v)}
          colors={colors}
        />
      );
    case "orbiter":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "portalRing":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "cometTrail":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={5}
          step={0.1}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "floatingCubes":
      return (
        <SliderRow
          label={p("count")}
          min={4}
          max={30}
          step={1}
          value={params.count as number}
          onChange={(v) => onUpdate("count", Math.round(v))}
          colors={colors}
        />
      );
    case "mirrorPlane":
      return (
        <SliderRow
          label={p("opacity")}
          min={0}
          max={1}
          step={0.01}
          value={params.opacity as number}
          onChange={(v) => onUpdate("opacity", v)}
          colors={colors}
        />
      );
    case "flatShade":
      return null;
    case "shadowFloor":
      return (
        <>
          <ColorPickerRow
            label={p("color")}
            value={(params.color as number) ?? 0x000000}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("opacity")}
            min={0}
            max={1}
            step={0.01}
            value={(params.opacity as number) ?? 0.35}
            onChange={(v) => onUpdate("opacity", v)}
            colors={colors}
          />
          <SliderRow
            label={t("size")}
            min={5}
            max={100}
            step={1}
            value={(params.size as number) ?? 30}
            onChange={(v) => onUpdate("size", v)}
            colors={colors}
          />
        </>
      );
    case "backgroundPlane":
      return (
        <>
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0x111111}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              {p("gradient")}
            </Text>
            <Switch
              value={Boolean(params.gradient)}
              onValueChange={(v) => onUpdate("gradient", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.gradient ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.gradient && (
            <ColorPickerRow
              label={p("colorBottom")}
              value={(params.colorBottom as number) ?? 0x222244}
              onChange={(v) => onUpdate("colorBottom", v)}
              colors={colors}
            />
          )}
          <SliderRow
            label={p("opacity")}
            min={0}
            max={1}
            step={0.01}
            value={(params.opacity as number) ?? 1}
            onChange={(v) => onUpdate("opacity", v)}
            colors={colors}
          />
          <SliderRow
            label={p("offsetZ")}
            min={-20}
            max={0}
            step={0.1}
            value={(params.offsetZ as number) ?? -3}
            onChange={(v) => onUpdate("offsetZ", v)}
            colors={colors}
          />
        </>
      );
    case "fogEffect":
      return (
        <>
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0xaaaaaa}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("near")}
            min={1}
            max={50}
            step={0.5}
            value={(params.near as number) ?? 10}
            onChange={(v) => onUpdate("near", v)}
            colors={colors}
          />
          <SliderRow
            label={p("far")}
            min={5}
            max={200}
            step={1}
            value={(params.far as number) ?? 50}
            onChange={(v) => onUpdate("far", v)}
            colors={colors}
          />
        </>
      );
    case "emboss":
      return (
        <SliderRow
          label={p("strength")}
          min={0}
          max={5}
          step={0.1}
          value={(params.strength as number) ?? 1}
          onChange={(v) => onUpdate("strength", v)}
          colors={colors}
        />
      );
    case "threshold":
      return (
        <SliderRow
          label={p("cutoff")}
          min={0}
          max={1}
          step={0.01}
          value={(params.cutoff as number) ?? 0.5}
          onChange={(v) => onUpdate("cutoff", v)}
          colors={colors}
        />
      );
    case "mirrorH":
      return (
        <SliderRow
          label={p("split")}
          min={0}
          max={1}
          step={0.01}
          value={(params.split as number) ?? 0.5}
          onChange={(v) => onUpdate("split", v)}
          colors={colors}
        />
      );
    case "mirrorV":
      return (
        <SliderRow
          label={p("split")}
          min={0}
          max={1}
          step={0.01}
          value={(params.split as number) ?? 0.5}
          onChange={(v) => onUpdate("split", v)}
          colors={colors}
        />
      );
    case "sketch":
      return (
        <>
          <SliderRow
            label={p("strength")}
            min={0}
            max={10}
            step={0.1}
            value={(params.strength as number) ?? 3}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
          <ColorPickerRow
            label={p("paperColor")}
            value={(params.paperColor as number) ?? 0xf5f0e0}
            onChange={(v) => onUpdate("paperColor", v)}
            colors={colors}
          />
          <ColorPickerRow
            label={p("inkColor")}
            value={(params.inkColor as number) ?? 0x141008}
            onChange={(v) => onUpdate("inkColor", v)}
            colors={colors}
          />
        </>
      );
    case "sunsetLight":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={3}
          step={0.05}
          value={(params.intensity as number) ?? 1}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "studioLight":
      return (
        <SliderRow
          label={p("keyIntensity")}
          min={0}
          max={8}
          step={0.1}
          value={(params.keyIntensity as number) ?? 3}
          onChange={(v) => onUpdate("keyIntensity", v)}
          colors={colors}
        />
      );
    case "moonLight":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={3}
          step={0.05}
          value={(params.intensity as number) ?? 1}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "chromeEdge":
      return (
        <>
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0xffffff}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("intensity")}
            min={0}
            max={3}
            step={0.05}
            value={(params.intensity as number) ?? 0.6}
            onChange={(v) => onUpdate("intensity", v)}
            colors={colors}
          />
        </>
      );
    case "colorBurn":
      return (
        <>
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0xff6600}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("strength")}
            min={0}
            max={1}
            step={0.01}
            value={(params.strength as number) ?? 0.5}
            onChange={(v) => onUpdate("strength", v)}
            colors={colors}
          />
        </>
      );
    case "depthLines":
      return (
        <>
          <SliderRow
            label={p("lineCount")}
            min={2}
            max={32}
            step={1}
            value={(params.lineCount as number) ?? 12}
            onChange={(v) => onUpdate("lineCount", Math.round(v))}
            colors={colors}
          />
          <SliderRow
            label={p("lineWidth")}
            min={0.005}
            max={0.2}
            step={0.005}
            value={(params.lineWidth as number) ?? 0.03}
            onChange={(v) => onUpdate("lineWidth", v)}
            colors={colors}
          />
          <ColorPickerRow
            label={t("color")}
            value={(params.color as number) ?? 0x000000}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
        </>
      );
    case "spin":
      return (
        <SliderRow
          label={p("speedY")}
          min={-5}
          max={5}
          step={0.1}
          value={params.speedY as number}
          onChange={(v) => onUpdate("speedY", v)}
          colors={colors}
        />
      );
    case "bounce":
      return (
        <SliderRow
          label={p("height")}
          min={0}
          max={5}
          step={0.1}
          value={params.height as number}
          onChange={(v) => onUpdate("height", v)}
          colors={colors}
        />
      );
    case "levitation":
      return (
        <SliderRow
          label={p("amplitude")}
          min={0}
          max={3}
          step={0.05}
          value={params.amplitude as number}
          onChange={(v) => onUpdate("amplitude", v)}
          colors={colors}
        />
      );
    case "swing":
      return (
        <SliderRow
          label={p("angle")}
          min={0}
          max={1}
          step={0.01}
          value={params.angle as number}
          onChange={(v) => onUpdate("angle", v)}
          colors={colors}
        />
      );
    case "tremble":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={0.5}
          step={0.005}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "breathe":
      return (
        <SliderRow
          label={t("depth")}
          min={0}
          max={0.3}
          step={0.005}
          value={params.depth as number}
          onChange={(v) => onUpdate("depth", v)}
          colors={colors}
        />
      );
    case "wiggle":
      return (
        <SliderRow
          label={p("amount")}
          min={0}
          max={1}
          step={0.01}
          value={params.amount as number}
          onChange={(v) => onUpdate("amount", v)}
          colors={colors}
        />
      );
    case "floatDrift":
      return (
        <SliderRow
          label={p("amplitude")}
          min={0}
          max={2}
          step={0.05}
          value={params.amplitude as number}
          onChange={(v) => onUpdate("amplitude", v)}
          colors={colors}
        />
      );
    case "flipCoin":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={5}
          step={0.1}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "grow":
      return (
        <SliderRow
          label={p("speed")}
          min={0}
          max={3}
          step={0.05}
          value={params.speed as number}
          onChange={(v) => onUpdate("speed", v)}
          colors={colors}
        />
      );
    case "shrink":
      return (
        <SliderRow
          label={p("targetScale")}
          min={0}
          max={1}
          step={0.01}
          value={params.targetScale as number}
          onChange={(v) => onUpdate("targetScale", v)}
          colors={colors}
        />
      );
    case "orbitAnim":
      return (
        <SliderRow
          label={p("radius")}
          min={0}
          max={10}
          step={0.1}
          value={params.radius as number}
          onChange={(v) => onUpdate("radius", v)}
          colors={colors}
        />
      );
    case "rock":
      return (
        <SliderRow
          label={p("angle")}
          min={0}
          max={1}
          step={0.01}
          value={params.angle as number}
          onChange={(v) => onUpdate("angle", v)}
          colors={colors}
        />
      );
    case "jitter":
      return (
        <SliderRow
          label={p("intensity")}
          min={0}
          max={1}
          step={0.01}
          value={params.intensity as number}
          onChange={(v) => onUpdate("intensity", v)}
          colors={colors}
        />
      );
    case "sway":
      return (
        <SliderRow
          label={p("amplitude")}
          min={0}
          max={1}
          step={0.01}
          value={params.amplitude as number}
          onChange={(v) => onUpdate("amplitude", v)}
          colors={colors}
        />
      );
    case "figureEight":
      return (
        <SliderRow
          label={p("width")}
          min={0}
          max={5}
          step={0.1}
          value={params.width as number}
          onChange={(v) => onUpdate("width", v)}
          colors={colors}
        />
      );
    case "pendulum":
      return (
        <SliderRow
          label={p("angle")}
          min={0}
          max={1.5}
          step={0.01}
          value={params.angle as number}
          onChange={(v) => onUpdate("angle", v)}
          colors={colors}
        />
      );
    case "customJs":
      return (
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          {params.description ? (
            <Text
              style={{ color: colors.text, fontSize: 12, marginBottom: 4 }}
              numberOfLines={2}
            >
              {params.description as string}
            </Text>
          ) : null}
          <Text
            style={{
              color: colors.text,
              fontSize: 11,
              fontFamily: "monospace",
              opacity: 0.6,
              marginBottom: 6,
            }}
            numberOfLines={1}
          >
            {params.code
              ? String(params.code).slice(0, 60) + "…"
              : "No code yet — tap Refine to generate"}
          </Text>
          <TouchableOpacity
            onPress={() =>
              onEditCode?.(
                effect.id,
                String(params.code ?? ""),
                String(params.description ?? ""),
              )
            }
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderWidth: 1,
              borderRadius: 6,
              borderColor: colors.tint,
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={{ color: colors.tint, fontSize: 12, fontWeight: "600" }}
            >
              Refine with AI
            </Text>
          </TouchableOpacity>
        </View>
      );
    case "text3d":
      return renderText3dControls({
        params,
        colors,
        t,
        onUpdate,
        confirm,
        colorScheme,
        includeTransform: true,
        onPickSlideImage,
      });
    case "graphics":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Layout</Text>
            <CycleButton
              value={(params.layout as string) ?? "row"}
              options={[]}
              onPress={() => {
                const layouts = ["row", "grid", "pile"];
                const currentIdx = layouts.indexOf(
                  (params.layout as string) ?? "row",
                );
                const nextIdx = (currentIdx + 1) % layouts.length;
                onUpdate("layout", layouts[nextIdx]);
              }}
              colors={colors}
            />
          </Row>
          {(params.layout as string) !== "grid" && (
            <SliderRow
              label="Spacing"
              min={0.5}
              max={15}
              step={0.1}
              value={(params.spacing as number) ?? 4}
              onChange={(v) => onUpdate("spacing", v)}
              colors={colors}
            />
          )}
          {(params.layout as string) === "grid" && (
            <>
              <SliderRow
                label="Columns"
                min={1}
                max={10}
                step={1}
                value={(params.columns as number) || Math.ceil(Math.sqrt(((params as any).items?.length ?? 1)))}
                onChange={(v) => onUpdate("columns", Math.round(v))}
                colors={colors}
              />
              <SliderRow
                label="Gap"
                min={0}
                max={8}
                step={0.1}
                value={(params.gap as number) ?? 0.5}
                onChange={(v) => onUpdate("gap", v)}
                colors={colors}
              />
            </>
          )}
          <SliderRow
            label="Scale"
            min={0.1}
            max={5}
            step={0.05}
            value={(params.scale as number) ?? 1}
            onChange={(v) => onUpdate("scale", v)}
            colors={colors}
          />
          <SliderRow
            label="Extrude Depth"
            min={0}
            max={2}
            step={0.05}
            value={(params.extrudeDepth as number) ?? 0.2}
            onChange={(v) => onUpdate("extrudeDepth", v)}
            colors={colors}
          />
          {/* Bevel */}
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Bevel (SVG)</Text>
            <Switch
              value={Boolean(params.bevelEnabled ?? true)}
              onValueChange={(v) => onUpdate("bevelEnabled", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.bevelEnabled ?? true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {(params.bevelEnabled ?? true) && (params.extrudeDepth as number ?? 0.2) > 0 && (
            <>
              <SliderRow
                label="Bevel Size"
                min={0}
                max={0.5}
                step={0.005}
                value={(params.bevelSize as number) ?? 0.02}
                onChange={(v) => onUpdate("bevelSize", v)}
                colors={colors}
              />
              <SliderRow
                label="Bevel Thickness"
                min={0}
                max={0.5}
                step={0.005}
                value={(params.bevelThickness as number) ?? 0.02}
                onChange={(v) => onUpdate("bevelThickness", v)}
                colors={colors}
              />
              <SliderRow
                label="Bevel Segments"
                min={1}
                max={12}
                step={1}
                value={(params.bevelSegments as number) ?? 3}
                onChange={(v) => onUpdate("bevelSegments", Math.round(v))}
                colors={colors}
              />
            </>
          )}
          {/* Material */}
          <SliderRow
            label="Metalness"
            min={0}
            max={1}
            step={0.05}
            value={(params.metalness as number) ?? 0.8}
            onChange={(v) => onUpdate("metalness", v)}
            colors={colors}
          />
          <SliderRow
            label="Roughness"
            min={0}
            max={1}
            step={0.05}
            value={(params.roughness as number) ?? 0.2}
            onChange={(v) => onUpdate("roughness", v)}
            colors={colors}
          />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>
              Color Override (SVG)
            </Text>
            <Switch
              value={Boolean(params.colorOverride)}
              onValueChange={(v) => onUpdate("colorOverride", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.colorOverride ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.colorOverride && (
            <ColorPickerRow
              label={t("overrideColor")}
              value={(params.color as number) ?? 0xff6600}
              onChange={(v) => onUpdate("color", v)}
              colors={colors}
            />
          )}
          {/* Background */}
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Background</Text>
            <Switch
              value={Boolean(params.bgEnabled)}
              onValueChange={(v) => onUpdate("bgEnabled", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.bgEnabled ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.bgEnabled && (
            <>
              <ColorPickerRow
                label="BG Color"
                value={(params.bgColor as number) ?? 0x111111}
                onChange={(v) => onUpdate("bgColor", v)}
                colors={colors}
              />
              <SliderRow
                label="BG Opacity"
                min={0}
                max={1}
                step={0.05}
                value={(params.bgOpacity as number) ?? 0.8}
                onChange={(v) => onUpdate("bgOpacity", v)}
                colors={colors}
              />
            </>
          )}
          {/* Image texture on material */}
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Image on Material</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                style={[styles.smallActionButton, { borderColor: colors.tint, paddingHorizontal: 8 }]}
                onPress={() => {
                  if (typeof document !== "undefined") {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*,.svg";
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      if (file.name.toLowerCase().endsWith(".svg")) {
                        reader.readAsText(file);
                        reader.onload = () => {
                          const encoded = btoa(unescape(encodeURIComponent(reader.result as string)));
                          onUpdate("matImageDataUrl", `data:image/svg+xml;base64,${encoded}`);
                        };
                      } else {
                        reader.readAsDataURL(file);
                        reader.onload = () => onUpdate("matImageDataUrl", reader.result as string);
                      }
                    };
                    input.click();
                  }
                }}
              >
                <Text style={[styles.buttonText, { color: colors.tint }]}>
                  {params.matImageDataUrl ? "Change" : "Pick Image"}
                </Text>
              </TouchableOpacity>
              {Boolean(params.matImageDataUrl) && (
                <TouchableOpacity
                  style={[styles.smallActionButton, { borderColor: "#888", paddingHorizontal: 8 }]}
                  onPress={() => onUpdate("matImageDataUrl", undefined)}
                >
                  <Text style={[styles.buttonText, { color: "#888" }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </Row>
          {/* Environment map */}
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Env Map</Text>
            <CycleButton
              value={(params.envMapStyle as string) ?? "none"}
              options={[]}
              onPress={() => {
                const styles_list = ["none", "gradient", "studio", "starfield", "sunset", "neon", "plasma", "custom"];
                const idx = styles_list.indexOf((params.envMapStyle as string) ?? "none");
                onUpdate("envMapStyle", styles_list[(idx + 1) % styles_list.length]);
              }}
              colors={colors}
            />
          </Row>
          {(params.envMapStyle as string | undefined) && (params.envMapStyle as string) !== "none" && (
            <>
              <SliderRow
                label="Env Intensity"
                min={0}
                max={3}
                step={0.05}
                value={(params.envMapIntensity as number) ?? 1.5}
                onChange={(v) => onUpdate("envMapIntensity", v)}
                colors={colors}
              />
              {(params.envMapStyle as string) === "custom" && (
                <Row>
                  <Text style={[styles.label, { color: colors.text }]}>Custom Env Image</Text>
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: colors.tint, paddingHorizontal: 8 }]}
                    onPress={() => {
                      if (typeof document !== "undefined") {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*,.svg";
                        input.onchange = (e: any) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          if (file.name.toLowerCase().endsWith(".svg")) {
                            reader.readAsText(file);
                            reader.onload = () => {
                              const encoded = btoa(unescape(encodeURIComponent(reader.result as string)));
                              onUpdate("envMapCustomDataUrl", `data:image/svg+xml;base64,${encoded}`);
                            };
                          } else {
                            reader.readAsDataURL(file);
                            reader.onload = () => onUpdate("envMapCustomDataUrl", reader.result as string);
                          }
                        };
                        input.click();
                      }
                    }}
                  >
                    <Text style={[styles.buttonText, { color: colors.tint }]}>
                      {params.envMapCustomDataUrl ? "Change" : "Pick"}
                    </Text>
                  </TouchableOpacity>
                </Row>
              )}
            </>
          )}
          <SliderRow
            label="Position X"
            min={-20}
            max={20}
            step={0.1}
            value={(params.posX as number) ?? 0}
            onChange={(v) => onUpdate("posX", v)}
            colors={colors}
          />
          <SliderRow
            label="Position Y"
            min={-20}
            max={20}
            step={0.1}
            value={(params.posY as number) ?? 0}
            onChange={(v) => onUpdate("posY", v)}
            colors={colors}
          />
          <SliderRow
            label="Position Z"
            min={-20}
            max={20}
            step={0.1}
            value={(params.posZ as number) ?? 0}
            onChange={(v) => onUpdate("posZ", v)}
            colors={colors}
          />
          <SliderRow
            label="Rotation X"
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotX as number) ?? 0}
            onChange={(v) => onUpdate("rotX", v)}
            colors={colors}
          />
          <SliderRow
            label="Rotation Y"
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotY as number) ?? 0}
            onChange={(v) => onUpdate("rotY", v)}
            colors={colors}
          />
          <SliderRow
            label="Rotation Z"
            min={-Math.PI}
            max={Math.PI}
            step={0.05}
            value={(params.rotZ as number) ?? 0}
            onChange={(v) => onUpdate("rotZ", v)}
            colors={colors}
          />

          <TouchableOpacity
            style={[
              styles.smallActionButton,
              {
                borderColor: colors.tint,
                marginVertical: 8,
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 8,
              },
            ]}
            onPress={() => {
              if (typeof document !== "undefined") {
                const input = document.createElement("input");
                input.type = "file";
                input.multiple = true;
                input.accept = "image/*,.svg";
                input.onchange = async (e: any) => {
                  const files = e.target.files;
                  if (!files) return;
                  const newItems = [...((params.items as any[]) || [])];
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const reader = new FileReader();
                    if (file.name.toLowerCase().endsWith(".svg")) {
                      reader.readAsText(file);
                      await new Promise((resolve) => {
                        reader.onload = () => {
                          newItems.push({
                            id: Math.random().toString(36).substring(2),
                            name: file.name,
                            type: "svg",
                            content: reader.result as string,
                          });
                          resolve(null);
                        };
                      });
                    } else {
                      reader.readAsDataURL(file);
                      await new Promise((resolve) => {
                        reader.onload = () => {
                          newItems.push({
                            id: Math.random().toString(36).substring(2),
                            name: file.name,
                            type: "image",
                            content: reader.result as string,
                          });
                          resolve(null);
                        };
                      });
                    }
                  }
                  onUpdate("items", newItems);
                };
                input.click();
              }
            }}
          >
            <Text style={[styles.buttonText, { color: colors.tint }]}>
              Select Graphic Files
            </Text>
          </TouchableOpacity>

          {params.items && (params.items as any[]).length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text, fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>
                Uploaded Files:
              </Text>
              {(params.items as any[]).map((item, idx) => (
                <GraphicsItemRow
                  key={item.id || idx}
                  item={item}
                  globalParams={params}
                  colors={colors}
                  onUpdateItem={(updated) => {
                    const newItems = (params.items as any[]).map((x) => x.id === item.id ? updated : x);
                    onUpdate("items", newItems);
                  }}
                  onDelete={() => {
                    const newItems = (params.items as any[]).filter((x) => x.id !== item.id);
                    onUpdate("items", newItems);
                  }}
                />
              ))}
            </View>
          )}
        </>
      );
    case "wings":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("style")}</Text>
            <CycleButton
              value={(params.style as string) ?? "straight"}
              options={["straight", "angel", "butterfly", "bat"]}
              onPress={() => {
                const styles2 = ["straight", "angel", "butterfly", "bat"];
                const idx = styles2.indexOf((params.style as string) ?? "straight");
                onUpdate("style", styles2[(idx + 1) % styles2.length]);
              }}
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("layout")}</Text>
            <CycleButton
              value={(params.layout as string) ?? "horizontal"}
              options={["horizontal", "vertical", "both"]}
              onPress={() => {
                const layouts = ["horizontal", "vertical", "both"];
                const idx = layouts.indexOf((params.layout as string) ?? "horizontal");
                onUpdate("layout", layouts[(idx + 1) % layouts.length]);
              }}
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("symmetric")}</Text>
            <Switch
              value={Boolean(params.symmetric)}
              onValueChange={(value) => onUpdate("symmetric", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={Boolean(params.symmetric) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("leftEnabled")}</Text>
            <Switch
              value={params.leftEnabled !== undefined ? Boolean(params.leftEnabled) : ((params.layout as string) !== "vertical")}
              onValueChange={(value) => onUpdate("leftEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.leftEnabled !== undefined ? Boolean(params.leftEnabled) : ((params.layout as string) !== "vertical")) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("rightEnabled")}</Text>
            <Switch
              value={params.rightEnabled !== undefined ? Boolean(params.rightEnabled) : ((params.layout as string) !== "vertical")}
              onValueChange={(value) => onUpdate("rightEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.rightEnabled !== undefined ? Boolean(params.rightEnabled) : ((params.layout as string) !== "vertical")) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("topEnabled")}</Text>
            <Switch
              value={params.topEnabled !== undefined ? Boolean(params.topEnabled) : ((params.layout as string) === "vertical" || (params.layout as string) === "both")}
              onValueChange={(value) => onUpdate("topEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.topEnabled !== undefined ? Boolean(params.topEnabled) : ((params.layout as string) === "vertical" || (params.layout as string) === "both")) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("bottomEnabled")}</Text>
            <Switch
              value={params.bottomEnabled !== undefined ? Boolean(params.bottomEnabled) : ((params.layout as string) === "vertical" || (params.layout as string) === "both")}
              onValueChange={(value) => onUpdate("bottomEnabled", value)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.bottomEnabled !== undefined ? Boolean(params.bottomEnabled) : ((params.layout as string) === "vertical" || (params.layout as string) === "both")) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          <ColorPickerRow
            label={p("color")}
            value={(params.color as number) ?? 0xffffff}
            onChange={(v) => onUpdate("color", v)}
            colors={colors}
          />
          <SliderRow
            label={p("size")}
            min={0.5}
            max={8}
            step={0.1}
            value={(params.size as number) ?? 2.5}
            onChange={(v) => onUpdate("size", v)}
            colors={colors}
          />
          <SliderRow
            label={p("longLength")}
            min={0.1}
            max={3}
            step={0.05}
            value={(params.longLength as number) ?? 1.4}
            onChange={(v) => onUpdate("longLength", v)}
            colors={colors}
          />
          <SliderRow
            label={p("shortLength")}
            min={0.05}
            max={2}
            step={0.05}
            value={(params.shortLength as number) ?? 0.6}
            onChange={(v) => onUpdate("shortLength", v)}
            colors={colors}
          />
          <SliderRow
            label={p("heightScale")}
            min={0.1}
            max={1.5}
            step={0.05}
            value={(params.heightScale as number) ?? 0.6}
            onChange={(v) => onUpdate("heightScale", v)}
            colors={colors}
          />
          <SliderRow
            label={p("flapSpeed")}
            min={0}
            max={8}
            step={0.1}
            value={(params.flapSpeed as number) ?? 2.5}
            onChange={(v) => onUpdate("flapSpeed", v)}
            colors={colors}
          />
          <SliderRow
            label={p("flapAmplitude")}
            min={0}
            max={1.2}
            step={0.01}
            value={(params.flapAmplitude as number) ?? 0.45}
            onChange={(v) => onUpdate("flapAmplitude", v)}
            colors={colors}
          />
          <SliderRow
            label={p("opacity")}
            min={0}
            max={1}
            step={0.01}
            value={(params.opacity as number) ?? 0.88}
            onChange={(v) => onUpdate("opacity", v)}
            colors={colors}
          />
        </>
      );
    case "tessellate":
      return (
        <>
          <Text style={{ color: colors.text, fontSize: 11, marginBottom: 4, opacity: 0.65 }}>
            {t("tessellateHint")}
          </Text>
          <SliderRow label={p("iterations")} min={1} max={3} step={1}
            value={(params.iterations as number) ?? 1} onChange={(v) => onUpdate("iterations", v)} colors={colors} />
        </>
      );
    case "fire":
      return (
        <>
          <SliderRow label={p("count")} min={50} max={600} step={10}
            value={(params.count as number) ?? 280} onChange={(v) => onUpdate("count", v)} colors={colors} />
          <SliderRow label={p("size")} min={0.2} max={3} step={0.05}
            value={(params.size as number) ?? 0.85} onChange={(v) => onUpdate("size", v)} colors={colors} />
          <SliderRow label={p("speed")} min={0.1} max={4} step={0.05}
            value={(params.speed as number) ?? 1} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <SliderRow label={p("spread")} min={0} max={3} step={0.05}
            value={(params.spread as number) ?? 1} onChange={(v) => onUpdate("spread", v)} colors={colors} />
        </>
      );
    case "smoke":
      return (
        <>
          <SliderRow label={p("count")} min={10} max={200} step={5}
            value={(params.count as number) ?? 70} onChange={(v) => onUpdate("count", v)} colors={colors} />
          <SliderRow label={p("size")} min={0.5} max={6} step={0.1}
            value={(params.size as number) ?? 1.6} onChange={(v) => onUpdate("size", v)} colors={colors} />
          <SliderRow label={p("speed")} min={0.1} max={3} step={0.05}
            value={(params.speed as number) ?? 1} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <SliderRow label={p("opacity")} min={0} max={1} step={0.01}
            value={(params.opacity as number) ?? 0.55} onChange={(v) => onUpdate("opacity", v)} colors={colors} />
          <ColorPickerRow label={p("color")} value={(params.color as number) ?? 0x888888}
            onChange={(v) => onUpdate("color", v)} colors={colors} />
        </>
      );
    case "skySphere":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("style")}</Text>
            <CycleButton
              value={(params.style as string) ?? "day"}
              options={["day", "sunset", "night", "nebula", "aurora"]}
              onPress={() => {
                const opts = ["day", "sunset", "night", "nebula", "aurora"];
                const idx = opts.indexOf((params.style as string) ?? "day");
                onUpdate("style", opts[(idx + 1) % opts.length]);
              }}
              colors={colors}
            />
          </Row>
        </>
      );
    case "fractalBackground":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("type")}</Text>
            <CycleButton
              value={(params.fractalType as string) ?? "mandelbrot"}
              options={["mandelbrot", "julia", "burningShip", "tricorn", "plasma"]}
              onPress={() => {
                const opts = ["mandelbrot", "julia", "burningShip", "tricorn", "plasma"];
                const idx = opts.indexOf((params.fractalType as string) ?? "mandelbrot");
                onUpdate("fractalType", opts[(idx + 1) % opts.length]);
              }}
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("scheme")}</Text>
            <CycleButton
              value={(params.scheme as string) ?? "psychedelic"}
              options={["psychedelic", "fire", "ice", "electric", "forest", "ocean", "sunset", "neon", "lava", "grayscale"]}
              onPress={() => {
                const opts = ["psychedelic", "fire", "ice", "electric", "forest", "ocean", "sunset", "neon", "lava", "grayscale"];
                const idx = opts.indexOf((params.scheme as string) ?? "psychedelic");
                onUpdate("scheme", opts[(idx + 1) % opts.length]);
              }}
              colors={colors}
            />
          </Row>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p("iterations")}</Text>
            <CycleButton
              value={String((params.maxIter as number) ?? 128)}
              options={["64", "128", "256", "512"]}
              onPress={() => {
                const opts = [64, 128, 256, 512];
                const idx = opts.indexOf((params.maxIter as number) ?? 128);
                onUpdate("maxIter", opts[(idx + 1) % opts.length]);
              }}
              colors={colors}
            />
          </Row>
          {(params.fractalType as string) !== "julia" && (params.fractalType as string) !== "plasma" && (
            <>
              <SliderRow label={p("zoom")} min={0.05} max={5} step={0.05}
                value={(params.zoom as number) ?? 0.35} onChange={(v) => onUpdate("zoom", v)} colors={colors} />
              <SliderRow label="cx" min={-2.5} max={1} step={0.01}
                value={(params.cx as number) ?? -0.5} onChange={(v) => onUpdate("cx", v)} colors={colors} />
              <SliderRow label="cy" min={-1.5} max={1.5} step={0.01}
                value={(params.cy as number) ?? 0} onChange={(v) => onUpdate("cy", v)} colors={colors} />
            </>
          )}
          {(params.fractalType as string) === "julia" && (
            <>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>{p("animate")}</Text>
                <Switch value={(params.animateJulia as boolean) ?? true}
                  onValueChange={(v) => onUpdate("animateJulia", v)}
                  trackColor={{ false: colors.border, true: colors.tint }} />
              </Row>
              {!(params.animateJulia ?? true) && (
                <>
                  <SliderRow label="Re" min={-2} max={2} step={0.01}
                    value={(params.juliaRe as number) ?? -0.7} onChange={(v) => onUpdate("juliaRe", v)} colors={colors} />
                  <SliderRow label="Im" min={-2} max={2} step={0.01}
                    value={(params.juliaIm as number) ?? 0.27} onChange={(v) => onUpdate("juliaIm", v)} colors={colors} />
                </>
              )}
              {(params.animateJulia ?? true) && (
                <SliderRow label={p("speed")} min={0.05} max={3} step={0.05}
                  value={(params.juliaSpeed as number) ?? 0.3} onChange={(v) => onUpdate("juliaSpeed", v)} colors={colors} />
              )}
              <SliderRow label={p("zoom")} min={0.05} max={5} step={0.05}
                value={(params.zoom as number) ?? 0.35} onChange={(v) => onUpdate("zoom", v)} colors={colors} />
            </>
          )}
          <SliderRow label={p("offsetZ")} min={-30} max={-1} step={0.5}
            value={(params.offsetZ as number) ?? -8} onChange={(v) => onUpdate("offsetZ", v)} colors={colors} />
        </>
      );
    default:
      return null;
  }
}

async function resizeThumbnail(dataUrl: string, targetSize: number): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(targetSize / img.width, targetSize / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) { resolve(dataUrl); return; }
      ctx2d.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function ThreeDTextScreen({
  sequenceMode = false,
  skipSavedConfigLoad = false,
  fullWindow = false,
  sequenceReady = true,
}: {
  sequenceMode?: boolean;
  skipSavedConfigLoad?: boolean;
  /** Hide all controls and chrome — canvas only, no toggle button */
  fullWindow?: boolean;
  /** When false, hold the sequence at slide 0 until set to true (OBS sync). */
  sequenceReady?: boolean;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { t, i18n: i18nInstance } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenWidth < 600;
  const initialControlsHeight = isSmallScreen
    ? Math.round(screenHeight * 0.45)
    : Math.round(screenHeight * 0.38);
  const controlsHeightSv = useSharedValue(fullWindow ? 0 : initialControlsHeight);
  const dividerDragBase = useSharedValue(0);
  const controlsAnimStyle = useAnimatedStyle(() => ({
    height: controlsHeightSv.value,
  }));
  const dividerGesture = Gesture.Pan()
    .onBegin(() => {
      dividerDragBase.value = controlsHeightSv.value;
    })
    .onUpdate((e) => {
      const newH = Math.round(dividerDragBase.value - e.translationY);
      controlsHeightSv.value = Math.max(80, Math.min(screenHeight - 120, newH));
    });

  const {
    effectInstances,
    setEffectInstances,
    resetToBasic: storeResetToBasic,
    slideEffectOverride,
    setSlideEffectOverride,
  } = useThreeDStore();
  const [selectedEffectType, setSelectedEffectType] =
    useState<EffectType>("bloom");
  const [selectedEffectSearch, setSelectedEffectSearch] = useState("");
  const [showMoreEffects, setShowMoreEffects] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<{
    item: EffectInstance;
    index: number;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  type ImagePickerTarget =
    | { mode: "effect"; instanceId: string; paramKey: string }
    | { mode: "slide"; textSetId: string; imageId?: string };
  const [imagePickerTarget, setImagePickerTarget] = useState<ImagePickerTarget | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(fullWindow);
  const savedControlsHeight = React.useRef(initialControlsHeight);

  const toggleFullscreen = React.useCallback(() => {
    setIsFullscreen((prev) => {
      if (!prev) {
        savedControlsHeight.current = controlsHeightSv.value;
        controlsHeightSv.value = 0;
        if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        // After layout settles, fit camera to mesh so all content is visible
        setTimeout(() => threeDTextRef.current?.fitCamera(), 180);
      } else {
        controlsHeightSv.value = savedControlsHeight.current;
        if (typeof document !== 'undefined' && document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setTimeout(() => threeDTextRef.current?.fitCamera(), 180);
      }
      return !prev;
    });
  }, [controlsHeightSv]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [aiChatTarget, setAiChatTarget] = useState<{
    id: string | null;
    code: string;
    description: string;
  } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [draftPresetName, setDraftPresetName] = useState("");
  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
  const threeDTextRef = useRef<ThreeDTextHandle>(null);
  const currentConfigIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsScrollRef = useRef<ScrollView | null>(null);
  const effectListContainerY = useRef<number>(0);
  const pendingScrollNewId = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const soundEnabled = !isMuted && sequenceMode;

  const c = colors; // shorthand

  // Load preset passed from the presets gallery screen
  useFocusEffect(
    React.useCallback(() => {
      const pending = consumePendingPresetToLoad();
      if (pending) {
        setEffectInstances(
          pending.effects.map((item) => ({
            ...item,
            enabled: item.enabled ?? true,
            animate: item.animate ?? true,
            params: item.params ?? {},
          })),
        );
        setLoadedPresetName(pending.name);
        setSaveStatus(`Loaded: ${pending.name}`);
        setTimeout(() => setSaveStatus(null), 3000);
      }
    }, []),
  );

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
    const source = sequenceMode && slideEffectOverride ? slideEffectOverride : effectInstances;
    return source
      .filter((instance) => instance.enabled)
      .map((instance) => {
        const pipe = createPipeFromInstance(instance);
        pipe.paused = !(instance.animate ?? true);
        pipe.speedMultiplier = commonSpeedValue(instance.params);
        return pipe;
      });
  }, [effectInstances, slideEffectOverride, sequenceMode]);

  const mainTextParams = useMemo(() => {
    const inst = effectInstances.find((i) => i.type === "mainText");
    return (inst?.params ?? {}) as Record<string, unknown>;
  }, [effectInstances]);
  const principalTextSets = useMemo(
    () => normalizePrincipalTextSets(mainTextParams),
    [mainTextParams],
  );
  const principalText = useMemo(
    () => getPrincipalText(mainTextParams),
    [mainTextParams],
  );
  const sequenceLineDurationMs =
    (mainTextParams.sequenceLineDurationMs as number | undefined) ??
    DEFAULT_SEQUENCE_LINE_DURATION_MS;
  const sequencePages = useMemo(
    () => getSequencePages(principalTextSets, sequenceLineDurationMs),
    [principalTextSets, sequenceLineDurationMs],
  );
  const [sequenceLineIndex, setSequenceLineIndex] = useState(0);
  const currentSequencePage =
    sequencePages[sequenceLineIndex % sequencePages.length] ?? sequencePages[0];
  const currentSequencePageKey = sequenceMode
    ? `${sequenceLineIndex}\x00${currentSequencePage.id}\x00${currentSequencePage.text}`
    : "";
  const [readySequenceTransition, setReadySequenceTransition] = useState<{
    key: string;
    nonce: number;
    index: number;
    page: SequencePage;
  } | null>(null);
  const readySequencePageKeyRef = useRef<string | null>(null);
  const sequenceTransitionNonceRef = useRef(0);
  // True once the 3D mesh has fired handleSequenceMeshReady while sequenceReady was still false
  const meshReadyPendingRef = useRef(false);
  const visibleSequencePage =
    sequenceMode
      ? (readySequenceTransition?.page ?? currentSequencePage)
      : currentSequencePage;
  const visibleSequenceLineIndex =
    sequenceMode
      ? (readySequenceTransition?.index ?? sequenceLineIndex)
      : sequenceLineIndex;
  const capitalizeText = mainTextParams.capitalizeText !== false;
  const applyCapitalize = (t: string) => capitalizeText ? t.toUpperCase() : t;
  const displayText = sequenceMode
    ? applyCapitalize(currentSequencePage.text)
    : applyCapitalize(principalText);

  // Stable key that changes only when text content changes, not when display params (bevel etc.) change.
  const principalTextSetsKey = useMemo(
    () => principalTextSets.map((s) => `${s.id}\x00${s.text}`).join('\x01'),
    [principalTextSets],
  );

  useEffect(() => {
    readySequencePageKeyRef.current = null;
    setReadySequenceTransition(null);
    setSequenceLineIndex(0);
  }, [principalTextSetsKey, sequenceMode]);

  const applySlideConfig = useSoundscapeStore((s) => s.applySlideConfig);
  useEffect(() => {
    if (!sequenceMode) {
      setSlideEffectOverride(null);
      return;
    }
    applySlideConfig(currentSequencePage.soundscape);
    setSlideEffectOverride(currentSequencePage.configOverride?.effectInstances ?? null);
  }, [sequenceMode, currentSequencePage.id, applySlideConfig, setSlideEffectOverride]);

  useEffect(() => {
    if (!sequenceMode || sequencePages.length <= 1) return;
    if (readySequenceTransition?.key !== currentSequencePageKey) return;
    const timer = setTimeout(() => {
      setSequenceLineIndex((index) => (index + 1) % sequencePages.length);
    }, currentSequencePage.durationMs);
    return () => clearTimeout(timer);
  }, [
    currentSequencePage.durationMs,
    currentSequencePageKey,
    readySequenceTransition?.key,
    sequenceMode,
    sequencePages.length,
  ]);

  const handleSequenceMeshReady = React.useCallback(() => {
    threeDTextRef.current?.fitCamera();
    if (!sequenceMode) return;
    if (readySequencePageKeyRef.current === currentSequencePageKey) return;

    if (!sequenceReady) {
      // Mesh is rendered but OBS hasn't signalled start yet — remember it
      meshReadyPendingRef.current = true;
      return;
    }

    readySequencePageKeyRef.current = currentSequencePageKey;
    const nonce = sequenceTransitionNonceRef.current + 1;
    sequenceTransitionNonceRef.current = nonce;
    setReadySequenceTransition({
      key: currentSequencePageKey,
      nonce,
      index: sequenceLineIndex,
      page: currentSequencePage,
    });
  }, [
    currentSequencePage,
    currentSequencePageKey,
    sequenceLineIndex,
    sequenceMode,
    sequenceReady,
  ]);

  // When OBS sends the start signal (sequenceReady flips to true), fire the
  // transition if the mesh was already rendered and waiting.
  useEffect(() => {
    if (!sequenceReady || !meshReadyPendingRef.current) return;
    meshReadyPendingRef.current = false;
    if (!sequenceMode) return;
    if (readySequencePageKeyRef.current === currentSequencePageKey) return;
    readySequencePageKeyRef.current = currentSequencePageKey;
    const nonce = sequenceTransitionNonceRef.current + 1;
    sequenceTransitionNonceRef.current = nonce;
    setReadySequenceTransition({
      key: currentSequencePageKey,
      nonce,
      index: sequenceLineIndex,
      page: currentSequencePage,
    });
  }, [sequenceReady, sequenceMode, currentSequencePageKey, currentSequencePage, sequenceLineIndex]);

  useEffect(() => {
    if (!sequenceMode || !soundEnabled) return;
    if (readySequenceTransition?.key !== currentSequencePageKey) return;
    playGongSound(audioContextRef);
  }, [
    currentSequencePageKey,
    readySequenceTransition?.key,
    readySequenceTransition?.nonce,
    sequenceMode,
    soundEnabled,
  ]);


  useEffect(() => {
    if (!sequenceMode || !soundEnabled || typeof window === "undefined") return;
    const unlockAudio = () => {
      playGongSound(audioContextRef);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [sequenceLineIndex, sequenceMode, soundEnabled]);

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
    const newInstance = createEffectInstance(t);
    pendingScrollNewId.current = newInstance.id;
    setEffectInstances((instances) => [...instances, newInstance]);
    markTried(t);
  };

  const [triedEffectsSet, setTriedEffectsSet] = useState<Set<string>>(new Set());
  const totalAddableCount = EFFECT_TYPES.filter((e) => !e.primary && e.type !== 'customJs').length;
  // Load from IDB once on mount
  useEffect(() => {
    getTriedEffects().then((arr) => setTriedEffectsSet(new Set(arr))).catch(() => {});
  }, []);

  const markTried = React.useCallback((type: EffectType) => {
    setTriedEffectsSet((prev) => {
      if (prev.has(type)) return prev;
      const next = new Set(prev);
      next.add(type);
      return next;
    });
    recordTriedEffect(type, API_BASE).catch(() => {});
  }, []);

  const handleRandom = React.useCallback(async () => {
    const newInstances = await generateRandomConfig(effectInstances, API_BASE);
    // Collect newly tried types synchronously from the new instances
    setTriedEffectsSet((prev) => {
      const next = new Set(prev);
      newInstances.forEach((i) => { if (i.type !== 'mainText') next.add(i.type); });
      return next;
    });
    setEffectInstances(newInstances);
    setSaveStatus("Random config applied!");
    setTimeout(() => setSaveStatus(null), 2000);
    setTimeout(() => controlsScrollRef.current?.scrollTo({ y: 0, animated: true }), 80);
  }, [effectInstances, setEffectInstances]);

  const handleApplyAiEffect = (
    code: string,
    description: string,
    targetId: string | null,
  ) => {
    if (targetId) {
      setEffectInstances((instances) =>
        instances.map((inst) =>
          inst.id === targetId
            ? { ...inst, params: { ...inst.params, code, description } }
            : inst,
        ),
      );
    } else {
      setEffectInstances((instances) => [
        ...instances,
        {
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          type: "customJs",
          enabled: true,
          animate: true,
          params: { code, description },
        },
      ]);
      markTried("customJs");
    }
  };

  function generatePresetName(instances: EffectInstance[]) {
    if (instances.length === 0) return "No effects";
    const counts: Record<string, number> = {};
    instances.forEach((i) => {
      const lbl = effectTypeLabel(i.type, t);
      counts[lbl] = (counts[lbl] || 0) + 1;
    });
    const parts = Object.entries(counts).map(([label, n]) =>
      n > 1 ? `${n}x ${label}` : `${label}`,
    );
    return parts.join(", ");
  }

  const handleSavePreset = () => {
    const base = generatePresetName(effectInstances.filter((i) => i.enabled));
    const existingNames = new Set(presets.map((p) => p.name));
    let name = base;
    let ordinal = 2;
    while (existingNames.has(name)) {
      name = `${base} ${ordinal++}`;
    }
    setDraftPresetName(name);
    setShowSavePresetModal(true);
  };

  const handleDuplicatePreset = () => {
    const base = loadedPresetName
      ? `${loadedPresetName} copy`
      : generatePresetName(effectInstances.filter((i) => i.enabled));
    const existingNames = new Set(presets.map((p) => p.name));
    let name = base;
    let ordinal = 2;
    while (existingNames.has(name)) {
      name = `${base} ${ordinal++}`;
    }
    setDraftPresetName(name);
    setShowSavePresetModal(true);
  };

  const confirmSavePreset = async () => {
    const name =
      draftPresetName.trim() ||
      generatePresetName(effectInstances.filter((i) => i.enabled));
    setShowSavePresetModal(false);
    try {
      const now = new Date().toISOString();
      const rawFrame = await threeDTextRef.current?.captureFrame();
      const thumbnail = rawFrame
        ? await resizeThumbnail(rawFrame, 1920)
        : undefined;
      const preset: PresetRecord = {
        id: nanoid(),
        name,
        when_created: now,
        when_last_modified: now,
        effects: effectInstances,
        thumbnail,
      };
      await savePresetOfflineFirst(preset, API_BASE);
      setPresets((prev) => [preset, ...prev]);
      setSaveStatus(`Saved preset: ${name}`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus(
        `Save preset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleResetToBasic = async () => {
    const performReset = () => {
      storeResetToBasic();
      threeDTextRef.current?.resetCamera?.();
    };

    const confirmed = await confirm({
      title: t("resetToBasic", "Reset to basic settings"),
      message: t(
        "resetConfirm",
        "Are you sure you want to delete all effects except 3D text?",
      ),
      confirmText: t("delete", "Delete"),
      cancelText: t("cancel", "Cancel"),
      destructive: true,
    });
    if (confirmed) performReset();
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

  const updateSlideImage = (textSetId: string, imageUrl: string, imageId?: string) => {
    setEffectInstances((instances) =>
      instances.map((instance) => {
        if (instance.type !== "mainText") return instance;
        const sets = normalizePrincipalTextSets(instance.params as Record<string, unknown>);
        const nextSets = sets.map((s) => {
          if (s.id !== textSetId) return s;
          const existing = s.images ?? [];
          if (imageId) {
            // replace existing image's URL
            return { ...s, images: existing.map((img) => img.id === imageId ? { ...img, imageUrl } : img) };
          }
          // add new image
          const newImg: SlideImage = {
            id: createId(),
            imageUrl,
            imagePosition: "bottom-right",
            opacity: 1,
            contrast: 1,
            brightness: 1,
            scale: 1,
            ...(isSvgDataUrl(imageUrl) ? { svgColor: '#ffffff', svgStrokeWidth: 0 } : {}),
          };
          return { ...s, images: [...existing, newImg] };
        });
        return { ...instance, params: { ...instance.params, textSets: nextSets } };
      }),
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

  const removeEffectInstance = async (id: string) => {
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
    const effectName = effectTypeLabel(
      effectInstances.find((i) => i.id === id)?.type ?? "mainText",
      t,
    );
    const confirmMsg = t("deleteEffectConfirm", { name: effectName });
    const confirmed = await confirm({
      title: t("deleteEffect", "Delete effect"),
      message: confirmMsg,
      confirmText: t("delete", "Delete"),
      cancelText: t("cancel", "Cancel"),
      destructive: true,
    });
    if (confirmed) performDelete();
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
        if (useThreeDStore.getState().mantraMode) {
          return;
        }

        currentConfigIdRef.current = latest.id;
        setShowAdvanced(latest.showAdvanced);

        const savedEffects = (latest as any).effectInstances as
          | EffectInstance[]
          | undefined;

        let instances: EffectInstance[] = Array.isArray(savedEffects)
          ? savedEffects.map((item) => ({
              ...item,
              enabled: item.enabled ?? true,
              animate: item.animate ?? true,
              params: item.params ?? {},
            }))
          : [];

        // Migration: if no mainText effect in saved config, create one from old top-level fields
        if (!instances.find((i) => i.type === "mainText")) {
          const mainInst = createEffectInstance("mainText");
          if (latest.text)
            mainInst.params = { ...mainInst.params, text: latest.text };
          if (latest.equalizeLineWidths !== undefined)
            mainInst.params = {
              ...mainInst.params,
              equalizeLineWidths: latest.equalizeLineWidths,
            };
          if (latest.equalizationMethod)
            mainInst.params = {
              ...mainInst.params,
              equalizationMethod: latest.equalizationMethod,
            };
          if (latest.targetWidth)
            mainInst.params = {
              ...mainInst.params,
              targetWidth: latest.targetWidth,
            };
          if (latest.lineSpacing)
            mainInst.params = {
              ...mainInst.params,
              lineSpacing: latest.lineSpacing,
            };
          instances = [mainInst, ...instances];
        }

        setEffectInstances(instances);
      } catch (error) {
        console.warn("Unable to load last configuration:", error);
      }
    }

    async function loadPresetList() {
      try {
        let loaded: PresetRecord[] = [];
        try {
          loaded = await loadPresetsFromBackend(API_BASE);
          // Merge into local IndexedDB
          for (const p of loaded) await savePreset(p);
        } catch {
          loaded = await getPresets();
        }
        if (active)
          setPresets(
            loaded.sort((a, b) =>
              b.when_last_modified.localeCompare(a.when_last_modified),
            ),
          );
      } catch (error) {
        console.warn("Unable to load presets:", error);
      }
    }

    async function refreshPending() {
      try {
        setPendingSyncCount(await getPendingSyncCount());
      } catch {
        setPendingSyncCount(0);
      }
    }

    if (!skipSavedConfigLoad) {
      loadLastSavedConfig();
    }
    loadPresetList();
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
  }, [skipSavedConfigLoad, setEffectInstances]);

  const refreshPending = async () => {
    try {
      setPendingSyncCount(await getPendingSyncCount());
    } catch {
      setPendingSyncCount(0);
    }
  };

  const buildCurrentConfig = (): ThreeDConfig => {
    if (!currentConfigIdRef.current) {
      currentConfigIdRef.current = nanoid();
    }
    const p = mainTextParams;
    return {
      id: currentConfigIdRef.current,
      name: `3D render configuration ${new Date().toISOString()}`,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Mirror mainText params for backward compat / easy querying
      text: getPrincipalText(p),
      equalizeLineWidths: (p.equalizeLineWidths as boolean) ?? false,
      equalizationMethod:
        (p.equalizationMethod as "spacing" | "fontSize") ?? "fontSize",
      targetWidth: (p.targetWidth as number) ?? 20,
      lineSpacing: (p.lineSpacing as number) ?? 1.5,
      effectInstances,
      showAdvanced,
    };
  };

  // Request browser fullscreen on mount when in fullWindow mode
  useEffect(() => {
    if (!fullWindow) return;
    if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      if (typeof document !== 'undefined' && document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every change (debounced 800ms)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen((prev) => {
          if (prev && !fullWindow) {
            controlsHeightSv.value = savedControlsHeight.current;
          }
          return fullWindow ? true : false;
        });
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [controlsHeightSv, fullWindow]);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const config = buildCurrentConfig();
        await saveConfigOfflineFirst(config, API_BASE);
      } catch (error) {
        console.warn("Auto-save failed:", error);
      }
    }, 800);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectInstances, showAdvanced]);

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
    <SafeAreaView
      edges={fullWindow ? [] : ["bottom"]}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <View style={styles.content}>
        <View style={[styles.canvas, { position: 'relative' }]}>
          <ThreeDText
            ref={threeDTextRef}
            text={displayText}
            size={mainTextParams.size as number | undefined}
            height={mainTextParams.height as number | undefined}
            curveSegments={mainTextParams.curveSegments as number | undefined}
            bevelEnabled={mainTextParams.bevelEnabled as boolean | undefined}
            bevelThickness={mainTextParams.bevelThickness as number | undefined}
            bevelSize={mainTextParams.bevelSize as number | undefined}
            bevelOffset={mainTextParams.bevelOffset as number | undefined}
            bevelSegments={mainTextParams.bevelSegments as number | undefined}
            fontFamily={mainTextParams.fontFamily as string | undefined}
            color={mainTextParams.color as number | undefined}
            metalness={mainTextParams.metalness as number | undefined}
            roughness={mainTextParams.roughness as number | undefined}
            envMapIntensity={
              mainTextParams.envMapIntensity as number | undefined
            }
            equalizeLineWidths={
              mainTextParams.equalizeLineWidths as boolean | undefined
            }
            equalizationMethod={
              mainTextParams.equalizationMethod as
                | "spacing"
                | "fontSize"
                | undefined
            }
            targetWidth={mainTextParams.targetWidth as number | undefined}
            lineSpacing={mainTextParams.lineSpacing as number | undefined}
            perspective={mainTextParams.perspective as number | undefined}
            pipes={activePipes}
            onMeshReady={sequenceMode ? handleSequenceMeshReady : undefined}
            onPrimaryMeshClick={() => {
              const mainInst = effectInstances.find(
                (i) => i.type === "mainText",
              );
              if (!mainInst) return;
              const layout = itemLayouts.current[mainInst.id];
              if (layout)
                controlsScrollRef.current?.scrollTo({
                  y: effectListContainerY.current + layout.y,
                  animated: true,
                });
            }}
            onNonPrimaryTap={(effectInstanceId) => {
              const layout = itemLayouts.current[effectInstanceId];
              if (layout)
                controlsScrollRef.current?.scrollTo({
                  y: effectListContainerY.current + layout.y,
                  animated: true,
                });
            }}
            onObjectTranslated={(effectInstanceId, x, y, z) => {
              setEffectInstances((prev) =>
                prev.map((inst) =>
                  inst.id === effectInstanceId
                    ? { ...inst, params: { ...inst.params, posX: x, posY: y, posZ: z } }
                    : inst,
                ),
              );
            }}
          />
          {(() => {
            const imgs = sequenceMode
              ? (visibleSequencePage.images ?? [])
              : (getActivePrincipalTextSet(mainTextParams).images ?? []);
            return imgs.length > 0 ? (
              <SlideImageOverlay
                key={
                  sequenceMode
                    ? `img-seq-${readySequenceTransition?.key ?? visibleSequencePage.id}`
                    : "img-active"
                }
                images={imgs}
              />
            ) : null;
          })()}
          {sequenceMode && readySequenceTransition?.key === currentSequencePageKey && (
            <SequenceTransitionOverlay
              key={`${readySequenceTransition.key}-${readySequenceTransition.nonce}`}
              page={readySequenceTransition.page}
            />
          )}
          {sequenceMode && !fullWindow && (
            <View
              style={[
                styles.sequenceBadge,
                {
                  pointerEvents: "none",
                  backgroundColor:
                    colorScheme === "dark"
                      ? "rgba(0,0,0,0.62)"
                      : "rgba(255,255,255,0.82)",
                  borderColor: c.tint,
                },
              ]}
            >
              <Text style={{ color: c.text, fontSize: 12, fontWeight: "700" }}>
                {visibleSequenceLineIndex + 1}/{sequencePages.length}
              </Text>
              <Text style={{ color: c.text, fontSize: 11, opacity: 0.7 }}>
                {visibleSequencePage.setName}
              </Text>
              <Text style={{ color: c.text, fontSize: 11, opacity: 0.7 }}>
                {Math.round(visibleSequencePage.durationMs / 100) / 10}s
              </Text>
            </View>
          )}
          {/* Mute toggle (only visible in sequence mode, not in full-window) */}
          {sequenceMode && !fullWindow && (
            <TouchableOpacity
              onPress={() => setIsMuted((m) => !m)}
              style={{
                position: 'absolute',
                top: 10,
                right: 52,
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: isMuted ? 'rgba(200,60,60,0.75)' : 'rgba(0,0,0,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, lineHeight: 18 }}>
                {isMuted ? '🔇' : '🔊'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Fullscreen toggle button — hidden in full-window mode */}
          {!fullWindow && (
            <TouchableOpacity
              onPress={toggleFullscreen}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: 'rgba(0,0,0,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, lineHeight: 18 }}>
                {isFullscreen ? '⤡' : '⤢'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isFullscreen && (
          <GestureDetector gesture={dividerGesture}>
            <View style={styles.dividerHandle}>
              <View style={styles.dividerGrip} />
            </View>
          </GestureDetector>
        )}

        <Animated.View style={[styles.controls, controlsAnimStyle]}>
          <ScrollView
            ref={controlsScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {/* ── Effects ── */}
            <Text style={[styles.groupLabel, { color: c.text }]}>
              {t("effects")}
            </Text>
            <View style={styles.effectListContainer} onLayout={(e) => { effectListContainerY.current = e.nativeEvent.layout.y; }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginHorizontal: 12,
                }}
              >
                <Text style={[styles.label, { color: c.text }]}>
                  {t("pipelinePresets")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "flex-end",
                    flex: 1,
                  }}
                >
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: c.tint, backgroundColor: c.tint + '22' }]}
                    onPress={handleRandom}
                  >
                    <Text style={[styles.buttonText, { color: c.tint, fontWeight: '700' }]}>
                      {`🎲 ${t("randomConfig")}`}
                      {triedEffectsSet.size < totalAddableCount
                        ? ` (${totalAddableCount - triedEffectsSet.size} new)`
                        : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: c.tint }]}
                    onPress={handleResetToBasic}
                  >
                    <Text style={[styles.buttonText, { color: c.tint }]}>
                      {t("resetToBasic")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: c.tint }]}
                    onPress={handleSavePreset}
                  >
                    <Text style={[styles.buttonText, { color: c.tint }]}>
                      {t("savePreset")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: c.tint }]}
                    onPress={handleDuplicatePreset}
                  >
                    <Text style={[styles.buttonText, { color: c.tint }]}>
                      {t("duplicatePreset")}
                    </Text>
                  </TouchableOpacity>
                  {presets.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.smallActionButton,
                        { borderColor: c.tint },
                      ]}
                      onPress={() => router.push("/(tabs)/presets")}
                    >
                      <Text style={[styles.buttonText, { color: c.tint }]}>
                        {t("loadPreset")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={{ marginHorizontal: 12, marginVertical: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                    gap: 8,
                  }}
                >
                  <Text style={[styles.label, { color: c.text }]}>
                    {t("addEffect")}
                  </Text>
                  <TextInput
                    style={[
                      styles.searchInput,
                      {
                        borderColor: c.tint,
                        color: c.text,
                        flex: 1,
                        marginBottom: 0,
                      },
                    ]}
                    placeholder="Search effects..."
                    placeholderTextColor={
                      colorScheme === "dark" ? "#666" : "#999"
                    }
                    value={selectedEffectSearch}
                    onChangeText={setSelectedEffectSearch}
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setAiChatTarget({ id: null, code: "", description: "" })
                    }
                    style={[
                      styles.smallActionButton,
                      { borderColor: c.tint, paddingHorizontal: 10 },
                    ]}
                  >
                    <Text
                      style={{ color: c.tint, fontSize: 13, fontWeight: "600" }}
                    >
                      AI
                    </Text>
                  </TouchableOpacity>
                </View>
                <View>
                  {selectedEffectSearch.length > 0 ? (
                    <View
                      style={[styles.effectSearchList, { borderColor: c.tint }]}
                    >
                      {EFFECT_TYPES.filter((e) => {
                        if (e.primary) return false;
                        const q = selectedEffectSearch.toLowerCase();
                        const base = (t(`eff_${e.type}`) + " " + e.type).toLowerCase();
                        if (base.includes(q)) return true;
                        const eng = (EFFECT_KEYWORDS[e.type] ?? []).join(" ").toLowerCase();
                        if (eng.includes(q)) return true;
                        const loc = t(`eff_${e.type}_kw`, { defaultValue: "" }).toLowerCase();
                        return loc.includes(q);
                      }).map((e) => (
                        <TouchableOpacity
                          key={e.type}
                          style={styles.effectSearchItem}
                          onPress={() => {
                            addEffectInstance(e.type);
                            setSelectedEffectSearch("");
                          }}
                        >
                          <Text style={{ color: c.text }}>
                            {t(`eff_${e.type}`)}
                          </Text>
                          {e.animated && (
                            <Text
                              style={{
                                color: "#ff9800",
                                fontSize: 11,
                                fontWeight: "bold",
                              }}
                            >
                              {" "}
                              A
                            </Text>
                          )}
                          {e.target && (
                            <Text style={{ color: "#888", fontSize: 11 }}>
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
                      {EFFECT_TYPES.filter(
                        (e) =>
                          !e.primary &&
                          (showMoreEffects ||
                            !DEFAULT_HIDDEN_EFFECT_TYPES.has(e.type)),
                      ).map((e) => (
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
                            {t(`eff_${e.type}`)}
                          </Text>
                          {e.animated && (
                            <View
                              style={[
                                styles.targetBadge,
                                { backgroundColor: "#ff9800" },
                              ]}
                            >
                              <Text style={{ color: "#fff", fontSize: 10 }}>
                                A
                              </Text>
                            </View>
                          )}
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
                      {EFFECT_TYPES.some(
                        (e) => !e.primary && DEFAULT_HIDDEN_EFFECT_TYPES.has(e.type),
                      ) && (
                        <TouchableOpacity
                          style={[
                            styles.effectPill,
                            {
                              borderColor: c.tint,
                              backgroundColor:
                                colorScheme === "dark" ? "#181818" : "#f7f7f7",
                            },
                          ]}
                          onPress={() => setShowMoreEffects((value) => !value)}
                        >
                          <Text
                            style={[
                              styles.effectPillText,
                              { color: c.tint, marginRight: 0 },
                            ]}
                          >
                            {showMoreEffects ? "Less" : "More..."}
                          </Text>
                        </TouchableOpacity>
                      )}
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
                    backgroundColor:
                      colorScheme === "dark" ? "#161616" : "#fff",
                  }}
                >
                  <Text style={{ color: c.text }}>
                    {t("deleted", {
                      name: effectTypeLabel(lastDeleted.item.type, t),
                    })}
                  </Text>
                  <TouchableOpacity
                    onPress={undoDelete}
                    style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ color: c.tint }}>{t("undo")}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {effectInstances.filter((i) => i.type !== "mainText").length ===
                0 && (
                <Text
                  style={[
                    styles.label,
                    {
                      color: c.text,
                      opacity: 0.5,
                      marginHorizontal: 12,
                      marginVertical: 8,
                    },
                  ]}
                >
                  {t("noAdditionalEffects")}
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
                    if (pendingScrollNewId.current === instance.id) {
                      pendingScrollNewId.current = null;
                      const scrollY = effectListContainerY.current + e.nativeEvent.layout.y;
                      setTimeout(() => controlsScrollRef.current?.scrollTo({ y: scrollY, animated: true }), 50);
                    }
                  }}
                  style={[
                    styles.effectCard,
                    {
                      pointerEvents: draggingId === instance.id ? "none" : "auto",
                      borderColor: c.tint,
                      backgroundColor:
                        colorScheme === "dark" ? "#1f1f1f" : "#fafafa",
                    },
                    draggingId === instance.id && styles.hiddenItem,
                  ]}
                >
                  <View style={styles.effectCardHeader}>
                    {instance.type !== "mainText" && (
                      <GestureDetector gesture={createDragGesture(instance.id)}>
                        <View style={styles.dragHandle}>
                          <Text style={[styles.buttonText, { color: c.tint }]}>
                            ≡
                          </Text>
                        </View>
                      </GestureDetector>
                    )}
                    <View style={{ flex: 1 }}>
                      <SectionHeader
                        title={`${index + 1}. ${effectTypeLabel(instance.type, t)}`}
                        enabled={instance.enabled}
                        onToggle={() => toggleEffectEnabled(instance.id)}
                        colors={c}
                      />
                    </View>
                    {instance.type !== "mainText" && (
                      <Row>
                        <TouchableOpacity
                          style={styles.smallActionButton}
                          onPress={() => toggleEffectAnimate(instance.id)}
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              {
                                color:
                                  (instance.animate ?? true) ? c.tint : "#666",
                              },
                            ]}
                          >
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
                    )}
                  </View>
                  {instance.enabled && (
                    <>
                      {isAnimatedEffectType(instance.type) && (
                        <SliderRow
                          label="Speed"
                          min={0}
                          max={4}
                          step={0.05}
                          value={commonSpeedValue(instance.params)}
                          onChange={(value) =>
                            updateEffectParam(instance.id, "commonSpeed", value)
                          }
                          colors={c}
                        />
                      )}
                      {renderEffectControls(
                        instance,
                        c,
                        t,
                        (key, value) =>
                          updateEffectParam(instance.id, key, value),
                        confirm,
                        (id, code, desc) =>
                          setAiChatTarget({ id, code, description: desc }),
                        colorScheme ?? "light",
                        (instanceId, paramKey) =>
                          setImagePickerTarget({ mode: "effect", instanceId, paramKey }),
                        (textSetId, imageId) =>
                          setImagePickerTarget({ mode: "slide", textSetId, imageId }),
                      )}
                    </>
                  )}
                </View>
              ))}

              {draggingItem && (
                <Animated.View
                  style={[
                    styles.effectCard,
                    styles.draggingOverlay,
                    {
                      pointerEvents: "none",
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
                      >{`Dragging: ${effectTypeLabel(draggingItem.type, t)}`}</Text>
                    </View>
                  </View>
                  {renderEffectControls(
                    draggingItem,
                    c,
                    t,
                    () => undefined,
                    confirm,
                    undefined,
                    colorScheme ?? "light",
                  )}
                </Animated.View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.advancedToggle, { borderColor: "#555" }]}
              onPress={() => setShowAdvanced((v) => !v)}
            >
              <Text style={[styles.buttonText, { color: "#888" }]}>
                {showAdvanced
                  ? `▲ ${t("hideAdvanced")}`
                  : `▼ ${t("showAdvanced")}`}
              </Text>
            </TouchableOpacity>

            {/* Language picker */}
            <View style={[styles.controlRow, { marginTop: 8 }]}>
              <Text style={[styles.label, { color: c.text }]}>
                {t("language")}
              </Text>
              {typeof document !== "undefined" ? (
                <select
                  value={i18nInstance.language}
                  onChange={(e: any) =>
                    i18nInstance.changeLanguage(e.target.value)
                  }
                  style={
                    {
                      background:
                        colorScheme === "dark" ? "#1a1a1a" : "#ffffff",
                      color: c.text as string,
                      border: `1px solid ${c.tint}`,
                      borderRadius: "5px",
                      padding: "4px 8px",
                      fontSize: "13px",
                      cursor: "pointer",
                      outline: "none",
                    } as any
                  }
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              ) : (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => i18nInstance.changeLanguage(lang.code)}
                      style={[
                        styles.smallActionButton,
                        {
                          borderColor:
                            i18nInstance.language === lang.code
                              ? c.tint
                              : "#555",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          {
                            color:
                              i18nInstance.language === lang.code
                                ? c.tint
                                : c.text,
                          },
                        ]}
                      >
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Export button */}
            <TouchableOpacity
              style={[
                styles.advancedToggle,
                { borderColor: c.tint, marginTop: 4 },
              ]}
              onPress={() => setShowExportModal(true)}
            >
              <Text style={[styles.buttonText, { color: c.tint }]}>
                {t("export")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>

      {/* Modals */}
      {aiChatTarget !== null && (
        <AiEffectChatModal
          visible
          onClose={() => setAiChatTarget(null)}
          onApplyEffect={(code, desc) =>
            handleApplyAiEffect(code, desc, aiChatTarget.id)
          }
          initialCode={aiChatTarget.code || undefined}
          initialDescription={aiChatTarget.description || undefined}
        />
      )}
      <ExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        captureFrame={() =>
          threeDTextRef.current?.captureFrame() ?? Promise.resolve(null)
        }
        getMesh={() => threeDTextRef.current?.getMesh() ?? null}
        getScene={() => threeDTextRef.current?.getScene() ?? null}
      />
      <ImagePickerModal
        visible={imagePickerTarget !== null}
        onClose={() => setImagePickerTarget(null)}
        onSelect={({ dataUrl }) => {
          if (!imagePickerTarget) return;
          if (imagePickerTarget.mode === "effect") {
            updateEffectParam(imagePickerTarget.instanceId, imagePickerTarget.paramKey, dataUrl);
          } else {
            updateSlideImage(imagePickerTarget.textSetId, dataUrl, imagePickerTarget.imageId);
          }
          setImagePickerTarget(null);
        }}
        onSelectAnimated={({ scale, scheme }) => {
          // Add or update the fractalBackground effect with animated plasma settings.
          setEffectInstances((instances) => {
            const existing = instances.find((i) => i.type === 'fractalBackground');
            if (existing) {
              return instances.map((i) =>
                i.type === 'fractalBackground'
                  ? { ...i, params: { ...i.params, fractalType: 'plasma', scheme, zoom: scale } }
                  : i,
              );
            }
            const newInst = createEffectInstance('fractalBackground');
            return [...instances, { ...newInst, params: { ...newInst.params, fractalType: 'plasma', scheme, zoom: scale } }];
          });
          setImagePickerTarget(null);
        }}
        tint={c.tint}
        textColor={c.text}
        background={colorScheme === "dark" ? "#1e1e1e" : "#fff"}
        borderColor={colorScheme === "dark" ? "#333" : "#ccc"}
      />

      {/* Preset picker modal */}
      {/* Save preset name modal */}
      <Modal
        visible={showSavePresetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSavePresetModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              backgroundColor: colorScheme === "dark" ? "#1e1e1e" : "#fff",
              borderRadius: 14,
              padding: 20,
              gap: 14,
            }}
          >
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>
              {t("savePreset")}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: c.tint,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: c.text,
                fontSize: 14,
                backgroundColor: colorScheme === "dark" ? "#111" : "#fafafa",
              }}
              value={draftPresetName}
              onChangeText={setDraftPresetName}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={confirmSavePreset}
              returnKeyType="done"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowSavePresetModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#555",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: c.text, fontSize: 14 }}>
                  {t("cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSavePreset}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: c.tint,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: colorScheme === "dark" ? "#000" : "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {t("savePreset")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {confirmDialog}

    </SafeAreaView>
  );
}

export default ThreeDTextScreen;


function SequenceTransitionOverlay({ page }: { page: SequencePage }) {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("sequence-transition-styles")) return;
    const style = document.createElement("style");
    style.id = "sequence-transition-styles";
    style.textContent = `
      @keyframes seqFlare {
        0% { opacity: 0; transform: scale(0.92); filter: blur(10px); }
        18% { opacity: 0.95; transform: scale(1.02); filter: blur(0); }
        100% { opacity: 0; transform: scale(1.18); filter: blur(12px); }
      }
      @keyframes seqSlide {
        0% { opacity: 0.88; transform: translateX(-100%) skewX(-12deg); }
        42% { opacity: 0.72; transform: translateX(8%) skewX(-12deg); }
        100% { opacity: 0; transform: translateX(115%) skewX(-12deg); }
      }
      @keyframes seqZoom {
        0% { opacity: 0; transform: scale(1.35) rotate(-2deg); }
        22% { opacity: 0.7; transform: scale(1.02) rotate(0deg); }
        100% { opacity: 0; transform: scale(0.88) rotate(1deg); }
      }
      @keyframes seqWipe {
        0% { opacity: 0.9; clip-path: inset(0 100% 0 0); }
        40% { opacity: 0.68; clip-path: inset(0 0 0 0); }
        100% { opacity: 0; clip-path: inset(0 0 0 100%); }
      }
      .sequence-transition {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5;
        mix-blend-mode: screen;
        overflow: hidden;
      }
      .sequence-transition::before,
      .sequence-transition::after {
        content: "";
        position: absolute;
        inset: -18%;
      }
      .sequence-transition-flare::before {
        background:
          radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95), rgba(255,120,0,0.45) 20%, rgba(0,170,255,0.18) 46%, transparent 72%);
        animation: seqFlare 900ms cubic-bezier(.16,1,.3,1) both;
      }
      .sequence-transition-slide::before {
        width: 58%;
        left: -18%;
        background: linear-gradient(100deg, transparent, rgba(255,255,255,0.92), rgba(255,118,0,0.54), transparent);
        animation: seqSlide 820ms cubic-bezier(.22,1,.36,1) both;
      }
      .sequence-transition-zoom::before {
        background:
          repeating-conic-gradient(from 20deg, rgba(255,255,255,.26) 0deg 7deg, transparent 7deg 18deg),
          radial-gradient(circle, rgba(0,170,255,0.28), rgba(255,102,0,0.42), transparent 62%);
        animation: seqZoom 980ms cubic-bezier(.16,1,.3,1) both;
      }
      .sequence-transition-wipe::before {
        background: linear-gradient(90deg, rgba(0,170,255,0.2), rgba(255,255,255,0.86), rgba(255,102,0,0.5));
        animation: seqWipe 760ms cubic-bezier(.65,0,.35,1) both;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`sequence-transition sequence-transition-${page.transition}`}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, flexDirection: "column" },
  canvas: { flex: 1, width: "100%", minHeight: 0 },
  dividerHandle: {
    height: 14,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    cursor: "row-resize" as any,
    zIndex: 10,
  },
  dividerGrip: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#aaa",
  },
  controls: {
    flexShrink: 0,
    overflow: "hidden" as any,
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
  label: { fontSize: 13, fontWeight: "500", minWidth: 90 },
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
  textSetChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 132,
  },
  sequenceBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 10,
    gap: 2,
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
    boxShadow: "0 8px 10px rgba(0,0,0,0.15)",
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
