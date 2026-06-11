import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface SketchPipeParams { strength?: number; paperColor?: number; inkColor?: number; }

const SHADER = {
  uniforms: {
    tDiffuse: { value: null }, strength: { value: 3.0 },
    paperColor: { value: [0.96, 0.94, 0.88] }, inkColor: { value: [0.08, 0.06, 0.04] },
    texelSize: { value: [1/512, 1/512] },
  },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec3 paperColor;
    uniform vec3 inkColor;
    uniform vec2 texelSize;
    varying vec2 vUv;

    float sobel() {
      float s00 = dot(texture2D(tDiffuse, vUv+texelSize*vec2(-1,-1)).rgb, vec3(.3,.59,.11));
      float s10 = dot(texture2D(tDiffuse, vUv+texelSize*vec2( 0,-1)).rgb, vec3(.3,.59,.11));
      float s20 = dot(texture2D(tDiffuse, vUv+texelSize*vec2( 1,-1)).rgb, vec3(.3,.59,.11));
      float s01 = dot(texture2D(tDiffuse, vUv+texelSize*vec2(-1, 0)).rgb, vec3(.3,.59,.11));
      float s21 = dot(texture2D(tDiffuse, vUv+texelSize*vec2( 1, 0)).rgb, vec3(.3,.59,.11));
      float s02 = dot(texture2D(tDiffuse, vUv+texelSize*vec2(-1, 1)).rgb, vec3(.3,.59,.11));
      float s12 = dot(texture2D(tDiffuse, vUv+texelSize*vec2( 0, 1)).rgb, vec3(.3,.59,.11));
      float s22 = dot(texture2D(tDiffuse, vUv+texelSize*vec2( 1, 1)).rgb, vec3(.3,.59,.11));
      float gx = -s00 - 2.*s10 - s20 + s02 + 2.*s12 + s22;
      float gy = -s00 + s20 - 2.*s01 + 2.*s21 - s02 + s22;
      return length(vec2(gx, gy));
    }

    void main() {
      float edge = clamp(sobel() * strength, 0.0, 1.0);
      vec3 col = mix(paperColor, inkColor, edge);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class SketchPipe extends ShaderPipeBase {
  readonly name = 'sketch';
  constructor(public params: SketchPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    this.setU('strength', this.params.strength ?? 3);
    const pc = new THREE.Color(this.params.paperColor ?? 0xf5f0e0);
    const ic = new THREE.Color(this.params.inkColor ?? 0x141008);
    this.setU('paperColor', [pc.r, pc.g, pc.b]);
    this.setU('inkColor', [ic.r, ic.g, ic.b]);
  }
}
