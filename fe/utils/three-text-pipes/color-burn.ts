import * as THREE from 'three';
import { ShaderPipeBase, PipeFrameContext, UV_VS } from './base';

export interface ColorBurnPipeParams { color?: number; strength?: number; }

const SHADER = {
  uniforms: { tDiffuse: { value: null }, burnColor: { value: [1, 0.4, 0] }, strength: { value: 0.5 } },
  vertexShader: UV_VS,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 burnColor;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // color burn blend: 1 - (1-dst)/src
      vec3 burned = 1.0 - (1.0 - c.rgb) / max(burnColor, vec3(0.001));
      gl_FragColor = vec4(mix(c.rgb, clamp(burned,0.,1.), strength), c.a);
    }`,
};

export class ColorBurnPipe extends ShaderPipeBase {
  readonly name = 'colorBurn';
  constructor(public params: ColorBurnPipeParams = {}) { super(SHADER); }
  update(_ctx: PipeFrameContext) {
    const c = new THREE.Color(this.params.color ?? 0xff6600);
    this.setU('burnColor', [c.r, c.g, c.b]);
    this.setU('strength', this.params.strength ?? 0.5);
  }
}
