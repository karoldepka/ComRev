import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface DepthLinesPipeParams { lineCount?: number; lineWidth?: number; color?: number; }

const SHADER = {
  uniforms: {
    tDiffuse: { value: null }, lineCount: { value: 12 }, lineWidth: { value: 0.03 },
    lineColor: { value: [0, 0, 0] },
  },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float lineCount;
    uniform float lineWidth;
    uniform vec3 lineColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      // contour lines at equal-luminance steps
      float band = fract(lum * lineCount);
      float line = 1.0 - smoothstep(lineWidth, lineWidth * 1.5, min(band, 1.0 - band));
      vec3 col = mix(c.rgb, lineColor, line);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class DepthLinesPipe extends ShaderPipeBase {
  readonly name = 'depthLines';
  constructor(public params: DepthLinesPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    const lc = new THREE.Color(this.params.color ?? 0x000000);
    this.setU('lineCount', this.params.lineCount ?? 12);
    this.setU('lineWidth', this.params.lineWidth ?? 0.03);
    this.setU('lineColor', [lc.r, lc.g, lc.b]);
  }
}
