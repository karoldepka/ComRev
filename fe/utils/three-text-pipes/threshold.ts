import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ThresholdPipeParams { cutoff?: number; smoothing?: number; invert?: boolean; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, cutoff: { value: 0.5 }, smoothing: { value: 0.05 } },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float cutoff;
    uniform float smoothing;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float v = smoothstep(cutoff - smoothing, cutoff + smoothing, lum);
      gl_FragColor = vec4(vec3(v), c.a);
    }`,
};

export class ThresholdPipe extends ShaderPipeBase {
  readonly name = 'threshold';
  constructor(public params: ThresholdPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('cutoff', this.params.cutoff ?? 0.5);
    this.setU('smoothing', this.params.smoothing ?? 0.05);
  }
}
