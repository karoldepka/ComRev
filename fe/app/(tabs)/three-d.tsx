import { ThreeDText, ThreeDTextHandle } from "@/components/three-d-text";
import { ExportModal } from "@/components/ExportModal";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    consumePendingPresetToLoad,
    deletePreset,
    deletePresetFromBackend,
    getLatestConfig,
    getPendingSyncCount,
    getPresets,
    loadPresetsFromBackend,
    PresetRecord,
    saveConfigOfflineFirst,
    savePreset,
    savePresetOfflineFirst,
    syncPendingConfigs,
    ThreeDConfig,
} from "@/utils/config-store";
import { useFocusEffect } from "expo-router";
import {
    // base
    EffectPipe,
    // vertex deform
    BendPipe, FishEyePipe, WavePipe, TwistPipe, InflatePipe, TaperPipe, ShearPipe,
    SpherifyPipe, RipplePipe, MeltPipe, PinchPipe, VoxelizePipe, CrumplePipe,
    NoiseWobblePipe, SpiralDeformPipe, BulgePipe, SquishPipe, ZapPipe, ExplodePipe,
    FoldPipe, SpikesPipe, CylindrizePipe,
    // post-process
    BloomPipe, DepthOfFieldPipe, FilmGrainPipe, GlitchPipe,
    ChromaticAberrationPipe, VignettePipe, ScanlinesPipe, ColorGradingPipe, PixelatePipe,
    RadialBlurPipe, CircularBlurPipe, SepiaPipe, InvertPipe, SobelEdgePipe, ThermalPipe,
    NightVisionPipe, DuotonePipe, PosterizePipe, ColorOverlayPipe, HalftonePipe,
    SharpenPipe, AnimChromaticPipe, BlurPipe, LensDistortPipe, MosaicPipe, NoisePostPipe,
    CrtCurvaturePipe, VhsTrackingPipe, GlowEdgePipe, AcidPipe, KaleidoscopePostPipe,
    OldFilmPipe, ZoomBlurPipe, CrosshatchPipe, GlitchBlockPipe, SpeedLinesPipe,
    RgbShiftPipe, FrostedGlassPipe, WaterRipplePipe, PixelShiftPipe, RetroTvPipe,
    AntialiasingPipe,
    // material
    EnvMapPipe, EnvMapStyle, NeonGlowPipe, MetallicPreset, MetallicPresetPipe,
    XRayPipe, ToonShadingPipe, HologramPipe, GradientMeshPipe, RainbowMeshPipe,
    IridescentPipe, EmissivePulsePipe, DissolveAnimPipe, GlassPipe, MatcapPipe,
    // lighting
    SpotlightPipe, StrobePipe, FlickerPipe, ColorCycleLightPipe, DiscoPipe,
    AmbientPulsePipe, RimLightPipe, DramaticLightPipe, LightningFlashPipe, RainbowLightsPipe,
    // scene objects
    ParticleDustPipe, WireframePipe, OutlinePipe, EchoCopiesPipe, RaysPipe,
    FloatingRingsPipe, StarField3dPipe, SnowPipe, RainPipe, ConfettiPipe, SparklePipe,
    AuraPipe, GridFloorPipe, OrbiterPipe, PortalRingPipe, CometTrailPipe,
    FloatingCubesPipe, MirrorPlanePipe,
    // animation
    PulsePipe, SpinPipe, BouncePipe, LevitationPipe, SwingPipe, TremplePipe,
    BreathePipe, WigglePipe, FloatDriftPipe, FlipCoinPipe, GrowPipe, ShrinkPipe,
    OrbitAnimPipe, RockPipe, JitterPipe, SwayPipe, FigureEightPipe, PendulumPipe,
    // ai-generated
    CustomJsPipe,
    MainTextPipe,
    Text3dPipe,
    GraphicsPipe,
    FlatShadePipe,
    ShadowFloorPipe,
    BackgroundPlanePipe,
    FogEffectPipe,
    EmbossPipe,
    ThresholdPipe,
    MirrorHPipe,
    MirrorVPipe,
    SketchPipe,
    SunsetLightPipe,
    StudioLightPipe,
    MoonLightPipe,
    ChromeEdgePipe,
    ColorBurnPipe,
    DepthLinesPipe,
} from "@/utils/three-text-pipes";
import { AVAILABLE_FONTS } from "@/utils/three-text-geometry";
import { AiEffectChatModal } from "@/components/AiEffectChatModal";
import { SUPPORTED_LANGUAGES } from "@/utils/i18n";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid/non-secure";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert, Modal, SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
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
  label1, label2,
  min, max, step,
  value1, value2,
  onChange1, onChange2,
  locked, onLockToggle,
  colors,
}: {
  label1: string; label2: string;
  min: number; max: number; step: number;
  value1: number; value2: number;
  onChange1: (v: number) => void; onChange2: (v: number) => void;
  locked: boolean; onLockToggle: () => void;
  colors: any;
}) {
  const handle1 = (v: number) => { onChange1(v); if (locked) onChange2(v); };
  const handle2 = (v: number) => { onChange2(v); if (locked) onChange1(v); };
  const lockBtn = (
    <TouchableOpacity onPress={onLockToggle} style={styles.smallActionButton}>
      <Text style={[styles.buttonText, { color: colors.tint }]}>{locked ? '🔒' : '🔓'}</Text>
    </TouchableOpacity>
  );
  return (
    <>
      <SliderRow label={label1} min={min} max={max} step={step} value={value1} onChange={handle1} colors={colors} />
      <SliderRow label={label2} min={min} max={max} step={step} value={value2} onChange={handle2} colors={colors} rightWidget={lockBtn} />
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

type EffectType =
  // primary text
  | "mainText"
  // post-process
  | "bloom" | "depthOfField" | "chromatic" | "filmGrain" | "glitch"
  | "vignette" | "scanlines" | "colorGrading" | "pixelate" | "radialBlur"
  | "circularBlur" | "sepia" | "invert" | "sobelEdge" | "thermal"
  | "nightVision" | "duotone" | "posterize" | "colorOverlay" | "halftone"
  | "sharpen" | "animChromatic" | "blur" | "lensDistort" | "mosaic"
  | "noisePost" | "crtCurvature" | "vhsTracking" | "glowEdge" | "acid"
  | "kaleidoscopePost" | "oldFilm" | "zoomBlur" | "crosshatch" | "glitchBlock"
  | "speedLines" | "rgbShift" | "frostedGlass" | "waterRipple" | "pixelShift"
  | "retroTv" | "antialiasing"
  // vertex deform
  | "fishEye" | "bend" | "wave" | "twist" | "inflate" | "taper" | "shear"
  | "spherify" | "ripple" | "melt" | "pinch" | "voxelize" | "crumple"
  | "noiseWobble" | "spiralDeform" | "bulge" | "squish" | "zap" | "explode"
  | "fold" | "spikes" | "cylindrize"
  // material
  | "envMap" | "neonGlow" | "metallicPreset" | "xRay" | "toonShading"
  | "hologram" | "gradientMesh" | "rainbowMesh" | "iridescent"
  | "emissivePulse" | "dissolveAnim" | "glass" | "matcap"
  // lighting
  | "spotlight" | "strobe" | "flicker" | "colorCycleLight" | "disco"
  | "ambientPulse" | "rimLight" | "dramaticLight" | "lightningFlash" | "rainbowLights"
  // scene objects
  | "dust" | "wireframe" | "outline" | "echoCopies" | "rays"
  | "floatingRings" | "starField3d" | "snow" | "rain" | "confetti"
  | "sparkle" | "aura" | "gridFloor" | "orbiter" | "portalRing"
  | "cometTrail" | "floatingCubes" | "mirrorPlane"
  // animation
  | "pulse" | "spin" | "bounce" | "levitation" | "swing" | "tremble"
  | "breathe" | "wiggle" | "floatDrift" | "flipCoin" | "grow" | "shrink"
  | "orbitAnim" | "rock" | "jitter" | "sway" | "figureEight" | "pendulum"
  // ai-generated
  | "customJs"
  // added effects
  | "text3d" | "graphics"
  // static effects
  | "flatShade" | "shadowFloor" | "backgroundPlane" | "fogEffect"
  | "emboss" | "threshold" | "mirrorH" | "mirrorV" | "sketch"
  | "sunsetLight" | "studioLight" | "moonLight" | "chromeEdge"
  | "colorBurn" | "depthLines";

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
  { type: "bloom",          label: "Bloom",           target: "post" },
  { type: "depthOfField",   label: "Depth of Field",  target: "post" },
  { type: "chromatic",      label: "Chromatic",       target: "post" },
  { type: "filmGrain",      label: "Film Grain",      target: "post" },
  { type: "glitch",         label: "Glitch",          target: "post",  animated: true },
  { type: "vignette",       label: "Vignette",        target: "post" },
  { type: "scanlines",      label: "Scanlines",       target: "post" },
  { type: "colorGrading",   label: "Color Grading",   target: "post" },
  { type: "pixelate",       label: "Pixelate",        target: "post" },
  { type: "radialBlur",     label: "Radial Blur",     target: "post" },
  { type: "circularBlur",   label: "Circular Blur",   target: "post" },
  { type: "sepia",          label: "Sepia",           target: "post" },
  { type: "invert",         label: "Invert",          target: "post" },
  { type: "sobelEdge",      label: "Sobel Edge",      target: "post" },
  { type: "thermal",        label: "Thermal",         target: "post" },
  { type: "nightVision",    label: "Night Vision",    target: "post" },
  { type: "duotone",        label: "Duotone",         target: "post" },
  { type: "posterize",      label: "Posterize",       target: "post" },
  { type: "colorOverlay",   label: "Color Overlay",   target: "post" },
  { type: "halftone",       label: "Halftone",        target: "post" },
  { type: "sharpen",        label: "Sharpen",         target: "post" },
  { type: "animChromatic",  label: "Anim Chromatic",  target: "post",  animated: true },
  { type: "blur",           label: "Blur",            target: "post" },
  { type: "lensDistort",    label: "Lens Distort",    target: "post" },
  { type: "mosaic",         label: "Mosaic",          target: "post" },
  { type: "noisePost",      label: "Noise",           target: "post" },
  { type: "crtCurvature",   label: "CRT Curvature",   target: "post" },
  { type: "vhsTracking",    label: "VHS Tracking",    target: "post",  animated: true },
  { type: "glowEdge",       label: "Glow Edge",       target: "post" },
  { type: "acid",           label: "Acid",            target: "post",  animated: true },
  { type: "kaleidoscopePost",label:"Kaleidoscope",    target: "post" },
  { type: "oldFilm",        label: "Old Film",        target: "post",  animated: true },
  { type: "zoomBlur",       label: "Zoom Blur",       target: "post" },
  { type: "crosshatch",     label: "Crosshatch",      target: "post" },
  { type: "glitchBlock",    label: "Glitch Block",    target: "post",  animated: true },
  { type: "speedLines",     label: "Speed Lines",     target: "post" },
  { type: "rgbShift",       label: "RGB Shift",       target: "post" },
  { type: "frostedGlass",   label: "Frosted Glass",   target: "post" },
  { type: "waterRipple",    label: "Water Ripple",    target: "post",  animated: true },
  { type: "pixelShift",     label: "Pixel Shift",     target: "post",  animated: true },
  { type: "retroTv",        label: "Retro TV",        target: "post",  animated: true },
  { type: "antialiasing",   label: "Antialiasing",    target: "post" },
  // Post-process static
  { type: "emboss",         label: "Emboss",          target: "post" },
  { type: "threshold",      label: "Threshold",       target: "post" },
  { type: "mirrorH",        label: "Mirror H",        target: "post" },
  { type: "mirrorV",        label: "Mirror V",        target: "post" },
  { type: "sketch",         label: "Sketch",          target: "post" },
  { type: "colorBurn",      label: "Color Burn",      target: "post" },
  { type: "depthLines",     label: "Depth Lines",     target: "post" },
  // Vertex deform
  { type: "fishEye",        label: "Fish Eye",        target: "geometry" },
  { type: "bend",           label: "Bend",            target: "geometry" },
  { type: "wave",           label: "Wave",            target: "geometry",  animated: true },
  { type: "twist",          label: "Twist",           target: "geometry" },
  { type: "inflate",        label: "Inflate",         target: "geometry" },
  { type: "taper",          label: "Taper",           target: "geometry" },
  { type: "shear",          label: "Shear",           target: "geometry" },
  { type: "spherify",       label: "Spherify",        target: "geometry" },
  { type: "ripple",         label: "Ripple",          target: "geometry",  animated: true },
  { type: "melt",           label: "Melt",            target: "geometry",  animated: true },
  { type: "pinch",          label: "Pinch",           target: "geometry" },
  { type: "voxelize",       label: "Voxelize",        target: "geometry" },
  { type: "crumple",        label: "Crumple",         target: "geometry" },
  { type: "noiseWobble",    label: "Noise Wobble",    target: "geometry",  animated: true },
  { type: "spiralDeform",   label: "Spiral Deform",   target: "geometry" },
  { type: "bulge",          label: "Bulge",           target: "geometry" },
  { type: "squish",         label: "Squish",          target: "geometry" },
  { type: "zap",            label: "Zap",             target: "geometry",  animated: true },
  { type: "explode",        label: "Explode",         target: "geometry",  animated: true },
  { type: "fold",           label: "Fold",            target: "geometry" },
  { type: "spikes",         label: "Spikes",          target: "geometry" },
  { type: "cylindrize",     label: "Cylindrize",      target: "geometry" },
  // Material
  { type: "envMap",         label: "Env Map",         target: "geometry" },
  { type: "neonGlow",       label: "Neon Glow",       target: "geometry",  animated: true },
  { type: "metallicPreset", label: "Metallic",        target: "geometry" },
  { type: "xRay",           label: "X-Ray",           target: "geometry" },
  { type: "toonShading",    label: "Toon Shading",    target: "geometry" },
  { type: "hologram",       label: "Hologram",        target: "geometry",  animated: true },
  { type: "gradientMesh",   label: "Gradient Mesh",   target: "geometry" },
  { type: "rainbowMesh",    label: "Rainbow Mesh",    target: "geometry",  animated: true },
  { type: "iridescent",     label: "Iridescent",      target: "geometry",  animated: true },
  { type: "emissivePulse",  label: "Emissive Pulse",  target: "geometry",  animated: true },
  { type: "dissolveAnim",   label: "Dissolve",        target: "geometry",  animated: true },
  { type: "glass",          label: "Glass",           target: "geometry" },
  { type: "matcap",         label: "Matcap",          target: "geometry" },
  { type: "flatShade",      label: "Flat Shade",      target: "geometry" },
  { type: "chromeEdge",     label: "Chrome Edge",     target: "geometry" },
  // Lighting
  { type: "spotlight",      label: "Spotlight" },
  { type: "strobe",         label: "Strobe",          animated: true },
  { type: "flicker",        label: "Flicker",         animated: true },
  { type: "colorCycleLight",label: "Color Cycle Light", animated: true },
  { type: "disco",          label: "Disco",           animated: true },
  { type: "ambientPulse",   label: "Ambient Pulse",   animated: true },
  { type: "rimLight",       label: "Rim Light" },
  { type: "dramaticLight",  label: "Dramatic Light" },
  { type: "lightningFlash", label: "Lightning Flash", animated: true },
  { type: "rainbowLights",  label: "Rainbow Lights",  animated: true },
  { type: "sunsetLight",    label: "Sunset Light" },
  { type: "studioLight",    label: "Studio Light" },
  { type: "moonLight",      label: "Moon Light" },
  // Scene objects
  { type: "dust",           label: "Particle Dust",   target: "geometry",  animated: true },
  { type: "wireframe",      label: "Wireframe",       target: "geometry" },
  { type: "outline",        label: "Outline",         target: "geometry" },
  { type: "echoCopies",     label: "Echo Copies",     target: "geometry" },
  { type: "rays",           label: "Rays",            target: "geometry" },
  { type: "floatingRings",  label: "Floating Rings",  target: "geometry",  animated: true },
  { type: "starField3d",    label: "Star Field 3D",   target: "geometry",  animated: true },
  { type: "snow",           label: "Snow",            target: "geometry",  animated: true },
  { type: "rain",           label: "Rain",            target: "geometry",  animated: true },
  { type: "confetti",       label: "Confetti",        target: "geometry",  animated: true },
  { type: "sparkle",        label: "Sparkle",         target: "geometry",  animated: true },
  { type: "aura",           label: "Aura",            target: "geometry",  animated: true },
  { type: "gridFloor",      label: "Grid Floor",      target: "geometry" },
  { type: "orbiter",        label: "Orbiter",         target: "geometry",  animated: true },
  { type: "portalRing",     label: "Portal Ring",     target: "geometry",  animated: true },
  { type: "cometTrail",     label: "Comet Trail",     target: "geometry",  animated: true },
  { type: "floatingCubes",  label: "Floating Cubes",  target: "geometry",  animated: true },
  { type: "mirrorPlane",    label: "Mirror Plane",    target: "geometry" },
  { type: "shadowFloor",    label: "Shadow Floor",    target: "geometry" },
  { type: "backgroundPlane",label: "Background Plane",target: "geometry" },
  { type: "fogEffect",      label: "Fog Effect",      target: "geometry" },
  // Animation
  { type: "pulse",          label: "Pulse",           target: "geometry",  animated: true },
  { type: "spin",           label: "Spin",            target: "geometry",  animated: true },
  { type: "bounce",         label: "Bounce",          target: "geometry",  animated: true },
  { type: "levitation",     label: "Levitation",      target: "geometry",  animated: true },
  { type: "swing",          label: "Swing",           target: "geometry",  animated: true },
  { type: "tremble",        label: "Tremble",         target: "geometry",  animated: true },
  { type: "breathe",        label: "Breathe",         target: "geometry",  animated: true },
  { type: "wiggle",         label: "Wiggle",          target: "geometry",  animated: true },
  { type: "floatDrift",     label: "Float Drift",     target: "geometry",  animated: true },
  { type: "flipCoin",       label: "Flip Coin",       target: "geometry",  animated: true },
  { type: "grow",           label: "Grow",            target: "geometry",  animated: true },
  { type: "shrink",         label: "Shrink",          target: "geometry",  animated: true },
  { type: "orbitAnim",      label: "Orbit",           target: "geometry",  animated: true },
  { type: "rock",           label: "Rock",            target: "geometry",  animated: true },
  { type: "jitter",         label: "Jitter",          target: "geometry",  animated: true },
  { type: "sway",           label: "Sway",            target: "geometry",  animated: true },
  { type: "figureEight",    label: "Figure Eight",    target: "geometry",  animated: true },
  { type: "pendulum",       label: "Pendulum",        target: "geometry",  animated: true },
  // AI-generated
  { type: "customJs",       label: "AI Custom",       target: "geometry" },
  // Added effects
  { type: "text3d",         label: "3D Text",          target: "geometry" },
  { type: "graphics",       label: "Add Graphics",     target: "geometry" },
];

function effectTypeLabel(type: EffectType, t: (k: string) => string) {
  return t(`eff_${type}`);
}

function createId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createDefaultEffectParams(type: EffectType): Record<string, unknown> {
  switch (type) {
    case "mainText":
      return {
        text: "Hi\nHello World\nThis is a very long line of text",
        fontFamily: "helvetiker",
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
      return { style: "gradient", intensity: 1.5, seed: 42, customImageDataUrl: undefined };
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
      return { count: 3, radiusMult: 1.6, speed: 0.25, thickness: 0.04, color: 0xff8800 };
    case "vignette":
      return { offset: 0.5, darkness: 1.0 };
    case "scanlines":
      return { count: 100, intensity: 0.3, scrollSpeed: 0 };
    case "colorGrading":
      return { hueShift: 0, saturation: 1.0, contrast: 1.0, brightness: 0 };
    case "pixelate":        return { pixelSize: 4 };
    case "circularBlur":   return { radius: 0.01, samples: 16 };
    case "sepia":          return { amount: 1 };
    case "invert":         return { amount: 1 };
    case "sobelEdge":      return { strength: 1 };
    case "thermal":        return { intensity: 1 };
    case "nightVision":    return { intensity: 0.8, noise: 0.2 };
    case "duotone":        return { colorA: 0xff6600, colorB: 0x0066ff };
    case "posterize":      return { levels: 4 };
    case "colorOverlay":   return { color: 0xff6600, opacity: 0.4 };
    case "halftone":       return { dotSize: 4 };
    case "sharpen":        return { amount: 1 };
    case "animChromatic":  return { amount: 0.01, speed: 1 };
    case "blur":           return { radius: 1 };
    case "lensDistort":    return { k: 0.3 };
    case "mosaic":         return { size: 0.05 };
    case "noisePost":      return { amount: 0.15, animated: true };
    case "crtCurvature":   return { bend: 4 };
    case "vhsTracking":    return { strength: 0.04, speed: 1 };
    case "glowEdge":       return { radius: 3, intensity: 1.5, color: 0xff6600 };
    case "acid":           return { strength: 0.08, speed: 1 };
    case "kaleidoscopePost": return { segments: 6 };
    case "oldFilm":        return { scratchIntensity: 0.3, vignetteAmount: 0.5, grainAmount: 0.08 };
    case "zoomBlur":       return { strength: 0.04, samples: 10 };
    case "crosshatch":     return { density: 8, lineWidth: 0.5 };
    case "glitchBlock":    return { intensity: 0.1, frequency: 1 };
    case "speedLines":     return { intensity: 0.5, lineCount: 48 };
    case "rgbShift":       return { amount: 0.005, angle: 0 };
    case "frostedGlass":   return { blur: 2 };
    case "waterRipple":    return { strength: 0.02, speed: 1, frequency: 10 };
    case "pixelShift":     return { amount: 3, speed: 1 };
    case "retroTv":        return { scanlineIntensity: 0.2, curvature: 5, noise: 0.05 };
    case "antialiasing":   return {};
    // vertex deform
    case "inflate":        return { strength: 0.5 };
    case "taper":          return { strength: 0.5, axis: "y" };
    case "shear":          return { strength: 0.3, axis: "x" };
    case "spherify":       return { strength: 0.5 };
    case "ripple":         return { amplitude: 0.3, frequency: 2, speed: 1.5 };
    case "melt":           return { strength: 0.5, speed: 0 };
    case "pinch":          return { strength: 0.5 };
    case "voxelize":       return { gridSize: 0.2 };
    case "crumple":        return { strength: 0.3, seed: 42 };
    case "noiseWobble":    return { amplitude: 0.3, frequency: 2, speed: 1 };
    case "spiralDeform":   return { twist: 0.3, flare: 0.2 };
    case "bulge":          return { strength: 0.5 };
    case "squish":         return { strength: 0.5, axis: "y" };
    case "zap":            return { strength: 1.5, density: 0.1 };
    case "explode":        return { strength: 0.5, pulse: false };
    case "fold":           return { strength: 0.5, axis: "y" };
    case "spikes":         return { strength: 2, density: 0.05, seed: 42 };
    case "cylindrize":     return { strength: 0.5, radius: 10 };
    // material
    case "xRay":           return { color: 0x00ffff, opacity: 0.4 };
    case "toonShading":    return { color: 0x44cc88, steps: 4 };
    case "hologram":       return { color: 0x00ffff, scanSpeed: 1 };
    case "gradientMesh":   return { colorTop: 0xff6600, colorBottom: 0x0066ff, animated: false };
    case "rainbowMesh":    return { speed: 0.3, saturation: 1 };
    case "iridescent":     return { speed: 1 };
    case "emissivePulse":  return { color: 0xff6600, minIntensity: 0, maxIntensity: 1.5, speed: 1.5 };
    case "dissolveAnim":   return { speed: 0.5, color: 0xff6600 };
    case "glass":          return { color: 0xaaddff, roughness: 0.05, transmission: 0.9 };
    case "matcap":         return { colorA: 0xff6600, colorB: 0xffffff, shininess: 0.5 };
    // lighting
    case "spotlight":      return { color: 0xffffff, intensity: 3, angle: 0.4, penumbra: 0.3 };
    case "strobe":         return { color: 0xffffff, frequency: 4, intensity: 5 };
    case "flicker":        return { color: 0xffa020, baseIntensity: 2, flickerAmount: 1.5 };
    case "colorCycleLight":return { speed: 0.5, intensity: 2, saturation: 1 };
    case "disco":          return { lightCount: 6, speed: 2, intensity: 2 };
    case "ambientPulse":   return { color: 0xffffff, minIntensity: 0.1, maxIntensity: 2, speed: 1 };
    case "rimLight":       return { color: 0x4488ff, intensity: 2 };
    case "dramaticLight":  return { keyColor: 0xfff4e0, fillColor: 0x203060 };
    case "lightningFlash": return { color: 0xaaccff, intensity: 8, frequency: 2 };
    case "rainbowLights":  return { count: 7, speed: 0.5, intensity: 1.5 };
    // scene objects
    case "echoCopies":     return { count: 4, offsetX: 0.3, offsetY: 0, offsetZ: -0.5, rotateY: 0, opacity: 0.4, color: 0xff6600, fade: true };
    case "starField3d":    return { count: 800, speed: 0.05, spread: 30 };
    case "snow":           return { count: 400, speed: 0.5, spread: 20 };
    case "rain":           return { count: 300, speed: 1, spread: 20 };
    case "confetti":       return { count: 60, speed: 1, spread: 15 };
    case "sparkle":        return { count: 200, color: 0xffffaa, spread: 8 };
    case "aura":           return { color: 0xff6600, opacity: 0.15, layers: 3, speed: 1 };
    case "gridFloor":      return { color: 0x444444, opacity: 0.4, size: 40, divisions: 40 };
    case "orbiter":        return { count: 4, color: 0xff6600, orbitRadius: 4, speed: 1, size: 0.3 };
    case "portalRing":     return { color: 0x00ffff, radius: 5, speed: 0.5 };
    case "cometTrail":     return { color: 0xffffff, speed: 1.2, count: 3 };
    case "floatingCubes":  return { count: 12, color: 0xff6600, spread: 10, speed: 0.5 };
    case "mirrorPlane":    return { opacity: 0.3, axis: "y", offset: 0 };
    // animation
    case "spin":           return { speedX: 0, speedY: 1, speedZ: 0 };
    case "bounce":         return { height: 1.5, speed: 2 };
    case "levitation":     return { amplitude: 0.5, speed: 0.8 };
    case "swing":          return { angle: 0.4, speed: 1, axis: "z" };
    case "tremble":        return { intensity: 0.05, speed: 20 };
    case "breathe":        return { depth: 0.08, speed: 0.4 };
    case "wiggle":         return { amount: 0.15, speed: 5 };
    case "floatDrift":     return { amplitude: 0.3, speed: 0.3 };
    case "flipCoin":       return { axis: "y", speed: 2 };
    case "grow":           return { targetScale: 1, speed: 1 };
    case "shrink":         return { targetScale: 0.5, speed: 1 };
    case "orbitAnim":      return { radius: 3, speed: 0.5, axis: "y" };
    case "rock":           return { angle: 0.2, speed: 1 };
    case "jitter":         return { intensity: 0.1, frequency: 12 };
    case "sway":           return { amplitude: 0.2, speed: 0.7 };
    case "figureEight":    return { width: 2, height: 1, speed: 0.5 };
    case "pendulum":       return { angle: 0.5, speed: 1.2 };
    case "customJs":       return { code: '', description: '' };
    case "text3d":
      return {
        text: "Text 3D",
        fontFamily: "helvetiker",
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
        colorOverride: false,
        color: 0xff6600,
        posX: 0,
        posY: 0,
        posZ: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    case "flatShade":      return {};
    case "shadowFloor":    return { color: 0x000000, opacity: 0.35, size: 30, offsetY: 0 };
    case "backgroundPlane": return { color: 0x111111, colorBottom: 0x222244, opacity: 1, width: 60, height: 40, offsetZ: -3, gradient: false };
    case "fogEffect":      return { color: 0xaaaaaa, near: 10, far: 50 };
    case "emboss":         return { strength: 1 };
    case "threshold":      return { cutoff: 0.5, smoothing: 0.05 };
    case "mirrorH":        return { split: 0.5 };
    case "mirrorV":        return { split: 0.5 };
    case "sketch":         return { strength: 3, paperColor: 0xf5f0e0, inkColor: 0x141008 };
    case "sunsetLight":    return { intensity: 1 };
    case "studioLight":    return { keyIntensity: 3, fillIntensity: 1.2, backIntensity: 1.5 };
    case "moonLight":      return { intensity: 1, ambientIntensity: 0.15 };
    case "chromeEdge":     return { color: 0xffffff, intensity: 0.6 };
    case "colorBurn":      return { color: 0xff6600, strength: 0.5 };
    case "depthLines":     return { lineCount: 12, lineWidth: 0.03, color: 0x000000 };
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
    seed: Math.floor(Math.random() * 1000000),
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
    case "pixelate":        return new PixelatePipe(effect.params as any);
    case "circularBlur":   return new CircularBlurPipe(effect.params as any);
    case "sepia":          return new SepiaPipe(effect.params as any);
    case "invert":         return new InvertPipe(effect.params as any);
    case "sobelEdge":      return new SobelEdgePipe(effect.params as any);
    case "thermal":        return new ThermalPipe(effect.params as any);
    case "nightVision":    return new NightVisionPipe(effect.params as any);
    case "duotone":        return new DuotonePipe(effect.params as any);
    case "posterize":      return new PosterizePipe(effect.params as any);
    case "colorOverlay":   return new ColorOverlayPipe(effect.params as any);
    case "halftone":       return new HalftonePipe(effect.params as any);
    case "sharpen":        return new SharpenPipe(effect.params as any);
    case "animChromatic":  return new AnimChromaticPipe(effect.params as any);
    case "blur":           return new BlurPipe(effect.params as any);
    case "lensDistort":    return new LensDistortPipe(effect.params as any);
    case "mosaic":         return new MosaicPipe(effect.params as any);
    case "noisePost":      return new NoisePostPipe(effect.params as any);
    case "crtCurvature":   return new CrtCurvaturePipe(effect.params as any);
    case "vhsTracking":    return new VhsTrackingPipe(effect.params as any);
    case "glowEdge":       return new GlowEdgePipe(effect.params as any);
    case "acid":           return new AcidPipe(effect.params as any);
    case "kaleidoscopePost": return new KaleidoscopePostPipe(effect.params as any);
    case "oldFilm":        return new OldFilmPipe(effect.params as any);
    case "zoomBlur":       return new ZoomBlurPipe(effect.params as any);
    case "crosshatch":     return new CrosshatchPipe(effect.params as any);
    case "glitchBlock":    return new GlitchBlockPipe(effect.params as any);
    case "speedLines":     return new SpeedLinesPipe(effect.params as any);
    case "rgbShift":       return new RgbShiftPipe(effect.params as any);
    case "frostedGlass":   return new FrostedGlassPipe(effect.params as any);
    case "waterRipple":    return new WaterRipplePipe(effect.params as any);
    case "pixelShift":     return new PixelShiftPipe(effect.params as any);
    case "retroTv":        return new RetroTvPipe(effect.params as any);
    case "antialiasing":   return new AntialiasingPipe(effect.params as any);
    case "inflate":        return new InflatePipe(effect.params as any);
    case "taper":          return new TaperPipe(effect.params as any);
    case "shear":          return new ShearPipe(effect.params as any);
    case "spherify":       return new SpherifyPipe(effect.params as any);
    case "ripple":         return new RipplePipe(effect.params as any);
    case "melt":           return new MeltPipe(effect.params as any);
    case "pinch":          return new PinchPipe(effect.params as any);
    case "voxelize":       return new VoxelizePipe(effect.params as any);
    case "crumple":        return new CrumplePipe(effect.params as any);
    case "noiseWobble":    return new NoiseWobblePipe(effect.params as any);
    case "spiralDeform":   return new SpiralDeformPipe(effect.params as any);
    case "bulge":          return new BulgePipe(effect.params as any);
    case "squish":         return new SquishPipe(effect.params as any);
    case "zap":            return new ZapPipe(effect.params as any);
    case "explode":        return new ExplodePipe(effect.params as any);
    case "fold":           return new FoldPipe(effect.params as any);
    case "spikes":         return new SpikesPipe(effect.params as any);
    case "cylindrize":     return new CylindrizePipe(effect.params as any);
    case "xRay":           return new XRayPipe(effect.params as any);
    case "toonShading":    return new ToonShadingPipe(effect.params as any);
    case "hologram":       return new HologramPipe(effect.params as any);
    case "gradientMesh":   return new GradientMeshPipe(effect.params as any);
    case "rainbowMesh":    return new RainbowMeshPipe(effect.params as any);
    case "iridescent":     return new IridescentPipe(effect.params as any);
    case "emissivePulse":  return new EmissivePulsePipe(effect.params as any);
    case "dissolveAnim":   return new DissolveAnimPipe(effect.params as any);
    case "glass":          return new GlassPipe(effect.params as any);
    case "matcap":         return new MatcapPipe(effect.params as any);
    case "spotlight":      return new SpotlightPipe(effect.params as any);
    case "strobe":         return new StrobePipe(effect.params as any);
    case "flicker":        return new FlickerPipe(effect.params as any);
    case "colorCycleLight":return new ColorCycleLightPipe(effect.params as any);
    case "disco":          return new DiscoPipe(effect.params as any);
    case "ambientPulse":   return new AmbientPulsePipe(effect.params as any);
    case "rimLight":       return new RimLightPipe(effect.params as any);
    case "dramaticLight":  return new DramaticLightPipe(effect.params as any);
    case "lightningFlash": return new LightningFlashPipe(effect.params as any);
    case "rainbowLights":  return new RainbowLightsPipe(effect.params as any);
    case "echoCopies":     return new EchoCopiesPipe(effect.params as any);
    case "starField3d":    return new StarField3dPipe(effect.params as any);
    case "snow":           return new SnowPipe(effect.params as any);
    case "rain":           return new RainPipe(effect.params as any);
    case "confetti":       return new ConfettiPipe(effect.params as any);
    case "sparkle":        return new SparklePipe(effect.params as any);
    case "aura":           return new AuraPipe(effect.params as any);
    case "gridFloor":      return new GridFloorPipe(effect.params as any);
    case "orbiter":        return new OrbiterPipe(effect.params as any);
    case "portalRing":     return new PortalRingPipe(effect.params as any);
    case "cometTrail":     return new CometTrailPipe(effect.params as any);
    case "floatingCubes":  return new FloatingCubesPipe(effect.params as any);
    case "mirrorPlane":    return new MirrorPlanePipe(effect.params as any);
    case "spin":           return new SpinPipe(effect.params as any);
    case "bounce":         return new BouncePipe(effect.params as any);
    case "levitation":     return new LevitationPipe(effect.params as any);
    case "swing":          return new SwingPipe(effect.params as any);
    case "tremble":        return new TremplePipe(effect.params as any);
    case "breathe":        return new BreathePipe(effect.params as any);
    case "wiggle":         return new WigglePipe(effect.params as any);
    case "floatDrift":     return new FloatDriftPipe(effect.params as any);
    case "flipCoin":       return new FlipCoinPipe(effect.params as any);
    case "grow":           return new GrowPipe(effect.params as any);
    case "shrink":         return new ShrinkPipe(effect.params as any);
    case "orbitAnim":      return new OrbitAnimPipe(effect.params as any);
    case "rock":           return new RockPipe(effect.params as any);
    case "jitter":         return new JitterPipe(effect.params as any);
    case "sway":           return new SwayPipe(effect.params as any);
    case "figureEight":    return new FigureEightPipe(effect.params as any);
    case "pendulum":       return new PendulumPipe(effect.params as any);
    case "customJs":       return new CustomJsPipe(effect.params as any);
    case "mainText":       return new MainTextPipe(effect.params as any);
    case "text3d":         return new Text3dPipe(effect.params as any);
    case "graphics":       return new GraphicsPipe(effect.params as any);
    case "flatShade":      return new FlatShadePipe(effect.params as any);
    case "shadowFloor":    return new ShadowFloorPipe(effect.params as any);
    case "backgroundPlane":return new BackgroundPlanePipe(effect.params as any);
    case "fogEffect":      return new FogEffectPipe(effect.params as any);
    case "emboss":         return new EmbossPipe(effect.params as any);
    case "threshold":      return new ThresholdPipe(effect.params as any);
    case "mirrorH":        return new MirrorHPipe(effect.params as any);
    case "mirrorV":        return new MirrorVPipe(effect.params as any);
    case "sketch":         return new SketchPipe(effect.params as any);
    case "sunsetLight":    return new SunsetLightPipe(effect.params as any);
    case "studioLight":    return new StudioLightPipe(effect.params as any);
    case "moonLight":      return new MoonLightPipe(effect.params as any);
    case "chromeEdge":     return new ChromeEdgePipe(effect.params as any);
    case "colorBurn":      return new ColorBurnPipe(effect.params as any);
    case "depthLines":     return new DepthLinesPipe(effect.params as any);
    default:
      return new FilmGrainPipe();
  }
}

const CURATED_COLORS = [
  { label: 'Orange', value: 0xff6600 },
  { label: 'Green', value: 0x00ff88 },
  { label: 'Blue', value: 0x0088ff },
  { label: 'Cyan', value: 0x00ffff },
  { label: 'Magenta', value: 0xff00ff },
  { label: 'Yellow', value: 0xffff00 },
  { label: 'Purple', value: 0x8800ff },
  { label: 'White', value: 0xffffff },
];

// ── Color history (localStorage, max 12 recent) ───────────────────────────────
const COLOR_HISTORY_KEY = 'comrev_recent_colors';
const MAX_COLOR_HISTORY = 12;

function loadRecentColors(): number[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(COLOR_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecentColor(hex: number) {
  try {
    if (typeof localStorage === 'undefined') return;
    const list = loadRecentColors().filter(c => c !== hex);
    list.unshift(hex);
    localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_COLOR_HISTORY)));
  } catch {}
}

function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function hexToNum(s: string): number {
  return parseInt(s.replace('#', ''), 16);
}

function ColorPickerRow({ label, value, onChange, colors }: { label: string; value: number; onChange: (v: number) => void; colors: any }) {
  const [showModal, setShowModal] = React.useState(false);
  const [recentColors, setRecentColors] = React.useState<number[]>(() => loadRecentColors());
  const [draftHex, setDraftHex] = React.useState(numToHex(value));

  React.useEffect(() => { setDraftHex(numToHex(value)); }, [value]);

  const applyColor = (num: number) => {
    onChange(num);
    saveRecentColor(num);
    setRecentColors(loadRecentColors());
  };

  return (
    <>
      <View style={[styles.controlRow, { paddingVertical: 2 }]}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <TouchableOpacity onPress={() => { setDraftHex(numToHex(value)); setShowModal(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 28, height: 20, borderRadius: 3, backgroundColor: numToHex(value), borderWidth: 1, borderColor: '#888' }} />
          <Text style={{ color: colors.tint, fontSize: 12 }}>Pick</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: colors.background ?? '#1a1a1a', borderRadius: 12, padding: 20, width: 280, gap: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15, marginBottom: 4 }}>{label}</Text>
            {/* Native color input */}
            <View style={{ alignItems: 'center' }}>
              {typeof document !== 'undefined' && (
                <input
                  type="color"
                  value={draftHex}
                  onChange={(e: any) => setDraftHex(e.target.value)}
                  style={{ width: 80, height: 80, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                />
              )}
            </View>
            {/* Recent colors */}
            {recentColors.length > 0 && (
              <View>
                <Text style={{ color: colors.text, fontSize: 11, opacity: 0.6, marginBottom: 6 }}>Recent</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {recentColors.map((c) => (
                    <TouchableOpacity key={c} onPress={() => { setDraftHex(numToHex(c)); }}>
                      <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: numToHex(c), borderWidth: 2, borderColor: numToHex(c) === draftHex ? colors.tint : 'transparent' }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {/* Hex input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 12 }}>Hex:</Text>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#555', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: colors.text, fontSize: 13, fontFamily: 'monospace' }}
                value={draftHex}
                onChangeText={(v) => { if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDraftHex(v); }}
                maxLength={7}
                autoCapitalize="none"
              />
            </View>
            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={{ flex: 1, padding: 10, borderWidth: 1, borderColor: '#555', borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { applyColor(hexToNum(draftHex)); setShowModal(false); }}
                style={{ flex: 1, padding: 10, backgroundColor: colors.tint, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function renderEffectControls(
  effect: EffectInstance,
  colors: any,
  t: (key: string, options?: any) => string,
  onUpdate: (key: string, value: unknown) => void,
  onEditCode?: (id: string, code: string, description: string) => void,
  colorScheme?: 'light' | 'dark',
) {
  const params = effect.params as Record<string, unknown>;
  const inputBg = colorScheme === 'dark' ? '#2a2a2a' : '#f5f5f5';
  // shorthand: t(`p_${k}`) for param labels
  const p = (k: string) => t(`p_${k}`);
  switch (effect.type) {
    case "mainText":
      return (
        <>
          <TextInput
            style={[
              styles.textInput,
              { color: colors.text, borderColor: colors.tint, backgroundColor: inputBg, marginVertical: 6 },
            ]}
            placeholder="Enter text..."
            placeholderTextColor={colorScheme === 'dark' ? '#999' : '#ccc'}
            value={params.text as string || ''}
            onChangeText={(v) => onUpdate("text", v)}
            multiline
          />
          <ColorPickerRow label={t('color')} value={params.color as number ?? 0xff6600} onChange={v => onUpdate("color", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{t('font')}</Text>
            <CycleButton
              value={AVAILABLE_FONTS.find(f => f.id === params.fontFamily)?.label ?? 'Helvetiker'}
              options={[]}
              onPress={() => {
                const idx = AVAILABLE_FONTS.findIndex(f => f.id === (params.fontFamily ?? 'helvetiker'));
                onUpdate("fontFamily", AVAILABLE_FONTS[(idx + 1) % AVAILABLE_FONTS.length].id);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow label={t('size')} min={0.5} max={6} step={0.1} value={params.size as number ?? 2} onChange={(v) => onUpdate("size", v)} colors={colors} />
          <SliderRow label={t('depth')} min={0.05} max={3} step={0.05} value={params.height as number ?? 0.8} onChange={(v) => onUpdate("height", v)} colors={colors} />
          <SliderRow label={t('metalness')} min={0} max={1} step={0.01} value={params.metalness as number ?? 0.95} onChange={(v) => onUpdate("metalness", v)} colors={colors} />
          <SliderRow label={t('roughness')} min={0} max={1} step={0.01} value={params.roughness as number ?? 0.15} onChange={(v) => onUpdate("roughness", v)} colors={colors} />
          <SliderRow label={t('envMapIntensity')} min={0} max={4} step={0.05} value={params.envMapIntensity as number ?? 1.5} onChange={(v) => onUpdate("envMapIntensity", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{t('bevel')}</Text>
            <Switch
              value={Boolean(params.bevelEnabled ?? true)}
              onValueChange={(v) => onUpdate("bevelEnabled", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={(params.bevelEnabled ?? true) ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {(params.bevelEnabled ?? true) && (
            <>
              <SliderRow label={t('bevelThickness')} min={0} max={0.5} step={0.01} value={params.bevelThickness as number ?? 0.15} onChange={(v) => onUpdate("bevelThickness", v)} colors={colors} />
              <SliderRow label={t('bevelSize')} min={0} max={0.3} step={0.01} value={params.bevelSize as number ?? 0.08} onChange={(v) => onUpdate("bevelSize", v)} colors={colors} />
              <SliderRow label={t('bevelSegments')} min={1} max={12} step={1} value={params.bevelSegments as number ?? 5} onChange={(v) => onUpdate("bevelSegments", Math.round(v))} colors={colors} />
            </>
          )}
          <SliderRow label={t('curveSegments')} min={2} max={128} step={1} value={params.curveSegments as number ?? 48} onChange={(v) => onUpdate("curveSegments", Math.round(v))} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{t('equalizeWidths')}</Text>
            <Switch
              value={Boolean(params.equalizeLineWidths)}
              onValueChange={(v) => onUpdate("equalizeLineWidths", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.equalizeLineWidths ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.equalizeLineWidths && (
            <>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>{t('method', { method: params.equalizationMethod as string ?? 'fontSize' })}</Text>
                <CycleButton
                  value="Switch"
                  options={[]}
                  onPress={() => onUpdate("equalizationMethod", params.equalizationMethod === 'spacing' ? 'fontSize' : 'spacing')}
                  colors={colors}
                />
              </Row>
              <SliderRow label={t('targetWidth')} min={5} max={40} step={0.1} value={params.targetWidth as number ?? 20} onChange={(v) => onUpdate("targetWidth", v)} colors={colors} />
            </>
          )}
          <SliderRow label={t('lineGap')} min={-1} max={6} step={0.05} value={params.lineSpacing as number ?? 1.0} onChange={(v) => onUpdate("lineSpacing", v)} colors={colors} />
        </>
      );
    case "bloom":
      return (
        <>
          <SliderRow label={p('strength')} min={0} max={3} step={0.05} value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
          <SliderRow label={p('threshold')} min={0} max={1} step={0.01} value={params.threshold as number} onChange={(v) => onUpdate("threshold", v)} colors={colors} />
          <SliderRow label={p('radius')} min={0} max={1} step={0.01} value={params.radius as number} onChange={(v) => onUpdate("radius", v)} colors={colors} />
        </>
      );
    case "depthOfField":
      return (
        <>
          <SliderRow label={p('focusDist')} min={1} max={40} step={0.5} value={params.focus as number} onChange={(v) => onUpdate("focus", v)} colors={colors} />
          <SliderRow label={p('aperture')} min={0.5} max={20} step={0.1} value={params.aperture as number} onChange={(v) => onUpdate("aperture", v)} colors={colors} />
          <SliderRow label={p('maxBlur')} min={0} max={0.05} step={0.001} value={params.maxBlur as number} onChange={(v) => onUpdate("maxBlur", v)} colors={colors} />
        </>
      );
    case "chromatic":
      return <SliderRow label={p('offset')} min={0} max={0.02} step={0.0005} value={params.offset as number} onChange={(v) => onUpdate("offset", v)} colors={colors} />;
    case "filmGrain":
      return <SliderRow label={p('intensity')} min={0} max={1} step={0.01} value={params.intensity as number} onChange={(v) => onUpdate("intensity", v)} colors={colors} />;
    case "glitch":
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>{p('wildMode')}</Text>
          <Switch value={Boolean(params.wildGlitch)} onValueChange={(value) => onUpdate("wildGlitch", value)}
            trackColor={{ false: "#767577", true: colors.tint }} thumbColor={Boolean(params.wildGlitch) ? colors.tint : "#f4f3f4"} />
        </Row>
      );
    case "fishEye":
      return (
        <>
          <SliderRow label={p('strength')} min={0} max={1} step={0.01} value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
          <SliderRow label={p('radius')} min={2} max={30} step={0.5} value={params.radius as number} onChange={(v) => onUpdate("radius", v)} colors={colors} />
        </>
      );
    case "bend":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p('axis')}</Text>
            <CycleButton value={(params.axis as string)?.toUpperCase() ?? "X"} options={[]}
              onPress={() => { const nextAxis = params.axis === "x" ? "y" : params.axis === "y" ? "z" : "x"; onUpdate("axis", nextAxis); }} colors={colors} />
          </Row>
          <SliderRow label={p('strength')} min={0} max={0.5} step={0.01} value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
        </>
      );
    case "envMap":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p('style')}</Text>
            <CycleButton value={(params.style as string) ?? "gradient"} options={[]}
              onPress={() => { const stylesList: EnvMapStyle[] = ["gradient","studio","starfield","sunset","neon","custom"]; const idx = stylesList.indexOf(params.style as EnvMapStyle); onUpdate("style", stylesList[(idx + 1) % stylesList.length]); }} colors={colors} />
          </Row>
          {params.style === 'custom' && (
            <Row>
              <Text style={[styles.label, { color: colors.text }]}>{p('customImage')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  style={[styles.smallActionButton, { borderColor: colors.tint, paddingHorizontal: 10, paddingVertical: 4 }]}
                  onPress={() => {
                    if (typeof document !== 'undefined') {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => onUpdate("customImageDataUrl", reader.result as string);
                      };
                      input.click();
                    }
                  }}
                >
                  <Text style={[styles.buttonText, { color: colors.tint }]}>
                    {params.customImageDataUrl ? p('changeImage') : p('chooseImage')}
                  </Text>
                </TouchableOpacity>
                {params.customImageDataUrl && (
                  <img src={params.customImageDataUrl as string} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 } as any} />
                )}
              </View>
            </Row>
          )}
          <SliderRow label={p('intensity')} min={0} max={3} step={0.05} value={params.intensity as number} onChange={(v) => onUpdate("intensity", v)} colors={colors} />
          {params.style !== 'custom' && (
            <SliderRow label={p('seed')} min={0} max={999} step={1} value={params.seed as number} onChange={(v) => onUpdate("seed", Math.round(v))} colors={colors} />
          )}
        </>
      );
    case "neonGlow":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{t('color')}</Text>
            <CycleButton value={["Magenta","Cyan","Green","Orange","Blue"][params.colorIdx as number]} options={[]}
              onPress={() => onUpdate("colorIdx", ((params.colorIdx as number) + 1) % 5)} colors={colors} />
          </Row>
          <SliderRow label={p('intensity')} min={0} max={2} step={0.05} value={params.intensity as number} onChange={(v) => onUpdate("intensity", v)} colors={colors} />
          <SliderRow label={p('pulseSpeed')} min={0} max={5} step={0.1} value={params.pulseSpeed as number} onChange={(v) => onUpdate("pulseSpeed", v)} colors={colors} />
          <SliderRow label={p('pulseAmplitude')} min={0} max={1} step={0.01} value={params.pulseAmplitude as number} onChange={(v) => onUpdate("pulseAmplitude", v)} colors={colors} />
        </>
      );
    case "metallicPreset":
      return (
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>{p('preset')}</Text>
          <CycleButton value={(params.preset as string) ?? "gold"} options={[]}
            onPress={() => { const presets: MetallicPreset[] = ["gold","chrome","copper","holographic","obsidian"]; const idx = presets.indexOf(params.preset as MetallicPreset); onUpdate("preset", presets[(idx + 1) % presets.length]); }} colors={colors} />
        </Row>
      );
    case "dust":
      return (
        <>
          <SliderRow label={p('count')} min={50} max={2000} step={50} value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          <SliderRow label={p('speed')} min={0} max={2} step={0.05} value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <SliderRow label={t('size')} min={0.01} max={0.3} step={0.005} value={params.size as number} onChange={(v) => onUpdate("size", v)} colors={colors} />
          <SliderRow label={p('seed')} min={0} max={999} step={1} value={params.seed as number} onChange={(v) => onUpdate("seed", Math.round(v))} colors={colors} />
        </>
      );
    case "wireframe":
      return <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number} onChange={(v) => onUpdate("opacity", v)} colors={colors} />;
    case "outline":
      return <SliderRow label={p('thickness')} min={1.01} max={1.2} step={0.005} value={params.thickness as number} onChange={(v) => onUpdate("thickness", v)} colors={colors} />;
    case "rays": {
      const raysMode = (params.mode as string) ?? "radial";
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p('mode')}</Text>
            <CycleButton value={raysMode} options={[]}
              onPress={() => onUpdate("mode", raysMode === "radial" ? "spaghetti" : raysMode === "spaghetti" ? "chip" : raysMode === "chip" ? "heart" : "radial")} colors={colors} />
          </Row>
          <SliderRow label={p('count')} min={4} max={128} step={1} value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          {raysMode !== "spaghetti" && (
            <LinkedSliderPair
              label1={p('innerThickness')} label2={p('outerThickness')}
              min={0.01} max={0.5} step={0.01}
              value1={params.innerThickness as number} value2={params.outerThickness as number}
              onChange1={(v) => onUpdate("innerThickness", v)} onChange2={(v) => onUpdate("outerThickness", v)}
              locked={Boolean(params.lockThickness)} onLockToggle={() => onUpdate("lockThickness", !Boolean(params.lockThickness))} colors={colors} />
          )}
          {raysMode === "spaghetti" && (
            <SliderRow label={p('thickness')} min={0.01} max={0.5} step={0.01}
              value={((params.innerThickness as number) + (params.outerThickness as number)) / 2}
              onChange={(v) => { onUpdate("innerThickness", v); onUpdate("outerThickness", v); }} colors={colors} />
          )}
          <SliderRow label={p('innerMargin')} min={0} max={20} step={0.1} value={params.innerMargin as number} onChange={(v) => onUpdate("innerMargin", v)} colors={colors} />
          <SliderRow label={p('outerMargin')} min={0} max={40} step={0.1} value={params.outerMargin as number} onChange={(v) => onUpdate("outerMargin", v)} colors={colors} />
          {raysMode === "heart" && (
            <SliderRow label={p('heartRotation')} min={0} max={180} step={1} value={(params.heartRotation as number) ?? 0} onChange={(v) => onUpdate("heartRotation", v)} colors={colors} />
          )}
        </>
      );
    }
    case "radialBlur":
      return (
        <>
          <SliderRow label={p('strength')} min={0} max={1} step={0.01} value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
          <SliderRow label={p('segments')} min={1} max={32} step={1} value={params.samples as number} onChange={(v) => onUpdate("samples", Math.round(v))} colors={colors} />
        </>
      );
    case "wave":
      return (
        <>
          <SliderRow label={p('amplitude')} min={0} max={3} step={0.05} value={params.amplitude as number} onChange={(v) => onUpdate("amplitude", v)} colors={colors} />
          <SliderRow label={p('frequency')} min={0.1} max={5} step={0.05} value={params.frequency as number} onChange={(v) => onUpdate("frequency", v)} colors={colors} />
          <SliderRow label={p('speed')} min={0} max={5} step={0.1} value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p('axis')}</Text>
            <CycleButton value={(params.axis as string) ?? "x"} options={[]}
              onPress={() => onUpdate("axis", params.axis === "x" ? "y" : "x")} colors={colors} />
          </Row>
        </>
      );
    case "twist":
      return (
        <>
          <SliderRow label={p('strength')} min={-3} max={3} step={0.05} value={params.strength as number} onChange={(v) => onUpdate("strength", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{p('axis')}</Text>
            <CycleButton value={(params.axis as string) ?? "y"} options={[]}
              onPress={() => onUpdate("axis", params.axis === "x" ? "y" : params.axis === "y" ? "z" : "x")} colors={colors} />
          </Row>
        </>
      );
    case "pulse":
      return (
        <>
          <SliderRow label={p('amplitude')} min={0} max={0.5} step={0.01} value={params.amplitude as number} onChange={(v) => onUpdate("amplitude", v)} colors={colors} />
          <SliderRow label={p('speed')} min={0.1} max={5} step={0.1} value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
        </>
      );
    case "floatingRings":
      return (
        <>
          <SliderRow label={p('count')} min={1} max={6} step={1} value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          <SliderRow label={p('radius')} min={0.5} max={4} step={0.05} value={params.radiusMult as number} onChange={(v) => onUpdate("radiusMult", v)} colors={colors} />
          <SliderRow label={p('speed')} min={0} max={2} step={0.05} value={params.speed as number} onChange={(v) => onUpdate("speed", v)} colors={colors} />
          <SliderRow label={p('thickness')} min={0.01} max={0.15} step={0.005} value={params.thickness as number} onChange={(v) => onUpdate("thickness", v)} colors={colors} />
        </>
      );
    case "vignette":
      return (
        <>
          <SliderRow label={p('offset')} min={0} max={1} step={0.01} value={params.offset as number} onChange={(v) => onUpdate("offset", v)} colors={colors} />
          <SliderRow label={p('darkness')} min={0} max={5} step={0.1} value={params.darkness as number} onChange={(v) => onUpdate("darkness", v)} colors={colors} />
        </>
      );
    case "scanlines":
      return (
        <>
          <SliderRow label={p('count')} min={10} max={400} step={5} value={params.count as number} onChange={(v) => onUpdate("count", Math.round(v))} colors={colors} />
          <SliderRow label={p('intensity')} min={0} max={1} step={0.01} value={params.intensity as number} onChange={(v) => onUpdate("intensity", v)} colors={colors} />
          <SliderRow label={p('scroll')} min={0} max={3} step={0.05} value={params.scrollSpeed as number} onChange={(v) => onUpdate("scrollSpeed", v)} colors={colors} />
        </>
      );
    case "colorGrading":
      return (
        <>
          <SliderRow label={p('hueShift')} min={0} max={1} step={0.01} value={params.hueShift as number} onChange={(v) => onUpdate("hueShift", v)} colors={colors} />
          <SliderRow label={p('saturation')} min={0} max={3} step={0.05} value={params.saturation as number} onChange={(v) => onUpdate("saturation", v)} colors={colors} />
          <SliderRow label={p('contrast')} min={0} max={3} step={0.05} value={params.contrast as number} onChange={(v) => onUpdate("contrast", v)} colors={colors} />
          <SliderRow label={p('brightness')} min={-0.5} max={0.5} step={0.01} value={params.brightness as number} onChange={(v) => onUpdate("brightness", v)} colors={colors} />
        </>
      );
    case "pixelate":
      return <SliderRow label={p('pixelSize')} min={1} max={32} step={1} value={params.pixelSize as number} onChange={(v) => onUpdate("pixelSize", Math.round(v))} colors={colors} />;
    case "circularBlur":   return <SliderRow label={p('radius')}    min={0} max={0.05} step={0.001} value={params.radius as number}    onChange={v=>onUpdate("radius",v)}    colors={colors} />;
    case "sepia":          return <SliderRow label={p('amount')}    min={0} max={1}    step={0.01}  value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "invert":         return <SliderRow label={p('amount')}    min={0} max={1}    step={0.01}  value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "sobelEdge":      return <SliderRow label={p('strength')}  min={0} max={5}    step={0.1}   value={params.strength as number}  onChange={v=>onUpdate("strength",v)}  colors={colors} />;
    case "thermal":        return <SliderRow label={p('intensity')} min={0} max={1}    step={0.01}  value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "nightVision":    return <SliderRow label={p('intensity')} min={0} max={2}    step={0.05}  value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "duotone": return (
      <>
        <ColorPickerRow label={p('colorA')} value={params.colorA as number ?? 0xff6600} onChange={v=>onUpdate("colorA",v)} colors={colors} />
        <ColorPickerRow label={p('colorB')} value={params.colorB as number ?? 0x0066ff} onChange={v=>onUpdate("colorB",v)} colors={colors} />
      </>
    );
    case "posterize":      return <SliderRow label={p('levels')}    min={2} max={16}   step={1}     value={params.levels as number}    onChange={v=>onUpdate("levels",Math.round(v))} colors={colors} />;
    case "colorOverlay": return (
      <>
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0xff6600} onChange={v=>onUpdate("color",v)} colors={colors} />
        <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number} onChange={v=>onUpdate("opacity",v)} colors={colors} />
      </>
    );
    case "halftone":       return <SliderRow label={p('dotSize')}   min={1} max={16}   step={0.5}   value={params.dotSize as number}   onChange={v=>onUpdate("dotSize",v)}   colors={colors} />;
    case "sharpen":        return <SliderRow label={p('amount')}    min={0} max={3}    step={0.05}  value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "animChromatic":  return <SliderRow label={p('amount')}    min={0} max={0.05} step={0.001} value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "blur":           return <SliderRow label={p('radius')}    min={0} max={5}    step={0.1}   value={params.radius as number}    onChange={v=>onUpdate("radius",v)}    colors={colors} />;
    case "lensDistort":    return <SliderRow label={p('k')}         min={-1} max={1}   step={0.01}  value={params.k as number}         onChange={v=>onUpdate("k",v)}         colors={colors} />;
    case "mosaic":         return <SliderRow label={t('size')}      min={0.01} max={0.3} step={0.005} value={params.size as number}   onChange={v=>onUpdate("size",v)}       colors={colors} />;
    case "noisePost":      return <SliderRow label={p('amount')}    min={0} max={0.5}  step={0.01}  value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "crtCurvature":   return <SliderRow label={p('bend')}      min={1} max={20}   step={0.5}   value={params.bend as number}      onChange={v=>onUpdate("bend",v)}      colors={colors} />;
    case "vhsTracking":    return <SliderRow label={p('strength')}  min={0} max={0.2}  step={0.002} value={params.strength as number}  onChange={v=>onUpdate("strength",v)}  colors={colors} />;
    case "glowEdge":       return <SliderRow label={p('intensity')} min={0} max={5}    step={0.1}   value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "acid":           return <SliderRow label={p('strength')}  min={0} max={0.3}  step={0.005} value={params.strength as number}  onChange={v=>onUpdate("strength",v)}  colors={colors} />;
    case "kaleidoscopePost":return <SliderRow label={p('segments')} min={2} max={16}   step={1}     value={params.segments as number}  onChange={v=>onUpdate("segments",Math.round(v))} colors={colors} />;
    case "oldFilm":        return <SliderRow label={p('grain')}     min={0} max={0.3}  step={0.005} value={params.grainAmount as number} onChange={v=>onUpdate("grainAmount",v)} colors={colors} />;
    case "zoomBlur":       return <SliderRow label={p('strength')}  min={0} max={0.2}  step={0.002} value={params.strength as number}  onChange={v=>onUpdate("strength",v)}  colors={colors} />;
    case "crosshatch":     return <SliderRow label={p('density')}   min={4} max={24}   step={1}     value={params.density as number}   onChange={v=>onUpdate("density",v)}   colors={colors} />;
    case "glitchBlock":    return <SliderRow label={p('intensity')} min={0} max={1}    step={0.01}  value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "speedLines":     return <SliderRow label={p('intensity')} min={0} max={2}    step={0.05}  value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "rgbShift":       return <SliderRow label={p('amount')}    min={0} max={0.03} step={0.001} value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "frostedGlass":   return <SliderRow label={p('blur')}      min={0} max={10}   step={0.2}   value={params.blur as number}      onChange={v=>onUpdate("blur",v)}      colors={colors} />;
    case "waterRipple":    return <SliderRow label={p('strength')}  min={0} max={0.1}  step={0.002} value={params.strength as number}  onChange={v=>onUpdate("strength",v)}  colors={colors} />;
    case "pixelShift":     return <SliderRow label={p('amount')}    min={0} max={20}   step={0.5}   value={params.amount as number}    onChange={v=>onUpdate("amount",v)}    colors={colors} />;
    case "retroTv":        return <SliderRow label={p('blur')}      min={0} max={0.3}  step={0.005} value={params.noise as number}     onChange={v=>onUpdate("noise",v)}     colors={colors} />;
    case "antialiasing":   return null;
    case "inflate":  case "spherify": case "pinch": case "bulge": case "squish":
    case "melt": case "fold": case "cylindrize":
      return <SliderRow label={p('strength')} min={0} max={2} step={0.05} value={params.strength as number} onChange={v=>onUpdate("strength",v)} colors={colors} />;
    case "taper": case "shear": case "explode":
      return <SliderRow label={p('strength')} min={0} max={2} step={0.05} value={params.strength as number} onChange={v=>onUpdate("strength",v)} colors={colors} />;
    case "voxelize": return <SliderRow label={p('gridSize')} min={0.05} max={1} step={0.05} value={params.gridSize as number} onChange={v=>onUpdate("gridSize",v)} colors={colors} />;
    case "crumple": case "spikes":
      return <SliderRow label={p('strength')} min={0} max={3} step={0.05} value={params.strength as number} onChange={v=>onUpdate("strength",v)} colors={colors} />;
    case "ripple": case "noiseWobble":
      return <SliderRow label={p('amplitude')} min={0} max={2} step={0.05} value={params.amplitude as number} onChange={v=>onUpdate("amplitude",v)} colors={colors} />;
    case "zap": return <SliderRow label={p('strength')} min={0} max={5} step={0.1} value={params.strength as number} onChange={v=>onUpdate("strength",v)} colors={colors} />;
    case "spiralDeform": return <SliderRow label={p('twist')} min={0} max={2} step={0.05} value={params.twist as number} onChange={v=>onUpdate("twist",v)} colors={colors} />;
    case "xRay": return <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number} onChange={v=>onUpdate("opacity",v)} colors={colors} />;
    case "toonShading": return <SliderRow label={p('steps')} min={2} max={8} step={1} value={params.steps as number} onChange={v=>onUpdate("steps",Math.round(v))} colors={colors} />;
    case "hologram": return <SliderRow label={p('scanSpeed')} min={0} max={3} step={0.1} value={params.scanSpeed as number} onChange={v=>onUpdate("scanSpeed",v)} colors={colors} />;
    case "gradientMesh": return <SliderRow label={p('amount')} min={0} max={1} step={1} value={params.animated ? 1 : 0} onChange={v=>onUpdate("animated",v===1)} colors={colors} />;
    case "rainbowMesh": return <SliderRow label={p('speed')} min={0} max={2} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "iridescent": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "emissivePulse": return <SliderRow label={p('maxIntensity')} min={0} max={3} step={0.1} value={params.maxIntensity as number} onChange={v=>onUpdate("maxIntensity",v)} colors={colors} />;
    case "dissolveAnim": return <SliderRow label={p('speed')} min={0} max={2} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "glass": return <SliderRow label={p('amount')} min={0} max={1} step={0.01} value={params.transmission as number} onChange={v=>onUpdate("transmission",v)} colors={colors} />;
    case "matcap": return null;
    case "spotlight": return <SliderRow label={p('intensity')} min={0} max={10} step={0.1} value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "strobe": return <SliderRow label={p('frequency')} min={0.5} max={20} step={0.5} value={params.frequency as number} onChange={v=>onUpdate("frequency",v)} colors={colors} />;
    case "flicker": return <SliderRow label={p('flickerAmount')} min={0} max={3} step={0.1} value={params.flickerAmount as number} onChange={v=>onUpdate("flickerAmount",v)} colors={colors} />;
    case "colorCycleLight": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "disco": return <SliderRow label={p('speed')} min={0} max={5} step={0.1} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "ambientPulse": return <SliderRow label={p('maxIntensity')} min={0} max={5} step={0.1} value={params.maxIntensity as number} onChange={v=>onUpdate("maxIntensity",v)} colors={colors} />;
    case "rimLight": return <SliderRow label={p('intensity')} min={0} max={5} step={0.1} value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "dramaticLight": return null;
    case "lightningFlash": return <SliderRow label={p('frequency')} min={0.5} max={10} step={0.5} value={params.frequency as number} onChange={v=>onUpdate("frequency",v)} colors={colors} />;
    case "rainbowLights": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "echoCopies": return <SliderRow label={p('count')} min={1} max={12} step={1} value={params.count as number} onChange={v=>onUpdate("count",Math.round(v))} colors={colors} />;
    case "starField3d": return <SliderRow label={p('speed')} min={0} max={0.5} step={0.005} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "snow": case "rain": case "confetti":
      return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "sparkle": return <SliderRow label={p('count')} min={50} max={500} step={10} value={params.count as number} onChange={v=>onUpdate("count",Math.round(v))} colors={colors} />;
    case "aura": return <SliderRow label={p('layers')} min={1} max={6} step={1} value={params.layers as number} onChange={v=>onUpdate("layers",Math.round(v))} colors={colors} />;
    case "gridFloor": return <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number} onChange={v=>onUpdate("opacity",v)} colors={colors} />;
    case "orbiter": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "portalRing": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "cometTrail": return <SliderRow label={p('speed')} min={0} max={5} step={0.1} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "floatingCubes": return <SliderRow label={p('count')} min={4} max={30} step={1} value={params.count as number} onChange={v=>onUpdate("count",Math.round(v))} colors={colors} />;
    case "mirrorPlane": return <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number} onChange={v=>onUpdate("opacity",v)} colors={colors} />;
    case "flatShade":   return null;
    case "shadowFloor": return (
      <>
        <ColorPickerRow label={p('color')} value={params.color as number ?? 0x000000} onChange={v=>onUpdate("color",v)} colors={colors} />
        <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number ?? 0.35} onChange={v=>onUpdate("opacity",v)} colors={colors} />
        <SliderRow label={t('size')} min={5} max={100} step={1} value={params.size as number ?? 30} onChange={v=>onUpdate("size",v)} colors={colors} />
      </>
    );
    case "backgroundPlane": return (
      <>
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0x111111} onChange={v=>onUpdate("color",v)} colors={colors} />
        <Row>
          <Text style={[styles.label, { color: colors.text }]}>{p('gradient')}</Text>
          <Switch value={Boolean(params.gradient)} onValueChange={v=>onUpdate("gradient",v)}
            trackColor={{ false: "#767577", true: colors.tint }} thumbColor={params.gradient ? colors.tint : "#f4f3f4"} />
        </Row>
        {params.gradient && <ColorPickerRow label={p('colorBottom')} value={params.colorBottom as number ?? 0x222244} onChange={v=>onUpdate("colorBottom",v)} colors={colors} />}
        <SliderRow label={p('opacity')} min={0} max={1} step={0.01} value={params.opacity as number ?? 1} onChange={v=>onUpdate("opacity",v)} colors={colors} />
        <SliderRow label={p('offsetZ')} min={-20} max={0} step={0.1} value={params.offsetZ as number ?? -3} onChange={v=>onUpdate("offsetZ",v)} colors={colors} />
      </>
    );
    case "fogEffect": return (
      <>
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0xaaaaaa} onChange={v=>onUpdate("color",v)} colors={colors} />
        <SliderRow label={p('near')} min={1} max={50} step={0.5} value={params.near as number ?? 10} onChange={v=>onUpdate("near",v)} colors={colors} />
        <SliderRow label={p('far')} min={5} max={200} step={1} value={params.far as number ?? 50} onChange={v=>onUpdate("far",v)} colors={colors} />
      </>
    );
    case "emboss":     return <SliderRow label={p('strength')} min={0} max={5} step={0.1} value={params.strength as number ?? 1} onChange={v=>onUpdate("strength",v)} colors={colors} />;
    case "threshold":  return <SliderRow label={p('cutoff')} min={0} max={1} step={0.01} value={params.cutoff as number ?? 0.5} onChange={v=>onUpdate("cutoff",v)} colors={colors} />;
    case "mirrorH":    return <SliderRow label={p('split')} min={0} max={1} step={0.01} value={params.split as number ?? 0.5} onChange={v=>onUpdate("split",v)} colors={colors} />;
    case "mirrorV":    return <SliderRow label={p('split')} min={0} max={1} step={0.01} value={params.split as number ?? 0.5} onChange={v=>onUpdate("split",v)} colors={colors} />;
    case "sketch": return (
      <>
        <SliderRow label={p('strength')} min={0} max={10} step={0.1} value={params.strength as number ?? 3} onChange={v=>onUpdate("strength",v)} colors={colors} />
        <ColorPickerRow label={p('paperColor')} value={params.paperColor as number ?? 0xf5f0e0} onChange={v=>onUpdate("paperColor",v)} colors={colors} />
        <ColorPickerRow label={p('inkColor')} value={params.inkColor as number ?? 0x141008} onChange={v=>onUpdate("inkColor",v)} colors={colors} />
      </>
    );
    case "sunsetLight":  return <SliderRow label={p('intensity')} min={0} max={3} step={0.05} value={params.intensity as number ?? 1} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "studioLight":  return <SliderRow label={p('keyIntensity')} min={0} max={8} step={0.1} value={params.keyIntensity as number ?? 3} onChange={v=>onUpdate("keyIntensity",v)} colors={colors} />;
    case "moonLight":    return <SliderRow label={p('intensity')} min={0} max={3} step={0.05} value={params.intensity as number ?? 1} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "chromeEdge": return (
      <>
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0xffffff} onChange={v=>onUpdate("color",v)} colors={colors} />
        <SliderRow label={p('intensity')} min={0} max={3} step={0.05} value={params.intensity as number ?? 0.6} onChange={v=>onUpdate("intensity",v)} colors={colors} />
      </>
    );
    case "colorBurn": return (
      <>
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0xff6600} onChange={v=>onUpdate("color",v)} colors={colors} />
        <SliderRow label={p('strength')} min={0} max={1} step={0.01} value={params.strength as number ?? 0.5} onChange={v=>onUpdate("strength",v)} colors={colors} />
      </>
    );
    case "depthLines": return (
      <>
        <SliderRow label={p('lineCount')} min={2} max={32} step={1} value={params.lineCount as number ?? 12} onChange={v=>onUpdate("lineCount",Math.round(v))} colors={colors} />
        <SliderRow label={p('lineWidth')} min={0.005} max={0.2} step={0.005} value={params.lineWidth as number ?? 0.03} onChange={v=>onUpdate("lineWidth",v)} colors={colors} />
        <ColorPickerRow label={t('color')} value={params.color as number ?? 0x000000} onChange={v=>onUpdate("color",v)} colors={colors} />
      </>
    );
    case "spin": return <SliderRow label={p('speedY')} min={-5} max={5} step={0.1} value={params.speedY as number} onChange={v=>onUpdate("speedY",v)} colors={colors} />;
    case "bounce": return <SliderRow label={p('height')} min={0} max={5} step={0.1} value={params.height as number} onChange={v=>onUpdate("height",v)} colors={colors} />;
    case "levitation": return <SliderRow label={p('amplitude')} min={0} max={3} step={0.05} value={params.amplitude as number} onChange={v=>onUpdate("amplitude",v)} colors={colors} />;
    case "swing": return <SliderRow label={p('angle')} min={0} max={1} step={0.01} value={params.angle as number} onChange={v=>onUpdate("angle",v)} colors={colors} />;
    case "tremble": return <SliderRow label={p('intensity')} min={0} max={0.5} step={0.005} value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "breathe": return <SliderRow label={t('depth')} min={0} max={0.3} step={0.005} value={params.depth as number} onChange={v=>onUpdate("depth",v)} colors={colors} />;
    case "wiggle": return <SliderRow label={p('amount')} min={0} max={1} step={0.01} value={params.amount as number} onChange={v=>onUpdate("amount",v)} colors={colors} />;
    case "floatDrift": return <SliderRow label={p('amplitude')} min={0} max={2} step={0.05} value={params.amplitude as number} onChange={v=>onUpdate("amplitude",v)} colors={colors} />;
    case "flipCoin": return <SliderRow label={p('speed')} min={0} max={5} step={0.1} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "grow": return <SliderRow label={p('speed')} min={0} max={3} step={0.05} value={params.speed as number} onChange={v=>onUpdate("speed",v)} colors={colors} />;
    case "shrink": return <SliderRow label={p('targetScale')} min={0} max={1} step={0.01} value={params.targetScale as number} onChange={v=>onUpdate("targetScale",v)} colors={colors} />;
    case "orbitAnim": return <SliderRow label={p('radius')} min={0} max={10} step={0.1} value={params.radius as number} onChange={v=>onUpdate("radius",v)} colors={colors} />;
    case "rock": return <SliderRow label={p('angle')} min={0} max={1} step={0.01} value={params.angle as number} onChange={v=>onUpdate("angle",v)} colors={colors} />;
    case "jitter": return <SliderRow label={p('intensity')} min={0} max={1} step={0.01} value={params.intensity as number} onChange={v=>onUpdate("intensity",v)} colors={colors} />;
    case "sway": return <SliderRow label={p('amplitude')} min={0} max={1} step={0.01} value={params.amplitude as number} onChange={v=>onUpdate("amplitude",v)} colors={colors} />;
    case "figureEight": return <SliderRow label={p('width')} min={0} max={5} step={0.1} value={params.width as number} onChange={v=>onUpdate("width",v)} colors={colors} />;
    case "pendulum": return <SliderRow label={p('angle')} min={0} max={1.5} step={0.01} value={params.angle as number} onChange={v=>onUpdate("angle",v)} colors={colors} />;
    case "customJs":
      return (
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          {params.description ? (
            <Text style={{ color: colors.text, fontSize: 12, marginBottom: 4 }} numberOfLines={2}>
              {params.description as string}
            </Text>
          ) : null}
          <Text style={{ color: colors.text, fontSize: 11, fontFamily: 'monospace', opacity: 0.6, marginBottom: 6 }} numberOfLines={1}>
            {params.code ? String(params.code).slice(0, 60) + '…' : 'No code yet — tap Refine to generate'}
          </Text>
          <TouchableOpacity
            onPress={() => onEditCode?.(effect.id, String(params.code ?? ''), String(params.description ?? ''))}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 6, borderColor: colors.tint, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>Refine with AI</Text>
          </TouchableOpacity>
        </View>
      );
    case "text3d":
      return (
        <>
          <TextInput
            style={[
              styles.textInput,
              { color: colors.text, borderColor: colors.tint, backgroundColor: inputBg, marginVertical: 6 },
            ]}
            placeholder="Enter text..."
            placeholderTextColor={colorScheme === 'dark' ? '#999' : '#ccc'}
            value={params.text as string || ''}
            onChangeText={(v) => onUpdate("text", v)}
            multiline
          />
          <ColorPickerRow label={t('color')} value={params.color as number ?? 0xff6600} onChange={v => onUpdate("color", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>{t('font')}</Text>
            <CycleButton
              value={AVAILABLE_FONTS.find(f => f.id === params.fontFamily)?.label ?? 'Helvetiker'}
              options={[]}
              onPress={() => {
                const idx = AVAILABLE_FONTS.findIndex(f => f.id === (params.fontFamily ?? 'helvetiker'));
                onUpdate("fontFamily", AVAILABLE_FONTS[(idx + 1) % AVAILABLE_FONTS.length].id);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow label="Size" min={0.5} max={5} step={0.1} value={params.size as number ?? 2} onChange={(v) => onUpdate("size", v)} colors={colors} />
          <SliderRow label="Height" min={0.1} max={3} step={0.1} value={params.height as number ?? 0.8} onChange={(v) => onUpdate("height", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Equalize Line Widths</Text>
            <Switch
              value={Boolean(params.equalizeLineWidths)}
              onValueChange={(v) => onUpdate("equalizeLineWidths", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.equalizeLineWidths ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.equalizeLineWidths && (
            <>
              <Row>
                <Text style={[styles.label, { color: colors.text }]}>Method: {params.equalizationMethod as string ?? 'fontSize'}</Text>
                <CycleButton
                  value="Switch"
                  options={[]}
                  onPress={() => onUpdate("equalizationMethod", params.equalizationMethod === 'spacing' ? 'fontSize' : 'spacing')}
                  colors={colors}
                />
              </Row>
              <SliderRow label="Target Width" min={5} max={40} step={0.1} value={params.targetWidth as number ?? 20} onChange={(v) => onUpdate("targetWidth", v)} colors={colors} />
            </>
          )}
          <SliderRow label="Line Gap" min={-1} max={6} step={0.05} value={params.lineSpacing as number ?? 1.0} onChange={(v) => onUpdate("lineSpacing", v)} colors={colors} />
          <SliderRow label="Position X" min={-20} max={20} step={0.1} value={params.posX as number ?? 0} onChange={(v) => onUpdate("posX", v)} colors={colors} />
          <SliderRow label="Position Y" min={-20} max={20} step={0.1} value={params.posY as number ?? 0} onChange={(v) => onUpdate("posY", v)} colors={colors} />
          <SliderRow label="Position Z" min={-20} max={20} step={0.1} value={params.posZ as number ?? 0} onChange={(v) => onUpdate("posZ", v)} colors={colors} />
          <SliderRow label="Rotation X" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotX as number ?? 0} onChange={(v) => onUpdate("rotX", v)} colors={colors} />
          <SliderRow label="Rotation Y" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotY as number ?? 0} onChange={(v) => onUpdate("rotY", v)} colors={colors} />
          <SliderRow label="Rotation Z" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotZ as number ?? 0} onChange={(v) => onUpdate("rotZ", v)} colors={colors} />
        </>
      );
    case "graphics":
      return (
        <>
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Layout</Text>
            <CycleButton
              value={params.layout as string ?? 'row'}
              options={[]}
              onPress={() => {
                const layouts = ['row', 'grid', 'pile'];
                const currentIdx = layouts.indexOf(params.layout as string ?? 'row');
                const nextIdx = (currentIdx + 1) % layouts.length;
                onUpdate("layout", layouts[nextIdx]);
              }}
              colors={colors}
            />
          </Row>
          <SliderRow label="Spacing" min={0.5} max={15} step={0.1} value={params.spacing as number ?? 4} onChange={(v) => onUpdate("spacing", v)} colors={colors} />
          <SliderRow label="Scale" min={0.1} max={5} step={0.05} value={params.scale as number ?? 1} onChange={(v) => onUpdate("scale", v)} colors={colors} />
          <SliderRow label="Extrude Depth" min={0} max={2} step={0.05} value={params.extrudeDepth as number ?? 0.2} onChange={(v) => onUpdate("extrudeDepth", v)} colors={colors} />
          <Row>
            <Text style={[styles.label, { color: colors.text }]}>Color Override (SVG)</Text>
            <Switch
              value={Boolean(params.colorOverride)}
              onValueChange={(v) => onUpdate("colorOverride", v)}
              trackColor={{ false: "#767577", true: colors.tint }}
              thumbColor={params.colorOverride ? colors.tint : "#f4f3f4"}
            />
          </Row>
          {params.colorOverride && (
            <ColorPickerRow label={t('overrideColor')} value={params.color as number ?? 0xff6600} onChange={v => onUpdate("color", v)} colors={colors} />
          )}
          <SliderRow label="Position X" min={-20} max={20} step={0.1} value={params.posX as number ?? 0} onChange={(v) => onUpdate("posX", v)} colors={colors} />
          <SliderRow label="Position Y" min={-20} max={20} step={0.1} value={params.posY as number ?? 0} onChange={(v) => onUpdate("posY", v)} colors={colors} />
          <SliderRow label="Position Z" min={-20} max={20} step={0.1} value={params.posZ as number ?? 0} onChange={(v) => onUpdate("posZ", v)} colors={colors} />
          <SliderRow label="Rotation X" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotX as number ?? 0} onChange={(v) => onUpdate("rotX", v)} colors={colors} />
          <SliderRow label="Rotation Y" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotY as number ?? 0} onChange={(v) => onUpdate("rotY", v)} colors={colors} />
          <SliderRow label="Rotation Z" min={-Math.PI} max={Math.PI} step={0.05} value={params.rotZ as number ?? 0} onChange={(v) => onUpdate("rotZ", v)} colors={colors} />

          <TouchableOpacity
            style={[styles.smallActionButton, { borderColor: colors.tint, marginVertical: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8 }]}
            onPress={() => {
              if (typeof document !== 'undefined') {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*,.svg';
                input.onchange = async (e: any) => {
                  const files = e.target.files;
                  if (!files) return;
                  const newItems = [...(params.items as any[] || [])];
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const reader = new FileReader();
                    if (file.name.toLowerCase().endsWith('.svg')) {
                      reader.readAsText(file);
                      await new Promise((resolve) => {
                        reader.onload = () => {
                          newItems.push({
                            id: Math.random().toString(36).substring(2),
                            name: file.name,
                            type: 'svg',
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
                            type: 'image',
                            content: reader.result as string,
                          });
                          resolve(null);
                        };
                      });
                    }
                  }
                  onUpdate('items', newItems);
                };
                input.click();
              }
            }}
          >
            <Text style={[styles.buttonText, { color: colors.tint }]}>Select Graphic Files</Text>
          </TouchableOpacity>

          {params.items && (params.items as any[]).length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>Uploaded Files:</Text>
              {(params.items as any[]).map((item, idx) => (
                <View key={item.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 }}>
                  <Text style={{ color: colors.text, fontSize: 12, opacity: 0.8, flex: 1 }} numberOfLines={1}>
                    {item.name} ({item.type.toUpperCase()})
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const newItems = (params.items as any[]).filter(x => x.id !== item.id);
                      onUpdate('items', newItems);
                    }}
                  >
                    <Text style={{ color: '#ff4444', fontSize: 12, marginLeft: 8 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      );
    default:
      return null;
  }
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ThreeDTextScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { t, i18n: i18nInstance } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 600;
  const canvasFlex = isSmallScreen ? 1 : 2;

  const [effectInstances, setEffectInstances] = useState<EffectInstance[]>(() => [
    createEffectInstance("mainText"),
  ]);
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
  const [aiChatTarget, setAiChatTarget] = useState<{
    id: string | null;
    code: string;
    description: string;
  } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const threeDTextRef = useRef<ThreeDTextHandle>(null);
  const currentConfigIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const c = colors; // shorthand

  // Load preset passed from the presets gallery screen
  useFocusEffect(React.useCallback(() => {
    const pending = consumePendingPresetToLoad();
    if (pending) {
      setEffectInstances(pending.effects.map((item) => ({
        ...item,
        enabled: item.enabled ?? true,
        animate: item.animate ?? true,
        params: item.params ?? {},
      })));
      setSaveStatus(`Loaded: ${pending.name}`);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, []));

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

  const mainTextParams = useMemo(() => {
    const inst = effectInstances.find(i => i.type === 'mainText');
    return (inst?.params ?? {}) as Record<string, unknown>;
  }, [effectInstances]);

  const updateMainTextParam = (key: string, value: unknown) => {
    setEffectInstances(instances => {
      const idx = instances.findIndex(i => i.type === 'mainText');
      if (idx < 0) return instances;
      const copy = [...instances];
      copy[idx] = { ...copy[idx], params: { ...copy[idx].params, [key]: value } };
      return copy;
    });
  };

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

  const handleApplyAiEffect = (code: string, description: string, targetId: string | null) => {
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
          type: 'customJs',
          enabled: true,
          animate: true,
          params: { code, description },
        },
      ]);
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

  const handleSavePreset = async () => {
    try {
      const name = generatePresetName(effectInstances.filter((i) => i.enabled));
      const now = new Date().toISOString();
      const preset: PresetRecord = {
        id: nanoid(),
        name,
        when_created: now,
        when_last_modified: now,
        effects: effectInstances,
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

  const handleLoadPreset = (preset: PresetRecord) => {
    setEffectInstances(preset.effects.map((item) => ({
      ...item,
      enabled: item.enabled ?? true,
      animate: item.animate ?? true,
      params: item.params ?? {},
    })));
    setShowPresetPicker(false);
    setSaveStatus(`Loaded preset: ${preset.name}`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deletePreset(id);
      try { await deletePresetFromBackend(API_BASE, id); } catch { /* ignore, best-effort */ }
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setSaveStatus(`Delete preset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleResetToBasic = () => {
    const performReset = () => {
      setEffectInstances((instances) => {
        const mainTextInst = instances.find((i) => i.type === 'mainText');
        if (mainTextInst) {
          return [mainTextInst];
        }
        return [createEffectInstance('mainText')];
      });
    };

    if (typeof window !== "undefined" && window.confirm) {
      if (window.confirm(t('resetConfirm', 'Are you sure you want to delete all effects except 3D text?'))) {
        performReset();
      }
    } else {
      Alert.alert(
        t('resetToBasic', 'Reset to basic settings'),
        t('resetConfirm', 'Are you sure you want to delete all effects except 3D text?'),
        [
          { text: t('cancel', 'Cancel'), style: "cancel" },
          { text: t('delete', 'Delete'), style: "destructive", onPress: performReset },
        ],
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
    const effectName = effectTypeLabel(
      effectInstances.find((i) => i.id === id)?.type ?? 'mainText',
      t,
    );
    const confirmMsg = t('deleteEffectConfirm', { name: effectName });
    if (typeof window !== "undefined" && window.confirm) {
      if (window.confirm(confirmMsg)) performDelete();
    } else if (typeof Alert !== "undefined" && Alert.alert) {
      Alert.alert(
        t('deleteEffect', 'Delete effect'),
        confirmMsg,
        [
          { text: t('cancel', 'Cancel'), style: "cancel" },
          { text: t('delete', 'Delete'), style: "destructive", onPress: performDelete },
        ],
      );
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
        if (!instances.find(i => i.type === 'mainText')) {
          const mainInst = createEffectInstance('mainText');
          if (latest.text) mainInst.params = { ...mainInst.params, text: latest.text };
          if (latest.equalizeLineWidths !== undefined) mainInst.params = { ...mainInst.params, equalizeLineWidths: latest.equalizeLineWidths };
          if (latest.equalizationMethod) mainInst.params = { ...mainInst.params, equalizationMethod: latest.equalizationMethod };
          if (latest.targetWidth) mainInst.params = { ...mainInst.params, targetWidth: latest.targetWidth };
          if (latest.lineSpacing) mainInst.params = { ...mainInst.params, lineSpacing: latest.lineSpacing };
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
        if (active) setPresets(loaded.sort((a, b) => b.when_last_modified.localeCompare(a.when_last_modified)));
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

    loadLastSavedConfig();
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
  }, []);

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
      text: p.text as string ?? '',
      equalizeLineWidths: p.equalizeLineWidths as boolean ?? false,
      equalizationMethod: (p.equalizationMethod as 'spacing' | 'fontSize') ?? 'fontSize',
      targetWidth: p.targetWidth as number ?? 20,
      lineSpacing: p.lineSpacing as number ?? 1.5,
      effectInstances,
      showAdvanced,
    };
  };

  // Auto-save on every change (debounced 800ms)
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
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.content}>
        <View style={[styles.canvas, { flex: canvasFlex }]}>
          <ThreeDText
            ref={threeDTextRef}
            text={mainTextParams.text as string ?? ''}
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
            envMapIntensity={mainTextParams.envMapIntensity as number | undefined}
            equalizeLineWidths={mainTextParams.equalizeLineWidths as boolean | undefined}
            equalizationMethod={mainTextParams.equalizationMethod as 'spacing' | 'fontSize' | undefined}
            targetWidth={mainTextParams.targetWidth as number | undefined}
            lineSpacing={mainTextParams.lineSpacing as number | undefined}
            pipes={activePipes}
          />
        </View>

        <ScrollView
          style={styles.controls}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* ── Quick text shortcut ── */}
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
            value={mainTextParams.text as string ?? ''}
            onChangeText={(v) => updateMainTextParam('text', v)}
            multiline
            numberOfLines={3}
          />

          {/* ── Effects ── */}
          <Text style={[styles.groupLabel, { color: c.text }]}>
            {t('effects')}
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
                {t('pipelinePresets')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', flex: 1 }}>
                <TouchableOpacity
                  style={[styles.smallActionButton, { borderColor: c.tint }]}
                  onPress={handleResetToBasic}
                >
                  <Text style={[styles.buttonText, { color: c.tint }]}>
                    {t('resetToBasic')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallActionButton, { borderColor: c.tint }]}
                  onPress={handleSavePreset}
                >
                  <Text style={[styles.buttonText, { color: c.tint }]}>
                    {t('savePreset')}
                  </Text>
                </TouchableOpacity>
                {presets.length > 0 && (
                  <TouchableOpacity
                    style={[styles.smallActionButton, { borderColor: c.tint }]}
                    onPress={() => setShowPresetPicker(true)}
                  >
                    <Text style={[styles.buttonText, { color: c.tint }]}>
                      {t('loadPreset')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={{ marginHorizontal: 12, marginVertical: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 }}>
                <Text style={[styles.label, { color: c.text }]}>
                  {t('addEffect')}
                </Text>
                <TextInput
                  style={[
                    styles.searchInput,
                    { borderColor: c.tint, color: c.text, flex: 1, marginBottom: 0 },
                  ]}
                  placeholder="Search effects..."
                  placeholderTextColor={
                    colorScheme === "dark" ? "#666" : "#999"
                  }
                  value={selectedEffectSearch}
                  onChangeText={setSelectedEffectSearch}
                />
                <TouchableOpacity
                  onPress={() => setAiChatTarget({ id: null, code: '', description: '' })}
                  style={[styles.smallActionButton, { borderColor: c.tint, paddingHorizontal: 10 }]}
                >
                  <Text style={{ color: c.tint, fontSize: 13, fontWeight: '600' }}>AI</Text>
                </TouchableOpacity>
              </View>
              <View>
                {selectedEffectSearch.length > 0 ? (
                  <View
                    style={[styles.effectSearchList, { borderColor: c.tint }]}
                  >
                    {EFFECT_TYPES.filter((e) =>
                      !e.primary &&
                      (t(`eff_${e.type}`) + " " + e.type)
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
                        <Text style={{ color: c.text }}>{t(`eff_${e.type}`)}</Text>
                        {e.animated && (
                          <Text style={{ color: "#ff9800", fontSize: 11, fontWeight: 'bold' }}> A</Text>
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
                    {EFFECT_TYPES.filter(e => !e.primary).map((e) => (
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
                          <View style={[styles.targetBadge, { backgroundColor: "#ff9800" }]}>
                            <Text style={{ color: "#fff", fontSize: 10 }}>A</Text>
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
                  {t('deleted', { name: effectTypeLabel(lastDeleted.item.type, t) })}
                </Text>
                <TouchableOpacity
                  onPress={undoDelete}
                  style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: c.tint }}>{t('undo')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {effectInstances.filter(i => i.type !== 'mainText').length === 0 && (
              <Text style={[styles.label, { color: c.text, opacity: 0.5, marginHorizontal: 12, marginVertical: 8 }]}>
                {t('noAdditionalEffects')}
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
                  {instance.type !== 'mainText' && (
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
                  {instance.type !== 'mainText' && (
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
                  )}
                </View>
                {instance.enabled &&
                  renderEffectControls(
                    instance, c, t,
                    (key, value) => updateEffectParam(instance.id, key, value),
                    (id, code, desc) => setAiChatTarget({ id, code, description: desc }),
                    colorScheme ?? 'light',
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
                    >{`Dragging: ${effectTypeLabel(draggingItem.type, t)}`}</Text>
                  </View>
                </View>
                {renderEffectControls(draggingItem, c, t, () => undefined, undefined, colorScheme ?? 'light')}
              </Animated.View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.advancedToggle, { borderColor: "#555" }]}
            onPress={() => setShowAdvanced((v) => !v)}
          >
            <Text style={[styles.buttonText, { color: "#888" }]}>
              {showAdvanced ? `▲ ${t('hideAdvanced')}` : `▼ ${t('showAdvanced')}`}
            </Text>
          </TouchableOpacity>

          {/* Language picker */}
          <View style={[styles.controlRow, { marginTop: 8 }]}>
            <Text style={[styles.label, { color: c.text }]}>{t('language')}</Text>
            {typeof document !== 'undefined' ? (
              <select
                value={i18nInstance.language}
                onChange={(e: any) => i18nInstance.changeLanguage(e.target.value)}
                style={{
                  background: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
                  color: c.text as string,
                  border: `1px solid ${c.tint}`,
                  borderRadius: '5px',
                  padding: '4px 8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  outline: 'none',
                } as any}
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => i18nInstance.changeLanguage(lang.code)}
                    style={[styles.smallActionButton, { borderColor: i18nInstance.language === lang.code ? c.tint : '#555' }]}
                  >
                    <Text style={[styles.buttonText, { color: i18nInstance.language === lang.code ? c.tint : c.text }]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Export button */}
          <TouchableOpacity
            style={[styles.advancedToggle, { borderColor: c.tint, marginTop: 4 }]}
            onPress={() => setShowExportModal(true)}
          >
            <Text style={[styles.buttonText, { color: c.tint }]}>{t('export')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Modals */}
      {aiChatTarget !== null && (
        <AiEffectChatModal
          visible
          onClose={() => setAiChatTarget(null)}
          onApplyEffect={(code, desc) => handleApplyAiEffect(code, desc, aiChatTarget.id)}
          initialCode={aiChatTarget.code || undefined}
          initialDescription={aiChatTarget.description || undefined}
        />
      )}
      <ExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        captureFrame={() => threeDTextRef.current?.captureFrame() ?? Promise.resolve(null)}
        getMesh={() => threeDTextRef.current?.getMesh() ?? null}
        getScene={() => threeDTextRef.current?.getScene() ?? null}
      />

      {/* Preset picker modal */}
      <Modal
        visible={showPresetPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPresetPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#333' }}>
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{t('loadPreset')}</Text>
              <TouchableOpacity onPress={() => setShowPresetPicker(false)}>
                <Text style={{ color: c.tint, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 8 }}>
              {presets.map((preset) => (
                <View key={preset.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colorScheme === 'dark' ? '#2a2a2a' : '#eee' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '500' }}>{preset.name}</Text>
                    <Text style={{ color: '#888', fontSize: 11 }}>{new Date(preset.when_last_modified).toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleLoadPreset(preset)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: c.tint, borderRadius: 6, marginRight: 8 }}>
                    <Text style={{ color: c.tint, fontSize: 13 }}>{t('load')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeletePreset(preset.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e55', borderRadius: 6 }}>
                    <Text style={{ color: '#e55', fontSize: 13 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
