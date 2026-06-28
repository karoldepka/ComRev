export type MantraText = string | readonly string[];

/** Visual configuration applied when /mcon opens — edit here to change the mantra slideshow style. */
export const MCON_VISUAL_PARAMS: Record<string, unknown> = {
  size: 2.5,
  height: 0.5,
  curveSegments: 128,
  bevelEnabled: false,
  bevelThickness: 0.12,
  bevelSize: 0.06,
  bevelOffset: 0,
  bevelSegments: 5,
  color: 0xff6600,
  metalness: 0.85,
  roughness: 0.25,
  envMapIntensity: 1.5,
  equalizeLineWidths: false,
  equalizationMethod: 'fontSize',
  targetWidth: 20,
  lineSpacing: 1.0,
  perspective: 1.0,
  capitalizeText: true,
  sequenceLineDurationMs: 3000,
};

export type MantraEntry = {
  text?: MantraText;
  sentiment?:
    | "loving"
    | "growth"
    | "hardcore"
    | "dreaming"
    | "calm"
    | "focus"
    | string;
  emotion?: string;
  style?: string;
};
