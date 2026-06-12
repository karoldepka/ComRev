import { EffectPipe, PipeSetupContext } from './base';

export interface MainTextPipeParams {
  text?: string;
  textSets?: { id: string; name: string; text: string }[];
  activeTextSetId?: string;
  sequenceLineDurationMs?: number;
  fontFamily?: string;
  size?: number;
  height?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
  color?: number;
  metalness?: number;
  roughness?: number;
  envMapIntensity?: number;
  equalizeLineWidths?: boolean;
  equalizationMethod?: 'spacing' | 'fontSize';
  targetWidth?: number;
  lineSpacing?: number;
}

/** No-op pipe that holds the primary 3D text params.
 *  ThreeDText reads these params directly; other pipes operate on the resulting mesh. */
export class MainTextPipe implements EffectPipe {
  readonly name = 'mainText';
  constructor(public params: MainTextPipeParams = {}) {}
  setup(_ctx: PipeSetupContext): void {}
  dispose(): void {}
}
