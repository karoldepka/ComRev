import { EffectInstance } from "@/utils/config-store";
import {
  AcidPipe,
  AmbientPulsePipe,
  AnimChromaticPipe,
  AntialiasingPipe,
  AuraPipe,
  BackgroundPlanePipe,
  BendPipe,
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
  CustomJsPipe,
  CylindrizePipe,
  DepthLinesPipe,
  DepthOfFieldPipe,
  DiscoPipe,
  DissolveAnimPipe,
  DramaticLightPipe,
  DuotonePipe,
  EchoCopiesPipe,
  EffectPipe,
  EmbossPipe,
  EmissivePulsePipe,
  EnvMapPipe,
  ExplodePipe,
  FigureEightPipe,
  FilmGrainPipe,
  FirePipe,
  FishEyePipe,
  FractalBackgroundPipe,
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
  ParticleDustPipe,
  PendulumPipe,
  PinchPipe,
  PixelatePipe,
  PixelShiftPipe,
  PortalRingPipe,
  PosterizePipe,
  PulsePipe,
  RadialBlurPipe,
  RainbowLightsPipe,
  RainbowMeshPipe,
  RainPipe,
  RaysPipe,
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
  SkySpherePipe,
  SmokePipe,
  SnowPipe,
  SobelEdgePipe,
  SparklePipe,
  SpeedLinesPipe,
  SpherifyPipe,
  SpikesPipe,
  SpinPipe,
  SpiralDeformPipe,
  SpotlightPipe,
  SquishPipe,
  StarField3dPipe,
  StrobePipe,
  StudioLightPipe,
  SunsetLightPipe,
  SwayPipe,
  SwingPipe,
  TaperPipe,
  TessellatePipe,
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
  WingsPipe,
  WireframePipe,
  XRayPipe,
  ZapPipe,
  ZoomBlurPipe,
} from "@/utils/three-text-pipes";

export function createPipeFromInstance(effect: EffectInstance): EffectPipe {
  const pipe = buildPipe(effect);
  pipe.effectInstanceId = effect.id;
  return pipe;
}

function buildPipe(effect: EffectInstance): EffectPipe {
  switch (effect.type) {
    case "bloom":          return new BloomPipe(effect.params as any);
    case "depthOfField":   return new DepthOfFieldPipe(effect.params as any);
    case "chromatic":      return new ChromaticAberrationPipe(effect.params as any);
    case "filmGrain":      return new FilmGrainPipe(effect.params as any);
    case "glitch":         return new GlitchPipe(effect.params as any);
    case "fishEye":        return new FishEyePipe(effect.params as any);
    case "bend":           return new BendPipe(effect.params as any);
    case "envMap":         return new EnvMapPipe(effect.params as any);
    case "neonGlow":       return new NeonGlowPipe(effect.params as any);
    case "metallicPreset": return new MetallicPresetPipe(effect.params as any);
    case "dust":           return new ParticleDustPipe(effect.params as any);
    case "wireframe":      return new WireframePipe(effect.params as any);
    case "outline":        return new OutlinePipe(effect.params as any);
    case "rays":           return new RaysPipe(effect.params as any);
    case "radialBlur":     return new RadialBlurPipe(effect.params as any);
    case "wave":           return new WavePipe(effect.params as any);
    case "twist":          return new TwistPipe(effect.params as any);
    case "pulse":          return new PulsePipe(effect.params as any);
    case "floatingRings":  return new FloatingRingsPipe(effect.params as any);
    case "vignette":       return new VignettePipe(effect.params as any);
    case "scanlines":      return new ScanlinesPipe(effect.params as any);
    case "colorGrading":   return new ColorGradingPipe(effect.params as any);
    case "pixelate":       return new PixelatePipe(effect.params as any);
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
    case "colorCycleLight": return new ColorCycleLightPipe(effect.params as any);
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
    case "graphics":       return new GraphicsPipe({ ...(effect.params as any), effectInstanceId: effect.id });
    case "tessellate":     return new TessellatePipe(effect.params as any);
    case "wings":          return new WingsPipe(effect.params as any);
    case "fire":           return new FirePipe(effect.params as any);
    case "smoke":          return new SmokePipe(effect.params as any);
    case "skySphere":      return new SkySpherePipe(effect.params as any);
    case "fractalBackground": return new FractalBackgroundPipe(effect.params as any);
    case "flatShade":      return new FlatShadePipe(effect.params as any);
    case "shadowFloor":    return new ShadowFloorPipe(effect.params as any);
    case "backgroundPlane": return new BackgroundPlanePipe(effect.params as any);
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
    default:               return new FilmGrainPipe();
  }
}
