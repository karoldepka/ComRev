import { EffectInstance, EffectType } from './config-store';

const DEFAULT_MAIN_TEXT = "Hi\nHello World\nThis is a very long line of text";
const DEFAULT_SEQUENCE_LINE_DURATION_MS = 1600;

export function createId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultEffectParams(type: EffectType): Record<string, unknown> {
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
        fontFamily: "droid_sans",
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
        perspective: 1.0,
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
      return { style: "plasma", plasmaScheme: "fire", plasmaScale: 8, intensity: 1.5, seed: 42, customImageDataUrl: undefined, showAsBackground: true, backgroundBlur: 0 };
    case "neonGlow":
      return { colorIdx: 0, intensity: 0.8, pulseSpeed: 1.0, pulseAmplitude: 0.3 };
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
        mode: "radial", count: 24, innerThickness: 0.06, outerThickness: 0.08,
        lockThickness: true, innerMargin: 2, outerMargin: 6, heartRotation: 0,
        crystalWidth: 0.12, thunderZigzags: 3, sineCycles: 2,
        spiralTightness: 1.0, roseK: 4, wingsStyle: "straight",
        leftEnabled: true, rightEnabled: true, topEnabled: true, bottomEnabled: true,
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
    case "tessellate": return { iterations: 1 };
    case "wings":      return { style: "angel", color: 0xffffff, size: 2.5, flapSpeed: 2.5, flapAmplitude: 0.45, opacity: 0.88, layout: "horizontal", symmetric: false, leftEnabled: true, rightEnabled: true, topEnabled: false, bottomEnabled: false };
    case "fire":       return { count: 280, size: 0.85, speed: 1, spread: 1 };
    case "smoke":      return { count: 70, size: 1.6, speed: 1, opacity: 0.55, color: 0x888888 };
    case "skySphere":  return { style: "day" };
    case "fractalBackground": return { fractalType: "mandelbrot", scheme: "psychedelic", maxIter: 128, zoom: 0.35, cx: -0.5, cy: 0, juliaRe: -0.7, juliaIm: 0.27, animateJulia: true, juliaSpeed: 0.3, width: 60, height: 40, offsetZ: -8 };
    case "text3d":
      return {
        text: "Text 3D", fontFamily: "droid_sans", size: 2, height: 0.8, curveSegments: 48,
        bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.08, bevelOffset: 0, bevelSegments: 5,
        color: 0xff6600, metalness: 0.95, roughness: 0.15, envMapIntensity: 1.5,
        equalizeLineWidths: false, equalizationMethod: "fontSize", targetWidth: 20, lineSpacing: 1.0,
        perspective: 1.0,
        posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0,
      };
    case "graphics":
      return {
        items: [], layout: "row", spacing: 4, columns: 0, gap: 0.5, scale: 1, extrudeDepth: 0.2,
        bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3,
        colorOverride: false, color: 0xff6600, metalness: 0.8, roughness: 0.2,
        bgEnabled: false, bgColor: 0x111111, bgOpacity: 0.8,
        matImageDataUrl: undefined,
        envMapStyle: "none", envMapIntensity: 1.5, envMapCustomDataUrl: undefined,
        posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0,
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

export function createEffectInstance(type: EffectType): EffectInstance {
  return {
    id: createId(),
    type,
    enabled: true,
    animate: true,
    seed: Math.floor(Math.random() * 1000000),
    params: createDefaultEffectParams(type),
  };
}
